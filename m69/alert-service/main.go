package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/nats-io/nats.go"
	"gopkg.in/yaml.v3"
)

type Config struct {
	NATS struct {
		URL     string `yaml:"url"`
		Subject string `yaml:"subject"`
	} `yaml:"nats"`
	AlertService struct {
		Patterns       []string `yaml:"patterns"`
		ErrorCodeRegex string   `yaml:"error_code_regex"`
		Aggregation    struct {
			Enabled      bool `yaml:"enabled"`
			WindowSec    int  `yaml:"window_sec"`
			Threshold    int  `yaml:"threshold"`
			SilenceSec   int  `yaml:"silence_sec"`
		} `yaml:"aggregation"`
		Webhook struct {
			DingTalk struct {
				Enabled bool   `yaml:"enabled"`
				URL     string `yaml:"url"`
				Secret  string `yaml:"secret"`
			} `yaml:"dingtalk"`
			Feishu struct {
				Enabled bool   `yaml:"enabled"`
				URL     string `yaml:"url"`
				Secret  string `yaml:"secret"`
			} `yaml:"feishu"`
		} `yaml:"webhook"`
	} `yaml:"alert_service"`
}

type LogMessage struct {
	Timestamp string
	Hostname  string
	Filename  string
	Message   string
}

type AlertService struct {
	config   *Config
	nc       *nats.Conn
	patterns []*regexp.Regexp
	codeRe   *regexp.Regexp
	agg      *AggregationEngine
}

type DingTalkMessage struct {
	MsgType string `json:"msgtype"`
	Text    struct {
		Content string `json:"content"`
	} `json:"text"`
	At struct {
		IsAtAll bool `json:"isAtAll"`
	} `json:"at"`
}

type FeishuMessage struct {
	MsgType string `json:"msg_type"`
	Content struct {
		Text string `json:"text"`
	} `json:"content"`
}

type windowEntry struct {
	timestamps []time.Time
	silenceEnd time.Time
}

type AggregationEngine struct {
	mu             sync.Mutex
	windows        map[string]*windowEntry
	windowDuration time.Duration
	threshold      int
	silenceDuration time.Duration
	alertSender    func(errorCode string, count int, window time.Duration)
	stopChan       chan struct{}
}

func NewAggregationEngine(windowSec, threshold, silenceSec int, sender func(string, int, time.Duration)) *AggregationEngine {
	agg := &AggregationEngine{
		windows:         make(map[string]*windowEntry),
		windowDuration:  time.Duration(windowSec) * time.Second,
		threshold:       threshold,
		silenceDuration: time.Duration(silenceSec) * time.Second,
		alertSender:     sender,
		stopChan:        make(chan struct{}),
	}
	go agg.cleanupLoop()
	return agg
}

func (ae *AggregationEngine) Stop() {
	close(ae.stopChan)
}

func (ae *AggregationEngine) Record(errorCode string) (shouldAlert bool, isAggregated bool, count int) {
	ae.mu.Lock()
	defer ae.mu.Unlock()

	now := time.Now()

	entry, exists := ae.windows[errorCode]
	if !exists {
		entry = &windowEntry{
			timestamps: make([]time.Time, 0),
		}
		ae.windows[errorCode] = entry
	}

	if now.Before(entry.silenceEnd) {
		entry.timestamps = append(entry.timestamps, now)
		ae.trimWindow(entry, now)
		return false, true, len(entry.timestamps)
	}

	entry.timestamps = append(entry.timestamps, now)
	ae.trimWindow(entry, now)

	count = len(entry.timestamps)

	if count >= ae.threshold {
		entry.silenceEnd = now.Add(ae.silenceDuration)
		entry.timestamps = entry.timestamps[:0]

		go ae.alertSender(errorCode, count, ae.windowDuration)
		return true, true, count
	}

	return false, false, count
}

func (ae *AggregationEngine) trimWindow(entry *windowEntry, now time.Time) {
	cutoff := now.Add(-ae.windowDuration)
	i := 0
	for i < len(entry.timestamps) && entry.timestamps[i].Before(cutoff) {
		i++
	}
	if i > 0 {
		entry.timestamps = entry.timestamps[i:]
	}
}

func (ae *AggregationEngine) cleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ae.stopChan:
			return
		case <-ticker.C:
			ae.cleanup()
		}
	}
}

