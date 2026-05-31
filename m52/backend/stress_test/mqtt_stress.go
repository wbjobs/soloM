package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type SensorMessage struct {
	DeviceID string    `json:"device_id"`
	Type     string    `json:"type"`
	Value    float64   `json:"value"`
	Unit     string    `json:"unit"`
	Time     time.Time `json:"time"`
}

var (
	broker       = flag.String("broker", "tcp://localhost:1883", "MQTT broker address")
	deviceCount  = flag.Int("devices", 10, "Number of simulated devices")
	qpsPerDevice = flag.Int("qps", 10, "QPS per device")
	duration     = flag.Int("duration", 60, "Test duration in seconds")
	topicPrefix  = flag.String("topic", "sensors", "MQTT topic prefix")
)

var (
	totalSent    uint64
	totalErrors  uint64
	totalLatency int64
)

func main() {
	flag.Parse()

	log.Printf("Starting MQTT stress test:")
	log.Printf("  Broker: %s", *broker)
	log.Printf("  Devices: %d", *deviceCount)
	log.Printf("  QPS per device: %d", *qpsPerDevice)
	log.Printf("  Total target QPS: %d", *deviceCount**qpsPerDevice)
	log.Printf("  Duration: %d seconds", *duration)

	var wg sync.WaitGroup

	for i := 0; i < *deviceCount; i++ {
		wg.Add(1)
		go simulateDevice(i, &wg)
	}

	go printStats()

	time.Sleep(time.Duration(*duration) * time.Second)

	log.Println("Test completed, waiting for all devices to finish...")
	wg.Wait()

	finalStats()
}

func simulateDevice(deviceIdx int, wg *sync.WaitGroup) {
	defer wg.Done()

	deviceID := fmt.Sprintf("stress-device-%04d", deviceIdx)

	opts := mqtt.NewClientOptions()
	opts.AddBroker(*broker)
	opts.SetClientID(fmt.Sprintf("stress-publisher-%04d", deviceIdx))
	opts.SetAutoReconnect(true)

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Printf("Device %d failed to connect: %v", deviceIdx, token.Error())
		atomic.AddUint64(&totalErrors, 1)
		return
	}
	defer client.Disconnect(250)

	interval := time.Second / time.Duration(*qpsPerDevice)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	baseTemp := 25.0 + rand.Float64()*10
	baseHumidity := 50.0 + rand.Float64()*20

	timeout := time.After(time.Duration(*duration) * time.Second)

	for {
		select {
		case <-ticker.C:
			start := time.Now()

			temp := baseTemp + rand.NormFloat64()*2
			humidity := baseHumidity + rand.NormFloat64()*3

			tempMsg := SensorMessage{
				DeviceID: deviceID,
				Type:     "temperature",
				Value:    temp,
				Unit:     "C",
				Time:     time.Now(),
			}

			humidityMsg := SensorMessage{
				DeviceID: deviceID,
				Type:     "humidity",
				Value:    humidity,
				Unit:     "%",
				Time:     time.Now(),
			}

			sendMessage(client, fmt.Sprintf("%s/%s", *topicPrefix, deviceID), tempMsg)
			sendMessage(client, fmt.Sprintf("%s/%s", *topicPrefix, deviceID), humidityMsg)

			latency := time.Since(start).Microseconds()
			atomic.AddInt64(&totalLatency, latency)

		case <-timeout:
			return
		}
	}
}

func sendMessage(client mqtt.Client, topic string, msg SensorMessage) {
	payload, err := json.Marshal(msg)
	if err != nil {
		atomic.AddUint64(&totalErrors, 1)
		return
	}

	token := client.Publish(topic, 0, false, payload)
	if token.Wait() && token.Error() != nil {
		atomic.AddUint64(&totalErrors, 1)
		return
	}

	atomic.AddUint64(&totalSent, 1)
}

func printStats() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	prevSent := uint64(0)
	startTime := time.Now()

	for range ticker.C {
		currentSent := atomic.LoadUint64(&totalSent)
		currentErrors := atomic.LoadUint64(&totalErrors)
		elapsed := time.Since(startTime).Seconds()

		delta := currentSent - prevSent
		qps := float64(delta) / 5.0

		log.Printf(
			"Stats: elapsed=%.1fs total_sent=%d total_errors=%d current_qps=%.1f",
			elapsed, currentSent, currentErrors, qps,
		)

		prevSent = currentSent
	}
}

func finalStats() {
	totalSentFinal := atomic.LoadUint64(&totalSent)
	totalErrorsFinal := atomic.LoadUint64(&totalErrors)
	totalLatencyFinal := atomic.LoadInt64(&totalLatency)

	avgQps := float64(totalSentFinal) / float64(*duration)
	avgLatency := float64(totalLatencyFinal) / float64(totalSentFinal) / 1000.0

	log.Println("\n==================== Final Statistics ====================")
	log.Printf("Total messages sent:      %d", totalSentFinal)
	log.Printf("Total errors:             %d", totalErrorsFinal)
	log.Printf("Duration:                 %d seconds", *duration)
	log.Printf("Average QPS:              %.2f", avgQps)
	log.Printf("Average publish latency:  %.2f ms", avgLatency)
	log.Printf("Error rate:               %.4f%%", float64(totalErrorsFinal)/float64(totalSentFinal+totalErrorsFinal)*100)
	log.Println("=========================================================")
}
