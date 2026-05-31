package storage

import (
	"container/ring"
	"sync"
	"time"

	"sensor-platform/models"
)

type RealtimeCache struct {
	deviceData    map[string]*deviceRing
	mu            sync.RWMutex
	maxPoints     int
	flushInterval time.Duration
}

type deviceRing struct {
	data *ring.Ring
	mu   sync.RWMutex
}

type DataPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

var Cache *RealtimeCache

func InitRealtimeCache(maxPoints int) {
	Cache = &RealtimeCache{
		deviceData: make(map[string]*deviceRing),
		maxPoints:  maxPoints,
	}
}

func (c *RealtimeCache) getKey(deviceID, dataType string) string {
	return deviceID + ":" + dataType
}

func (c *RealtimeCache) Add(data models.SensorData) {
	key := c.getKey(data.DeviceID, data.Type)

	c.mu.Lock()
	dr, exists := c.deviceData[key]
	if !exists {
		dr = &deviceRing{
			data: ring.New(c.maxPoints),
		}
		c.deviceData[key] = dr
	}
	c.mu.Unlock()

	dr.mu.Lock()
	dr.data.Value = DataPoint{
		Timestamp: data.Timestamp,
		Value:     data.Value,
	}
	dr.data = dr.data.Next()
	dr.mu.Unlock()
}

func (c *RealtimeCache) GetLatest(deviceID, dataType string, limit int) []DataPoint {
	key := c.getKey(deviceID, dataType)

	c.mu.RLock()
	dr, exists := c.deviceData[key]
	c.mu.RUnlock()

	if !exists {
		return []DataPoint{}
	}

	result := make([]DataPoint, 0, limit)
	count := 0

	dr.mu.RLock()
	current := dr.data
	dr.mu.RUnlock()

	for i := 0; i < c.maxPoints && count < limit; i++ {
		current = current.Prev()
		if current.Value != nil {
			dp, ok := current.Value.(DataPoint)
			if ok && !dp.Timestamp.IsZero() {
				result = append(result, dp)
				count++
			}
		}
	}

	return result
}

func (c *RealtimeCache) GetSince(deviceID, dataType string, since time.Time) []DataPoint {
	key := c.getKey(deviceID, dataType)

	c.mu.RLock()
	dr, exists := c.deviceData[key]
	c.mu.RUnlock()

	if !exists {
		return []DataPoint{}
	}

	result := make([]DataPoint, 0)

	dr.mu.RLock()
	current := dr.data
	dr.mu.RUnlock()

	for i := 0; i < c.maxPoints; i++ {
		current = current.Prev()
		if current.Value != nil {
			dp, ok := current.Value.(DataPoint)
			if ok && !dp.Timestamp.IsZero() {
				if dp.Timestamp.After(since) {
					result = append(result, dp)
				} else {
					break
				}
			}
		}
	}

	return result
}

func (c *RealtimeCache) GetAllSince(since time.Time) map[string][]DataPoint {
	result := make(map[string][]DataPoint)

	c.mu.RLock()
	keys := make([]string, 0, len(c.deviceData))
	for k := range c.deviceData {
		keys = append(keys, k)
	}
	c.mu.RUnlock()

	for _, key := range keys {
		c.mu.RLock()
		dr := c.deviceData[key]
		c.mu.RUnlock()

		points := make([]DataPoint, 0)

		dr.mu.RLock()
		current := dr.data
		dr.mu.RUnlock()

		for i := 0; i < c.maxPoints; i++ {
			current = current.Prev()
			if current.Value != nil {
				dp, ok := current.Value.(DataPoint)
				if ok && !dp.Timestamp.IsZero() {
					if dp.Timestamp.After(since) {
						points = append(points, dp)
					} else {
						break
					}
				}
			}
		}

		if len(points) > 0 {
			result[key] = points
		}
	}

	return result
}

func (c *RealtimeCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.deviceData = make(map[string]*deviceRing)
}
