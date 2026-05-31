package models

import (
	"time"

	"github.com/google/uuid"
	"sensor-platform/config"
)

type Device struct {
	ID          string    `gorm:"primary_key" json:"id"`
	Name        string    `gorm:"not null" json:"name"`
	Type        string    `gorm:"not null" json:"type"`
	Description string    `json:"description"`
	Status      string    `gorm:"default:active" json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type SensorData struct {
	ID        uint      `gorm:"primary_key" json:"id"`
	DeviceID  string    `gorm:"index:idx_device_time" json:"device_id"`
	Timestamp time.Time `gorm:"index:idx_device_time" json:"timestamp"`
	Type      string    `json:"type"`
	Value     float64   `json:"value"`
	Unit      string    `json:"unit"`
}

type AnomalyRecord struct {
	ID          uint      `gorm:"primary_key" json:"id"`
	DeviceID    string    `gorm:"index" json:"device_id"`
	StartTime   time.Time `json:"start_time"`
	EndTime     time.Time `json:"end_time"`
	Type        string    `json:"type"`
	Description string    `json:"description"`
	Threshold   float64   `json:"threshold"`
	Duration    float64   `json:"duration"`
	CreatedAt   time.Time `json:"created_at"`
}

func (d *Device) BeforeCreate() (err error) {
	d.ID = uuid.New().String()
	return
}

func Migrate() {
	config.DB.AutoMigrate(&Device{}, &SensorData{}, &AnomalyRecord{})

	config.DB.Exec(`SELECT create_hypertable('sensor_data', 'timestamp', if_not_exists => TRUE);`)

	config.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_sensor_data_device_timestamp ON sensor_data(device_id, timestamp DESC);`)

	createContinuousAggregates()
}

func createContinuousAggregates() {
	config.DB.Exec(`
		CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_data_hourly
		WITH (timescaledb.continuous) AS
		SELECT
			device_id,
			type,
			time_bucket('1 hour', timestamp) AS bucket,
			COUNT(*) AS count,
			MIN(value) AS min,
			MAX(value) AS max,
			AVG(value) AS avg,
			SUM(value) AS sum,
			PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) AS median
		FROM sensor_data
		GROUP BY device_id, type, time_bucket('1 hour', timestamp)
		WITH NO DATA;
	`)

	config.DB.Exec(`
		SELECT add_continuous_aggregate_policy('sensor_data_hourly',
			start_offset => INTERVAL '3 hours',
			end_offset => INTERVAL '1 hour',
			schedule_interval => INTERVAL '30 minutes',
			if_not_exists => TRUE
		);
	`)

	config.DB.Exec(`
		CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_data_daily
		WITH (timescaledb.continuous) AS
		SELECT
			device_id,
			type,
			time_bucket('1 day', timestamp) AS bucket,
			COUNT(*) AS count,
			MIN(value) AS min,
			MAX(value) AS max,
			AVG(value) AS avg,
			SUM(value) AS sum,
			PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) AS median
		FROM sensor_data
		GROUP BY device_id, type, time_bucket('1 day', timestamp)
		WITH NO DATA;
	`)

	config.DB.Exec(`
		SELECT add_continuous_aggregate_policy('sensor_data_daily',
			start_offset => INTERVAL '3 days',
			end_offset => INTERVAL '1 day',
			schedule_interval => INTERVAL '2 hours',
			if_not_exists => TRUE
		);
	`)

	config.DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_sensor_data_hourly_device_type_bucket
		ON sensor_data_hourly(device_id, type, bucket DESC);
	`)

	config.DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_sensor_data_daily_device_type_bucket
		ON sensor_data_daily(device_id, type, bucket DESC);
	`)

	config.DB.Exec(`
		ALTER MATERIALIZED VIEW sensor_data_hourly SET (timescaledb.materialized_only = false);
	`)

	config.DB.Exec(`
		ALTER MATERIALIZED VIEW sensor_data_daily SET (timescaledb.materialized_only = false);
	`)
}
