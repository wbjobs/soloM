package storage

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"ebpf-syscall-monitor/types"
)

const (
	defaultMaxHistorySeconds = 300
	cleanupInterval          = 60 * time.Second
	batchSize                = 500
	maxQueueSize             = 100000
)

type SQLiteStore struct {
	db           *sql.DB
	eventChan    chan *types.SyscallEvent
	batch        []*types.SyscallEvent
	batchMutex   sync.Mutex
	stopChan     chan struct{}
	wg           sync.WaitGroup
	maxHistory   int64
}

func NewSQLiteStore(dbPath string, maxHistorySeconds int) (*SQLiteStore, error) {
	if maxHistorySeconds <= 0 {
		maxHistorySeconds = defaultMaxHistorySeconds
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}

	store := &SQLiteStore{
		db:         db,
		eventChan:  make(chan *types.SyscallEvent, maxQueueSize),
		batch:      make([]*types.SyscallEvent, 0, batchSize),
		stopChan:   make(chan struct{}),
		maxHistory: int64(maxHistorySeconds),
	}

	if err := store.initSchema(); err != nil {
		return nil, err
	}

	store.wg.Add(2)
	go store.writeLoop()
	go store.cleanupLoop()

	return store, nil
}

func (s *SQLiteStore) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS syscall_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		pid INTEGER NOT NULL,
		tgid INTEGER NOT NULL,
		timestamp_ns INTEGER NOT NULL,
		comm TEXT NOT NULL,
		syscall_id INTEGER NOT NULL,
		syscall_name TEXT NOT NULL,
		filename TEXT,
		argv TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_syscall_events_timestamp ON syscall_events(timestamp_ns);
	CREATE INDEX IF NOT EXISTS idx_syscall_events_pid ON syscall_events(pid);
	CREATE INDEX IF NOT EXISTS idx_syscall_events_syscall ON syscall_events(syscall_name);
	`

	_, err := s.db.Exec(schema)
	return err
}

func (s *SQLiteStore) writeLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			s.flushBatch()
			return
		case event := <-s.eventChan:
			s.batchMutex.Lock()
			s.batch = append(s.batch, event)
			if len(s.batch) >= batchSize {
				s.flushBatchLocked()
			}
			s.batchMutex.Unlock()
		case <-ticker.C:
			s.batchMutex.Lock()
			if len(s.batch) > 0 {
				s.flushBatchLocked()
			}
			s.batchMutex.Unlock()
		}
	}
}

func (s *SQLiteStore) flushBatchLocked() {
	if len(s.batch) == 0 {
		return
	}

	tx, err := s.db.Begin()
	if err != nil {
		fmt.Printf("Error beginning transaction: %v\n", err)
		s.batch = s.batch[:0]
		return
	}

	stmt, err := tx.Prepare(`
		INSERT INTO syscall_events (pid, tgid, timestamp_ns, comm, syscall_id, syscall_name, filename, argv)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		fmt.Printf("Error preparing statement: %v\n", err)
		tx.Rollback()
		s.batch = s.batch[:0]
		return
	}
	defer stmt.Close()

	for _, event := range s.batch {
		_, err := stmt.Exec(
			event.PID,
			event.TGID,
			event.Timestamp,
			event.Comm,
			event.SyscallID,
			event.SyscallName,
			event.Filename,
			event.Argv,
		)
		if err != nil {
			fmt.Printf("Error inserting event: %v\n", err)
		}
	}

	if err := tx.Commit(); err != nil {
		fmt.Printf("Error committing transaction: %v\n", err)
	}

	s.batch = s.batch[:0]
}

func (s *SQLiteStore) flushBatch() {
	s.batchMutex.Lock()
	defer s.batchMutex.Unlock()
	s.flushBatchLocked()
}

func (s *SQLiteStore) cleanupLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.cleanupOldData()
		}
	}
}

func (s *SQLiteStore) cleanupOldData() {
	cutoff := time.Now().UnixNano() - (s.maxHistory * 1e9)

	result, err := s.db.Exec(
		"DELETE FROM syscall_events WHERE timestamp_ns < ?",
		cutoff,
	)
	if err != nil {
		fmt.Printf("Error cleaning up old data: %v\n", err)
		return
	}

	deleted, _ := result.RowsAffected()
	if deleted > 0 {
		fmt.Printf("Cleaned up %d old events\n", deleted)
	}
}

func (s *SQLiteStore) StoreEvent(event *types.SyscallEvent) {
	select {
	case s.eventChan <- event:
	default:
	}
}

func (s *SQLiteStore) QueryEvents(ctx context.Context, startNano, endNano int64) ([]*types.SyscallEvent, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT pid, tgid, timestamp_ns, comm, syscall_id, syscall_name, filename, argv
		FROM syscall_events
		WHERE timestamp_ns >= ? AND timestamp_ns <= ?
		ORDER BY timestamp_ns ASC
		LIMIT 50000
	`, startNano, endNano)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*types.SyscallEvent
	for rows.Next() {
		event := &types.SyscallEvent{}
		err := rows.Scan(
			&event.PID,
			&event.TGID,
			&event.Timestamp,
			&event.Comm,
			&event.SyscallID,
			&event.SyscallName,
			&event.Filename,
			&event.Argv,
		)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, rows.Err()
}

func (s *SQLiteStore) QueryStats(ctx context.Context, startNano, endNano int64, resolutionSeconds int) ([]*types.TimeSeriesPoint, error) {
	if resolutionSeconds <= 0 {
		resolutionSeconds = 1
	}

	bucketNano := int64(resolutionSeconds) * 1e9

	rows, err := s.db.QueryContext(ctx, `
		SELECT 
			(timestamp_ns / ?) * ? AS bucket,
			syscall_name,
			COUNT(*) as count
		FROM syscall_events
		WHERE timestamp_ns >= ? AND timestamp_ns <= ?
		GROUP BY bucket, syscall_name
		ORDER BY bucket ASC
	`, bucketNano, bucketNano, startNano, endNano)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []*types.TimeSeriesPoint
	for rows.Next() {
		point := &types.TimeSeriesPoint{}
		err := rows.Scan(&point.Timestamp, &point.Syscall, &point.Count)
		if err != nil {
			return nil, err
		}
		points = append(points, point)
	}

	return points, rows.Err()
}

func (s *SQLiteStore) Close() {
	close(s.stopChan)
	s.wg.Wait()
	s.flushBatch()
	s.db.Close()
}
