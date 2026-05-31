package config

import (
	"os"
	"time"
)

type Config struct {
	DSN              string
	Port             string
	SlowlogInterval  time.Duration
}

func Load() *Config {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/redis_monitor?sslmode=disable"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	intervalStr := os.Getenv("SLOWLOG_INTERVAL")
	interval, err := time.ParseDuration(intervalStr)
	if err != nil {
		interval = 30 * time.Second
	}

	return &Config{
		DSN:             dsn,
		Port:            port,
		SlowlogInterval: interval,
	}
}
