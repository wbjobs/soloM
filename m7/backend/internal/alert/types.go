package alert

import "time"

type Alert struct {
	ID               string    `json:"id"`
	ServicePair      string    `json:"service_pair"`
	SourceService    string    `json:"source_service"`
	TargetService    string    `json:"target_service"`
	Type             string    `json:"type"`
	Severity         string    `json:"severity"`
	Message          string    `json:"message"`
	Value            float64   `json:"value"`
	Baseline         float64   `json:"baseline"`
	DeviationPercent float64   `json:"deviation_percent"`
	Timestamp        time.Time `json:"timestamp"`
	Resolved         bool      `json:"resolved"`
	Ack              bool      `json:"ack"`
}

type WebhookConfig struct {
	URL     string            `json:"url"`
	Enabled bool              `json:"enabled"`
	Headers map[string]string `json:"headers"`
	Secret  string            `json:"secret"`
}

type AnomalyRequest struct {
	ServicePair string    `json:"service_pair"`
	Latency     float64   `json:"latency"`
	Timestamp   time.Time `json:"timestamp"`
}

type AnomalyResult struct {
	IsAnomaly        bool    `json:"is_anomaly"`
	Score            float64 `json:"score"`
	DeviationPercent float64 `json:"deviation_percent"`
	Method           string  `json:"method"`
	Baseline         float64 `json:"baseline"`
}
