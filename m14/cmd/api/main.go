package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"push-gateway/config"
	"push-gateway/internal/api"
	"push-gateway/internal/storage"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(fmt.Sprintf("Failed to load config: %v", err))
	}

	initLogger(cfg.Log.Level)

	redisClient, err := storage.NewRedisClient(&cfg.Redis)
	if err != nil {
		zap.L().Fatal("Failed to create redis client", zap.Error(err))
	}
	defer redisClient.Close()

	userRegistry := storage.NewUserRegistry(redisClient)
	pubsubManager := storage.NewPubSubManager(redisClient)
	delayQueue := storage.NewDelayQueue(redisClient)

	pushHandler := api.NewPushHandler(userRegistry, pubsubManager, delayQueue)
	apiServer := api.NewServer(&cfg.API, pushHandler)

	go func() {
		if err := apiServer.Start(); err != nil {
			zap.L().Fatal("Failed to start API server", zap.Error(err))
		}
	}()

	zap.L().Info("API server started",
		zap.String("host", cfg.API.Host),
		zap.Int("port", cfg.API.Port),
	)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	zap.L().Info("Shutting down API server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30)
	defer cancel()

	if err := apiServer.Stop(ctx); err != nil {
		zap.L().Error("Error stopping API server", zap.Error(err))
	}

	zap.L().Info("API server stopped")
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
