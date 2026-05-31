package gateway

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"raft-kv-gateway/pkg/consistenthash"
)

type nodeState struct {
	addr          string
	unhealthy     bool
	failCount     int
	lastFail      time.Time
	lastHealthCheck time.Time
}

type Gateway struct {
	nodes       map[string]*nodeState
	hash        *consistenthash.Map
	mu          sync.RWMutex
	httpClient  *http.Client
	leaderCache map[string]string
	leaderExpiry map[string]time.Time

	failThreshold    int
	healthInterval   time.Duration
	healthTimeout    time.Duration
	retryMax         int
	stopCh           chan struct{}
}

func NewGateway(nodeAddrs map[string]string) *Gateway {
	g := &Gateway{
		nodes:       make(map[string]*nodeState),
		hash:        consistenthash.New(150, nil),
		httpClient:  &http.Client{Timeout: 5 * time.Second},
		leaderCache: make(map[string]string),
		leaderExpiry: make(map[string]time.Time),

		failThreshold:    3,
		healthInterval:   5 * time.Second,
		healthTimeout:    2 * time.Second,
		retryMax:         3,
		stopCh:           make(chan struct{}),
	}

	for nodeID, addr := range nodeAddrs {
		g.addNodeInternal(nodeID, addr)
	}

	return g
}

func (g *Gateway) AddNode(nodeID, addr string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.addNodeInternal(nodeID, addr)
}

func (g *Gateway) addNodeInternal(nodeID, addr string) {
	g.nodes[nodeID] = &nodeState{
		addr:      addr,
		unhealthy: false,
		failCount: 0,
	}
	g.hash.Add(nodeID)
	delete(g.leaderCache, nodeID)
	delete(g.leaderExpiry, nodeID)
}

func (g *Gateway) RemoveNode(nodeID string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	delete(g.nodes, nodeID)
	g.hash.Remove(nodeID)
	delete(g.leaderCache, nodeID)
	delete(g.leaderExpiry, nodeID)
}

func (g *Gateway) markUnhealthy(nodeID string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if ns, ok := g.nodes[nodeID]; ok {
		ns.unhealthy = true
		ns.lastFail = time.Now()
		delete(g.leaderCache, nodeID)
		delete(g.leaderExpiry, nodeID)
	}
}

func (g *Gateway) recordFailure(nodeID string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if ns, ok := g.nodes[nodeID]; ok {
		ns.failCount++
		ns.lastFail = time.Now()
		if ns.failCount >= g.failThreshold {
			ns.unhealthy = true
			delete(g.leaderCache, nodeID)
			delete(g.leaderExpiry, nodeID)
		}
	}
}

func (g *Gateway) markHealthy(nodeID string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if ns, ok := g.nodes[nodeID]; ok {
		ns.unhealthy = false
		ns.failCount = 0
	}
}

func (g *Gateway) getUnhealthySet() map[string]bool {
	g.mu.RLock()
	defer g.mu.RUnlock()

	exclude := make(map[string]bool)
	for id, ns := range g.nodes {
		if ns.unhealthy {
			exclude[id] = true
		}
	}
	return exclude
}

func (g *Gateway) getNodeForKey(key string, exclude map[string]bool) (string, string, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	nodeID := g.hash.GetWithFallback(key, exclude)
	if nodeID == "" {
		return "", "", false
	}
	ns, ok := g.nodes[nodeID]
	if !ok {
		return "", "", false
	}
	return nodeID, ns.addr, true
}

