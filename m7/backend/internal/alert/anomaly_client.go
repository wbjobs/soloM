package alert

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"
)

type AnomalyClient struct {
	baseURL string
	client  *http.Client
}

func NewAnomalyClient(baseURL string) *AnomalyClient {
	return &AnomalyClient{
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *AnomalyClient) DetectBatch(requests []AnomalyRequest) ([]AnomalyResult, error) {
	body, err := json.Marshal(requests)
	if err != nil {
		return nil, err
	}

	resp, err := c.client.Post(c.baseURL+"/api/v1/detect", "application/json", bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var results []AnomalyResult
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	return results, nil
}

func (c *AnomalyClient) TrainBatch(requests []AnomalyRequest) error {
	body, err := json.Marshal(requests)
	if err != nil {
		return err
	}

	resp, err := c.client.Post(c.baseURL+"/api/v1/train", "application/json", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}
