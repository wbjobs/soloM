package storage

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
	"time"

	"sensor-platform/config"
	"sensor-platform/models"
)

type WriteBuffer struct {
	buffer        []models.SensorData
	bufferMutex   sync.Mutex
	bufferSize    int
	flushInterval time.Duration
	maxBatchSize  int
	workerCount   int
	taskQueue     chan models.SensorData
	stopChan      chan struct{}
	wg            sync.WaitGroup

	stats struct {
		received    uint64
		flushed     uint64
		dropped     uint64
		batchErrors uint64
		mu          sync.Mutex
	}
}

var Buffer *WriteBuffer

func InitWriteBuffer() {
	bufferSize := getEnvInt("WRITE_BUFFER_SIZE", 50000)
	maxBatchSize := getEnvInt("WRITE_BATCH_SIZE", 500)
	flushInterval := getEnvInt("WRITE_FLUSH_INTERVAL_MS", 100)
	workerCount := getEnvInt("WRITE_WORKER_COUNT", 8)

	Buffer = &WriteBuffer{
		buffer:        make([]models.SensorData, 0, bufferSize),
		bufferSize:    bufferSize,
		maxBatchSize:  maxBatchSize,
		flushInterval: time.Duration(flushInterval) * time.Millisecond,
		workerCount:   workerCount,
		taskQueue:     make(chan models.SensorData, bufferSize),
		stopChan:      make(chan struct{}),
	}

	Buffer.startWorkers()
	Buffer.startFlusher()

	log.Printf("Write buffer initialized: buffer=%d, batch=%d, workers=%d, flush_interval=%v",
		bufferSize, maxBatchSize, workerCount, Buffer.flushInterval)
}

func (wb *WriteBuffer) startWorkers() {
	for i := 0; i < wb.workerCount; i++ {
		wb.wg.Add(1)
		go wb.worker(i)
	}
}

func (wb *WriteBuffer) worker(id int) {
	defer wb.wg.Done()

	localBatch := make([]models.SensorData, 0, wb.maxBatchSize)
	ticker := time.NewTicker(wb.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case data := <-wb.taskQueue:
			wb.stats.mu.Lock()
			wb.stats.received++
			wb.stats.mu.Unlock()

			localBatch = append(localBatch, data)

			if len(localBatch) >= wb.maxBatchSize {
				wb.flushBatch(localBatch)
				localBatch = localBatch[:0]
			}

		case <-ticker.C:
			if len(localBatch) > 0 {
				wb.flushBatch(localBatch)
				localBatch = localBatch[:0]
			}

		case <-wb.stopChan:
			if len(localBatch) > 0 {
				wb.flushBatch(localBatch)
			}
			return
		}
	}
}

func (wb *WriteBuffer) flushBatch(batch []models.SensorData) {
	if len(batch) == 0 {
		return
	}

	retries := 3
	for attempt := 0; attempt < retries; attempt++ {
		err := wb.batchInsert(batch)
		if err == nil {
			wb.stats.mu.Lock()
			wb.stats.flushed += uint64(len(batch))
			wb.stats.mu.Unlock()
			return
		}

		log.Printf("Batch insert failed (attempt %d/%d): %v", attempt+1, retries, err)
		time.Sleep(time.Duration(attempt+1) * 50 * time.Millisecond)
	}

	wb.stats.mu.Lock()
	wb.stats.batchErrors++
	wb.stats.dropped += uint64(len(batch))
	wb.stats.mu.Unlock()
	log.Printf("Batch dropped after %d retries, size=%d", retries, len(batch))
}

func (wb *WriteBuffer) batchInsert(data []models.SensorData) error {
	if len(data) == 0 {
		return nil
	}

	values := make([]interface{}, 0, len(data)*5)
	placeholders := ""

	for i, d := range data {
		idx := i * 5
		placeholders += fmt.Sprintf("($%d, $%d, $%d, $%d, $%d),",
			idx+1, idx+2, idx+3, idx+4, idx+5)
		values = append(values, d.DeviceID, d.Timestamp, d.Type, d.Value, d.Unit)
	}

	placeholders = placeholders[:len(placeholders)-1]

	sql := fmt.Sprintf(`
		INSERT INTO sensor_data (device_id, timestamp, type, value, unit)
		VALUES %s
	`, placeholders)

	return config.DB.Exec(sql, values...).Error
}

func (wb *WriteBuffer) Write(data models.SensorData) {
	select {
	case wb.taskQueue <- data:
	default:
		wb.stats.mu.Lock()
		wb.stats.dropped++
		wb.stats.mu.Unlock()
	}
}

func (wb *WriteBuffer) WriteAsync(data models.SensorData) bool {
	select {
	case wb.taskQueue <- data:
		return true
	default:
		wb.stats.mu.Lock()
		wb.stats.dropped++
		wb.stats.mu.Unlock()
		return false
	}
}

func (wb *WriteBuffer) startFlusher() {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				wb.stats.mu.Lock()
				received := wb.stats.received
				flushed := wb.stats.flushed
				dropped := wb.stats.dropped
				errors := wb.stats.batchErrors
				wb.stats.mu.Unlock()

				log.Printf("Buffer stats: received=%d, flushed=%d, dropped=%d, errors=%d, queue_len=%d",
					received, flushed, dropped, errors, len(wb.taskQueue))

			case <-wb.stopChan:
				return
			}
		}
	}()
}

func (wb *WriteBuffer) Stop() {
	close(wb.stopChan)
	wb.wg.Wait()
	close(wb.taskQueue)
	log.Println("Write buffer stopped")
}

func (wb *WriteBuffer) GetStats() map[string]interface{} {
	wb.stats.mu.Lock()
	defer wb.stats.mu.Unlock()

	return map[string]interface{}{
		"received": wb.stats.received,
		"flushed":  wb.stats.flushed,
		"dropped":  wb.stats.dropped,
		"errors":   wb.stats.batchErrors,
		"queue_len": len(wb.taskQueue),
		"queue_cap": cap(wb.taskQueue),
	}
}

func getEnvInt(key string, defaultValue int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue
	}
	return parsed
}
