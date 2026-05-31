package remote

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"server-monitor/internal/collector"
)

type ServerNode struct {
	Config       *ServerConfig
	Client       *SSHClient
	Metrics      *RemoteMetrics
	CPUHistory   []float64
	RecvHistory  []float64
	SentHistory  []float64
	ReadHistory  []float64
	WriteHistory []float64
	prevDiskReads  uint64
	prevDiskWrites uint64
	prevNetRecv    uint64
	prevNetSent    uint64
	prevTime       time.Time
	mu           sync.RWMutex
	connected    bool
	lastError    string
}

type ServerManager struct {
	nodes       map[string]*ServerNode
	nodesOrder  []string
	historyLen  int
	mu          sync.RWMutex
	configFile  string
}

func NewServerManager(historyLen int, configFile string) *ServerManager {
	m := &ServerManager{
		nodes:      make(map[string]*ServerNode),
		nodesOrder: make([]string, 0),
		historyLen: historyLen,
		configFile: configFile,
	}

	m.nodes["local"] = &ServerNode{
		Config: &ServerConfig{
			ID:   "local",
			Name: "本地主机",
			Host: "localhost",
			Port: 0,
			User: "",
		},
		Metrics: &RemoteMetrics{
			Connected: true,
			Timestamp: time.Now(),
		},
		connected: true,
	}
	m.nodesOrder = append(m.nodesOrder, "local")

	if configFile != "" {
		m.LoadConfig()
	}

	return m
}

func (m *ServerManager) LoadConfig() error {
	if m.configFile == "" {
		return nil
	}

	data, err := os.ReadFile(m.configFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("读取配置文件失败: %w", err)
	}

	var config struct {
		Servers []*ServerConfig `json:"servers"`
	}
	if err := json.Unmarshal(data, &config); err != nil {
		var servers []*ServerConfig
		if err2 := json.Unmarshal(data, &servers); err2 == nil {
			config.Servers = servers
		} else {
			return fmt.Errorf("解析配置文件失败: %w", err)
		}
	}

	for _, server := range config.Servers {
		if err := m.AddServer(server); err != nil {
			fmt.Fprintf(os.Stderr, "添加服务器 %s 失败: %v\n", server.Name, err)
		}
	}

	return nil
}

func (m *ServerManager) SaveConfig() error {
	if m.configFile == "" {
		return nil
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	var servers []*ServerConfig
	for _, id := range m.nodesOrder {
		if id == "local" {
			continue
		}
		servers = append(servers, m.nodes[id].Config)
	}

	config := struct {
		Servers []*ServerConfig `json:"servers"`
	}{
		Servers: servers,
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	dir := filepath.Dir(m.configFile)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}

	if err := os.WriteFile(m.configFile, data, 0600); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	return nil
}

func (m *ServerManager) AddServer(config *ServerConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if config.ID == "" {
		config.ID = fmt.Sprintf("server_%d", len(m.nodesOrder)+1)
	}

	if _, exists := m.nodes[config.ID]; exists {
		return fmt.Errorf("服务器ID %s 已存在", config.ID)
	}

	client, err := NewSSHClient(config, m.historyLen)
	if err != nil {
		return err
	}

	node := &ServerNode{
		Config:    config,
		Client:    client,
		Metrics:   &RemoteMetrics{Connected: false},
		connected: false,
	}

	m.nodes[config.ID] = node
	m.nodesOrder = append(m.nodesOrder, config.ID)

	return nil
}

func (m *ServerManager) RemoveServer(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if id == "local" {
		return fmt.Errorf("不能删除本地主机")
	}

	node, exists := m.nodes[id]
	if !exists {
		return fmt.Errorf("服务器 %s 不存在", id)
	}

	if node.Client != nil {
		node.Client.Disconnect()
	}

	delete(m.nodes, id)

	for i, nodeID := range m.nodesOrder {
		if nodeID == id {
			m.nodesOrder = append(m.nodesOrder[:i], m.nodesOrder[i+1:]...)
			break
		}
	}

	return nil
}

func (m *ServerManager) GetServers() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]string, len(m.nodesOrder))
	copy(result, m.nodesOrder)
	return result
}

func (m *ServerManager) GetNode(id string) (*ServerNode, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	node, exists := m.nodes[id]
	return node, exists
}

