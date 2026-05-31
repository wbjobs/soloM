package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"push-gateway/pkg/model"
)

type MessageHandler func(msg *model.PubSubMessage) error

type PubSubManager struct {
	redis     *RedisClient
	channel   string
	handlers  []MessageHandler
	ctx       context.Context
	cancel    context.CancelFunc
}

func NewPubSubManager(redis *RedisClient) *PubSubManager {
	ctx, cancel := context.WithCancel(context.Background())
	return &PubSubManager{
		redis:    redis,
		channel:  redis.Channel(),
		handlers: make([]MessageHandler, 0),
		ctx:      ctx,
		cancel:   cancel,
	}
}

func (p *PubSubManager) AddHandler(handler MessageHandler) {
	p.handlers = append(p.handlers, handler)
}

func (p *PubSubManager) Start(gatewayID string) error {
	pubsub := p.redis.Client().Subscribe(p.ctx, p.channel)

	_, err := pubsub.Receive(p.ctx)
	if err != nil {
		pubsub.Close()
		return fmt.Errorf("failed to subscribe to channel: %w", err)
	}

	zap.L().Info("Subscribed to pubsub channel", zap.String("channel", p.channel), zap.String("gateway_id", gatewayID))

	go p.messageLoop(pubsub, gatewayID)

	return nil
}

func (p *PubSubManager) messageLoop(pubsub *redis.PubSub, gatewayID string) {
	defer pubsub.Close()

	ch := pubsub.Channel()

	for {
		select {
		case <-p.ctx.Done():
			zap.L().Info("PubSub manager stopped")
			return
		case msg := <-ch:
			if msg == nil {
				continue
			}

			var pubsubMsg model.PubSubMessage
			if err := json.Unmarshal([]byte(msg.Payload), &pubsubMsg); err != nil {
				zap.L().Warn("Failed to parse pubsub message", zap.Error(err))
				continue
			}

			if pubsubMsg.GatewayID != "" && pubsubMsg.GatewayID != gatewayID {
				continue
			}

			for _, handler := range p.handlers {
				if err := handler(&pubsubMsg); err != nil {
					zap.L().Error("Handler failed to process message", zap.Error(err))
				}
			}
		}
	}
}

func (p *PubSubManager) Publish(msg *model.PubSubMessage) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	msg.Timestamp = time.Now().Unix()

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	return p.redis.Client().Publish(ctx, p.channel, data).Err()
}

func (p *PubSubManager) Stop() {
	p.cancel()
}
