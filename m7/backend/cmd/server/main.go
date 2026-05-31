package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/cloudmon/netwatch/internal/alert"
	"github.com/cloudmon/netwatch/internal/aggregator"
	"github.com/cloudmon/netwatch/internal/api"
	"github.com/cloudmon/netwatch/internal/ebpf"
	"github.com/cloudmon/netwatch/internal/k8s"
	"github.com/cloudmon/netwatch/internal/model"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	retransmitLoader, err := ebpf.NewRetransmitLoader()
	if err != nil {
		log.Fatalf("initializing retransmit loader: %v", err)
	}
	defer retransmitLoader.Stop()
	retransmitLoader.Start()

	latencyLoader, err := ebpf.NewLatencyLoader()
	if err != nil {
		log.Fatalf("initializing latency loader: %v", err)
	}
	defer latencyLoader.Stop()
	latencyLoader.Start()

	kubeconfig := os.Getenv("KUBECONFIG")
	discoverer, err := k8s.NewDiscoverer(kubeconfig)
	if err != nil {
		log.Fatalf("initializing k8s discoverer: %v", err)
	}
	defer discoverer.Stop()
	discoverer.Start(ctx)

	alertCh := make(chan model.ServiceEdge, 1000)

	agg := aggregator.New(discoverer, retransmitLoader.Events, latencyLoader.Events, alertCh)
	agg.Start()
	defer agg.Stop()

	anomalyURL := getEnv("ANOMALY_SERVICE_URL", "http://localhost:5000")
	anomalyClient := alert.NewAnomalyClient(anomalyURL)

	webhookConfig := alert.WebhookConfig{}
	webhookNotifier := alert.NewWebhookNotifier(webhookConfig)

	alertManager := alert.NewAlertManager(anomalyClient, webhookNotifier)
	alertManager.Start()
	defer alertManager.Stop()

	wsHub := api.NewWebSocketHub(agg)
	wsHub.Start()
	defer wsHub.Stop()

	alertManager.OnAlert = wsHub.BroadcastAlert

	go func() {
		for edge := range alertCh {
			alertManager.ProcessEdge(edge)
		}
	}()

	handler := api.NewHandler(agg, discoverer, wsHub, alertManager)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	handler.RegisterRoutes(router)

	router.GET("/ws", func(c *gin.Context) {
		wsHub.HandleWebSocket(c.Writer, c.Request)
	})

	addr := fmt.Sprintf(":%s", getEnv("PORT", "8080"))
	srv := &http.Server{
		Addr:    addr,
		Handler: router,
	}

	go func() {
		log.Printf("server listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-sigCh
	log.Println("shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("server shutdown error: %v", err)
	}

	log.Println("server stopped")
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
