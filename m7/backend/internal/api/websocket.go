package api

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/cloudmon/netwatch/internal/alert"
	"github.com/cloudmon/netwatch/internal/aggregator"
	"github.com/cloudmon/netwatch/internal/model"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type wsMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp int64       `json:"timestamp"`
}

type client struct {
	conn *websocket.Conn
	ch   chan wsMessage
	done chan struct{}
}

type WebSocketHub struct {
	clients map[*client]struct{}
	mu      sync.RWMutex
	agg     *aggregator.Aggregator
}

func NewWebSocketHub(agg *aggregator.Aggregator) *WebSocketHub {
	return &WebSocketHub{
		clients: make(map[*client]struct{}),
		agg:     agg,
	}
}

func (h *WebSocketHub) Start() {
	go h.broadcastTopology()
	go h.broadcastHeatmap()
	go h.heartbeat()
}

func (h *WebSocketHub) Stop() {
	h.mu.Lock()
	for c := range h.clients {
		close(c.done)
		c.conn.Close()
	}
	h.mu.Unlock()
}

func (h *WebSocketHub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	c := &client{
		conn: conn,
		ch:   make(chan wsMessage, 64),
		done: make(chan struct{}),
	}

	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()

	go h.writePump(c)
	go h.readPump(c)
}

func (h *WebSocketHub) writePump(c *client) {
	defer h.removeClient(c)

	for {
		select {
		case <-c.done:
			return
		case msg := <-c.ch:
			data, err := json.Marshal(msg)
			if err != nil {
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}
		}
	}
}

func (h *WebSocketHub) readPump(c *client) {
	defer h.removeClient(c)

	c.conn.SetReadLimit(512)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
	}
}

func (h *WebSocketHub) removeClient(c *client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	close(c.done)
	c.conn.Close()
}

func (h *WebSocketHub) broadcastTopology() {
	sub, err := h.agg.Subscribe()
	if err != nil {
		return
	}
	defer h.agg.Unsubscribe(sub)

	for {
		select {
		case <-sub.done:
			return
		case data := <-sub.topology:
			msg := wsMessage{
				Type:      "topology",
				Data:      data,
				Timestamp: time.Now().UnixMilli(),
			}
			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.ch <- msg:
				default:
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *WebSocketHub) broadcastHeatmap() {
	sub, err := h.agg.Subscribe()
	if err != nil {
		return
	}
	defer h.agg.Unsubscribe(sub)

	for {
		select {
		case <-sub.done:
			return
		case data := <-sub.heatmap:
			msg := wsMessage{
				Type:      "heatmap",
				Data:      data,
				Timestamp: time.Now().UnixMilli(),
			}
			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.ch <- msg:
				default:
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *WebSocketHub) heartbeat() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		h.mu.RLock()
		for c := range h.clients {
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				h.mu.RUnlock()
				h.removeClient(c)
				h.mu.RLock()
			}
		}
		h.mu.RUnlock()
	}
}

func (h *WebSocketHub) BroadcastAlert(a alert.Alert) {
	msg := wsMessage{
		Type:      "alert",
		Data:      a,
		Timestamp: time.Now().UnixMilli(),
	}

	h.mu.RLock()
	for c := range h.clients {
		select {
		case c.ch <- msg:
		default:
		}
	}
	h.mu.RUnlock()
}
