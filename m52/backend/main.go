package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"sensor-platform/config"
	"sensor-platform/models"
	"sensor-platform/mqtt"
	"sensor-platform/routes"
	"sensor-platform/storage"
	"sensor-platform/websocket"
)

func getEnvInt(key string, defaultValue int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("Warning: Error loading .env file")
	}

	config.InitDB()
	models.Migrate()

	websocket.InitWebSocket()

	cacheSize := getEnvInt("REALTIME_CACHE_SIZE", 1000)
	storage.InitRealtimeCache(cacheSize)

	storage.InitWriteBuffer()
	defer storage.Buffer.Stop()

	mqttWorkers := getEnvInt("MQTT_WORKER_COUNT", 16)
	mqttQueueSize := getEnvInt("MQTT_QUEUE_SIZE", 100000)
	mqtt.InitMessagePool(mqttWorkers, mqttQueueSize)
	defer mqtt.StopMessagePool()

	mqttClient := mqtt.InitMQTT()
	defer mqttClient.Disconnect(250)

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.GET("/ws", func(c *gin.Context) {
		websocket.HandleWebSocket(websocket.WSHub, c.Writer, c.Request)
	})

	startDataBroadcaster()

	routes.SetupRoutes(r)

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down gracefully...")
		os.Exit(0)
	}()

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	log.Fatal(r.Run(":" + port))
}

func startDataBroadcaster() {
	broadcastInterval := getEnvInt("WS_BROADCAST_INTERVAL_MS", 500)

	go func() {
		ticker := time.NewTicker(time.Duration(broadcastInterval) * time.Millisecond)
		defer ticker.Stop()

		lastBroadcast := make(map[string]time.Time)

		for range ticker.C {
			if websocket.WSHub == nil || websocket.WSHub.ClientCount() == 0 {
				continue
			}

			now := time.Now()
			sinceTime := now.Add(-time.Duration(broadcastInterval*2) * time.Millisecond)

			allData := storage.Cache.GetAllSince(sinceTime)
			for key, points := range allData {
				lastTime, exists := lastBroadcast[key]
				if exists && len(points) > 0 {
					filtered := make([]storage.DataPoint, 0)
					for _, p := range points {
						if p.Timestamp.After(lastTime) {
							filtered = append(filtered, p)
						}
					}
					if len(filtered) > 0 {
						websocket.WSHub.Broadcast(map[string]interface{}{
							"type":      "sensor_batch",
							"device_id": key,
							"data":      filtered,
						})
						lastBroadcast[key] = now
					}
				} else if len(points) > 0 {
					websocket.WSHub.Broadcast(map[string]interface{}{
						"type":      "sensor_batch",
						"device_id": key,
						"data":      points,
					})
					lastBroadcast[key] = now
				}
			}
		}
	}()

	log.Printf("WebSocket broadcaster started, interval: %dms", broadcastInterval)
}
