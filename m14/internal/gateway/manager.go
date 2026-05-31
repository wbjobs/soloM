package gateway

import (
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
	"golang.org/x/sync/singleflight"

	"push-gateway/pkg/model"
)

type ConnectionManager struct {
	connections sync.Map
	count       int64
	maxConns    int64
	sf          singleflight.Group
}

func NewConnectionManager(maxConnections int) *ConnectionManager {
	return &ConnectionManager{
		maxConns: int64(maxConnections),
	}
}

func (m *ConnectionManager) Add(userID string, conn *Connection) bool {
	current := atomic.LoadInt64(&m.count)
	if current >= m.maxConns {
		zap.L().Warn("Max connections reached", zap.Int64("current", current), zap.Int64("max", m.maxConns))
		return false
	}

	key := userID
	_, ok := m.connections.Load(key)
	if ok {
		m.Close(key)
	}

	m.connections.Store(key, conn)
	atomic.AddInt64(&m.count, 1)
	zap.L().Debug("Connection added", zap.String("user_id", userID), zap.Int64("total", atomic.LoadInt64(&m.count)))
	return true
}

func (m *ConnectionManager) Remove(userID string) {
	key := userID
	_, ok := m.connections.LoadAndDelete(key)
	if ok {
		atomic.AddInt64(&m.count, -1)
		zap.L().Debug("Connection removed", zap.String("user_id", userID), zap.Int64("total", atomic.LoadInt64(&m.count)))
	}
}

func (m *ConnectionManager) Get(userID string) (*Connection, bool) {
	key := userID
	val, ok := m.connections.Load(key)
	if !ok {
		return nil, false
	}
	return val.(*Connection), true
}

func (m *ConnectionManager) Close(userID string) {
	key := userID
	val, ok := m.connections.LoadAndDelete(key)
	if ok {
		conn := val.(*Connection)
		conn.Close()
		atomic.AddInt64(&m.count, -1)
		zap.L().Debug("Connection closed", zap.String("user_id", userID))
	}
}

func (m *ConnectionManager) Count() int64 {
	return atomic.LoadInt64(&m.count)
}

type PushResult struct {
	Success bool
	MsgID   string
	Offline bool
}

func (m *ConnectionManager) PushToUser(userID string, payload interface{}) PushResult {
	conn, ok := m.Get(userID)
	msgID := model.GenerateMsgID()

	if !ok {
		return PushResult{Success: false, MsgID: msgID, Offline: true}
	}

	msg := &model.Message{
		Type:    model.MessageTypePush,
		MsgID:   msgID,
		UserID:  userID,
		Payload: payload,
	}

	data, err := msg.ToJSON()
	if err != nil {
		zap.L().Error("Failed to marshal message", zap.Error(err))
		return PushResult{Success: false, MsgID: msgID}
	}

	success := conn.Send(data)
	return PushResult{Success: success, MsgID: msgID, Offline: false}
}

type BatchPushResult struct {
	Success        int
	Failed         int
	OfflineUsers   []string
	SuccessMsgIDs  map[string]string
	PendingMsgs    []*model.PendingMessage
}

func (m *ConnectionManager) PushToUsers(userIDs []string, payload interface{}) *BatchPushResult {
	result := &BatchPushResult{
		SuccessMsgIDs: make(map[string]string),
		OfflineUsers:  make([]string, 0),
		PendingMsgs:   make([]*model.PendingMessage, 0),
	}

	var wg sync.WaitGroup
	var successCount int64
	var failedCount int64

	workerCount := 10
	jobCh := make(chan string, len(userIDs))
	type pushResultWithUser struct {
		*PushResult
		UserID string
	}
	resultCh := make(chan *pushResultWithUser, len(userIDs))

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for userID := range jobCh {
				pushResult := m.PushToUser(userID, payload)
				resultCh <- &pushResultWithUser{&pushResult, userID}
			}
		}()
	}

	for _, userID := range userIDs {
		jobCh <- userID
	}
	close(jobCh)

	go func() {
		wg.Wait()
		close(resultCh)
	}()

	now := time.Now().Unix()
	for r := range resultCh {
		if r.Success {
			atomic.AddInt64(&successCount, 1)
			result.SuccessMsgIDs[r.UserID] = r.MsgID
			result.PendingMsgs = append(result.PendingMsgs, &model.PendingMessage{
				MsgID:     r.MsgID,
				UserID:    r.UserID,
				Payload:   payload,
				Retry:     0,
				MaxRetry:  5,
				RetryAt:   now + 30,
				CreatedAt: now,
			})
		} else if r.Offline {
			result.OfflineUsers = append(result.OfflineUsers, r.UserID)
		} else {
			atomic.AddInt64(&failedCount, 1)
		}
	}

	result.Success = int(atomic.LoadInt64(&successCount))
	result.Failed = int(atomic.LoadInt64(&failedCount))
	return result
}

func (m *ConnectionManager) Broadcast(payload interface{}) (success int) {
	msg := &model.Message{
		Type:    model.MessageTypeBroadcast,
		Payload: payload,
	}

	data, err := msg.ToJSON()
	if err != nil {
		zap.L().Error("Failed to marshal message", zap.Error(err))
		return 0
	}

	var successCount int64
	var wg sync.WaitGroup

	workerCount := 20
	jobCh := make(chan *Connection, 1000)

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for conn := range jobCh {
				if conn.Send(data) {
					atomic.AddInt64(&successCount, 1)
				}
			}
		}()
	}

	m.connections.Range(func(key, value interface{}) bool {
		conn := value.(*Connection)
		jobCh <- conn
		return true
	})
	close(jobCh)

	wg.Wait()
	return int(atomic.LoadInt64(&successCount))
}

func (m *ConnectionManager) CleanStaleConnections(timeout time.Duration) int {
	cutoff := time.Now().Add(-timeout)
	var cleaned int64

	m.connections.Range(func(key, value interface{}) bool {
		conn := value.(*Connection)
		if conn.LastPing().Before(cutoff) {
			userID := key.(string)
			m.Close(userID)
			atomic.AddInt64(&cleaned, 1)
		}
		return true
	})

	return int(atomic.LoadInt64(&cleaned))
}

func (m *ConnectionManager) RangeClosed(callback func(userID string)) {
	toRemove := make([]string, 0, 1000)

	m.connections.Range(func(key, value interface{}) bool {
		conn := value.(*Connection)
		if conn.IsClosed() {
			userID := key.(string)
			toRemove = append(toRemove, userID)
		}
		return true
	})

	for _, userID := range toRemove {
		m.Remove(userID)
		callback(userID)
	}
}
