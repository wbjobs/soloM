package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"redis-monitor/internal/model"
	rmanager "redis-monitor/internal/redis"
	"redis-monitor/internal/repository"
)

type ClusterService struct {
	repo    *repository.Repository
	manager *rmanager.Manager
}

func NewClusterService(repo *repository.Repository, manager *rmanager.Manager) *ClusterService {
	return &ClusterService{
		repo:    repo,
		manager: manager,
	}
}

type CreateClusterInput struct {
	Name     string   `json:"name" binding:"required"`
	Mode     string   `json:"mode" binding:"required,oneof=cluster standalone"`
	Addrs    []string `json:"addrs" binding:"required,min=1"`
	Password string   `json:"password"`
}

func (s *ClusterService) CreateCluster(ctx context.Context, input CreateClusterInput) (*model.Cluster, error) {
	cluster := &model.Cluster{
		ID:       uuid.New(),
		Name:     input.Name,
		Mode:     input.Mode,
		Addrs:    model.StringArray(input.Addrs),
		Password: input.Password,
		Status:   "offline",
	}

	if err := s.manager.AddCluster(cluster.ID, cluster.Mode, input.Addrs, cluster.Password); err != nil {
		cluster.Status = "offline"
		_ = s.repo.CreateCluster(cluster)
		return cluster, fmt.Errorf("failed to connect to redis: %w", err)
	}

	cluster.Status = "online"
	if err := s.repo.CreateCluster(cluster); err != nil {
		s.manager.RemoveCluster(cluster.ID)
		return nil, fmt.Errorf("failed to save cluster: %w", err)
	}

	return cluster, nil
}

func (s *ClusterService) DeleteCluster(ctx context.Context, id uuid.UUID) error {
	s.manager.RemoveCluster(id)
	return s.repo.DeleteCluster(id)
}

func (s *ClusterService) ListClusters(ctx context.Context) ([]model.Cluster, error) {
	return s.repo.ListClusters()
}

func (s *ClusterService) GetCluster(ctx context.Context, id uuid.UUID) (*model.Cluster, error) {
	return s.repo.GetCluster(id)
}

type ParsedNode struct {
	ID        string
	Addr      string
	Flags     string
	Role      string
	MasterID  string
	Slots     string
	Connected bool
}

func parseClusterNodes(output string) []ParsedNode {
	var nodes []ParsedNode
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 8 {
			continue
		}

		node := ParsedNode{
			ID:    fields[0],
			Addr:  fields[1],
			Flags: fields[2],
		}

		if strings.Contains(strings.ToLower(node.Flags), "master") || strings.Contains(strings.ToLower(node.Flags), "myself,master") {
			node.Role = "master"
		} else {
			node.Role = "slave"
		}

		if node.Role == "slave" && len(fields) > 3 {
			node.MasterID = fields[3]
		}

		node.Connected = fields[7] == "connected"

		if node.Role == "master" && len(fields) > 8 {
			node.Slots = strings.Join(fields[8:], " ")
		}

		nodes = append(nodes, node)
	}
	return nodes
}

