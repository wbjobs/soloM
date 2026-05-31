package routes

import (
	"github.com/gin-gonic/gin"
	"sensor-platform/controllers"
)

func SetupRoutes(r *gin.Engine) {
	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"status": "ok",
			})
		})

		devices := api.Group("/devices")
		{
			devices.POST("", controllers.CreateDevice)
			devices.GET("", controllers.GetDevices)
			devices.GET("/:id", controllers.GetDevice)
			devices.PUT("/:id", controllers.UpdateDevice)
			devices.DELETE("/:id", controllers.DeleteDevice)
		}

		sensor := api.Group("/sensor")
		{
			sensor.GET("/:deviceId/data", controllers.GetSensorData)
			sensor.GET("/:deviceId/latest", controllers.GetLatestSensorData)
			sensor.GET("/:deviceId/aggregated", controllers.GetSensorDataAggregated)
			sensor.GET("/:deviceId/realtime", controllers.GetRealtimeData)
			sensor.GET("/:deviceId/incremental", controllers.GetIncrementalData)
			sensor.GET("/:deviceId/smart", controllers.GetSmartQuery)
			sensor.GET("/buffer/stats", controllers.GetBufferStats)
		}

		anomaly := api.Group("/anomaly")
		{
			anomaly.POST("/detect", controllers.DetectAnomalies)
			anomaly.GET("/:deviceId/records", controllers.GetAnomalyRecords)
			anomaly.GET("/:deviceId/realtime", controllers.CheckRealTimeAnomaly)
		}
	}
}
