package game

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type GoRedisClient struct {
	client *redis.Client
}

func NewGoRedisClient(addr string) (*GoRedisClient, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: "",
		DB:       0,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return &GoRedisClient{client: client}, nil
}

func (g *GoRedisClient) RPush(ctx context.Context, key string, values ...interface{}) error {
	return g.client.RPush(ctx, key, values...).Err()
}

func (g *GoRedisClient) LRange(ctx context.Context, key string, start, stop int64) ([]string, error) {
	return g.client.LRange(ctx, key, start, stop).Result()
}

func (g *GoRedisClient) Del(ctx context.Context, keys ...string) error {
	return g.client.Del(ctx, keys...).Err()
}

func (g *GoRedisClient) LTrim(ctx context.Context, key string, start, stop int64) error {
	return g.client.LTrim(ctx, key, start, stop).Err()
}

func (g *GoRedisClient) LLen(ctx context.Context, key string) (int64, error) {
	return g.client.LLen(ctx, key).Result()
}

func init() {
	log.Println("Redis client adapter initialized")
}