func (s *ClusterService) GetClusterTopology(ctx context.Context, clusterID uuid.UUID) ([]model.ClusterNode, error) {
	cluster, err := s.repo.GetCluster(clusterID)
	if err != nil {
		return nil, err
	}

	client, err := s.manager.GetClientWithRefresh(clusterID, ctx)
	if err != nil {
		return nil, err
	}

	var nodes []model.ClusterNode

	if cluster.Mode == "cluster" {
		result, err := s.executeWithRetry(ctx, client, func() (interface{}, error) {
			return client.Do(ctx, "CLUSTER", "NODES").Result()
		}, clusterID, 2)

		if err != nil {
			s.updateClusterStatus(clusterID, "offline")
			return nil, fmt.Errorf("failed to get cluster nodes: %w", err)
		}

		output, ok := result.(string)
		if !ok {
			return nil, fmt.Errorf("unexpected cluster nodes response type")
		}

		parsed := parseClusterNodes(output)
		for _, pn := range parsed {
			status := "online"
			if !pn.Connected {
				status = "fail"
			}

			node := model.ClusterNode{
				ClusterID: clusterID,
				NodeID:    pn.ID,
				Addr:      pn.Addr,
				Role:      pn.Role,
				Slots:     pn.Slots,
				MasterID:  pn.MasterID,
				Status:    status,
				UpdatedAt: time.Now(),
			}
			nodes = append(nodes, node)
		}
	} else {
		info, err := s.executeWithRetry(ctx, client, func() (interface{}, error) {
			return client.Info(ctx, "replication").Result()
		}, clusterID, 2)

		if err != nil {
			s.updateClusterStatus(clusterID, "offline")
			return nil, fmt.Errorf("failed to get replication info: %w", err)
		}

		infoStr, _ := info.(string)
		role := "slave"
		var masterID string
		for _, line := range strings.Split(infoStr, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "role:") {
				role = strings.TrimSpace(strings.TrimPrefix(line, "role:"))
			}
			if strings.HasPrefix(line, "master_host:") {
				masterID = strings.TrimSpace(strings.TrimPrefix(line, "master_host:"))
			}
		}

		nodes = append(nodes, model.ClusterNode{
			ClusterID: clusterID,
			Addr:      cluster.Addrs[0],
			Role:      role,
			MasterID:  masterID,
			Status:    "online",
			UpdatedAt: time.Now(),
		})
	}

	if err := s.repo.UpsertNodes(nodes); err != nil {
		return nil, fmt.Errorf("failed to upsert nodes: %w", err)
	}

	s.updateClusterStatus(clusterID, "online")
	return nodes, nil
}

func (s *ClusterService) executeWithRetry(ctx context.Context, client rmanager.UniversalClient, fn func() (interface{}, error), clusterID uuid.UUID, maxRetries int) (interface{}, error) {
	var lastErr error
	for i := 0; i <= maxRetries; i++ {
		result, err := fn()
		if err == nil {
			return result, nil
		}

		lastErr = err
		if rmanager.IsClusterDownErr(err) {
			if i < maxRetries {
				if refreshErr := s.manager.RefreshCluster(clusterID); refreshErr == nil {
					continue
				}
			}
		}

		time.Sleep(time.Duration(i+1) * 500 * time.Millisecond)
	}
	return nil, lastErr
}

func (s *ClusterService) updateClusterStatus(clusterID uuid.UUID, status string) {
	cluster, err := s.repo.GetCluster(clusterID)
	if err != nil {
		return
	}
	if cluster.Status != status {
		cluster.Status = status
		s.repo.DB().Model(cluster).Update("status", status)
	}
}

func (s *ClusterService) CheckAndRecoverClusters(ctx context.Context) {
	clusters, err := s.repo.ListClusters()
	if err != nil {
		return
	}

	for _, cluster := range clusters {
		if err := s.manager.ReloadClusterState(ctx, cluster.ID); err != nil {
			s.updateClusterStatus(cluster.ID, "partial")
			continue
		}

		if _, err := s.GetClusterTopology(ctx, cluster.ID); err != nil {
			s.updateClusterStatus(cluster.ID, "offline")
		}
	}
}

type ClusterHealth struct {
	ClusterID    uuid.UUID `json:"clusterId"`
	Status       string    `json:"status"`
	TotalNodes   int       `json:"totalNodes"`
	OnlineNodes  int       `json:"onlineNodes"`
	MasterNodes  int       `json:"masterNodes"`
	SlaveNodes   int       `json:"slaveNodes"`
	FailNodes    int       `json:"failNodes"`
}

func (s *ClusterService) GetClusterHealth(ctx context.Context, clusterID uuid.UUID) (*ClusterHealth, error) {
	nodes, err := s.repo.GetNodesByCluster(clusterID)
	if err != nil {
		return nil, err
	}

	health := &ClusterHealth{
		ClusterID:  clusterID,
		TotalNodes: len(nodes),
	}

	for _, node := range nodes {
		switch node.Status {
		case "online":
			health.OnlineNodes++
		case "fail":
			health.FailNodes++
		}
		if node.Role == "master" {
			health.MasterNodes++
		} else {
			health.SlaveNodes++
		}
	}

	if health.OnlineNodes == health.TotalNodes && health.TotalNodes > 0 {
		health.Status = "online"
	} else if health.OnlineNodes > 0 {
		health.Status = "partial"
	} else {
		health.Status = "offline"
	}

	return health, nil
}
