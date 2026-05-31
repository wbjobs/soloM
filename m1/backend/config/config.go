package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	ServerHost      string
	ServerPort      string
	Postgres        PostgresConfig
	MinIO           MinIOConfig
	MaxUploadSize   int64
	UploadRateLimit int
}

type PostgresConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DB       string
	SSLMode  string
}

type MinIOConfig struct {
	Endpoint            string
	AccessKey           string
	SecretKey           string
	UseSSL              bool
	Bucket              string
	MaxIdleConns        int
	MaxIdleConnsPerHost int
	MaxConnsPerHost     int
}

var AppConfig Config

func Load() {
	_ = godotenv.Load()

	AppConfig = Config{
		ServerHost: getEnv("SERVER_HOST", "0.0.0.0"),
		ServerPort: getEnv("SERVER_PORT", "8080"),
		Postgres: PostgresConfig{
			Host:     getEnv("POSTGRES_HOST", "localhost"),
			Port:     getEnv("POSTGRES_PORT", "5432"),
			User:     getEnv("POSTGRES_USER", "dicom_user"),
			Password: getEnv("POSTGRES_PASSWORD", "dicom_password"),
			DB:       getEnv("POSTGRES_DB", "dicom_db"),
			SSLMode:  getEnv("POSTGRES_SSL_MODE", "disable"),
		},
		MinIO: MinIOConfig{
			Endpoint:            getEnv("MINIO_ENDPOINT", "localhost:9000"),
			AccessKey:           getEnv("MINIO_ACCESS_KEY", "minio_admin"),
			SecretKey:           getEnv("MINIO_SECRET_KEY", "minio_password"),
			UseSSL:              getEnvBool("MINIO_USE_SSL", false),
			Bucket:              getEnv("MINIO_BUCKET", "dicom-images"),
			MaxIdleConns:        getEnvInt("MINIO_MAX_IDLE_CONNS", 100),
			MaxIdleConnsPerHost: getEnvInt("MINIO_MAX_IDLE_CONNS_PER_HOST", 50),
			MaxConnsPerHost:     getEnvInt("MINIO_MAX_CONNS_PER_HOST", 50),
		},
		MaxUploadSize:   getEnvInt64("MAX_UPLOAD_SIZE", 50*1024*1024),
		UploadRateLimit: getEnvInt("UPLOAD_RATE_LIMIT", 10),
	}

	log.Println("Configuration loaded successfully")
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value, exists := os.LookupEnv(key); exists {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getEnvInt64(key string, defaultValue int64) int64 {
	if value, exists := os.LookupEnv(key); exists {
		if i, err := strconv.ParseInt(value, 10, 64); err == nil {
			return i
		}
	}
	return defaultValue
}
