package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"push-gateway/pkg/model"
)

type DelayQueue struct {
	redis         *RedisClient
	queueKey      string
	historyKey    string
	dataKey       string
	stopChan      chan struct{}
	stopped       bool
	mu            sync.Mutex
	maxRetries    int
	historyTTL    time.Duration
}

func NewDelayQueue(redis *RedisClient) *DelayQueue {
	return &DelayQueue{
		redis:      redis,
		queueKey:   "push:delay_queue",
		historyKey: "push:history",
		dataKey:    "push:msg_data",
		stopChan:   make(chan struct{}),
		maxRetries: 5,
		historyTTL: 7 * 24 * time.Hour,
	}
}

func NewDelayQueueWithConfig(redis *RedisClient, queueKey, historyKey, dataKey string, maxRetries int, historyTTL time.Duration) *DelayQueue {
	if queueKey == "" {
		queueKey = "push:delay_queue"
	}
	if historyKey == "" {
		historyKey = "push:history"
	}
	if dataKey == "" {
		dataKey = "push:msg_data"
	}
	if maxRetries <= 0 {
		maxRetries = 5
	}
	if historyTTL <= 0 {
		historyTTL = 7 * 24 * time.Hour
	}

	return &DelayQueue{
		redis:      redis,
		queueKey:   queueKey,
		historyKey: historyKey,
		dataKey:    dataKey,
		stopChan:   make(chan struct{}),
		maxRetries: maxRetries,
		historyTTL: historyTTL,
	}
}

func (dq *DelayQueue) SetMaxRetries(max int) {
	if max > 0 {
		dq.maxRetries = max
	}
}

func (dq *DelayQueue) SetHistoryTTL(ttl time.Duration) {
	if ttl > 0 {
		dq.historyTTL = ttl
	}
}

func (dq *DelayQueue) Add(msg *model.PendingMessage) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if msg.MsgID == "" {
		msg.MsgID = model.GenerateMsgID()
	}
	if msg.CreatedAt == 0 {
		msg.CreatedAt = time.Now().Unix()
	}
	if msg.RetryAt == 0 {
		msg.RetryAt = time.Now().Unix()
	}
	if msg.MaxRetry == 0 {
		msg.MaxRetry = dq.maxRetries
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	pipe := dq.redis.Client().Pipeline()
	pipe.HSet(ctx, dq.dataKey, msg.MsgID, data)
	pipe.ZAdd(ctx, dq.queueKey, redis.Z{
		Score:  float64(msg.RetryAt),
		Member: msg.MsgID,
	})

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to add message to delay queue: %w", err)
	}

	zap.L().Debug("Message added to delay queue",
		zap.String("msg_id", msg.MsgID),
		zap.String("user_id", msg.UserID),
		zap.Int("retry", msg.Retry),
		zap.Int64("retry_at", msg.RetryAt),
	)
	return nil
}

func (dq *DelayQueue) AddForRetry(msgID string, userID string, payload interface{}, retry int) error {
	backoff := getExponentialBackoff(retry)
	retryAt := time.Now().Add(backoff).Unix()

	msg := &model.PendingMessage{
		MsgID:   msgID,
		UserID:  userID,
		Payload: payload,
		Retry:   retry,
		RetryAt: retryAt,
	}

	return dq.Add(msg)
}

func (dq *DelayQueue) PollDueMessages(limit int64) ([]*model.PendingMessage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	now := float64(time.Now().Unix())

	msgIDs, err := dq.redis.Client().ZRangeByScore(ctx, dq.queueKey, &redis.ZRangeBy{
		Min:    "-inf",
		Max:    fmt.Sprintf("%f", now),
		Offset: 0,
		Count:  limit,
	}).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to poll delay queue: %w", err)
	}

	if len(msgIDs) == 0 {
		return nil, nil
	}

	members := make([]interface{}, len(msgIDs))
	for i, id := range msgIDs {
		members[i] = id
	}

	pipe := dq.redis.Client().Pipeline()
	dataCmd := pipe.HMGet(ctx, dq.dataKey, msgIDs...)
	pipe.ZRem(ctx, dq.queueKey, members...)

	_, err = pipe.Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch message data: %w", err)
	}

	results := make([]*model.PendingMessage, 0, len(msgIDs))
	for _, v := range dataCmd.Val() {
		if v == nil {
			continue
		}
		data, ok := v.(string)
		if !ok {
			continue
		}

		var msg model.PendingMessage
		if err := json.Unmarshal([]byte(data), &msg); err != nil {
			continue
		}
		results = append(results, &msg)
	}

	dq.redis.Client().HDel(ctx, dq.dataKey, msgIDs...)

	return results, nil
}

