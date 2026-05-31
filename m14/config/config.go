package config

import (
	"fmt"

	"github.com/spf13/viper"
)

type Config struct {
	Gateway  GatewayConfig  `mapstructure:"gateway"`
	Redis    RedisConfig    `mapstructure:"redis"`
	Message  MessageConfig  `mapstructure:"message"`
	API      APIConfig      `mapstructure:"api"`
	Log      LogConfig      `mapstructure:"log"`
}

type RateLimitConfig struct {
	MaxConnPerSec int64 `mapstructure:"max_conn_per_sec"`
	Burst         int64 `mapstructure:"burst"`
	MaxPending    int   `mapstructure:"max_pending"`
}

type BatchRegistryConfig struct {
	BatchSize       int `mapstructure:"batch_size"`
	FlushIntervalMs int `mapstructure:"flush_interval_ms"`
}

type GatewayConfig struct {
	NodeID          string             `mapstructure:"node_id"`
	Host            string             `mapstructure:"host"`
	Port            int                `mapstructure:"port"`
	AdvertiseAddr   string             `mapstructure:"advertise_addr"`
	MaxConnections  int                `mapstructure:"max_connections"`
	PingInterval    int                `mapstructure:"ping_interval"`
	PongTimeout     int                `mapstructure:"pong_timeout"`
	WriteTimeout    int                `mapstructure:"write_timeout"`
	ReadBufferSize  int                `mapstructure:"read_buffer_size"`
	WriteBufferSize int                `mapstructure:"write_buffer_size"`
	RateLimit       RateLimitConfig    `mapstructure:"rate_limit"`
	BatchRegistry   BatchRegistryConfig `mapstructure:"batch_registry"`
}

type RedisConfig struct {
	Addrs         []string `mapstructure:"addrs"`
	Password      string   `mapstructure:"password"`
	DB            int      `mapstructure:"db"`
	PoolSize      int      `mapstructure:"pool_size"`
	MinIdleConns  int      `mapstructure:"min_idle_conns"`
	Channel       string   `mapstructure:"channel"`
	UserHashKey   string   `mapstructure:"user_hash_key"`
	DelayQueueKey string   `mapstructure:"delay_queue_key"`
	HistoryKey    string   `mapstructure:"history_key"`
	MsgDataKey    string   `mapstructure:"msg_data_key"`
}

type MessageConfig struct {
	AckTimeoutSec  int `mapstructure:"ack_timeout_sec"`
	MaxRetry       int `mapstructure:"max_retry"`
	HistoryTTHours int `mapstructure:"history_ttl_hours"`
}

type APIConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

type LogConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

var AppConfig *Config

func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	viper.SetDefault("gateway.host", "0.0.0.0")
	viper.SetDefault("gateway.port", 8080)
	viper.SetDefault("gateway.max_connections", 1000000)
	viper.SetDefault("gateway.ping_interval", 30)
	viper.SetDefault("gateway.pong_timeout", 60)
	viper.SetDefault("gateway.write_timeout", 10)
	viper.SetDefault("gateway.read_buffer_size", 1024)
	viper.SetDefault("gateway.write_buffer_size", 1024)
	viper.SetDefault("gateway.rate_limit.max_conn_per_sec", 1000)
	viper.SetDefault("gateway.rate_limit.burst", 5000)
	viper.SetDefault("gateway.rate_limit.max_pending", 10000)
	viper.SetDefault("gateway.batch_registry.batch_size", 500)
	viper.SetDefault("gateway.batch_registry.flush_interval_ms", 100)

	viper.SetDefault("redis.addrs", []string{"127.0.0.1:6379"})
	viper.SetDefault("redis.pool_size", 100)
	viper.SetDefault("redis.min_idle_conns", 10)
	viper.SetDefault("redis.channel", "push:channel")
	viper.SetDefault("redis.user_hash_key", "push:users")
	viper.SetDefault("redis.delay_queue_key", "push:delay_queue")
	viper.SetDefault("redis.history_key", "push:history")
	viper.SetDefault("redis.msg_data_key", "push:msg_data")

	viper.SetDefault("message.ack_timeout_sec", 30)
	viper.SetDefault("message.max_retry", 5)
	viper.SetDefault("message.history_ttl_hours", 168)

	viper.SetDefault("api.host", "0.0.0.0")
	viper.SetDefault("api.port", 9090)

	viper.SetDefault("log.level", "info")
	viper.SetDefault("log.format", "json")

	if err := viper.ReadInConfig(); err != nil {
		fmt.Printf("Warning: Config file not found, using defaults: %v\n", err)
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	AppConfig = &config
	return &config, nil
}
