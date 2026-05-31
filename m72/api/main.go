package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	_ "github.com/lib/pq"
)

type SensorData struct {
	DeviceID      string  `json:"device_id"`
	Temperature   float64 `json:"temperature"`
	VibrationFreq float64 `json:"vibration_freq"`
	Timestamp     string  `json:"timestamp"`
}

type VibrationAlert struct {
	DeviceID    string  `json:"device_id"`
	StdDev      float64 `json:"std_dev"`
	Mean        float64 `json:"mean"`
	Threshold   float64 `json:"threshold"`
	SampleCount int     `json:"sample_count"`
	Timestamp   string  `json:"timestamp"`
}

type SSEEventType string

const (
	SSEDataEvent  SSEEventType = "data"
	SSEAlertEvent SSEEventType = "alert"
)

type SSEEvent struct {
	Type SSEEventType
	Data interface{}
}

type SSEClient struct {
	Ch chan SSEEvent
}

type SSEBroker struct {
	mu      sync.RWMutex
	clients map[*SSEClient]struct{}
}

func NewSSEBroker() *SSEBroker {
	return &SSEBroker{
		clients: make(map[*SSEClient]struct{}),
	}
}

func (b *SSEBroker) Subscribe() *SSEClient {
	client := &SSEClient{Ch: make(chan SSEEvent, 128)}
	b.mu.Lock()
	b.clients[client] = struct{}{}
	b.mu.Unlock()
	return client
}

func (b *SSEBroker) Unsubscribe(client *SSEClient) {
	b.mu.Lock()
	delete(b.clients, client)
	b.mu.Unlock()
	close(client.Ch)
}

func (b *SSEBroker) BroadcastData(data SensorData) {
	evt := SSEEvent{Type: SSEDataEvent, Data: data}
	b.mu.RLock()
	defer b.mu.RUnlock()
	for client := range b.clients {
		select {
		case client.Ch <- evt:
		default:
		}
	}
}

func (b *SSEBroker) BroadcastAlert(alert VibrationAlert) {
	evt := SSEEvent{Type: SSEAlertEvent, Data: alert}
	b.mu.RLock()
	defer b.mu.RUnlock()
	for client := range b.clients {
		select {
		case client.Ch <- evt:
		default:
		}
	}
}

var broker = NewSSEBroker()

const (
	batchSize          = 100
	batchFlushInterval = 500 * time.Millisecond
	dbWriteTimeout     = 5 * time.Second
	dbQueryTimeout     = 8 * time.Second
	sseHeartbeatInterval = 15 * time.Second
	writeQueueSize     = 8192
	redisStreamCount   = 50
	redisBlockTimeout  = 2 * time.Second

	vibWindowSize     = 20
	vibStdDevThreshold = 30.0
	vibAlertCooldown  = 30 * time.Second
)

type VibrationMonitor struct {
	mu       sync.Mutex
	windows  map[string]*vibWindow
	broker   *SSEBroker
}

type vibWindow struct {
	samples    []float64
	lastAlert  time.Time
	inAlert    bool
}

func NewVibrationMonitor(b *SSEBroker) *VibrationMonitor {
	return &VibrationMonitor{
		windows: make(map[string]*vibWindow),
		broker:  b,
	}
}

func (vm *VibrationMonitor) Observe(data SensorData) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	w, exists := vm.windows[data.DeviceID]
	if !exists {
		w = &vibWindow{
			samples: make([]float64, 0, vibWindowSize),
		}
		vm.windows[data.DeviceID] = w
	}

	w.samples = append(w.samples, data.VibrationFreq)
	if len(w.samples) > vibWindowSize {
		w.samples = w.samples[len(w.samples)-vibWindowSize:]
	}

	if len(w.samples) < 3 {
		return
	}

	stdDev := calcStdDev(w.samples)
	mean := calcMean(w.samples)

	now := time.Now()

	if stdDev > vibStdDevThreshold {
		if !w.inAlert || now.Sub(w.lastAlert) >= vibAlertCooldown {
			w.inAlert = true
			w.lastAlert = now

			alert := VibrationAlert{
				DeviceID:    data.DeviceID,
				StdDev:      math.Round(stdDev*100) / 100,
				Mean:        math.Round(mean*100) / 100,
				Threshold:   vibStdDevThreshold,
				SampleCount: len(w.samples),
				Timestamp:   now.UTC().Format(time.RFC3339),
			}

			log.Printf("[API] ⚠ VIBRATION ALERT: device=%s stdDev=%.2f > threshold=%.2f (mean=%.2f, n=%d)",
				alert.DeviceID, alert.StdDev, alert.Threshold, alert.Mean, alert.SampleCount)

			go vm.broker.BroadcastAlert(alert)
		}
	} else {
		if w.inAlert {
			w.inAlert = false
			log.Printf("[API] ✓ Vibration normal: device=%s stdDev=%.2f", data.DeviceID, stdDev)
		}
	}
}

