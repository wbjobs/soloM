package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/jinzhu/gorm"
	_ "github.com/jinzhu/gorm/dialects/postgres"
)

var DB *gorm.DB

func getEnvInt(key string, defaultValue int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func InitDB() {
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")

	maxOpenConns := getEnvInt("DB_MAX_OPEN_CONNS", 100)
	maxIdleConns := getEnvInt("DB_MAX_IDLE_CONNS", 50)
	connMaxLifetime := getEnvInt("DB_CONN_MAX_LIFETIME", 3600)

	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	var err error
	DB, err = gorm.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	sqlDB := DB.DB()
	sqlDB.SetMaxOpenConns(maxOpenConns)
	sqlDB.SetMaxIdleConns(maxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(connMaxLifetime) * time.Second)

	log.Printf("Database connection established (max_open=%d, max_idle=%d", maxOpenConns, maxIdleConns)
}
