package storage

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type UserRegistry struct {
	redis       *RedisClient
	hashKey     string
}

func NewUserRegistry(redis *RedisClient) *UserRegistry {
	return &UserRegistry{
		redis:   redis,
		hashKey: redis.UserHashKey(),
	}
}

func (r *UserRegistry) RegisterUser(userID, gatewayAddr string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := r.redis.Client().HSet(ctx, r.hashKey, userID, gatewayAddr).Err()
	if err != nil {
		zap.L().Error("Failed to register user", zap.String("user_id", userID), zap.Error(err))
		return err
	}

	zap.L().Debug("User registered", zap.String("user_id", userID), zap.String("gateway", gatewayAddr))
	return nil
}

func (r *UserRegistry) UnregisterUser(userID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := r.redis.Client().HDel(ctx, r.hashKey, userID).Err()
	if err != nil {
		zap.L().Error("Failed to unregister user", zap.String("user_id", userID), zap.Error(err))
		return err
	}

	zap.L().Debug("User unregistered", zap.String("user_id", userID))
	return nil
}

func (r *UserRegistry) GetUserGateway(userID string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	addr, err := r.redis.Client().HGet(ctx, r.hashKey, userID).Result()
	if err != nil {
		return "", err
	}

	return addr, nil
}

func (r *UserRegistry) BatchGetUserGateways(userIDs []string) (map[string]string, []string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result := make(map[string]string)
	notFound := make([]string, 0)

	if len(userIDs) == 0 {
		return result, notFound, nil
	}

	pipe := r.redis.Client().Pipeline()
	cmds := make([]*redis.StringCmd, len(userIDs))

	for i, userID := range userIDs {
		cmds[i] = pipe.HGet(ctx, r.hashKey, userID)
	}

	_, err := pipe.Exec(ctx)
	if err != nil && err != redis.Nil {
		return nil, nil, err
	}

	for i, cmd := range cmds {
		addr, err := cmd.Result()
		if err != nil {
			notFound = append(notFound, userIDs[i])
			continue
		}
		result[userIDs[i]] = addr
	}

	return result, notFound, nil
}

func (r *UserRegistry) GroupUsersByGateway(userIDs []string) (map[string][]string, []string) {
	gatewayUsers := make(map[string][]string)
	notFound := make([]string, 0)

	results, missed, _ := r.BatchGetUserGateways(userIDs)
	notFound = append(notFound, missed...)

	for userID, gateway := range results {
		gatewayUsers[gateway] = append(gatewayUsers[gateway], userID)
	}

	return gatewayUsers, notFound
}
