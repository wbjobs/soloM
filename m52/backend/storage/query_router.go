package storage

import (
	"time"

	"sensor-platform/config"
)

type Granularity string

const (
	GranularityRaw     Granularity = "raw"
	GranularityHourly  Granularity = "hourly"
	GranularityDaily   Granularity = "daily"
)

type AggregatedDataPoint struct {
	Bucket time.Time `json:"bucket"`
	Min    float64   `json:"min"`
	Max    float64   `json:"max"`
	Avg    float64   `json:"avg"`
	Count  int       `json:"count"`
	Median float64   `json:"median,omitempty"`
}

type QueryResult struct {
	Granularity Granularity           `json:"granularity"`
	Data        []AggregatedDataPoint `json:"data"`
	RawData     []RawDataPoint        `json:"raw_data,omitempty"`
	Count       int                   `json:"count"`
}

type RawDataPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
	Unit      string    `json:"unit"`
}

const (
	hourThreshold = 24 * time.Hour
	dayThreshold  = 7 * 24 * time.Hour
)

func DetermineGranularity(startTime, endTime time.Time, requestGranularity Granularity) Granularity {
	if requestGranularity != "" {
		return requestGranularity
	}

	duration := endTime.Sub(startTime)

	if duration > dayThreshold {
		return GranularityDaily
	} else if duration > hourThreshold {
		return GranularityHourly
	}

	return GranularityRaw
}

func SmartQuery(deviceID, dataType string, startTime, endTime time.Time, requestGranularity Granularity, maxPoints int) (*QueryResult, error) {
	granularity := DetermineGranularity(startTime, endTime, requestGranularity)

	if maxPoints <= 0 {
		maxPoints = 1000
	}

	switch granularity {
	case GranularityDaily:
		return queryDailyAggregate(deviceID, dataType, startTime, endTime, maxPoints)
	case GranularityHourly:
		return queryHourlyAggregate(deviceID, dataType, startTime, endTime, maxPoints)
	default:
		return queryRawData(deviceID, dataType, startTime, endTime, maxPoints)
	}
}

func queryRawData(deviceID, dataType string, startTime, endTime time.Time, maxPoints int) (*QueryResult, error) {
	var rawData []RawDataPoint

	totalDuration := endTime.Sub(startTime)
	interval := totalDuration / time.Duration(maxPoints)

	config.DB.Raw(`
		SELECT timestamp, value, unit
		FROM sensor_data
		WHERE device_id = ? AND type = ? AND timestamp BETWEEN ? AND ?
		AND EXTRACT(EPOCH FROM timestamp) % ? = 
		(SELECT MIN(EXTRACT(EPOCH FROM timestamp) % ?) FROM sensor_data WHERE device_id = ? AND type = ? AND timestamp BETWEEN ? AND ?)
		ORDER BY timestamp DESC
		LIMIT ?
	`, deviceID, dataType, startTime, endTime, interval.Seconds(), interval.Seconds(), deviceID, dataType, startTime, endTime, maxPoints).Scan(&rawData)

	if len(rawData) == 0 {
		config.DB.Raw(`
			SELECT timestamp, value, unit
			FROM sensor_data
			WHERE device_id = ? AND type = ? AND timestamp BETWEEN ? AND ?
			ORDER BY timestamp DESC
			LIMIT ?
		`, deviceID, dataType, startTime, endTime, maxPoints).Scan(&rawData)
	}

	return &QueryResult{
		Granularity: GranularityRaw,
		RawData:     rawData,
		Count:       len(rawData),
	}, nil
}

func queryHourlyAggregate(deviceID, dataType string, startTime, endTime time.Time, maxPoints int) (*QueryResult, error) {
	var data []AggregatedDataPoint

	limit := calculateLimit(startTime, endTime, time.Hour, maxPoints)

	config.DB.Raw(`
		SELECT
			bucket,
			min,
			max,
			avg,
			count,
			median
		FROM sensor_data_hourly
		WHERE device_id = ? AND type = ? AND bucket BETWEEN ? AND ?
		ORDER BY bucket DESC
		LIMIT ?
	`, deviceID, dataType, startTime, endTime, limit).Scan(&data)

	prependRecentRawData(deviceID, dataType, &data)

	return &QueryResult{
		Granularity: GranularityHourly,
		Data:        data,
		Count:       len(data),
	}, nil
}

func queryDailyAggregate(deviceID, dataType string, startTime, endTime time.Time, maxPoints int) (*QueryResult, error) {
	var data []AggregatedDataPoint

	limit := calculateLimit(startTime, endTime, 24*time.Hour, maxPoints)

	config.DB.Raw(`
		SELECT
			bucket,
			min,
			max,
			avg,
			count,
			median
		FROM sensor_data_daily
		WHERE device_id = ? AND type = ? AND bucket BETWEEN ? AND ?
		ORDER BY bucket DESC
		LIMIT ?
	`, deviceID, dataType, startTime, endTime, limit).Scan(&data)

	prependRecentHourlyData(deviceID, dataType, &data)

	return &QueryResult{
		Granularity: GranularityDaily,
		Data:        data,
		Count:       len(data),
	}, nil
}

func calculateLimit(startTime, endTime, bucketInterval time.Duration, maxPoints int) int {
	expectedPoints := int(endTime.Sub(startTime) / bucketInterval)
	if expectedPoints > maxPoints {
		return maxPoints
	}
	return expectedPoints
}

func prependRecentRawData(deviceID, dataType string, data *[]AggregatedDataPoint) {
	now := time.Now()
	oneHourAgo := now.Add(-1 * time.Hour)

	var recentRaw []RawDataPoint
	config.DB.Raw(`
		SELECT timestamp, value, unit
		FROM sensor_data
		WHERE device_id = ? AND type = ? AND timestamp >= ?
		ORDER BY timestamp DESC
		LIMIT 60
	`, deviceID, dataType, oneHourAgo).Scan(&recentRaw)

	if len(recentRaw) > 0 {
		var minVal, maxVal, sumVal float64
		minVal = recentRaw[0].Value
		maxVal = recentRaw[0].Value
		for _, p := range recentRaw {
			if p.Value < minVal {
				minVal = p.Value
			}
			if p.Value > maxVal {
				maxVal = p.Value
			}
			sumVal += p.Value
		}

		recentPoint := AggregatedDataPoint{
			Bucket: now,
			Min:    minVal,
			Max:    maxVal,
			Avg:    sumVal / float64(len(recentRaw)),
			Count:  len(recentRaw),
		}

		*data = append([]AggregatedDataPoint{recentPoint}, *data...)
	}
}

func prependRecentHourlyData(deviceID, dataType string, data *[]AggregatedDataPoint) {
	now := time.Now()
	oneDayAgo := now.Add(-24 * time.Hour)

	var recentHourly []AggregatedDataPoint
	config.DB.Raw(`
		SELECT
			bucket,
			min,
			max,
			avg,
			count,
			median
		FROM sensor_data_hourly
		WHERE device_id = ? AND type = ? AND bucket >= ?
		ORDER BY bucket DESC
		LIMIT 24
	`, deviceID, dataType, oneDayAgo).Scan(&recentHourly)

	prependRecentRawData(deviceID, dataType, &recentHourly)

	if len(recentHourly) > 0 {
		*data = append(recentHourly, *data...)
	}
}