func (ae *AggregationEngine) cleanup() {
	ae.mu.Lock()
	defer ae.mu.Unlock()

	now := time.Now()
	for code, entry := range ae.windows {
		ae.trimWindow(entry, now)
		if len(entry.timestamps) == 0 && now.After(entry.silenceEnd) {
			delete(ae.windows, code)
		}
	}
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	if config.AlertService.Aggregation.WindowSec == 0 {
		config.AlertService.Aggregation.WindowSec = 60
	}
	if config.AlertService.Aggregation.Threshold == 0 {
		config.AlertService.Aggregation.Threshold = 100
	}
	if config.AlertService.Aggregation.SilenceSec == 0 {
		config.AlertService.Aggregation.SilenceSec = 300
	}

	return &config, nil
}

func NewAlertService(config *Config) (*AlertService, error) {
	nc, err := nats.Connect(config.NATS.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %v", err)
	}

	patterns := make([]*regexp.Regexp, 0, len(config.AlertService.Patterns))
	for _, p := range config.AlertService.Patterns {
		re, err := regexp.Compile(p)
		if err != nil {
			return nil, fmt.Errorf("invalid pattern %s: %v", p, err)
		}
		patterns = append(patterns, re)
	}

	var codeRe *regexp.Regexp
	if config.AlertService.ErrorCodeRegex != "" {
		codeRe, err = regexp.Compile(config.AlertService.ErrorCodeRegex)
		if err != nil {
			return nil, fmt.Errorf("invalid error_code_regex %s: %v", config.AlertService.ErrorCodeRegex, err)
		}
	}

	as := &AlertService{
		config:   config,
		nc:       nc,
		patterns: patterns,
		codeRe:   codeRe,
	}

	if config.AlertService.Aggregation.Enabled {
		as.agg = NewAggregationEngine(
			config.AlertService.Aggregation.WindowSec,
			config.AlertService.Aggregation.Threshold,
			config.AlertService.Aggregation.SilenceSec,
			as.sendAggregatedAlert,
		)
	}

	return as, nil
}

func (as *AlertService) Close() {
	if as.agg != nil {
		as.agg.Stop()
	}
	as.nc.Close()
}

func parseLogMessage(data []byte) (*LogMessage, error) {
	parts := strings.SplitN(string(data), "|", 4)
	if len(parts) != 4 {
		return nil, fmt.Errorf("invalid message format")
	}
	return &LogMessage{
		Timestamp: parts[0],
		Hostname:  parts[1],
		Filename:  parts[2],
		Message:   parts[3],
	}, nil
}

func (as *AlertService) matchError(msg string) bool {
	for _, re := range as.patterns {
		if re.MatchString(msg) {
			return true
		}
	}
	return false
}

func (as *AlertService) extractErrorCode(msg string) string {
	if as.codeRe == nil {
		return "UNKNOWN_ERROR"
	}

	match := as.codeRe.FindStringSubmatch(msg)
	if len(match) >= 2 {
		return match[1]
	}
	return "UNKNOWN_ERROR"
}

func (as *AlertService) formatAlertMessage(logMsg *LogMessage) string {
	return fmt.Sprintf(`
⚠️ 日志异常告警 ⚠️

时间: %s
主机: %s
文件: %s

错误内容:
%s
`, logMsg.Timestamp, logMsg.Hostname, logMsg.Filename, logMsg.Message)
}

func (as *AlertService) formatAggregatedAlertMessage(errorCode string, count int, window time.Duration) string {
	return fmt.Sprintf(`
🔴 告警聚合通知 🔴

过去 %d 分钟内错误码 [%s] 爆发 %d 次，已超过阈值 %d 次/分钟

触发时间: %s
当前已进入 %d 分钟静默期，同类告警将暂不发送

请尽快排查！
`,
		int(window.Minutes()),
		errorCode,
		count,
		as.config.AlertService.Aggregation.Threshold,
		time.Now().Format("2006-01-02 15:04:05"),
		as.config.AlertService.Aggregation.SilenceSec/60,
	)
}

func dingTalkSign(secret string, timestamp int64) string {
	stringToSign := fmt.Sprintf("%d\n%s", timestamp, secret)
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(stringToSign))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func (as *AlertService) sendDingTalkAlert(message string) error {
	if !as.config.AlertService.Webhook.DingTalk.Enabled {
		return nil
	}

	url := as.config.AlertService.Webhook.DingTalk.URL
	secret := as.config.AlertService.Webhook.DingTalk.Secret

	if secret != "" {
		timestamp := time.Now().UnixMilli()
		sign := dingTalkSign(secret, timestamp)
		url = fmt.Sprintf("%s&timestamp=%d&sign=%s", url, timestamp, sign)
	}

	msg := DingTalkMessage{
		MsgType: "text",
	}
	msg.Text.Content = message
	msg.At.IsAtAll = true

	data, _ := json.Marshal(msg)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("dingtalk webhook returned status: %d", resp.StatusCode)
	}

	log.Println("DingTalk alert sent successfully")
	return nil
}

