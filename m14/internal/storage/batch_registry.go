package storage

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
)

type BatchRegistry struct {
	redis          *RedisClient
	hashKey        string
	gatewayAddr    string
	pendingReg     sync.Map
	pendingUnreg   sync.Map
	batchSize      int
	flushInterval  time.Duration
	stopChan       chan struct{}
	stopped        bool
	mu             sync.Mutex
	regBuffer      []string
	unregBuffer    []string
}

func NewBatchRegistry(redis *RedisClient, gatewayAddr string, batchSize int, flushIntervalMs int) *BatchRegistry {
	if batchSize <= 0 {
		batchSize = 500
	}
	if flushIntervalMs <= 0 {
		flushIntervalMs = 100
	}

	return &BatchRegistry{
		redis:         redis,
		hashKey:       redis.UserHashKey(),
		gatewayAddr:   gatewayAddr,
		batchSize:     batchSize,
		flushInterval: time.Duration(flushIntervalMs) * time.Millisecond,
		stopChan:      make(chan struct{}),
		regBuffer:     make([]string, 0, batchSize),
		unregBuffer:   make([]string, 0, batchSize),
	}
}

func (br *BatchRegistry) Start() {
	go br.flushLoop()
	zap.L().Info("Batch registry started",
		zap.Int("batch_size", br.batchSize),
		zap.String("flush_interval", br.flushInterval.String()),
	)
}

func (br *BatchRegistry) Stop() {
	br.mu.Lock()
	defer br.mu.Unlock()

	if !br.stopped {
		br.stopped = true
		close(br.stopChan)
		br.flush()
		zap.L().Info("Batch registry stopped")
	}
}

func (br *BatchRegistry) RegisterUser(userID string) {
	br.pendingReg.Store(userID, struct{}{})
}

func (br *BatchRegistry) UnregisterUser(userID string) {
	br.pendingUnreg.Store(userID, struct{}{})
}

func (br *BatchRegistry) flushLoop() {
	ticker := time.NewTicker(br.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-br.stopChan:
			return
		case <-ticker.C:
			br.flush()
		}
	}
}

func (br *BatchRegistry) flush() {
	br.mu.Lock()
	defer br.mu.Unlock()

	br.regBuffer = br.regBuffer[:0]
	br.unregBuffer = br.unregBuffer[:0]

	regCount := 0
	br.pendingReg.Range(func(key, value interface{}) bool {
		userID := key.(string)
		br.regBuffer = append(br.regBuffer, userID)
		br.pendingReg.Delete(key)
		regCount++
		return regCount < br.batchSize
	})

	unregCount := 0
	br.pendingUnreg.Range(func(key, value interface{}) bool {
		userID := key.(string)
		br.unregBuffer = append(br.unregBuffer, userID)
		br.pendingUnreg.Delete(key)
		unregCount++
		return unregCount < br.batchSize
	})

	if len(br.regBuffer) > 0 {
		br.batchRegister(br.regBuffer)
	}

	if len(br.unregBuffer) > 0 {
		br.batchUnregister(br.unregBuffer)
	}
}

func (br *BatchRegistry) batchRegister(userIDs []string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pipe := br.redis.Client().Pipeline()

	for _, userID := range userIDs {
		pipe.HSet(ctx, br.hashKey, userID, br.gatewayAddr)
	}

	_, err := pipe.Exec(ctx)
	if err != nil {
		zap.L().Warn("Failed to batch register users",
			zap.Int("count", len(userIDs)),
			zap.Error(err),
		)
		for _, userID := range userIDs {
			br.pendingReg.Store(userID, struct{}{})
		}
		return
	}

	zap.L().Debug("Batch registered users", zap.Int("count", len(userIDs)))
}

func (br *BatchRegistry) batchUnregister(userIDs []string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pipe := br.redis.Client().Pipeline()

	fields := make([]interface{}, len(userIDs))
	for i, userID := range userIDs {
		fields[i] = userID
	}

	pipe.HDel(ctx, br.hashKey, fields...)

	_, err := pipe.Exec(ctx)
	if err != nil {
		zap.L().Warn("Failed to batch unregister users",
			zap.Int("count", len(userIDs)),
			zap.Error(err),
		)
		for _, userID := range userIDs {
			br.pendingUnreg.Store(userID, struct{}{})
		}
		return
	}

	zap.L().Debug("Batch unregistered users", zap.Int("count", len(userIDs)))
}

func (br *BatchRegistry) PendingCount() (reg, unreg int) {
	br.pendingReg.Range(func(_, _ interface{}) bool {
		reg++
		return true
	})
	br.pendingUnreg.Range(func(_, _ interface{}) bool {
		unreg++
		return true
	})
	return
}
