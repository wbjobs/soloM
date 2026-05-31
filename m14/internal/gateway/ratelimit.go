package gateway

import (
	"context"
	"sync"
	"time"
)

type RateLimiter struct {
	capacity     int64
	tokens       int64
	refillRate   int64
	refillPeriod time.Duration
	mu           sync.Mutex
	lastRefill   time.Time
}

func NewRateLimiter(ratePerSecond int64, burst int64) *RateLimiter {
	return &RateLimiter{
		capacity:     burst,
		tokens:       burst,
		refillRate:   ratePerSecond,
		refillPeriod: time.Second,
		lastRefill:   time.Now(),
	}
}

func (rl *RateLimiter) refill() {
	now := time.Now()
	elapsed := now.Sub(rl.lastRefill)

	if elapsed >= rl.refillPeriod {
		periods := int64(elapsed / rl.refillPeriod)
		newTokens := periods * rl.refillRate

		if newTokens > 0 {
			rl.tokens = min(rl.capacity, rl.tokens+newTokens)
			rl.lastRefill = now
		}
	}
}

func (rl *RateLimiter) Allow() bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	rl.refill()

	if rl.tokens > 0 {
		rl.tokens--
		return true
	}
	return false
}

func (rl *RateLimiter) Wait(ctx context.Context) bool {
	for {
		if rl.Allow() {
			return true
		}

		select {
		case <-ctx.Done():
			return false
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func min(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

type ConnectionLimiter struct {
	connRateLimiter *RateLimiter
	maxPending      int
	pendingCount    int32
	pendingChan     chan struct{}
}

func NewConnectionLimiter(maxConnPerSec int64, burst int64, maxPending int) *ConnectionLimiter {
	return &ConnectionLimiter{
		connRateLimiter: NewRateLimiter(maxConnPerSec, burst),
		maxPending:      maxPending,
		pendingChan:     make(chan struct{}, maxPending),
	}
}

func (cl *ConnectionLimiter) TryAccept() bool {
	return cl.connRateLimiter.Allow()
}

func (cl *ConnectionLimiter) Accept(ctx context.Context) bool {
	select {
	case cl.pendingChan <- struct{}{}:
		defer func() { <-cl.pendingChan }()
		return cl.connRateLimiter.Wait(ctx)
	default:
		return false
	}
}

func (cl *ConnectionLimiter) PendingCount() int {
	return len(cl.pendingChan)
}
