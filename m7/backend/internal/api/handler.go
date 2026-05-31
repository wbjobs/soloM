package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/cloudmon/netwatch/internal/alert"
	"github.com/cloudmon/netwatch/internal/aggregator"
	"github.com/cloudmon/netwatch/internal/k8s"
)

type Handler struct {
	aggregator   *aggregator.Aggregator
	discoverer   *k8s.Discoverer
	ws           *WebSocketHub
	alertManager *alert.AlertManager
}

func NewHandler(agg *aggregator.Aggregator, disc *k8s.Discoverer, ws *WebSocketHub, am *alert.AlertManager) *Handler {
	return &Handler{
		aggregator:   agg,
		discoverer:   disc,
		ws:           ws,
		alertManager: am,
	}
}

func (h *Handler) RegisterRoutes(r *gin.Engine) {
	v1 := r.Group("/api/v1")
	{
		v1.GET("/topology", h.getTopology)
		v1.GET("/heatmap", h.getHeatmap)
		v1.GET("/metrics/:source/:target", h.getEdgeMetrics)
		v1.GET("/services", h.getServices)
		v1.GET("/alerts", h.getAlerts)
		v1.POST("/alerts/:id/ack", h.acknowledgeAlert)
		v1.POST("/alerts/:id/resolve", h.resolveAlert)
		v1.GET("/webhook", h.getWebhook)
		v1.POST("/webhook", h.setWebhook)
	}

	r.GET("/metrics", gin.WrapH(promhttp.Handler()))
}

func (h *Handler) getTopology(c *gin.Context) {
	data := h.aggregator.GetTopology()
	c.JSON(http.StatusOK, data)
}

func (h *Handler) getHeatmap(c *gin.Context) {
	source := c.Query("source")
	target := c.Query("target")
	if source == "" || target == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "source and target query params required"})
		return
	}

	data := h.aggregator.GetHeatmap(source, target)
	c.JSON(http.StatusOK, data)
}

func (h *Handler) getEdgeMetrics(c *gin.Context) {
	source := c.Param("source")
	target := c.Param("target")

	edge, ok := h.aggregator.GetEdgeMetrics(source, target)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "edge not found"})
		return
	}

	c.JSON(http.StatusOK, edge)
}

func (h *Handler) getServices(c *gin.Context) {
	services := h.discoverer.AllServices()
	c.JSON(http.StatusOK, gin.H{"services": services})
}

func (h *Handler) getAlerts(c *gin.Context) {
	limitStr := c.Query("limit")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	alerts := h.alertManager.GetAlerts(limit)
	c.JSON(http.StatusOK, gin.H{"alerts": alerts})
}

func (h *Handler) acknowledgeAlert(c *gin.Context) {
	id := c.Param("id")
	if err := h.alertManager.AcknowledgeAlert(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "acknowledged"})
}

func (h *Handler) resolveAlert(c *gin.Context) {
	id := c.Param("id")
	if err := h.alertManager.ResolveAlert(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "resolved"})
}

func (h *Handler) getWebhook(c *gin.Context) {
	config := h.alertManager.GetWebhook()
	c.JSON(http.StatusOK, config)
}

func (h *Handler) setWebhook(c *gin.Context) {
	var config alert.WebhookConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.alertManager.SetWebhook(config)
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}
