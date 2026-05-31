package remote

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
	"server-monitor/internal/collector"
)

type ServerConfig struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	Password   string `json:"password,omitempty"`
	KeyFile    string `json:"key_file,omitempty"`
	Passphrase string `json:"key_password,omitempty"`
}

type RemoteMetrics struct {
	collector.Metrics
	Hostname  string    `json:"hostname"`
	Error     string    `json:"error,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	Connected bool      `json:"connected"`
}

type SSHClient struct {
	config     *ServerConfig
	sshConfig  *ssh.ClientConfig
	client     *ssh.Client
	mu         sync.Mutex
	connected  bool
	lastError  string
	historyLen int
}

func NewSSHClient(config *ServerConfig, historyLen int) (*SSHClient, error) {
	client := &SSHClient{
		config:     config,
		historyLen: historyLen,
	}

	var authMethods []ssh.AuthMethod

	if config.KeyFile != "" {
		key, err := os.ReadFile(config.KeyFile)
		if err != nil {
			return nil, fmt.Errorf("读取密钥文件失败: %w", err)
		}

		var signer ssh.Signer
		if config.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(key, []byte(config.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(key)
		}
		if err != nil {
			return nil, fmt.Errorf("解析密钥失败: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	if config.Password != "" {
		authMethods = append(authMethods, ssh.Password(config.Password))
		authMethods = append(authMethods, ssh.KeyboardInteractive(func(user, instruction string, questions []string, echos []bool) ([]string, error) {
			answers := make([]string, len(questions))
			for i := range questions {
				answers[i] = config.Password
			}
			return answers, nil
		}))
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("必须提供密码或密钥文件")
	}

	hostKeyCallback := ssh.InsecureIgnoreHostKey()
	if knownHostsFile := os.Getenv("SSH_KNOWN_HOSTS"); knownHostsFile != "" {
		if cb, err := knownhosts.New(knownHostsFile); err == nil {
			hostKeyCallback = cb
		}
	}

	client.sshConfig = &ssh.ClientConfig{
		User:            config.User,
		Auth:            authMethods,
		HostKeyCallback: hostKeyCallback,
		Timeout:         10 * time.Second,
	}

	return client, nil
}

func (c *SSHClient) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client != nil {
		c.client.Close()
	}

	addr := fmt.Sprintf("%s:%d", c.config.Host, c.config.Port)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		c.connected = false
		c.lastError = fmt.Sprintf("连接失败: %v", err)
		return err
	}

	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, c.sshConfig)
	if err != nil {
		c.connected = false
		c.lastError = fmt.Sprintf("SSH握手失败: %v", err)
		conn.Close()
		return err
	}

	c.client = ssh.NewClient(sshConn, chans, reqs)
	c.connected = true
	c.lastError = ""

	return nil
}

func (c *SSHClient) Disconnect() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client != nil {
		c.client.Close()
		c.client = nil
	}
	c.connected = false
}

func (c *SSHClient) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

func (c *SSHClient) GetLastError() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastError
}

func (c *SSHClient) executeCommand(cmd string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client == nil {
		return "", fmt.Errorf("未连接")
	}

	session, err := c.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("创建会话失败: %w", err)
	}
	defer session.Close()

	output, err := session.CombinedOutput(cmd)
	if err != nil {
		return string(output), fmt.Errorf("命令执行失败: %w, 输出: %s", err, string(output))
	}

	return string(output), nil
}

func (c *SSHClient) Collect(ctx context.Context) (*RemoteMetrics, error) {
	if !c.IsConnected() {
		if err := c.Connect(); err != nil {
			return &RemoteMetrics{
				Timestamp: time.Now(),
				Connected: false,
				Error:     c.lastError,
			}, err
		}
	}

	script := generateCollectorScript()
	output, err := c.executeCommand(script)
	if err != nil {
		c.connected = false
		c.lastError = fmt.Sprintf("采集失败: %v", err)
		return &RemoteMetrics{
			Timestamp: time.Now(),
			Connected: false,
			Error:     c.lastError,
		}, err
	}

	var metrics collector.Metrics
	if err := json.Unmarshal([]byte(strings.TrimSpace(output)), &metrics); err != nil {
		c.lastError = fmt.Sprintf("解析数据失败: %v, 输出: %.200s", err, output)
		return &RemoteMetrics{
			Timestamp: time.Now(),
			Connected: true,
			Error:     c.lastError,
		}, fmt.Errorf(c.lastError)
	}

	hostname, _ := c.executeCommand("hostname")
	hostname = strings.TrimSpace(hostname)

	return &RemoteMetrics{
		Metrics:   metrics,
		Hostname:  hostname,
		Timestamp: time.Now(),
		Connected: true,
	}, nil
}

func generateCollectorScript() string {
	return `python3 -c '
import json
import sys
import os

try:
    import psutil
except ImportError:
    result = {"error": "psutil not installed", "suggestion": "pip install psutil"}
    print(json.dumps(result))
    sys.exit(1)

def get_metrics():
    metrics = {}

    cpu_percent = psutil.cpu_percent(interval=0.2)
    metrics["CPUPercent"] = cpu_percent
    metrics["CPUHistory"] = []

    mem = psutil.virtual_memory()
    metrics["MemoryUsed"] = mem.used
    metrics["MemoryTotal"] = mem.total
    metrics["MemoryPercent"] = mem.percent

    swap = psutil.swap_memory()
    metrics["SwapUsed"] = swap.used
    metrics["SwapTotal"] = swap.total
    metrics["SwapPercent"] = swap.percent

    disk_io = psutil.disk_io_counters()
    if disk_io:
        metrics["DiskReads"] = disk_io.read_bytes
        metrics["DiskWrites"] = disk_io.write_bytes
        metrics["DiskReadRate"] = 0.0
        metrics["DiskWriteRate"] = 0.0

    net_io = psutil.net_io_counters()
    if net_io:
        metrics["NetRecv"] = net_io.bytes_recv
        metrics["NetSent"] = net_io.bytes_sent
        metrics["NetRecvRate"] = 0.0
        metrics["NetSentRate"] = 0.0

    processes = []
    for proc in psutil.process_iter(["pid", "name", "memory_percent", "memory_info", "cpu_percent"]):
        try:
            p = proc.info
            rss = p["memory_info"].rss if p["memory_info"] else 0
            processes.append({
                "PID": p["pid"],
                "Name": p["name"],
                "MemoryPercent": p["memory_percent"] or 0.0,
                "MemoryRSS": rss,
                "CPUPercent": p["cpu_percent"] or 0.0
            })
        except:
            continue

    processes.sort(key=lambda x: x["MemoryPercent"], reverse=True)
    metrics["Processes"] = processes[:10]

    return metrics

result = get_metrics()
print(json.dumps(result))
' 2>/dev/null`
}

func (c *SSHClient) ReconnectIfNeeded() error {
	if !c.IsConnected() {
		return c.Connect()
	}

	_, err := c.executeCommand("echo ok")
	if err != nil {
		return c.Connect()
	}
	return nil
}