func (g *Gateway) getLeaderAddr(nodeID, fallbackAddr string) (string, error) {
	g.mu.RLock()
	cachedLeader, cacheOk := g.leaderCache[nodeID]
	expiry, expiryOk := g.leaderExpiry[nodeID]
	g.mu.RUnlock()

	if cacheOk && expiryOk && time.Now().Before(expiry) {
		return cachedLeader, nil
	}

	statusURL := fmt.Sprintf("http://%s/status", fallbackAddr)
	resp, err := g.httpClient.Get(statusURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var status struct {
		IsLeader   bool   `json:"is_leader"`
		LeaderHTTP string `json:"leader_http_addr"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return "", err
	}

	if status.IsLeader {
		g.mu.Lock()
		g.leaderCache[nodeID] = fallbackAddr
		g.leaderExpiry[nodeID] = time.Now().Add(5 * time.Second)
		g.mu.Unlock()
		return fallbackAddr, nil
	}

	if status.LeaderHTTP == "" {
		return "", fmt.Errorf("no leader found")
	}

	g.mu.Lock()
	g.leaderCache[nodeID] = status.LeaderHTTP
	g.leaderExpiry[nodeID] = time.Now().Add(5 * time.Second)
	g.mu.Unlock()

	return status.LeaderHTTP, nil
}

func (g *Gateway) Get(key string) (string, error) {
	var lastErr error
	exclude := g.getUnhealthySet()

	for attempt := 0; attempt < g.retryMax; attempt++ {
		nodeID, addr, ok := g.getNodeForKey(key, exclude)
		if !ok {
			break
		}

		url := fmt.Sprintf("http://%s/kv/%s", addr, key)
		resp, err := g.httpClient.Get(url)
		if err != nil {
			g.recordFailure(nodeID)
			exclude[nodeID] = true
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusServiceUnavailable {
			exclude[nodeID] = true
			lastErr = fmt.Errorf("node %s returned 503", nodeID)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			lastErr = fmt.Errorf("get failed: %s", string(body))
			continue
		}

		value, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", err
		}

		return string(value), nil
	}

	return "", fmt.Errorf("all retries exhausted: %v", lastErr)
}

func (g *Gateway) Put(key, value string) error {
	var lastErr error
	exclude := g.getUnhealthySet()

	for attempt := 0; attempt < g.retryMax; attempt++ {
		nodeID, addr, ok := g.getNodeForKey(key, exclude)
		if !ok {
			break
		}

		leaderAddr, err := g.getLeaderAddr(nodeID, addr)
		if err != nil {
			g.recordFailure(nodeID)
			exclude[nodeID] = true
			lastErr = err
			continue
		}

		url := fmt.Sprintf("http://%s/kv/%s", leaderAddr, key)
		req, err := http.NewRequest(http.MethodPut, url, bytes.NewBufferString(value))
		if err != nil {
			return err
		}

		resp, err := g.httpClient.Do(req)
		if err != nil {
			g.recordFailure(nodeID)
			exclude[nodeID] = true
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusServiceUnavailable {
			exclude[nodeID] = true
			lastErr = fmt.Errorf("node %s returned 503", nodeID)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			lastErr = fmt.Errorf("put failed: %s", string(body))
			continue
		}

		return nil
	}

	return fmt.Errorf("all retries exhausted: %v", lastErr)
}

func (g *Gateway) Delete(key string) error {
	var lastErr error
	exclude := g.getUnhealthySet()

	for attempt := 0; attempt < g.retryMax; attempt++ {
		nodeID, addr, ok := g.getNodeForKey(key, exclude)
		if !ok {
			break
		}

		leaderAddr, err := g.getLeaderAddr(nodeID, addr)
		if err != nil {
			g.recordFailure(nodeID)
			exclude[nodeID] = true
			lastErr = err
			continue
		}

		url := fmt.Sprintf("http://%s/kv/%s", leaderAddr, key)
		req, err := http.NewRequest(http.MethodDelete, url, nil)
		if err != nil {
			return err
		}

		resp, err := g.httpClient.Do(req)
		if err != nil {
			g.recordFailure(nodeID)
			exclude[nodeID] = true
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusServiceUnavailable {
			exclude[nodeID] = true
			lastErr = fmt.Errorf("node %s returned 503", nodeID)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			lastErr = fmt.Errorf("delete failed: %s", string(body))
			continue
		}

		return nil
	}

	return fmt.Errorf("all retries exhausted: %v", lastErr)
}

func (g *Gateway) GetNodes() map[string]string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	nodes := make(map[string]string)
	for k, v := range g.nodes {
		nodes[k] = v.addr
	}
	return nodes
}

func (g *Gateway) GetNodeStatus() map[string]NodeStatusInfo {
	g.mu.RLock()
	defer g.mu.RUnlock()

	result := make(map[string]NodeStatusInfo)
	for id, ns := range g.nodes {
		result[id] = NodeStatusInfo{
			Addr:      ns.addr,
			Healthy:   !ns.unhealthy,
			FailCount: ns.failCount,
		}
	}
	return result
}

type NodeStatusInfo struct {
	Addr      string `json:"addr"`
	Healthy   bool   `json:"healthy"`
	FailCount int    `json:"fail_count"`
}

func (g *Gateway) StartHealthCheck() {
	go g.healthCheckLoop()
}

func (g *Gateway) Stop() {
	close(g.stopCh)
}

func (g *Gateway) healthCheckLoop() {
	ticker := time.NewTicker(g.healthInterval)
	defer ticker.Stop()

	for {
		select {
		case <-g.stopCh:
			return
		case <-ticker.C:
			g.checkAllNodes()
		}
	}
}

func (g *Gateway) checkAllNodes() {
	g.mu.RLock()
	nodeIDs := make([]string, 0, len(g.nodes))
	for id := range g.nodes {
		nodeIDs = append(nodeIDs, id)
	}
	g.mu.RUnlock()

	checkClient := &http.Client{Timeout: g.healthTimeout}

	for _, nodeID := range nodeIDs {
		g.mu.RLock()
		ns, ok := g.nodes[nodeID]
		g.mu.RUnlock()

		if !ok {
			continue
		}

		url := fmt.Sprintf("http://%s/status", ns.addr)
		resp, err := checkClient.Get(url)

		if err != nil {
			if !ns.unhealthy {
				g.recordFailure(nodeID)
			}
			continue
		}
		resp.Body.Close()

		if ns.unhealthy {
			g.markHealthy(nodeID)
		} else {
			g.mu.Lock()
			if ns, ok := g.nodes[nodeID]; ok {
				ns.failCount = 0
			}
			g.mu.Unlock()
		}
	}
}
