package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/latency-tracer/pkg/agent"
	"github.com/latency-tracer/pkg/server"
)

func main() {
	listenAddr := flag.String("listen", ":9090", "Address to listen on for metrics endpoint")
	windowSeconds := flag.Int("window", 60, "Time window in seconds for latency aggregation")
	bpfObjPath := flag.String("bpf-obj", "bpf/latency_kern.o", "Path to compiled eBPF object file")
	maxLatencyNs := flag.Uint64("max-latency", 5_000_000_000, "Maximum allowed latency in nanoseconds (outliers will be dropped)")
	cleanupInterval := flag.Int("cleanup-interval", 30, "Cleanup interval in seconds for stale entries")
	entryTTL := flag.Int("entry-ttl", 10, "TTL in seconds for start_map entries")
	highLatencyThreshold := flag.Uint64("high-latency-threshold", 100_000_000, "High latency threshold in nanoseconds - triggers stack trace collection")
	flameGraphWindow := flag.Int("flamegraph-window", 300, "Time window in seconds for flame graph data retention")
	maxStackEvents := flag.Int("max-stack-events", 10000, "Maximum number of stack events to retain")
	enableRetransmit := flag.Bool("enable-retransmit", true, "Enable TCP retransmit event tracing")
	enableStacks := flag.Bool("enable-stacks", true, "Enable kernel stack trace collection")
	flag.Parse()

	log.SetOutput(os.Stdout)
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	cfg := agent.Config{
		MetricsWindowSeconds:    *windowSeconds,
		BPFObjectPath:           *bpfObjPath,
		MaxLatencyNs:            *maxLatencyNs,
		CleanupIntervalSeconds:  *cleanupInterval,
		EntryTTLSeconds:         *entryTTL,
		HighLatencyThresholdNs:  *highLatencyThreshold,
		FlameGraphWindowSeconds: *flameGraphWindow,
		MaxStackEvents:          *maxStackEvents,
		EnableRetransmit:        *enableRetransmit,
		EnableStackTraces:       *enableStacks,
	}

	a, err := agent.NewAgent(cfg)
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	if err := a.Start(); err != nil {
		log.Fatalf("Failed to start agent: %v", err)
	}
	defer a.Stop()

	metricsServer := server.NewMetricsServer(*listenAddr, a.Aggregator(), a)

	go func() {
		if err := metricsServer.Start(); err != nil {
			log.Fatalf("Metrics server error: %v", err)
		}
	}()

	log.Println("Latency tracer is running. Press Ctrl+C to stop.")
	log.Printf("Available endpoints:")
	log.Printf("  GET /metrics                  - Prometheus metrics")
	log.Printf("  GET /health                   - Health check")
	log.Printf("  GET /api/status               - Agent status")
	log.Printf("  GET /api/flamegraph           - Flame graph JSON (?pid=1234 filter)")
	log.Printf("  GET /api/flamegraph/folded    - Flame graph folded format")
	log.Printf("  GET /api/events/retransmits   - TCP retransmit events")
	log.Printf("  GET /api/events/high-latencies - High latency events")

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")
}
