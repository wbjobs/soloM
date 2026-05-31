package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"push-gateway/config"
	"push-gateway/internal/gateway"
	"push-gateway/internal/storage"
	"push-gateway/pkg/model"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(fmt.Sprintf("Failed to load config: %v", err))
	}

	initLogger(cfg.Log.Level)

	if cfg.Gateway.NodeID == "" {
		cfg.Gateway.NodeID = fmt.Sprintf("gateway-%s:%d", cfg.Gateway.Host, cfg.Gateway.Port)
	}

	if cfg.Gateway.AdvertiseAddr == "" {
		cfg.Gateway.AdvertiseAddr = cfg.Gateway.NodeID
	}

	redisClient, err := storage.NewRedisClient(&cfg.Redis)
	if err != nil {
		zap.L().Fatal("Failed to create redis client", zap.Error(err))
	}
	defer redisClient.Close()

	userRegistry := storage.NewBatchRegistry(
		redisClient,
		cfg.Gateway.AdvertiseAddr,
		cfg.Gateway.BatchRegistry.BatchSize,
		cfg.Gateway.BatchRegistry.FlushIntervalMs,
	)

	pubsubManager := storage.NewPubSubManager(redisClient)

	connManager := gateway.NewConnectionManager(cfg.Gateway.MaxConnections)

	delayQueue := storage.NewDelayQueue(redisClient)

	pubsubManager.AddHandler(func(msg *model.PubSubMessage) error {
		switch msg.Action {
		case "push":
			if len(msg.UserIDs) > 0 {
				result := connManager.PushToUsers(msg.UserIDs, msg.Payload)

				for _, pending := range result.PendingMsgs {
					delayQueue.Add(pending)
				}

				for _, userID := range result.OfflineUsers {
					pendingMsg := &model.PendingMessage{
						MsgID:     model.GenerateMsgID(),
						UserID:    userID,
						Payload:   msg.Payload,
						Retry:     0,
						MaxRetry:  5,
						RetryAt:   time.Now().Unix() + 60,
						CreatedAt: time.Now().Unix(),
					}
					delayQueue.Add(pendingMsg)
				}

				zap.L().Debug("Processed push message",
					zap.Int("success", result.Success),
					zap.Int("failed", result.Failed),
					zap.Int("offline", len(result.OfflineUsers)),
					zap.Int("total", len(msg.UserIDs)),
				)
			}
		case "broadcast":
			success := connManager.Broadcast(msg.Payload)
			zap.L().Debug("Processed broadcast message",
				zap.Int("success", success),
			)
		}
		return nil
	})

	if err := pubsubManager.Start(cfg.Gateway.AdvertiseAddr); err != nil {
		zap.L().Fatal("Failed to start pubsub manager", zap.Error(err))
	}
	defer pubsubManager.Stop()

	wsServer := gateway.NewServer(&cfg.Gateway, connManager, userRegistry, delayQueue)

	go func() {
		if err := wsServer.Start(); err != nil {
			zap.L().Fatal("Failed to start WebSocket server", zap.Error(err))
		}
	}()

	zap.L().Info("Gateway server started",
		zap.String("node_id", cfg.Gateway.NodeID),
		zap.String("advertise_addr", cfg.Gateway.AdvertiseAddr),
		zap.Int("port", cfg.Gateway.Port),
	)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	zap.L().Info("Shutting down gateway server...")

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Gateway.WriteTimeout)
	defer cancel()

	if err := wsServer.Stop(ctx); err != nil {
		zap.L().Error("Error stopping WebSocket server", zap.Error(err))
	}

	zap.L().Info("Gateway server stopped")
}

func initLogger(level string) {
	var logLevel zapcore.Level
	switch level {
	case "debug":
		logLevel = zap.DebugLevel
	case "info":
		logLevel = zap.InfoLevel
	case "warn":
		logLevel = zap.WarnLevel
	case "error":
		logLevel = zap.ErrorLevel
	default:
		logLevel = zap.InfoLevel
	}

	cfg := zap.Config{
		Level:       zap.NewAtomicLevelAt(logLevel),
		Development: false,
		Sampling: &zap.SamplingConfig{
			Initial:    100,
			Thereafter: 100,
		},
		Encoding:         "json",
		EncoderConfig:    zap.NewProductionEncoderConfig(),
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
	}

	logger, err := cfg.Build()
	if err != nil {
		panic(err)
	}

	zap.ReplaceGlobals(logger)
}