func (m *ServerManager) UpdateLocalMetrics(metrics collector.Metrics) {
	m.mu.Lock()
	defer m.mu.Unlock()

	node, exists := m.nodes["local"]
	if !exists {
		return
	}

	node.mu.Lock()
	defer node.mu.Unlock()

	node.Metrics = &RemoteMetrics{
		Metrics:   metrics,
		Hostname:  "localhost",
		Timestamp: time.Now(),
		Connected: true,
	}

	node.CPUHistory = append(node.CPUHistory, metrics.CPUPercent)
	if len(node.CPUHistory) > m.historyLen {
		node.CPUHistory = node.CPUHistory[1:]
	}

	node.RecvHistory = append(node.RecvHistory, metrics.NetRecvRate/1024)
	if len(node.RecvHistory) > m.historyLen {
		node.RecvHistory = node.RecvHistory[1:]
	}

	node.SentHistory = append(node.SentHistory, metrics.NetSentRate/1024)
	if len(node.SentHistory) > m.historyLen {
		node.SentHistory = node.SentHistory[1:]
	}

	node.ReadHistory = append(node.ReadHistory, metrics.DiskReadRate/1024)
	if len(node.ReadHistory) > m.historyLen {
		node.ReadHistory = node.ReadHistory[1:]
	}

	node.WriteHistory = append(node.WriteHistory, metrics.DiskWriteRate/1024)
	if len(node.WriteHistory) > m.historyLen {
		node.WriteHistory = node.WriteHistory[1:]
	}

	node.connected = true
}

func (m *ServerManager) CollectRemote(ctx context.Context, id string) {
	node, exists := m.GetNode(id)
	if !exists || id == "local" {
		return
	}

	metrics, err := node.Client.Collect(ctx)
	if err != nil {
		node.mu.Lock()
		node.connected = false
		node.lastError = node.Client.GetLastError()
		node.mu.Unlock()
		return
	}

	node.mu.Lock()
	defer node.mu.Unlock()

	now := time.Now()
	interval := now.Sub(node.prevTime).Seconds()
	if interval <= 0 {
		interval = 1.0
	}

	if node.prevDiskReads > 0 && metrics.DiskReads >= node.prevDiskReads {
		metrics.DiskReadRate = float64(metrics.DiskReads-node.prevDiskReads) / interval
		metrics.DiskWriteRate = float64(metrics.DiskWrites-node.prevDiskWrites) / interval
	}
	if node.prevNetRecv > 0 && metrics.NetRecv >= node.prevNetRecv {
		metrics.NetRecvRate = float64(metrics.NetRecv-node.prevNetRecv) / interval
		metrics.NetSentRate = float64(metrics.NetSent-node.prevNetSent) / interval
	}

	node.prevDiskReads = metrics.DiskReads
	node.prevDiskWrites = metrics.DiskWrites
	node.prevNetRecv = metrics.NetRecv
	node.prevNetSent = metrics.NetSent
	node.prevTime = now

	node.Metrics = metrics
	node.connected = metrics.Connected
	node.lastError = metrics.Error

	node.CPUHistory = append(node.CPUHistory, metrics.CPUPercent)
	if len(node.CPUHistory) > m.historyLen {
		node.CPUHistory = node.CPUHistory[1:]
	}

	node.RecvHistory = append(node.RecvHistory, metrics.NetRecvRate/1024)
	if len(node.RecvHistory) > m.historyLen {
		node.RecvHistory = node.RecvHistory[1:]
	}

	node.SentHistory = append(node.SentHistory, metrics.NetSentRate/1024)
	if len(node.SentHistory) > m.historyLen {
		node.SentHistory = node.SentHistory[1:]
	}

	node.ReadHistory = append(node.ReadHistory, metrics.DiskReadRate/1024)
	if len(node.ReadHistory) > m.historyLen {
		node.ReadHistory = node.ReadHistory[1:]
	}

	node.WriteHistory = append(node.WriteHistory, metrics.DiskWriteRate/1024)
	if len(node.WriteHistory) > m.historyLen {
		node.WriteHistory = node.WriteHistory[1:]
	}
}

func (m *ServerManager) CollectAllRemote(ctx context.Context) {
	servers := m.GetServers()
	for _, id := range servers {
		if id != "local" {
			go m.CollectRemote(ctx, id)
		}
	}
}

func (node *ServerNode) IsConnected() bool {
	node.mu.RLock()
	defer node.mu.RUnlock()
	return node.connected
}

func (node *ServerNode) GetLastError() string {
	node.mu.RLock()
	defer node.mu.RUnlock()
	return node.lastError
}

func (node *ServerNode) GetMetrics() *RemoteMetrics {
	node.mu.RLock()
	defer node.mu.RUnlock()
	return node.Metrics
}

func (node *ServerNode) GetCPUHistory() []float64 {
	node.mu.RLock()
	defer node.mu.RUnlock()
	return append([]float64{}, node.CPUHistory...)
}

func (node *ServerNode) GetNetworkHistory() ([]float64, []float64) {
	node.mu.RLock()
	defer node.mu.RUnlock()
	return append([]float64{}, node.RecvHistory...), append([]float64{}, node.SentHistory...)
}

func (node *ServerNode) GetDiskHistory() ([]float64, []float64) {
	node.mu.RLock()
	defer node.mu.RUnlock()
	return append([]float64{}, node.ReadHistory...), append([]float64{}, node.WriteHistory...)
}
