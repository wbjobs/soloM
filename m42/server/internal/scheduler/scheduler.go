package scheduler

import (
	"context"
	"log"
	"time"

	"github.com/robfig/cron/v3"
	"redis-monitor/internal/service"
)

type Scheduler struct {
	cron            *cron.Cron
	clusterService  *service.ClusterService
	slowlogService  *service.SlowlogService
	slowlogInterval string
}

func NewScheduler(clusterService *service.ClusterService, slowlogService *service.SlowlogService, slowlogInterval string) *Scheduler {
	if slowlogInterval == "" {
		slowlogInterval = "@every 30s"
	}
	return &Scheduler{
		cron:            cron.New(cron.WithSeconds()),
		clusterService:  clusterService,
		slowlogService:  slowlogService,
		slowlogInterval: slowlogInterval,
	}
}

func (s *Scheduler) Start() {
	ctx := context.Background()

	s.cron.AddFunc(s.slowlogInterval, func() {
		runCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
		defer cancel()

		if err := s.slowlogService.CollectSlowlogs(runCtx); err != nil {
			log.Printf("[scheduler] slowlog collection error: %v", err)
		}
	})

	s.cron.AddFunc("@every 60s", func() {
		runCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()

		clusters, err := s.clusterService.ListClusters(runCtx)
		if err != nil {
			log.Printf("[scheduler] list clusters error: %v", err)
			return
		}

		for _, cluster := range clusters {
			if cluster.Status == "online" {
				continue
			}
			if _, err := s.clusterService.GetClusterTopology(runCtx, cluster.ID); err != nil {
				log.Printf("[scheduler] refresh topology for %s failed: %v", cluster.ID, err)
			}
		}
	})

	s.cron.AddFunc("@every 120s", func() {
		runCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()
		s.clusterService.CheckAndRecoverClusters(runCtx)
	})

	s.cron.Start()
	log.Println("[scheduler] started")
}

func (s *Scheduler) Stop() {
	s.cron.Stop()
	log.Println("[scheduler] stopped")
}
