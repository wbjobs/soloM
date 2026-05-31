package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"push-gateway/internal/storage"
	"push-gateway/pkg/model"
)

type HistoryStore interface {
	GetHistory(userID string, limit, offset int64) ([]*model.HistoryMessage, error)
}

type PushHandler struct {
	registry *storage.UserRegistry
	pubsub   *storage.PubSubManager
	history  HistoryStore
}

func NewPushHandler(registry *storage.UserRegistry, pubsub *storage.PubSubManager, history HistoryStore) *PushHandler {
	return &PushHandler{
		registry: registry,
		pubsub:   pubsub,
		history:  history,
	}
}

func (h *PushHandler) HandlePush(c *gin.Context) {
	var req model.PushRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.PushResponse{
			Success: false,
			Message: "Invalid request: " + err.Error(),
		})
		return
	}

	if len(req.UserIDs) == 0 {
		c.JSON(http.StatusBadRequest, model.PushResponse{
			Success: false,
			Message: "user_ids is required",
		})
		return
	}

	gatewayUsers, notFound := h.registry.GroupUsersByGateway(req.UserIDs)

	var successCount int64
	var wg sync.WaitGroup

	for gateway, userIDs := range gatewayUsers {
		wg.Add(1)
		go func(gw string, uids []string) {
			defer wg.Done()

			msg := &model.PubSubMessage{
				GatewayID: gw,
				UserIDs:   uids,
				Payload:   req.Payload,
				Action:    "push",
				Timestamp: time.Now().Unix(),
			}

			if err := h.pubsub.Publish(msg); err != nil {
				zap.L().Error("Failed to publish message",
					zap.String("gateway", gw),
					zap.Error(err),
				)
				return
			}

			zap.L().Debug("Message published to gateway",
				zap.String("gateway", gw),
				zap.Int("user_count", len(uids)),
			)
		}(gateway, userIDs)
	}

	wg.Wait()

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"pushed":     len(req.UserIDs) - len(notFound),
		"not_found":  notFound,
		"gateways":   len(gatewayUsers),
	})
}

func (h *PushHandler) HandleBroadcast(c *gin.Context) {
	var req struct {
		Payload interface{} `json:"payload" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.PushResponse{
			Success: false,
			Message: "Invalid request: " + err.Error(),
		})
		return
	}

	msg := &model.PubSubMessage{
		GatewayID: "",
		Payload:   req.Payload,
		Action:    "broadcast",
		Timestamp: time.Now().Unix(),
	}

	if err := h.pubsub.Publish(msg); err != nil {
		c.JSON(http.StatusInternalServerError, model.PushResponse{
			Success: false,
			Message: "Failed to broadcast: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.PushResponse{
		Success: true,
		Message: "Broadcast sent to all gateways",
	})
}

func (h *PushHandler) HandleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"time":   time.Now().Unix(),
	})
}

func (h *PushHandler) HandleHistory(c *gin.Context) {
	var req model.HistoryRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid request: " + err.Error(),
		})
		return
	}

	if req.Limit <= 0 {
		req.Limit = 50
	}
	if req.Limit > 200 {
		req.Limit = 200
	}

	messages, err := h.history.GetHistory(req.UserID, req.Limit, req.Offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to get history: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"user_id": req.UserID,
		"limit":   req.Limit,
		"offset":  req.Offset,
		"total":   len(messages),
		"data":    messages,
	})
}