func calcMean(samples []float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range samples {
		sum += v
	}
	return sum / float64(len(samples))
}

func calcStdDev(samples []float64) float64 {
	n := len(samples)
	if n < 2 {
		return 0
	}
	mean := calcMean(samples)
	sumSq := 0.0
	for _, v := range samples {
		d := v - mean
		sumSq += d * d
	}
	variance := sumSq / float64(n-1)
	return math.Sqrt(variance)
}

type WriteQueue struct {
	ch      chan SensorData
	dropped atomic.Int64
}

func NewWriteQueue(size int) *WriteQueue {
	return &WriteQueue{
		ch: make(chan SensorData, size),
	}
}

func (q *WriteQueue) Push(data SensorData) bool {
	select {
	case q.ch <- data:
		return true
	default:
		q.dropped.Add(1)
		return false
	}
}

type BatchWriter struct {
	db       *sql.DB
	queue    *WriteQueue
	ctx      context.Context
	cancel   context.CancelFunc
	batchBuf []SensorData
	flushed  atomic.Int64
	failed   atomic.Int64
}

func NewBatchWriter(db *sql.DB, queue *WriteQueue, ctx context.Context) *BatchWriter {
	bwCtx, bwCancel := context.WithCancel(ctx)
	return &BatchWriter{
		db:       db,
		queue:    queue,
		ctx:      bwCtx,
		cancel:   bwCancel,
		batchBuf: make([]SensorData, 0, batchSize),
	}
}

func (bw *BatchWriter) Stop() {
	bw.cancel()
}

func (bw *BatchWriter) Run() {
	ticker := time.NewTicker(batchFlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-bw.ctx.Done():
			if len(bw.batchBuf) > 0 {
				bw.flush(bw.batchBuf)
				bw.batchBuf = bw.batchBuf[:0]
			}
			return
		case data, ok := <-bw.queue.ch:
			if !ok {
				return
			}
			bw.batchBuf = append(bw.batchBuf, data)
			if len(bw.batchBuf) >= batchSize {
				bw.flush(bw.batchBuf)
				bw.batchBuf = bw.batchBuf[:0]
			}
		case <-ticker.C:
			if len(bw.batchBuf) > 0 {
				bw.flush(bw.batchBuf)
				bw.batchBuf = bw.batchBuf[:0]
			}
		}
	}
}

func (bw *BatchWriter) flush(batch []SensorData) {
	if len(batch) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(bw.ctx, dbWriteTimeout)
	defer cancel()

	valueParts := make([]string, 0, len(batch))
	args := make([]interface{}, 0, len(batch)*4)
	for i, d := range batch {
		ts, err := time.Parse(time.RFC3339, d.Timestamp)
		if err != nil {
			ts = time.Now()
		}
		offset := i * 4
		valueParts = append(valueParts, fmt.Sprintf("($%d, $%d, $%d, $%d)", offset+1, offset+2, offset+3, offset+4))
		args = append(args, ts, d.DeviceID, d.Temperature, d.VibrationFreq)
	}

	query := fmt.Sprintf(
		"INSERT INTO sensor_readings (time, device_id, temperature, vibration_freq) VALUES %s",
		strings.Join(valueParts, ","),
	)

	_, err := bw.db.ExecContext(ctx, query, args...)
	if err != nil {
		bw.failed.Add(int64(len(batch)))
		log.Printf("[API] Batch insert failed (%d rows): %v", len(batch), err)

		for _, d := range batch {
			if bw.insertSingle(d) {
				bw.flushed.Add(1)
			}
		}
		return
	}

	bw.flushed.Add(int64(len(batch)))
}

func (bw *BatchWriter) insertSingle(data SensorData) bool {
	singleCtx, singleCancel := context.WithTimeout(bw.ctx, dbWriteTimeout)
	defer singleCancel()

	ts, err := time.Parse(time.RFC3339, data.Timestamp)
	if err != nil {
		ts = time.Now()
	}
	_, err = bw.db.ExecContext(singleCtx,
		`INSERT INTO sensor_readings (time, device_id, temperature, vibration_freq) VALUES ($1, $2, $3, $4)`,
		ts, data.DeviceID, data.Temperature, data.VibrationFreq,
	)
	if err != nil {
		log.Printf("[API] Single insert retry failed for device=%s: %v", data.DeviceID, err)
		return false
	}
	return true
}

