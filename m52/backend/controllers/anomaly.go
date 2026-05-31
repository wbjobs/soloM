package controllers

import (
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"sensor-platform/config"
	"sensor-platform/models"
)

type AnomalyDetectionRequest struct {
	DeviceID       string  `json:"device_id" binding:"required"`
	SensorType     string  `json:"sensor_type" binding:"required"`
	Threshold      float64 `json:"threshold"`
	WindowSeconds  int     `json:"window_seconds"`
	ComparisonType string  `json:"comparison_type"`
}

type AnomalyResult struct {
	DeviceID     string    `json:"device_id"`
	SensorType   string    `json:"sensor_type"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	Duration     float64   `json:"duration_seconds"`
	MaxValue     float64   `json:"max_value"`
	MinValue     float64   `json:"min_value"`
	AvgValue     float64   `json:"avg_value"`
	Threshold    float64   `json:"threshold"`
	DataPointCnt int       `json:"data_points"`
}

func DetectAnomalies(c *gin.Context) {
	var req AnomalyDetectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Threshold == 0 {
		thresholdStr := os.Getenv("TEMPERATURE_THRESHOLD")
		req.Threshold, _ = strconv.ParseFloat(thresholdStr, 64)
		if req.Threshold == 0 {
			req.Threshold = 35.0
		}
	}

	if req.WindowSeconds == 0 {
		windowStr := os.Getenv("ANOMALY_WINDOW_SECONDS")
		req.WindowSeconds, _ = strconv.Atoi(windowStr)
		if req.WindowSeconds == 0 {
			req.WindowSeconds = 5
		}
	}

	if req.ComparisonType == "" {
		req.ComparisonType = "above"
	}

	comparisonOp := ">"
	if req.ComparisonType == "below" {
		comparisonOp = "<"
	}

	endTime := time.Now()
	startTime := endTime.Add(-1 * time.Hour)

	type TimeValue struct {
		Timestamp time.Time `json:"timestamp"`
		Value     float64   `json:"value"`
	}

	var rawData []TimeValue
	config.DB.Table("sensor_data").
		Select("timestamp, value").
		Where("device_id = ? AND type = ? AND timestamp BETWEEN ? AND ?",
			req.DeviceID, req.SensorType, startTime, endTime).
		Order("timestamp ASC").
		Scan(&rawData)

	anomalies := detectAnomalyWindows(rawData, req.Threshold, req.WindowSeconds, comparisonOp)

	for _, anomaly := range anomalies {
		record := models.AnomalyRecord{
			DeviceID:    req.DeviceID,
			StartTime:   anomaly.StartTime,
			EndTime:     anomaly.EndTime,
			Type:        req.SensorType,
			Description: "Continuous " + req.ComparisonType + " threshold",
			Threshold:   req.Threshold,
			Duration:    anomaly.Duration,
			CreatedAt:   time.Now(),
		}
		config.DB.Create(&record)
	}

	c.JSON(http.StatusOK, gin.H{
		"device_id":       req.DeviceID,
		"sensor_type":     req.SensorType,
		"threshold":       req.Threshold,
		"window_seconds":  req.WindowSeconds,
		"comparison":      req.ComparisonType,
		"anomalies_count": len(anomalies),
		"anomalies":       anomalies,
	})
}

func detectAnomalyWindows(data []TimeValue, threshold float64, windowSeconds int, op string) []AnomalyResult {
	var anomalies []AnomalyResult
	var currentWindow *AnomalyResult

	for i, point := range data {
		isViolation := false
		if op == ">" {
			isViolation = point.Value > threshold
		} else {
			isViolation = point.Value < threshold
		}

		if isViolation {
			if currentWindow == nil {
				currentWindow = &AnomalyResult{
					StartTime:    point.Timestamp,
					EndTime:      point.Timestamp,
					MaxValue:     point.Value,
					MinValue:     point.Value,
					AvgValue:     point.Value,
					DataPointCnt: 1,
					Threshold:    threshold,
				}
			} else {
				currentWindow.EndTime = point.Timestamp
				if point.Value > currentWindow.MaxValue {
					currentWindow.MaxValue = point.Value
				}
				if point.Value < currentWindow.MinValue {
					currentWindow.MinValue = point.Value
				}
				currentWindow.AvgValue = (currentWindow.AvgValue*float64(currentWindow.DataPointCnt) + point.Value) / float64(currentWindow.DataPointCnt+1)
				currentWindow.DataPointCnt++
			}
		} else {
			if currentWindow != nil {
				duration := currentWindow.EndTime.Sub(currentWindow.StartTime).Seconds()
				if duration >= float64(windowSeconds) {
					currentWindow.Duration = duration
					anomalies = append(anomalies, *currentWindow)
				}
				currentWindow = nil
			}
		}

		if i == len(data)-1 && currentWindow != nil {
			duration := currentWindow.EndTime.Sub(currentWindow.StartTime).Seconds()
			if duration >= float64(windowSeconds) {
				currentWindow.Duration = duration
				anomalies = append(anomalies, *currentWindow)
			}
		}
	}

	return anomalies
}

func GetAnomalyRecords(c *gin.Context) {
	deviceID := c.Param("deviceId")
	limit := c.DefaultQuery("limit", "50")

	limitInt, _ := strconv.Atoi(limit)
	if limitInt == 0 {
		limitInt = 50
	}

	var records []models.AnomalyRecord
	query := config.DB.Model(&models.AnomalyRecord{})

	if deviceID != "" {
		query = query.Where("device_id = ?", deviceID)
	}

	query.Order("created_at DESC").Limit(limitInt).Find(&records)

	c.JSON(http.StatusOK, gin.H{
		"count":   len(records),
		"records": records,
	})
}

func CheckRealTimeAnomaly(c *gin.Context) {
	deviceID := c.Param("deviceId")
	sensorType := c.DefaultQuery("type", "temperature")
	thresholdStr := c.DefaultQuery("threshold", os.Getenv("TEMPERATURE_THRESHOLD"))
	windowStr := c.DefaultQuery("window", os.Getenv("ANOMALY_WINDOW_SECONDS"))

	threshold, _ := strconv.ParseFloat(thresholdStr, 64)
	windowSeconds, _ := strconv.Atoi(windowStr)
	if threshold == 0 {
		threshold = 35.0
	}
	if windowSeconds == 0 {
		windowSeconds = 5
	}

	endTime := time.Now()
	startTime := endTime.Add(-time.Duration(windowSeconds*2) * time.Second)

	type Result struct {
		MinValue   float64 `json:"min_value"`
		MaxValue   float64 `json:"max_value"`
		AvgValue   float64 `json:"avg_value"`
		Count      int     `json:"count"`
		StartTime  time.Time
		EndTime    time.Time
		IsAnomaly  bool `json:"is_anomaly"`
	}

	var result Result
	config.DB.Raw(`
		SELECT
			MIN(value) as min_value,
			MAX(value) as max_value,
			AVG(value) as avg_value,
			COUNT(*) as count,
			MIN(timestamp) as start_time,
			MAX(timestamp) as end_time
		FROM sensor_data
		WHERE device_id = ? AND type = ? AND timestamp >= ? AND value > ?
	`, deviceID, sensorType, startTime, threshold).Scan(&result)

	duration := 0.0
	if result.Count > 0 {
		duration = result.EndTime.Sub(result.StartTime).Seconds()
	}
	result.IsAnomaly = duration >= float64(windowSeconds)

	c.JSON(http.StatusOK, gin.H{
		"device_id":       deviceID,
		"sensor_type":     sensorType,
		"threshold":       threshold,
		"window_seconds":  windowSeconds,
		"is_anomaly":      result.IsAnomaly,
		"duration_above":  duration,
		"min_value":       result.MinValue,
		"max_value":       result.MaxValue,
		"avg_value":       result.AvgValue,
		"data_points":     result.Count,
	})
}
