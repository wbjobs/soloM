package alert

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/cloudmon/netwatch/internal/model"
	"github.com/google/uuid"
)

type AlertManager struct {
	anomalyClient *AnomalyClient
	webhook       *WebhookNotifier
	alerts        []Alert
	mu            sync.RWMutex
	detectorCh    chan model.ServiceEdge
	done          chan struct{}
	lastAlerts    map[string]time.Time
	trainCount    int
	OnAlert       func(Alert)
}

func NewAlertManager(anomalyClient *AnomalyClient, webhook *WebhookNotifier) *AlertManager {
	return &AlertManager{
		anomalyClient: anomalyClient,
		webhook:       webhook,
		alerts:        make([]Alert, 0, 1000),
		detectorCh:    make(chan model.ServiceEdge, 1000),
		done:          make(chan struct{}),
		lastAlerts:    make(map[string]time.Time),
		trainCount:    0,
	}
}

func (m *AlertManager) Start() {
	go m.processLoop()
}

func (m *AlertManager) Stop() {
	close(m.done)
}

func (m *AlertManager) ProcessEdge(edge model.ServiceEdge) {
	select {
	case m.detectorCh <- edge:
	default:
	}
}

func (m *AlertManager) processLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	batch := make([]model.ServiceEdge, 0, 100)

	for {
		select {
		case <-m.done:
			return
		case edge := <-m.detectorCh:
			batch = append(batch, edge)
			if len(batch) >= 100 {
				m.processBatch(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				m.processBatch(batch)
				batch = batch[:0]
			}
		}
	}
}

func (m *AlertManager) processBatch(edges []model.ServiceEdge) {
	if len(edges) == 0 {
		return
	}

	requests := make([]AnomalyRequest, 0, len(edges))
	for _, edge := range edges {
		requests = append(requests, AnomalyRequest{
			ServicePair: edge.Source + "->" + edge.Target,
			Latency:     edge.P99LatencyUS,
			Timestamp:   edge.Timestamp,
		})
	}

	if m.trainCount < 100 {
		if err := m.anomalyClient.TrainBatch(requests); err == nil {
			m.trainCount += len(requests)
		}
		return
	}

	results, err := m.anomalyClient.DetectBatch(requests)
	if err != nil {
		return
	}

	for i, result := range results {
		if result.IsAnomaly {
			edge := edges[i]
			m.handleAnomaly(edge, result)
		}
	}
}

func (m *AlertManager) handleAnomaly(edge model.ServiceEdge, result AnomalyResult) {
	pair := edge.Source + "->" + edge.Target

	m.mu.Lock()
	if last, ok := m.lastAlerts[pair]; ok && time.Since(last) < 5*time.Minute {
		m.mu.Unlock()
		return
	}
	m.lastAlerts[pair] = time.Now()
	m.mu.Unlock()

	alertType := "anomaly"
	severity := "warning"
	message := fmt.Sprintf("服务 %s->%s 检测到异常，偏差 %.1f%%", edge.Source, edge.Target, result.DeviationPercent)

	if result.DeviationPercent > 100 {
		severity = "critical"
	}

	if edge.RetransmitCount > 10 {
		alertType = "retransmit_surge"
		message = fmt.Sprintf("服务 %s->%s 重传激增，计数 %d", edge.Source, edge.Target, edge.RetransmitCount)
	} else if result.DeviationPercent > 50 {
		alertType = "latency_spike"
		message = fmt.Sprintf("服务 %s->%s 延迟飙升，P99 %.0fus，基线 %.0fus，偏差 %.1f%%",
			edge.Source, edge.Target, edge.P99LatencyUS, result.Baseline, result.DeviationPercent)
	}

	alert := Alert{
		ID:               uuid.NewString(),
		ServicePair:      pair,
		SourceService:    edge.Source,
		TargetService:    edge.Target,
		Type:             alertType,
		Severity:         severity,
		Message:          message,
		Value:            edge.P99LatencyUS,
		Baseline:         result.Baseline,
		DeviationPercent: result.DeviationPercent,
		Timestamp:        time.Now(),
		Resolved:         false,
		Ack:              false,
	}

	m.mu.Lock()
	m.alerts = append(m.alerts, alert)
	if len(m.alerts) > 1000 {
		m.alerts = m.alerts[1:]
	}
	m.mu.Unlock()

	if m.webhook != nil {
		go m.webhook.Notify(alert)
	}

	if m.OnAlert != nil {
		m.OnAlert(alert)
	}
}

func (m *AlertManager) GetAlerts(limit int) []Alert {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if limit <= 0 || limit > len(m.alerts) {
		limit = len(m.alerts)
	}

	result := make([]Alert, limit)
	for i := 0; i < limit; i++ {
		result[i] = m.alerts[len(m.alerts)-1-i]
	}

	return result
}

func (m *AlertManager) AcknowledgeAlert(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i := range m.alerts {
		if m.alerts[i].ID == id {
			m.alerts[i].Ack = true
			return nil
		}
	}

	return errors.New("alert not found")
}

func (m *AlertManager) ResolveAlert(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i := range m.alerts {
		if m.alerts[i].ID == id {
			m.alerts[i].Resolved = true
			return nil
		}
	}

	return errors.New("alert not found")
}

func (m *AlertManager) SetWebhook(config WebhookConfig) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.webhook = NewWebhookNotifier(config)
}

func (m *AlertManager) GetWebhook() WebhookConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.webhook == nil {
		return WebhookConfig{}
	}

	return m.webhook.config
}