func initDB(db *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS sensor_readings (
			time        TIMESTAMPTZ       NOT NULL,
			device_id   TEXT              NOT NULL,
			temperature DOUBLE PRECISION  NOT NULL,
			vibration_freq DOUBLE PRECISION NOT NULL
		);
		SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);
	`)
	if err != nil {
		return fmt.Errorf("initDB: %w", err)
	}

	_, err = db.ExecContext(ctx, `
		CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_id ON sensor_readings (device_id, time DESC);
	`)
	if err != nil {
		log.Printf("[API] Warning: index creation failed: %v", err)
	}

	log.Println("[API] TimescaleDB table initialized")
	return nil
}

func consumeRedisStream(ctx context.Context, rdb *redis.Client, writeQueue *WriteQueue, vibMon *VibrationMonitor) {
	lastID := "0"
	consumeErrors := 0

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		readCtx, readCancel := context.WithTimeout(ctx, redisBlockTimeout+time.Second)
		results, err := rdb.XRead(readCtx, &redis.XReadArgs{
			Streams: []string{"sensor_data", lastID},
			Count:   redisStreamCount,
			Block:   redisBlockTimeout,
		}).Result()
		readCancel()

		if err != nil {
			if err == redis.Nil || err == context.DeadlineExceeded {
				consumeErrors = 0
				continue
			}
			if ctx.Err() != nil {
				return
			}
			consumeErrors++
			if consumeErrors > 10 {
				log.Printf("[API] Redis XRead persistent errors (%d), backing off", consumeErrors)
				time.Sleep(time.Duration(consumeErrors) * time.Second)
			} else {
				log.Printf("[API] Redis XRead error: %v", err)
				time.Sleep(time.Second)
			}
			continue
		}

		consumeErrors = 0

		for _, stream := range results {
			for _, msg := range stream.Messages {
				lastID = msg.ID

				payload, ok := msg.Values["payload"].(string)
				if !ok {
					continue
				}

				var data SensorData
				if err := json.Unmarshal([]byte(payload), &data); err != nil {
					log.Printf("[API] JSON unmarshal error: %v", err)
					continue
				}

				if data.Timestamp == "" {
					data.Timestamp = time.Now().UTC().Format(time.RFC3339)
				}

				if !writeQueue.Push(data) {
					log.Printf("[API] Write queue full, dropping data for device=%s", data.DeviceID)
				}

				vibMon.Observe(data)

				broker.BroadcastData(data)
			}
		}
	}
}

func handleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no")

	client := broker.Subscribe()
	defer broker.Unsubscribe(client)

	notify := r.Context().Done()
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\"}\n\n")
	flusher.Flush()

	heartbeat := time.NewTicker(sseHeartbeatInterval)
	defer heartbeat.Stop()

	for {
		select {
		case <-notify:
			return
		case evt := <-client.Ch:
			jsonData, err := json.Marshal(evt.Data)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Type, jsonData)
			flusher.Flush()
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

func handleLatestDevices(readDB *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		ctx, cancel := context.WithTimeout(r.Context(), dbQueryTimeout)
		defer cancel()

		rows, err := readDB.QueryContext(ctx, `
			SELECT DISTINCT ON (device_id)
				time, device_id, temperature, vibration_freq
			FROM sensor_readings
			ORDER BY device_id, time DESC
			LIMIT 100
		`)
		if err != nil {
			if ctx.Err() == context.DeadlineExceeded {
				http.Error(w, `{"error":"query timeout"}`, http.StatusGatewayTimeout)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var results []SensorData
		for rows.Next() {
			var d SensorData
			if err := rows.Scan(&d.Timestamp, &d.DeviceID, &d.Temperature, &d.VibrationFreq); err != nil {
				continue
			}
			results = append(results, d)
		}

		json.NewEncoder(w).Encode(results)
	}
}

func handleHistory(readDB *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		ctx, cancel := context.WithTimeout(r.Context(), dbQueryTimeout)
		defer cancel()

		deviceID := r.URL.Query().Get("device_id")
		limit := 200

		var rows *sql.Rows
		var err error
		if deviceID != "" {
			rows, err = readDB.QueryContext(ctx, `
				SELECT time, device_id, temperature, vibration_freq
				FROM sensor_readings
				WHERE device_id = $1
				ORDER BY time DESC
				LIMIT $2
			`, deviceID, limit)
		} else {
			rows, err = readDB.QueryContext(ctx, `
				SELECT time, device_id, temperature, vibration_freq
				FROM sensor_readings
				ORDER BY time DESC
				LIMIT $1
			`, limit)
		}

		if err != nil {
			if ctx.Err() == context.DeadlineExceeded {
				http.Error(w, `{"error":"query timeout"}`, http.StatusGatewayTimeout)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var results []SensorData
		for rows.Next() {
			var d SensorData
			if err := rows.Scan(&d.Timestamp, &d.DeviceID, &d.Temperature, &d.VibrationFreq); err != nil {
				continue
			}
			results = append(results, d)
		}

		json.NewEncoder(w).Encode(results)
	}
}

func statsReporter(ctx context.Context, batchWriter *BatchWriter, writeQueue *WriteQueue) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			dropped := writeQueue.dropped.Swap(0)
			flushed := batchWriter.flushed.Swap(0)
			failed := batchWriter.failed.Swap(0)
			queueLen := len(writeQueue.ch)
			log.Printf("[API] Stats: flushed=%d failed=%d queueLen=%d queueDropped=%d",
				flushed, failed, queueLen, dropped)
		}
	}
}

func main() {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	dbHost := os.Getenv("DB_HOST")
	if dbHost == "" {
		dbHost = "localhost"
	}
	dbPort := os.Getenv("DB_PORT")
	if dbPort == "" {
		dbPort = "5432"
	}
	dbUser := os.Getenv("DB_USER")
	if dbUser == "" {
		dbUser = "industrial"
	}
	dbPassword := os.Getenv("DB_PASSWORD")
	if dbPassword == "" {
		dbPassword = "industrial123"
	}
	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "sensor_db"
	}
	apiPort := os.Getenv("API_PORT")
	if apiPort == "" {
		apiPort = "8080"
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		PoolSize:     16,
		MinIdleConns: 4,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolTimeout:  4 * time.Second,
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for i := 0; i < 30; i++ {
		if err := rdb.Ping(ctx).Err(); err == nil {
			break
		}
		log.Printf("[API] Waiting for Redis... (%d/30)", i+1)
		time.Sleep(time.Second)
	}
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("[API] Cannot connect to Redis: %v", err)
	}
	log.Printf("[API] Connected to Redis at %s", redisAddr)

	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName,
	)

	writeDB, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("[API] Cannot open write DB: %v", err)
	}
	writeDB.SetMaxOpenConns(10)
	writeDB.SetMaxIdleConns(5)
	writeDB.SetConnMaxLifetime(30 * time.Minute)
	writeDB.SetConnMaxIdleTime(5 * time.Minute)

	for i := 0; i < 30; i++ {
		if err := writeDB.Ping(); err == nil {
			break
		}
		log.Printf("[API] Waiting for TimescaleDB... (%d/30)", i+1)
		time.Sleep(time.Second)
	}
	if err := writeDB.Ping(); err != nil {
		log.Fatalf("[API] Cannot connect to TimescaleDB: %v", err)
	}
	log.Printf("[API] Connected to TimescaleDB at %s:%s", dbHost, dbPort)

	readDB, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("[API] Cannot open read DB: %v", err)
	}
	readDB.SetMaxOpenConns(8)
	readDB.SetMaxIdleConns(4)
	readDB.SetConnMaxLifetime(30 * time.Minute)
	readDB.SetConnMaxIdleTime(5 * time.Minute)

	if err := readDB.Ping(); err != nil {
		log.Fatalf("[API] Cannot ping read DB: %v", err)
	}

	if err := initDB(writeDB); err != nil {
		log.Fatalf("[API] Failed to initialize DB: %v", err)
	}

	writeQueue := NewWriteQueue(writeQueueSize)
	batchWriter := NewBatchWriter(writeDB, writeQueue, ctx)
	vibMonitor := NewVibrationMonitor(broker)

	go batchWriter.Run()
	go consumeRedisStream(ctx, rdb, writeQueue, vibMonitor)
	go statsReporter(ctx, batchWriter, writeQueue)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/sse", handleSSE)
	mux.HandleFunc("/api/devices", handleLatestDevices(readDB))
	mux.HandleFunc("/api/history", handleHistory(readDB))
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", apiPort),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("[API] HTTP server listening on :%s (writePool=10, readPool=8, batchSize=%d, queueSize=%d, vibWindow=%d, vibThreshold=%.1f)",
			apiPort, batchSize, writeQueueSize, vibWindowSize, vibStdDevThreshold)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[API] HTTP server error: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("[API] Shutting down...")
	cancel()
	batchWriter.Stop()
	srv.Shutdown(context.Background())
	rdb.Close()
	writeDB.Close()
	readDB.Close()
}
