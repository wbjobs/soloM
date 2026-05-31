package gateway

import (
	"net"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"push-gateway/pkg/model"
)

type Connection struct {
	UserID     string
	Conn       *websocket.Conn
	Addr       net.Addr
	sendChan   chan []byte
	once       sync.Once
	closed     bool
	closeMutex sync.RWMutex
	lastPing   time.Time
}

func NewConnection(userID string, conn *websocket.Conn) *Connection {
	return &Connection{
		UserID:   userID,
		Conn:     conn,
		Addr:     conn.RemoteAddr(),
		sendChan: make(chan []byte, 256),
		lastPing: time.Now(),
	}
}

func (c *Connection) Send(data []byte) bool {
	c.closeMutex.RLock()
	defer c.closeMutex.RUnlock()

	if c.closed {
		return false
	}

	select {
	case c.sendChan <- data:
		return true
	default:
		return false
	}
}

func (c *Connection) Close() {
	c.once.Do(func() {
		c.closeMutex.Lock()
		c.closed = true
		c.closeMutex.Unlock()

		close(c.sendChan)
		c.Conn.Close()
	})
}

func (c *Connection) IsClosed() bool {
	c.closeMutex.RLock()
	defer c.closeMutex.RUnlock()
	return c.closed
}

func (c *Connection) UpdatePing() {
	c.closeMutex.Lock()
	defer c.closeMutex.Unlock()
	c.lastPing = time.Now()
}

func (c *Connection) LastPing() time.Time {
	c.closeMutex.RLock()
	defer c.closeMutex.RUnlock()
	return c.lastPing
}

type MessageHandler func(userID string, msg *model.Message)

func (c *Connection) readPump(manager *ConnectionManager, handler MessageHandler) {
	defer func() {
		manager.Remove(c.UserID)
		c.Close()
	}()

	c.Conn.SetReadLimit(1024)
	c.Conn.SetPongHandler(func(string) error {
		c.UpdatePing()
		return nil
	})

	for {
		_, data, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				zap.L().Warn("WebSocket read error", zap.String("user_id", c.UserID), zap.Error(err))
			}
			break
		}

		if handler != nil {
			msg, err := model.ParseMessage(data)
			if err != nil {
				zap.L().Debug("Failed to parse client message", zap.String("user_id", c.UserID), zap.Error(err))
				continue
			}
			handler(c.UserID, msg)
		}
	}
}

func (c *Connection) writePump(writeTimeout time.Duration, pingInterval time.Duration) {
	ticker := time.NewTicker(pingInterval)
	defer func() {
		ticker.Stop()
		c.Close()
	}()

	for {
		select {
		case message, ok := <-c.sendChan:
			c.Conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				zap.L().Warn("WebSocket write error", zap.String("user_id", c.UserID), zap.Error(err))
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
