package alert

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"
)

type WebhookNotifier struct {
	config WebhookConfig
	client *http.Client
}

func NewWebhookNotifier(config WebhookConfig) *WebhookNotifier {
	return &WebhookNotifier{
		config: config,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (n *WebhookNotifier) Notify(alert Alert) error {
	if !n.config.Enabled || n.config.URL == "" {
		return nil
	}

	body, err := json.Marshal(alert)
	if err != nil {
		return err
	}

	var lastErr error
	for i := 0; i < 3; i++ {
		if err := n.send(body); err != nil {
			lastErr = err
			time.Sleep(time.Duration(1<<i) * time.Second)
			continue
		}
		return nil
	}

	return lastErr
}

func (n *WebhookNotifier) send(body []byte) error {
	req, err := http.NewRequest("POST", n.config.URL, bytes.NewBuffer(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	for k, v := range n.config.Headers {
		req.Header.Set(k, v)
	}

	if n.config.Secret != "" {
		sig := computeSignature(body, n.config.Secret)
		req.Header.Set("X-Signature", sig)
	}

	resp, err := n.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

func computeSignature(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}
