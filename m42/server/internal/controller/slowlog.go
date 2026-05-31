package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"redis-monitor/internal/repository"
)

type SlowlogController struct {
	repo *repository.Repository
}

func NewSlowlogController(repo *repository.Repository) *SlowlogController {
	return &SlowlogController{
		repo: repo,
	}
}

func (sc *SlowlogController) ListSlowlogs(c *gin.Context) {
	filter := repository.SlowlogFilter{
		Page:     1,
		PageSize: 20,
	}

	if v := c.Query("cluster_id"); v != "" {
		id, err := uuid.Parse(v)
		if err == nil {
			filter.ClusterID = id
		}
	}

	if v := c.Query("node_addr"); v != "" {
		filter.NodeAddr = v
	}

	if v := c.Query("command"); v != "" {
		filter.Command = v
	}

	if v := c.Query("start_time"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err == nil {
			filter.StartTime = &t
		}
	}

	if v := c.Query("end_time"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err == nil {
			filter.EndTime = &t
		}
	}

	if v := c.Query("min_duration"); v != "" {
		if d, err := strconv.ParseInt(v, 10, 64); err == nil {
			filter.MinDuration = d
		}
	}

	if v := c.Query("page"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			filter.Page = p
		}
	}

	if v := c.Query("page_size"); v != "" {
		if ps, err := strconv.Atoi(v); err == nil && ps > 0 {
			filter.PageSize = ps
		}
	}

	entries, total, err := sc.repo.ListSlowlogEntries(filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  entries,
		"total": total,
		"page":  filter.Page,
		"page_size": filter.PageSize,
	})
}

func (sc *SlowlogController) GetSlowlogStats(c *gin.Context) {
	var clusterID uuid.UUID
	if v := c.Query("cluster_id"); v != "" {
		id, err := uuid.Parse(v)
		if err == nil {
			clusterID = id
		}
	}

	stats, err := sc.repo.GetSlowlogStats(clusterID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (sc *SlowlogController) GetSlowlogTrend(c *gin.Context) {
	var clusterID uuid.UUID
	if v := c.Query("cluster_id"); v != "" {
		id, err := uuid.Parse(v)
		if err == nil {
			clusterID = id
		}
	}

	end := time.Now()
	start := end.Add(-24 * time.Hour)

	if v := c.Query("start_time"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err == nil {
			start = t
		}
	}

	if v := c.Query("end_time"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err == nil {
			end = t
		}
	}

	interval := c.DefaultQuery("interval", "hour")

	points, err := sc.repo.GetSlowlogTrend(clusterID, start, end, interval)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, points)
}

func (sc *SlowlogController) GetSlowlogDistribution(c *gin.Context) {
	var clusterID uuid.UUID
	if v := c.Query("cluster_id"); v != "" {
		id, err := uuid.Parse(v)
		if err == nil {
			clusterID = id
		}
	}

	points, err := sc.repo.GetSlowlogDistribution(clusterID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, points)
}

func (sc *SlowlogController) GetSlowlogCommands(c *gin.Context) {
	var clusterID uuid.UUID
	if v := c.Query("cluster_id"); v != "" {
		id, err := uuid.Parse(v)
		if err == nil {
			clusterID = id
		}
	}

	limit := 10
	if v := c.Query("limit"); v != "" {
		if l, err := strconv.Atoi(v); err == nil && l > 0 {
			limit = l
		}
	}

	stats, err := sc.repo.GetSlowlogCommands(clusterID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (sc *SlowlogController) GetSlowlogFingerprints(c *gin.Context) {
	var clusterID uuid.UUID
	if v := c.Query("cluster_id"); v != "" {
		id, err := uuid.Parse(v)
		if err == nil {
			clusterID = id
		}
	}

	limit := 15
	if v := c.Query("limit"); v != "" {
		if l, err := strconv.Atoi(v); err == nil && l > 0 {
			limit = l
		}
	}

	stats, err := sc.repo.GetSlowlogFingerprints(clusterID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}
