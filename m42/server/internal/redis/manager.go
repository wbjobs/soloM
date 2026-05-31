package redis

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type UniversalClient interface {
	redis.Cmdable
	Close() error
}

type clusterClientExt interface {
	UniversalClient
	ReloadState(ctx context.Context) error
	ForEachMaster(ctx context.Context, fn func(ctx context.Context, client *redis.Client) error) error
	ForEachSlave(ctx context.Context, fn func(ctx context.Context, client *redis.Client) error) error
}

type Manager struct {
	mu      sync.RWMutex
	clients map[uuid.UUID]UniversalClient
	meta    map[uuid.UUID]*clusterMeta
}

type clusterMeta struct {
	mode     string
	addrs    []string
	password string
}

func NewManager() *Manager {
	return &Manager{
		clients: make(map[uuid.UUID]UniversalClient),
		meta:    make(map[uuid.UUID]*clusterMeta),
	}
}

func IsClusterDownErr(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "CLUSTERDOWN") ||
		strings.Contains(errStr, "MOVED") ||
		strings.Contains(errStr, "CLUSTER")
}

func (m *Manager) AddCluster(id uuid.UUID, mode string, addrs []string, password string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.clients[id]; exists {
		return fmt.Errorf("cluster %s already exists", id)
	}

	var client UniversalClient

	if mode == "cluster" {
		client = redis.NewClusterClient(&redis.ClusterOptions{
			Addrs:               addrs,
			Password:            password,
			MaxRedirects:        8,
			RouteByLatency:      true,
			RouteRandomly:       true,
			RefreshTableInterval: 15 * time.Second,
			DialTimeout:         3 * time.Second,
			ReadTimeout:         2 * time.Second,
			WriteTimeout:        2 * time.Second,
			PoolSize:            10,
			MinIdleConns:        3,
			PoolTimeout:         4 * time.Second,
			OnNewNode: func(client *redis.Client) {
				client.ConfigSet(context.Background(), "timeout", "0")
			},
		})
	} else {
		client = redis.NewClient(&redis.Options{
			Addr:         addrs[0],
			Password:     password,
			DialTimeout:  3 * time.Second,
			ReadTimeout:  2 * time.Second,
			WriteTimeout: 2 * time.Second,
			PoolSize:     10,
			MinIdleConns: 3,
			PoolTimeout:  4 * time.Second,
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return fmt.Errorf("failed to connect to redis: %w", err)
	}

	m.clients[id] = client
	m.meta[id] = &clusterMeta{
		mode:     mode,
		addrs:    addrs,
		password: password,
	}
	return nil
}

func (m *Manager) RemoveCluster(id uuid.UUID) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if client, exists := m.clients[id]; exists {
		client.Close()
		delete(m.clients, id)
		delete(m.meta, id)
	}
}

func (m *Manager) GetClient(id uuid.UUID) (UniversalClient, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	client, exists := m.clients[id]
	if !exists {
		return nil, fmt.Errorf("cluster %s not found", id)
	}
	return client, nil
}

func (m *Manager) GetClientWithRefresh(id uuid.UUID, ctx context.Context) (UniversalClient, error) {
	client, err := m.GetClient(id)
	if err != nil {
		return nil, err
	}

	if err := client.Ping(ctx).Err(); err != nil {
		if IsClusterDownErr(err) {
			if err := m.RefreshCluster(id); err == nil {
				return m.GetClient(id)
			}
		}
	}
	return client, nil
}

func (m *Manager) RefreshCluster(id uuid.UUID) error {
	m.mu.RLock()
	meta, exists := m.meta[id]
	m.mu.RUnlock()

	if !exists {
		return fmt.Errorf("cluster %s not found", id)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if oldClient, exists := m.clients[id]; exists {
		oldClient.Close()
		delete(m.clients, id)
	}

	var client UniversalClient
	if meta.mode == "cluster" {
		client = redis.NewClusterClient(&redis.ClusterOptions{
			Addrs:               meta.addrs,
			Password:            meta.password,
			MaxRedirects:        8,
			RouteByLatency:      true,
			RouteRandomly:       true,
			RefreshTableInterval: 15 * time.Second,
			DialTimeout:         3 * time.Second,
			ReadTimeout:         2 * time.Second,
			WriteTimeout:        2 * time.Second,
			PoolSize:            10,
			MinIdleConns:        3,
			PoolTimeout:         4 * time.Second,
		})
	} else {
		client = redis.NewClient(&redis.Options{
			Addr:         meta.addrs[0],
			Password:     meta.password,
			DialTimeout:  3 * time.Second,
			ReadTimeout:  2 * time.Second,
			WriteTimeout: 2 * time.Second,
			PoolSize:     10,
			MinIdleConns: 3,
			PoolTimeout:  4 * time.Second,
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return fmt.Errorf("failed to reconnect to redis: %w", err)
	}

	m.clients[id] = client
	return nil
}

func (m *Manager) ReloadClusterState(ctx context.Context, id uuid.UUID) error {
	m.mu.RLock()
	client, exists := m.clients[id]
	meta, hasMeta := m.meta[id]
	m.mu.RUnlock()

	if !exists || !hasMeta {
		return fmt.Errorf("cluster %s not found", id)
	}

	if meta.mode != "cluster" {
		return nil
	}

	if cc, ok := client.(*redis.ClusterClient); ok {
		if err := cc.ForEachMaster(ctx, func(ctx context.Context, c *redis.Client) error {
			return c.Ping(ctx).Err()
		}); err != nil {
			if IsClusterDownErr(err) {
				return m.RefreshCluster(id)
			}
			return err
		}
	}

	return nil
}

func (m *Manager) ListClusters() map[uuid.UUID]UniversalClient {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[uuid.UUID]UniversalClient, len(m.clients))
	for k, v := range m.clients {
		result[k] = v
	}
	return result
}

func (m *Manager) ForEachMaster(ctx context.Context, id uuid.UUID, fn func(ctx context.Context, addr string, client *redis.Client) error) error {
	m.mu.RLock()
	client, exists := m.clients[id]
	meta, hasMeta := m.meta[id]
	m.mu.RUnlock()

	if !exists || !hasMeta {
		return errors.New("cluster not found")
	}

	if meta.mode == "cluster" {
		if cc, ok := client.(*redis.ClusterClient); ok {
			return cc.ForEachMaster(ctx, func(ctx context.Context, c *redis.Client) error {
				return fn(ctx, c.Options().Addr, c)
			})
		}
	}

	if rc, ok := client.(*redis.Client); ok {
		return fn(ctx, rc.Options().Addr, rc)
	}

	return errors.New("unsupported client type")
}

func (m *Manager) GetMeta(id uuid.UUID) (mode string, addrs []string, exists bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if meta, ok := m.meta[id]; ok {
		return meta.mode, meta.addrs, true
	}
	return "", nil, false
}
