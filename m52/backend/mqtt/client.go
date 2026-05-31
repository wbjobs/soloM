package mqtt

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"sensor-platform/models"
	"sensor-platform/storage"
)

type SensorMessage struct {
	DeviceID string    `json:"device_id"`
	Type     string    `json:"type"`
	Value    float64   `json:"value"`
	Unit     string    `json:"unit"`
	Time     time.Time `json:"time"`
}

type MessagePool struct {
	workerCount int
	taskQueue   chan mqtt.Message
	wg          sync.WaitGroup
	stopChan    chan struct{}
}

var msgPool *MessagePool

func InitMessagePool(workerCount int, queueSize int) {
	msgPool = &MessagePool{
		workerCount: workerCount,
		taskQueue:   make(chan mqtt.Message, queueSize),
		stopChan:    make(chan struct{}),
	}

	for i := 0; i < workerCount; i++ {
		msgPool.wg.Add(1)
		go msgPool.worker(i)
	}

	log.Printf("MQTT message pool initialized: workers=%d, queue=%d", workerCount, queueSize)
}

func (p *MessagePool) worker(id int) {
	defer p.wg.Done()

	for {
		select {
		case msg := <-p.taskQueue:
			processMessage(msg)
		case <-p.stopChan:
			return
		}
	}
}

func (p *MessagePool) Submit(msg mqtt.Message) bool {
	select {
	case p.taskQueue <- msg:
		return true
	default:
		return false
	}
}

func (p *MessagePool) Stop() {
	close(p.stopChan)
	p.wg.Wait()
	close(p.taskQueue)
}

func StopMessagePool() {
	if msgPool != nil {
		msgPool.Stop()
	}
}

var messageHandler mqtt.MessageHandler = func(client mqtt.Client, msg mqtt.Message) {
	if msgPool != nil {
		if !msgPool.Submit(msg) {
			log.Printf("MQTT queue full, message dropped: topic=%s", msg.Topic())
		}
	} else {
		processMessage(msg)
	}
}

func processMessage(msg mqtt.Message) {
	var sensorMsg SensorMessage
	err := json.Unmarshal(msg.Payload(), &sensorMsg)
	if err != nil {
		log.Printf("Error parsing MQTT message: %v", err)
		return
	}

	if sensorMsg.Time.IsZero() {
		sensorMsg.Time = time.Now()
	}

	topicParts := strings.Split(msg.Topic(), "/")
	if len(topicParts) >= 2 && sensorMsg.DeviceID == "" {
		sensorMsg.DeviceID = topicParts[1]
	}

	sensorData := models.SensorData{
		DeviceID:  sensorMsg.DeviceID,
		Timestamp: sensorMsg.Time,
		Type:      sensorMsg.Type,
		Value:     sensorMsg.Value,
		Unit:      sensorMsg.Unit,
	}

	if storage.Cache != nil {
		storage.Cache.Add(sensorData)
	}

	if storage.Buffer != nil {
		storage.Buffer.Write(sensorData)
	}
}

func InitMQTT() mqtt.Client {
	broker := os.Getenv("MQTT_BROKER")
	clientID := os.Getenv("MQTT_CLIENT_ID")
	topic := os.Getenv("MQTT_TOPIC")

	if broker == "" {
		broker = "tcp://localhost:1883"
	}
	if clientID == "" {
		clientID = "sensor_backend"
	}
	if topic == "" {
		topic = "sensors/#"
	}

	opts := mqtt.NewClientOptions()
	opts.AddBroker(broker)
	opts.SetClientID(clientID)
	opts.SetDefaultPublishHandler(messageHandler)
	opts.OnConnect = func(c mqtt.Client) {
		log.Println("Connected to MQTT broker")
		if token := c.Subscribe(topic, 0, nil); token.Wait() && token.Error() != nil {
			log.Printf("Error subscribing to topic: %v", token.Error())
		} else {
			log.Printf("Subscribed to topic: %s", topic)
		}
	}
	opts.OnConnectionLost = func(c mqtt.Client, err error) {
		log.Printf("MQTT connection lost: %v", err)
	}

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Fatalf("Failed to connect to MQTT broker: %v", token.Error())
	}

	return client
}

func PublishTestData(deviceID string) {
	broker := os.Getenv("MQTT_BROKER")
	if broker == "" {
		broker = "tcp://localhost:1883"
	}

	opts := mqtt.NewClientOptions()
	opts.AddBroker(broker)
	opts.SetClientID(fmt.Sprintf("test_publisher_%s", deviceID))

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Printf("Test publisher failed to connect: %v", token.Error())
		return
	}
	defer client.Disconnect(250)

	baseTemp := 25.0
	for i := 0; i < 10; i++ {
		temp := baseTemp + float64(i)*0.5
		humidity := 60.0 + float64(i)*0.3

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

		tempPayload, _ := json.Marshal(tempMsg)
		humidityPayload, _ := json.Marshal(humidityMsg)

		topic := fmt.Sprintf("sensors/%s", deviceID)
		client.Publish(topic, 0, false, tempPayload)
		client.Publish(topic, 0, false, humidityPayload)

		time.Sleep(1 * time.Second)
	}
}
