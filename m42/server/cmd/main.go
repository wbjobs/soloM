package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"redis-monitor/internal/config"
	"redis-monitor/internal/controller"
	"redis-monitor/internal/model"
	rmanager "redis-monitor/internal/redis"
	"redis-monitor/internal/repository"
	"redis-monitor/internal/scheduler"
	"redis-monitor/internal/service"
)

func main() {
	cfg := config.Load()

	db, err := gorm.Open(postgres.Open(cfg.DSN), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	if err := db.AutoMigrate(&model.Cluster{}, &model.ClusterNode{}, &model.SlowlogEntry{}); err != nil {
		log.Fatalf("failed to auto migrate: %v", err)
	}

	manager := rmanager.NewManager()
	repo := repository.NewRepository(db)

	clusterService := service.NewClusterService(repo, manager)
	slowlogService := service.NewSlowlogService(repo, manager)

	clusterController := controller.NewClusterController(clusterService)
	slowlogController := controller.NewSlowlogController(repo)
	dashboardController := controller.NewDashboardController(repo)

	sched := scheduler.NewScheduler(clusterService, slowlogService)
	if err := sched.Start(); err != nil {
		log.Fatalf("failed to start scheduler: %v", err)
	}
	defer sched.Stop()

	r := gin.Default()

	api := r.Group("/api")
	{
		clusters := api.Group("/clusters")
		{
			clusters.POST("", clusterController.CreateCluster)
			clusters.GET("", clusterController.ListClusters)
			clusters.GET("/:id", clusterController.GetCluster)
			clusters.DELETE("/:id", clusterController.DeleteCluster)
			clusters.GET("/:id/nodes", clusterController.GetClusterNodes)
			clusters.GET("/:id/health", clusterController.GetClusterHealth)
		}

		slowlogs := api.Group("/slowlogs")
		{
			slowlogs.GET("", slowlogController.ListSlowlogs)
			slowlogs.GET("/stats", slowlogController.GetSlowlogStats)
			slowlogs.GET("/trend", slowlogController.GetSlowlogTrend)
			slowlogs.GET("/distribution", slowlogController.GetSlowlogDistribution)
			slowlogs.GET("/commands", slowlogController.GetSlowlogCommands)
			slowlogs.GET("/fingerprints", slowlogController.GetSlowlogFingerprints)
		}

		dashboard := api.Group("/dashboard")
		{
			dashboard.GET("/overview", dashboardController.GetOverview)
			dashboard.GET("/recent", dashboardController.GetRecentSlowlogs)
		}
	}

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
