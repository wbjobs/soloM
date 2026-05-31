package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type SensorData struct {
	DeviceID      string  `json:"device_id"`
	Temperature   float64 `json:"temperature"`
	VibrationFreq float64 `json:"vibration_freq"`
	Timestamp     string  `json:"timestamp"`
}

var devices = []string{
	"SENSOR-001",
	"SENSOR-002",
	"SENSOR-003",
	"SENSOR-004",
	"SENSOR-005",
}

func generateData(deviceID string) SensorData {
	return SensorData{
		DeviceID:      deviceID,
		Temperature:   20.0 + rand.Float64()*60.0,
		VibrationFreq: 50.0 + rand.Float64()*200.0,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
	}
}

func main() {
	broker := os.Getenv("MQTT_BROKER")
	if broker == "" {
		broker = "tcp://localhost:1883"
	}

	opts := mqtt.NewClientOptions().AddBroker(broker)
	opts.SetClientID("industrial-simulator")
	opts.SetConnectRetryInterval(5 * time.Second)
	opts.SetConnectTimeout(30 * time.Second)
	opts.SetAutoReconnect(true)
	opts.SetOnConnectHandler(func(c mqtt.Client) {
		log.Printf("[Simulator] Connected to MQTT broker at %s", broker)
	})
	opts.SetConnectionLostHandler(func(c mqtt.Client, err error) {
		log.Printf("[Simulator] Connection lost: %v, will retry...", err)
	})

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Fatalf("[Simulator] Failed to connect: %v", token.Error())
	}
	defer client.Disconnect(250)

	topic := "industrial/sensors"
	interval := 2 * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	log.Printf("[Simulator] Publishing to topic '%s' every %v", topic, interval)

	for range ticker.C {
		for _, deviceID := range devices {
			data := generateData(deviceID)
			payload, err := json.Marshal(data)
			if err != nil {
				log.Printf("[Simulator] JSON marshal error: %v", err)
				continue
			}

			token := client.Publish(topic, 0, false, payload)
			token.Wait()
			if token.Error() != nil {
				log.Printf("[Simulator] Publish error: %v", token.Error())
				continue
			}

			fmt.Printf("[Simulator] Published: device=%s temp=%.2f vib=%.2f\n",
				data.DeviceID, data.Temperature, data.VibrationFreq)
		}
	}
}
