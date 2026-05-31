package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"runtime"
	"sync/atomic"
	"syscall"
	"time"

	mqtt "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"
	"github.com/mochi-mqtt/server/v2/packets"
	"github.com/redis/go-redis/v9"
)

const (
	redisWriteTimeout   = 500 * time.Millisecond
	forwardChannelSize  = 4096
	redisMaxRetries     = 2
	redisPoolSize       = 32
	redisMinIdleConns   = 8
	streamMaxLen        = 500000
	droppedWarnInterval = 5 * time.Second
)

type RedisForwardHook struct {
	mqtt.HookBase
	rdb            *redis.Client
	forwardCh      chan forwardItem
	ctx            context.Context
	cancel         context.CancelFunc
	droppedCount   atomic.Int64
	lastDropWarn   atomic.Int64
}

type forwardItem struct {
	Topic   string
	Payload []byte
}

func (h *RedisForwardHook) ID() string {
	return "redis-forward"
}

func (h *RedisForwardHook) Provides(b byte) bool {
	return b == mqtt.OnPublished
}

func (h *RedisForwardHook) Init(config any) error {
	return nil
}

func (h *RedisForwardHook) Stop() error {
	h.cancel()
	return nil
}

func (h *RedisForwardHook) OnPublished(cl *mqtt.Client, pk packets.Packet) {
	payload := make([]byte, len(pk.Payload))
	copy(payload, pk.Payload)

	select {
	case h.forwardCh <- forwardItem{Topic: pk.TopicName, Payload: payload}:
	default:
		dropped := h.droppedCount.Add(1)
		now := time.Now().UnixMilli()
		last := h.lastDropWarn.Load()
		if now-last > droppedWarnInterval.Milliseconds() {
			h.lastDropWarn.Store(now)
			log.Printf("[Gateway] WARN: forward channel full, total dropped=%d, topic=%s", dropped, pk.TopicName)
		}
	}
}

func (h *RedisForwardHook) startWorkers(numWorkers int) {
	for i := 0; i < numWorkers; i++ {
		go h.forwardWorker(i)
	}
	go h.dropStatsReporter()
}

func (h *RedisForwardHook) forwardWorker(id int) {
	for {
		select {
		case <-h.ctx.Done():
			return
		case item := <-h.forwardCh:
			h.doForward(item, id)
		}
	}
}

func (h *RedisForwardHook) doForward(item forwardItem, workerID int) {
	ctx, cancel := context.WithTimeout(h.ctx, redisWriteTimeout)
	defer cancel()

	err := h.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: "sensor_data",
		MaxLen: streamMaxLen,
		Approx: true,
		Values: map[string]interface{}{
			"topic":   item.Topic,
			"payload": string(item.Payload),
		},
	}).Err()

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			log.Printf("[Gateway] Worker%d: Redis XAdd timeout, topic=%s", workerID, item.Topic)
			return
		}
		for attempt := 1; attempt <= redisMaxRetries; attempt++ {
			retryCtx, retryCancel := context.WithTimeout(h.ctx, redisWriteTimeout)
			err = h.rdb.XAdd(retryCtx, &redis.XAddArgs{
				Stream: "sensor_data",
				MaxLen: streamMaxLen,
				Approx: true,
				Values: map[string]interface{}{
					"topic":   item.Topic,
					"payload": string(item.Payload),
				},
			}).Err()
			retryCancel()
			if err == nil {
				break
			}
			log.Printf("[Gateway] Worker%d: Redis XAdd retry %d/%d failed: %v", workerID, attempt, redisMaxRetries, err)
		}
	}
}

func (h *RedisForwardHook) dropStatsReporter() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-h.ctx.Done():
			return
		case <-ticker.C:
			dropped := h.droppedCount.Swap(0)
			if dropped > 0 {
				log.Printf("[Gateway] Drop stats: %d messages dropped in last 10s (channel capacity=%d)", dropped, forwardChannelSize)
			}
		}
	}
}

func main() {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	mqttPort := os.Getenv("MQTT_PORT")
	if mqttPort == "" {
		mqttPort = "1883"
	}

	maxClients := int64(2000)
	if v := os.Getenv("MAX_CLIENTS"); v != "" {
		fmt.Sscanf(v, "%d", &maxClients)
	}

	numWorkers := runtime.NumCPU()
	if numWorkers < 4 {
		numWorkers = 4
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		PoolSize:     redisPoolSize,
		MinIdleConns: redisMinIdleConns,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolTimeout:  4 * time.Second,
		MaxRetries:   0,
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("[Gateway] Cannot connect to Redis at %s: %v", redisAddr, err)
	}
	log.Printf("[Gateway] Connected to Redis at %s (pool=%d, idle=%d)", redisAddr, redisPoolSize, redisMinIdleConns)

	hookCtx, hookCancel := context.WithCancel(context.Background())
	hook := &RedisForwardHook{
		rdb:       rdb,
		forwardCh: make(chan forwardItem, forwardChannelSize),
		ctx:       hookCtx,
		cancel:    hookCancel,
	}

	server := mqtt.New(nil)

	if err := server.AddHook(new(auth.AllowHook), nil); err != nil {
		log.Fatalf("[Gateway] Failed to add auth hook: %v", err)
	}

	if err := server.AddHook(hook, nil); err != nil {
		log.Fatalf("[Gateway] Failed to add Redis forward hook: %v", err)
	}

	hook.startWorkers(numWorkers)

	tcp := listeners.NewTCP(listeners.Config{
		ID:      "tcp-listener",
		Address: fmt.Sprintf(":%s", mqttPort),
	})
	if err := server.AddListener(tcp); err != nil {
		log.Fatalf("[Gateway] Failed to add TCP listener: %v", err)
	}

	log.Printf("[Gateway] MQTT Broker listening on :%s (maxClients=%d, workers=%d, forwardBuf=%d)",
		mqttPort, maxClients, numWorkers, forwardChannelSize)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("[Gateway] Shutting down...")
	hookCancel()
	server.Close()

	drained := 0
	timer := time.NewTimer(3 * time.Second)
drain:
	for {
		select {
		case <-hook.forwardCh:
			drained++
		case <-timer.C:
			break drain
		default:
			break drain
		}
	}
	if drained > 0 {
		log.Printf("[Gateway] Drained %d pending messages", drained)
	}

	rdb.Close()
}