func (as *AlertService) sendFeishuAlert(message string) error {
	if !as.config.AlertService.Webhook.Feishu.Enabled {
		return nil
	}

	url := as.config.AlertService.Webhook.Feishu.URL

	msg := FeishuMessage{
		MsgType: "text",
	}
	msg.Content.Text = message

	data, _ := json.Marshal(msg)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("feishu webhook returned status: %d", resp.StatusCode)
	}

	log.Println("Feishu alert sent successfully")
	return nil
}

func (as *AlertService) sendAlert(logMsg *LogMessage) {
	alertMsg := as.formatAlertMessage(logMsg)

	if as.config.AlertService.Webhook.DingTalk.Enabled {
		if err := as.sendDingTalkAlert(alertMsg); err != nil {
			log.Printf("Failed to send DingTalk alert: %v", err)
		}
	}

	if as.config.AlertService.Webhook.Feishu.Enabled {
		if err := as.sendFeishuAlert(alertMsg); err != nil {
			log.Printf("Failed to send Feishu alert: %v", err)
		}
	}
}

func (as *AlertService) sendAggregatedAlert(errorCode string, count int, window time.Duration) {
	alertMsg := as.formatAggregatedAlertMessage(errorCode, count, window)
	log.Printf("Sending aggregated alert: error_code=%s, count=%d, window=%v", errorCode, count, window)

	if as.config.AlertService.Webhook.DingTalk.Enabled {
		if err := as.sendDingTalkAlert(alertMsg); err != nil {
			log.Printf("Failed to send DingTalk aggregated alert: %v", err)
		}
	}

	if as.config.AlertService.Webhook.Feishu.Enabled {
		if err := as.sendFeishuAlert(alertMsg); err != nil {
			log.Printf("Failed to send Feishu aggregated alert: %v", err)
		}
	}
}

func (as *AlertService) processMessage(msg *nats.Msg) {
	logMsg, err := parseLogMessage(msg.Data)
	if err != nil {
		log.Printf("Failed to parse message: %v", err)
		return
	}

	if !as.matchError(logMsg.Message) {
		return
	}

	errorCode := as.extractErrorCode(logMsg.Message)

	if as.agg != nil && as.config.AlertService.Aggregation.Enabled {
		shouldAlert, isAggregated, count := as.agg.Record(errorCode)

		if isAggregated {
			if shouldAlert {
				log.Printf("Aggregation threshold reached: error_code=%s, count=%d -> sending aggregated alert", errorCode, count)
			} else {
				log.Printf("Error suppressed (aggregated): error_code=%s, current_window_count=%d", errorCode, count)
			}
			return
		}
	}

	log.Printf("Error detected in %s: %s (error_code=%s)", logMsg.Filename, logMsg.Message, errorCode)
	as.sendAlert(logMsg)
}

func (as *AlertService) Start() error {
	_, err := as.nc.Subscribe(as.config.NATS.Subject, as.processMessage)
	if err != nil {
		return fmt.Errorf("failed to subscribe: %v", err)
	}

	log.Printf("Alert Service started, listening on subject: %s", as.config.NATS.Subject)
	log.Printf("Error patterns: %v", as.config.AlertService.Patterns)

	if as.config.AlertService.Aggregation.Enabled {
		log.Printf("Aggregation enabled: window=%ds, threshold=%d, silence=%ds",
			as.config.AlertService.Aggregation.WindowSec,
			as.config.AlertService.Aggregation.Threshold,
			as.config.AlertService.Aggregation.SilenceSec)
		log.Printf("Error code regex: %s", as.config.AlertService.ErrorCodeRegex)
	} else {
		log.Println("Aggregation disabled: every error will trigger an alert")
	}

	if as.config.AlertService.Webhook.DingTalk.Enabled {
		log.Println("DingTalk webhook enabled")
	}
	if as.config.AlertService.Webhook.Feishu.Enabled {
		log.Println("Feishu webhook enabled")
	}

	return nil
}

func main() {
	configPath := "../config/config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	config, err := loadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	alertService, err := NewAlertService(config)
	if err != nil {
		log.Fatalf("Failed to create alert service: %v", err)
	}
	defer alertService.Close()

	if err := alertService.Start(); err != nil {
		log.Fatalf("Failed to start alert service: %v", err)
	}

	select {}
}
