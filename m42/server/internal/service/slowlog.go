package service

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"redis-monitor/internal/model"
	rmanager "redis-monitor/internal/redis"
	"redis-monitor/internal/repository"
)

var (
	numRegex    = regexp.MustCompile(`\b\d+\b`)
	uuidRegex   = regexp.MustCompile(`\b[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}\b`)
	hashRegex   = regexp.MustCompile(`\b[0-9a-fA-F]{16,64}\b`)
	keyNumRegex = regexp.MustCompile(`(:|_|-)\d+(\b|$)`)
	ipRegex     = regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)
)

func GenerateCommandFingerprint(command string, args string) string {
	full := command
	if args != "" {
		full = command + " " + args
	}

	full = uuidRegex.ReplaceAllString(full, "{uuid}")
	full = hashRegex.ReplaceAllString(full, "{hash}")
	full = ipRegex.ReplaceAllString(full, "{ip}")
	full = keyNumRegex.ReplaceAllString(full, "${1}{num}")

	parts := strings.Fields(full)
	if len(parts) == 0 {
		return command
	}

	result := []string{parts[0]}
	for i := 1; i < len(parts); i++ {
		part := parts[i]
		if numRegex.MatchString(part) && !strings.Contains(part, "{num}") {
			if len(result) <= 2 {
				result = append(result, "{num}")
			}
		} else {
			result = append(result, part)
		}
	}

	return strings.Join(result, " ")
}

type SlowlogService struct {
	repo    *repository.Repository
	manager *rmanager.Manager
}

func NewSlowlogService(repo *repository.Repository, manager *rmanager.Manager) *SlowlogService {
	return &SlowlogService{
		repo:    repo,
		manager: manager,
	}
}

func (s *SlowlogService) CollectSlowlogs(ctx context.Context) error {
	clusters, err := s.repo.ListClusters()
	if err != nil {
		return fmt.Errorf("failed to list clusters: %w", err)
	}

	for _, cluster := range clusters {
		if cluster.Status == "offline" {
			if err := s.manager.ReloadClusterState(ctx, cluster.ID); err != nil {
				log.Printf("cluster %s still offline, skipping slowlog collection", cluster.ID)
				continue
			}
		}

		if err := s.collectFromCluster(ctx, cluster.ID); err != nil {
			log.Printf("slowlog collection failed for cluster %s: %v", cluster.ID, err)
		}
	}

	return nil
}

func (s *SlowlogService) collectFromCluster(ctx context.Context, clusterID uuid.UUID) error {
	var allEntries []model.SlowlogEntry
	var mu struct{}
	_ = mu

	err := s.manager.ForEachMaster(ctx, clusterID, func(ctx context.Context, addr string, client *redis.Client) error {
		entries, err := s.collectFromNode(ctx, client, clusterID, addr)
		if err != nil {
			if rmanager.IsClusterDownErr(err) {
				if refreshErr := s.manager.RefreshCluster(clusterID); refreshErr == nil {
					return fmt.Errorf("cluster topology refreshed, will retry on next run: %w", err)
				}
			}
			return fmt.Errorf("collect from %s failed: %w", addr, err)
		}

		if len(entries) > 0 {
			allEntries = append(allEntries, entries...)
		}
		return nil
	})

	if err != nil {
		return err
	}

	if len(allEntries) > 0 {
		if err := s.repo.CreateSlowlogEntry(allEntries); err != nil {
			return fmt.Errorf("failed to save slowlog entries: %w", err)
		}
		log.Printf("collected %d slowlog entries from cluster %s", len(allEntries), clusterID)
	}

	return nil
}

func (s *SlowlogService) collectFromNode(ctx context.Context, client *redis.Client, clusterID uuid.UUID, nodeAddr string) ([]model.SlowlogEntry, error) {
	maxSeenID, err := s.repo.GetMaxSlowlogID(clusterID, nodeAddr)
	if err != nil {
		maxSeenID = 0
	}

	var result interface{}
	var opErr error

	for retry := 0; retry < 2; retry++ {
		result, opErr = client.Do(ctx, "SLOWLOG", "GET", 128).Result()
		if opErr == nil {
			break
		}

		if rmanager.IsClusterDownErr(opErr) {
			time.Sleep(time.Duration(retry+1) * 500 * time.Millisecond)
			continue
		}

		return nil, opErr
	}

	if opErr != nil {
		return nil, opErr
	}

	items, ok := result.([]interface{})
	if !ok {
		return nil, nil
	}

	var entries []model.SlowlogEntry
	for _, item := range items {
		fields, ok := item.([]interface{})
		if !ok || len(fields) < 4 {
			continue
		}

		slowlogID, err := parseInt64(fields[0])
		if err != nil {
			continue
		}

		if slowlogID <= maxSeenID {
			continue
		}

		unixTime, err := parseInt64(fields[1])
		if err != nil {
			continue
		}

		durationUs, err := parseInt64(fields[2])
		if err != nil {
			continue
		}

		args := parseArgs(fields[3])
		command := ""
		if len(args) > 0 {
			command = args[0]
		}

		var argsStr string
		if len(args) > 1 {
			argsStr = strings.Join(args[1:], " ")
		}

		fingerprint := GenerateCommandFingerprint(command, argsStr)

		entries = append(entries, model.SlowlogEntry{
			ClusterID:          clusterID,
			NodeAddr:           nodeAddr,
			SlowlogID:          slowlogID,
			Command:            command,
			CommandFingerprint: fingerprint,
			DurationUs:         durationUs,
			OccurredAt:         time.Unix(unixTime, 0),
			Args:               argsStr,
			CreatedAt:          time.Now(),
		})
	}

	return entries, nil
}

func parseInt64(v interface{}) (int64, error) {
	switch val := v.(type) {
	case int64:
		return val, nil
	case int:
		return int64(val), nil
	case string:
		return strconv.ParseInt(val, 10, 64)
	case float64:
		return int64(val), nil
	default:
		return 0, fmt.Errorf("cannot parse %T as int64", v)
	}
}

func parseArgs(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}
	var result []string
	for _, item := range arr {
		switch val := item.(type) {
		case string:
			result = append(result, val)
		case []byte:
			result = append(result, string(val))
		default:
			result = append(result, fmt.Sprintf("%v", val))
		}
	}
	return result
}
