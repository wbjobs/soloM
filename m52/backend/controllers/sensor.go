package controllers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"sensor-platform/config"
	"sensor-platform/models"
	"sensor-platform/storage"
)

func GetSensorData(c *gin.Context) {
	deviceID := c.Param("deviceId")
	dataType := c.DefaultQuery("type", "temperature")
	limit := c.DefaultQuery("limit", "100")

	limitInt, err := strconv.Atoi(limit)
	if err != nil {
		limitInt = 100
	}

	var data []models.SensorData
	query := config.DB.Where("device_id = ? AND type = ?", deviceID, dataType)

	startTime := c.Query("start_time")
	endTime := c.Query("end_time")

	if startTime != "" {
		if st, err := time.Parse(time.RFC3339, startTime); err == nil {
			query = query.Where("timestamp >= ?", st)
		}
	}
	if endTime != "" {
		if et, err := time.Parse(time.RFC3339, endTime); err == nil {
			query = query.Where("timestamp <= ?", et)
		}
	}

	query.Order("timestamp DESC").Limit(limitInt).Find(&data)

	c.JSON(http.StatusOK, gin.H{
		"device_id": deviceID,
		"type":      dataType,
		"count":     len(data),
		"data":      data,
	})
}

func GetLatestSensorData(c *gin.Context) {
	deviceID := c.Param("deviceId")

	var data []models.SensorData
	config.DB.Raw(`
		SELECT DISTINCT ON (type) *
		FROM sensor_data
		WHERE device_id = ?
		ORDER BY type, timestamp DESC
	`, deviceID).Scan(&data)

	c.JSON(http.StatusOK, gin.H{
		"device_id": deviceID,
		"data":      data,
	})
}

func GetSensorDataAggregated(c *gin.Context) {
	deviceID := c.Param("deviceId")
	dataType := c.DefaultQuery("type", "temperature")
	bucket := c.DefaultQuery("bucket", "1 minute")

	now := time.Now()
	startTime := now.Add(-1 * time.Hour)

	if s := c.Query("start_time"); s != "" {
		if st, err := time.Parse(time.RFC3339, s); err == nil {
			startTime = st
		}
	}

	type AggregatedData struct {
		Bucket time.Time `json:"bucket"`
		Min    float64   `json:"min"`
		Max    float64   `json:"max"`
		Avg    float64   `json:"avg"`
		Count  int       `json:"count"`
	}

	var results []AggregatedData
	config.DB.Raw(`
		SELECT
			time_bucket(?, timestamp) as bucket,
			MIN(value) as min,
			MAX(value) as max,
			AVG(value) as avg,
			COUNT(*) as count
		FROM sensor_data
		WHERE device_id = ? AND type = ? AND timestamp >= ?
		GROUP BY bucket
		ORDER BY bucket DESC
	`, bucket, deviceID, dataType, startTime).Scan(&results)

	c.JSON(http.StatusOK, gin.H{
		"device_id":  deviceID,
		"type":       dataType,
		"bucket":     bucket,
		"aggregated": results,
	})
}

func GetRealtimeData(c *gin.Context) {
	deviceID := c.Param("deviceId")
	dataType := c.DefaultQuery("type", "temperature")
	limitStr := c.DefaultQuery("limit", "100")

	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	var data []storage.DataPoint
	if storage.Cache != nil {
		data = storage.Cache.GetLatest(deviceID, dataType, limit)
	}

	c.JSON(http.StatusOK, gin.H{
		"device_id": deviceID,
		"type":      dataType,
		"count":     len(data),
		"data":      data,
		"source":    "cache",
	})
}

func GetIncrementalData(c *gin.Context) {
	deviceID := c.Param("deviceId")
	dataType := c.DefaultQuery("type", "temperature")
	sinceStr := c.Query("since")

	var since time.Time
	var err error
	if sinceStr != "" {
		since, err = time.Parse(time.RFC3339, sinceStr)
		if err != nil {
			since = time.Now().Add(-5 * time.Second)
		}
	} else {
		since = time.Now().Add(-5 * time.Second)
	}

	var data []storage.DataPoint
	if storage.Cache != nil {
		data = storage.Cache.GetSince(deviceID, dataType, since)
	}

	c.JSON(http.StatusOK, gin.H{
		"device_id":  deviceID,
		"type":       dataType,
		"count":      len(data),
		"data":       data,
		"since":      since,
		"server_now": time.Now(),
	})
}

func GetBufferStats(c *gin.Context) {
	if storage.Buffer == nil {
		c.JSON(http.StatusOK, gin.H{"error": "buffer not initialized"})
		return
	}

	stats := storage.Buffer.GetStats()
	c.JSON(http.StatusOK, stats)
}

func GetSmartQuery(c *gin.Context) {
	deviceID := c.Param("deviceId")
	dataType := c.DefaultQuery("type", "temperature")
	granularity := c.DefaultQuery("granularity", "")
	maxPointsStr := c.DefaultQuery("max_points", "500")

	maxPoints, _ := strconv.Atoi(maxPointsStr)
	if maxPoints <= 0 {
		maxPoints = 500
	}
	if maxPoints > 5000 {
		maxPoints = 5000
	}

	endTime := time.Now()
	startTime := endTime.Add(-1 * time.Hour)

	if s := c.Query("start_time"); s != "" {
		if st, err := time.Parse(time.RFC3339, s); err == nil {
			startTime = st
		}
	}
	if e := c.Query("end_time"); e != "" {
		if et, err := time.Parse(time.RFC3339, e); err == nil {
			endTime = et
		}
	}

	var result *storage.QueryResult
	var err error

	requestGranularity := storage.Granularity(granularity)

	if storage.Cache != nil && requestGranularity == "" && endTime.Sub(startTime) <= 2*time.Hour {
		cacheData := storage.Cache.GetSince(deviceID, dataType, startTime)
		if len(cacheData) >= 10 {
			rawData := make([]storage.RawDataPoint, 0, len(cacheData))
			for _, p := range cacheData {
				rawData = append(rawData, storage.RawDataPoint{
					Timestamp: p.Timestamp,
					Value:     p.Value,
				})
			}
			c.JSON(http.StatusOK, gin.H{
				"device_id":   deviceID,
				"type":        dataType,
				"granularity": "raw",
				"source":      "cache",
				"count":       len(rawData),
				"raw_data":    rawData,
				"start_time":  startTime,
				"end_time":    endTime,
			})
			return
		}
	}

	result, err = storage.SmartQuery(deviceID, dataType, startTime, endTime, requestGranularity, maxPoints)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := gin.H{
		"device_id":   deviceID,
		"type":        dataType,
		"granularity": result.Granularity,
		"source":      "database",
		"count":       result.Count,
		"start_time":  startTime,
		"end_time":    endTime,
		"data":        result.Data,
	}

	if result.Granularity == storage.GranularityRaw {
		response["raw_data"] = result.RawData
	}

	c.JSON(http.StatusOK, response)
}
