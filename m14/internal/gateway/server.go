package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"push-gateway/config"
	"push-gateway/pkg/model"
)

type BatchRegistry interface {
	RegisterUser(userID string)
	UnregisterUser(userID string)
	Start()
	Stop()
}

type DelayQueue interface {
	Add(msg *model.PendingMessage) error
	AddForRetry(msgID string, userID string, payload interface{}, retry int) error
	SaveToHistory(userID string, msg *model.PendingMessage, status string) error
	GetHistory(userID string, limit, offset int64) ([]*model.HistoryMessage, error)
	Start(processor func(msg *model.PendingMessage) bool)
	Stop()
}

type Server struct {
	config          *config.GatewayConfig
	manager         *ConnectionManager
	upgrader        websocket.Upgrader
	httpServer      *http.Server
	registry        BatchRegistry
	connLimiter     *ConnectionLimiter
	messageTracker  *MessageTracker
	delayQueue      DelayQueue
	closeNotify     chan struct{}
}

func NewServer(cfg *config.GatewayConfig, manager *ConnectionManager, registry BatchRegistry, delayQueue DelayQueue) *Server {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  cfg.ReadBufferSize,
		WriteBufferSize: cfg.WriteBufferSize,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	maxConnPerSec := cfg.RateLimit.MaxConnPerSec
	if maxConnPerSec <= 0 {
		maxConnPerSec = 1000
	}
	burst := cfg.RateLimit.Burst
	if burst <= 0 {
		burst = 5000
	}
	maxPending := cfg.RateLimit.MaxPending
	if maxPending <= 0 {
		maxPending = 10000
	}

	return &Server{
		config:         cfg,
		manager:        manager,
		upgrader:       upgrader,
		registry:       registry,
		connLimiter:    NewConnectionLimiter(maxConnPerSec, burst, maxPending),
		messageTracker: NewMessageTracker(30*time.Second, 5),
		delayQueue:     delayQueue,
		closeNotify:    make(chan struct{}),
	}
}

func (s *Server) Start() error {
	if s.registry != nil {
		s.registry.Start()
	}

	s.messageTracker.Start()

	if s.delayQueue != nil {
		s.delayQueue.Start(func(msg *model.PendingMessage) bool {
			result := s.manager.PushToUser(msg.UserID, msg.Payload)
			if result.Success {
				s.messageTracker.Track(result.MsgID, msg.UserID, msg.Payload, func(msgID string, success bool) {
					if !success {
						s.delayQueue.AddForRetry(msgID, msg.UserID, msg.Payload, msg.Retry+1)
					}
				})
				return true
			}
			return false
		})
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/stats", s.handleStats)

	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
	s.httpServer = &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	zap.L().Info("WebSocket gateway starting",
		zap.String("addr", addr),
		zap.Int64("max_conn_per_sec", 1000),
		zap.Int64("burst", 5000),
	)

	go s.startCleaner()
	go s.monitorDisconnections()

	return s.httpServer.ListenAndServe()
}

func (s *Server) Stop(ctx context.Context) error {
	close(s.closeNotify)

	s.messageTracker.Stop()

	if s.delayQueue != nil {
		s.delayQueue.Stop()
	}

	if s.registry != nil {
		s.registry.Stop()
	}

	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	limitCtx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if !s.connLimiter.Accept(limitCtx) {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("Too many connections"))
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		zap.L().Warn("WebSocket upgrade failed", zap.Error(err))
		return
	}

	userID, err := s.authenticate(conn)
	if err != nil {
		zap.L().Warn("Authentication failed", zap.Error(err))
		conn.Close()
		return
	}

	client := NewConnection(userID, conn)
	if !s.manager.Add(userID, client) {
		client.Close()
		return
	}

	if s.registry != nil {
		s.registry.RegisterUser(userID)
	}

	go client.readPump(s.manager, s.handleClientMessage)
	go client.writePump(
		time.Duration(s.config.WriteTimeout)*time.Second,
		time.Duration(s.config.PingInterval)*time.Second,
	)

	zap.L().Debug("Client connected",
		zap.String("user_id", userID),
		zap.String("remote", conn.RemoteAddr().String()),
	)
}

func (s *Server) handleClientMessage(userID string, msg *model.Message) {
	switch msg.Type {
	case model.MessageTypeACK:
		if msg.MsgID != "" {
			s.messageTracker.ACK(msg.MsgID)
		}
	case model.MessageTypeNAK:
		if msg.MsgID != "" {
			if tm, ok := s.messageTracker.GetPending(msg.MsgID); ok {
				s.delayQueue.AddForRetry(msg.MsgID, tm.userID, tm.payload, tm.retryCount+1)
				s.messageTracker.NAK(msg.MsgID)
			}
		}
	}
}

func (s *Server) authenticate(conn *websocket.Conn) (string, error) {
	_, message, err := conn.ReadMessage()
	if err != nil {
		return "", fmt.Errorf("failed to read auth message: %w", err)
	}

	var msg model.Message
	if err := json.Unmarshal(message, &msg); err != nil {
		return "", fmt.Errorf("failed to parse auth message: %w", err)
	}

	if msg.Type != model.MessageTypeAuth {
		return "", fmt.Errorf("expected auth message, got: %s", msg.Type)
	}

	payloadMap, ok := msg.Payload.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid auth payload format")
	}

	userID, ok := payloadMap["user_id"].(string)
	if !ok || userID == "" {
		return "", fmt.Errorf("user_id is required")
	}

	ack := model.Message{
		Type: model.MessageTypeAuthAck,
		Payload: map[string]interface{}{
			"success": true,
			"user_id": userID,
		},
	}
	ackData, _ := ack.ToJSON()
	conn.WriteMessage(websocket.TextMessage, ackData)

	return userID, nil
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	stats := map[string]interface{}{
		"connections": s.manager.Count(),
		"node_id":     s.config.NodeID,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (s *Server) monitorDisconnections() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.closeNotify:
			return
		case <-ticker.C:
			s.manager.RangeClosed(func(userID string) {
				if s.registry != nil {
					s.registry.UnregisterUser(userID)
				}
				zap.L().Debug("Client disconnected", zap.String("user_id", userID))
			})
		}
	}
}

func (s *Server) startCleaner() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		cleaned := s.manager.CleanStaleConnections(2 * time.Minute)
		if cleaned > 0 {
			zap.L().Info("Cleaned stale connections", zap.Int("count", cleaned))
		}
	}
}

func (s *Server) Manager() *ConnectionManager {
	return s.manager
}