func (dq *DelayQueue) Remove(msgID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pipe := dq.redis.Client().Pipeline()
	pipe.ZRem(ctx, dq.queueKey, msgID)
	pipe.HDel(ctx, dq.dataKey, msgID)

	_, err := pipe.Exec(ctx)
	return err
}

func (dq *DelayQueue) SaveToHistory(userID string, msg *model.PendingMessage, status string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	historyMsg := &model.HistoryMessage{
		MsgID:     msg.MsgID,
		Payload:   msg.Payload,
		Timestamp: msg.CreatedAt,
		Status:    status,
	}

	data, err := json.Marshal(historyMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal history message: %w", err)
	}

	key := fmt.Sprintf("%s:%s", dq.historyKey, userID)
	pipe := dq.redis.Client().Pipeline()
	pipe.LPush(ctx, key, data)
	pipe.LTrim(ctx, key, 0, 999)
	pipe.Expire(ctx, key, dq.historyTTL)

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to save history: %w", err)
	}

	return nil
}

func (dq *DelayQueue) GetHistory(userID string, limit, offset int64) ([]*model.HistoryMessage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	key := fmt.Sprintf("%s:%s", dq.historyKey, userID)
	start := offset
	end := offset + limit - 1

	dataList, err := dq.redis.Client().LRange(ctx, key, start, end).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get history: %w", err)
	}

	results := make([]*model.HistoryMessage, 0, len(dataList))
	for _, data := range dataList {
		var msg model.HistoryMessage
		if err := json.Unmarshal([]byte(data), &msg); err != nil {
			continue
		}
		results = append(results, &msg)
	}

	return results, nil
}

func (dq *DelayQueue) Size() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return dq.redis.Client().ZCard(ctx, dq.queueKey).Result()
}

func (dq *DelayQueue) Start(processor func(msg *model.PendingMessage) bool) {
	go dq.processLoop(processor)
	zap.L().Info("Delay queue started",
		zap.Int("max_retries", dq.maxRetries),
		zap.Duration("history_ttl", dq.historyTTL),
	)
}

func (dq *DelayQueue) Stop() {
	dq.mu.Lock()
	defer dq.mu.Unlock()

	if !dq.stopped {
		dq.stopped = true
		close(dq.stopChan)
		zap.L().Info("Delay queue stopped")
	}
}

func (dq *DelayQueue) processLoop(processor func(msg *model.PendingMessage) bool) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-dq.stopChan:
			return
		case <-ticker.C:
			msgs, err := dq.PollDueMessages(100)
			if err != nil {
				zap.L().Warn("Failed to poll delay queue", zap.Error(err))
				time.Sleep(1 * time.Second)
				continue
			}

			for _, msg := range msgs {
				success := processor(msg)
				if success {
					dq.SaveToHistory(msg.UserID, msg, "delivered")
				} else {
					msg.Retry++
					if msg.Retry >= msg.MaxRetry {
						dq.SaveToHistory(msg.UserID, msg, "failed")
						zap.L().Warn("Message delivery failed permanently",
							zap.String("msg_id", msg.MsgID),
							zap.String("user_id", msg.UserID),
							zap.Int("retries", msg.Retry),
						)
					} else {
						backoff := getExponentialBackoff(msg.Retry)
						msg.RetryAt = time.Now().Add(backoff).Unix()
						dq.Add(msg)
					}
				}
			}
		}
	}
}

func getExponentialBackoff(retryCount int) time.Duration {
	if retryCount <= 0 {
		return 1 * time.Second
	}
	backoff := time.Duration(1<<uint(retryCount-1)) * time.Second
	if backoff > 5*time.Minute {
		backoff = 5 * time.Minute
	}
	return backoff
}
