package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"redis-monitor/internal/repository"
)

type DashboardController struct {
	repo *repository.Repository
}

func NewDashboardController(repo *repository.Repository) *DashboardController {
	return &DashboardController{
		repo: repo,
	}
}

func (dc *DashboardController) GetOverview(c *gin.Context) {
	overview, err := dc.repo.GetDashboardOverview()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, overview)
}

func (dc *DashboardController) GetRecentSlowlogs(c *gin.Context) {
	limit := 20
	if v := c.Query("limit"); v != "" {
		if l, err := strconv.Atoi(v); err == nil && l > 0 {
			limit = l
		}
	}

	entries, err := dc.repo.GetRecentSlowlogs(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, entries)
}
