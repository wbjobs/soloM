package gateway

import (
	"sync"
	"time"

	"go.uber.org/zap"

	"push-gateway/pkg/model"
)

type AckCallback func(msgID string, success bool)

type trackedMessage struct {
	msgID      string
	userID     string
	payload    interface{}
	expiresAt  time.Time
	retryCount int
	maxRetry   int
	callback   AckCallback
}

type MessageTracker struct {
	pending   sync.Map
	timeout   time.Duration
	maxRetry  int
	stopChan  chan struct{}
	stopped   bool
	mu        sync.Mutex
}

func NewMessageTracker(timeout time.Duration, maxRetry int) *MessageTracker {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	if maxRetry <= 0 {
		maxRetry = 5
	}

	return &MessageTracker{
		timeout:  timeout,
		maxRetry: maxRetry,
		stopChan: make(chan struct{}),
	}
}

func (mt *MessageTracker) Track(msgID string, userID string, payload interface{}, callback AckCallback) {
	if msgID == "" {
		msgID = model.GenerateMsgID()
	}

	tm := &trackedMessage{
		msgID:      msgID,
		userID:     userID,
		payload:    payload,
		expiresAt:  time.Now().Add(mt.timeout),
		retryCount: 0,
		maxRetry:   mt.maxRetry,
		callback:   callback,
	}

	mt.pending.Store(msgID, tm)
}

func (mt *MessageTracker) ACK(msgID string) bool {
	val, ok := mt.pending.LoadAndDelete(msgID)
	if !ok {
		return false
	}

	tm := val.(*trackedMessage)
	if tm.callback != nil {
		tm.callback(msgID, true)
	}

	zap.L().Debug("Message acknowledged",
		zap.String("msg_id", msgID),
		zap.String("user_id", tm.userID),
		zap.Int("retry_count", tm.retryCount),
	)
	return true
}

func (mt *MessageTracker) NAK(msgID string) bool {
	val, ok := mt.pending.Load(msgID)
	if !ok {
		return false
	}

	tm := val.(*trackedMessage)
	tm.retryCount++

	if tm.retryCount >= tm.maxRetry {
		mt.pending.Delete(msgID)
		if tm.callback != nil {
			tm.callback(msgID, false)
		}
		zap.L().Warn("Message max retries exceeded",
			zap.String("msg_id", msgID),
			zap.String("user_id", tm.userID),
			zap.Int("max_retry", tm.maxRetry),
		)
		return false
	}

	tm.expiresAt = time.Now().Add(mt.timeout)
	zap.L().Debug("Message marked for retry",
		zap.String("msg_id", msgID),
		zap.String("user_id", tm.userID),
		zap.Int("retry_count", tm.retryCount),
	)
	return true
}

func (mt *MessageTracker) GetPending(msgID string) (*trackedMessage, bool) {
	val, ok := mt.pending.Load(msgID)
	if !ok {
		return nil, false
	}
	return val.(*trackedMessage), true
}

func (mt *MessageTracker) PendingCount() int {
	count := 0
	mt.pending.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	return count
}

func (mt *MessageTracker) CheckExpired() []*trackedMessage {
	now := time.Now()
	expired := make([]*trackedMessage, 0, 100)

	mt.pending.Range(func(key, value interface{}) bool {
		tm := value.(*trackedMessage)
		if tm.expiresAt.Before(now) {
			tm.retryCount++
			if tm.retryCount >= tm.maxRetry {
				mt.pending.Delete(key)
				if tm.callback != nil {
					tm.callback(tm.msgID, false)
				}
				zap.L().Warn("Message timeout, max retries exceeded",
					zap.String("msg_id", tm.msgID),
					zap.String("user_id", tm.userID),
				)
			} else {
				backoff := getExponentialBackoff(tm.retryCount)
				tm.expiresAt = time.Now().Add(backoff)
				expired = append(expired, tm)
				zap.L().Debug("Message timeout, scheduled for retry",
					zap.String("msg_id", tm.msgID),
					zap.String("user_id", tm.userID),
					zap.Int("retry_count", tm.retryCount),
					zap.Duration("backoff", backoff),
				)
			}
		}
		return true
	})

	return expired
}

func (mt *MessageTracker) Start() {
	go mt.checkLoop()
	zap.L().Info("Message tracker started",
		zap.Duration("timeout", mt.timeout),
		zap.Int("max_retry", mt.maxRetry),
	)
}

func (mt *MessageTracker) Stop() {
	mt.mu.Lock()
	defer mt.mu.Unlock()

	if !mt.stopped {
		mt.stopped = true
		close(mt.stopChan)
		zap.L().Info("Message tracker stopped")
	}
}

func (mt *MessageTracker) checkLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-mt.stopChan:
			return
		case <-ticker.C:
			mt.CheckExpired()
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
