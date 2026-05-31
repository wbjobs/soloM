package main

import (
	"encoding/json"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"raft-kv-gateway/gateway"
)

func main() {
	addr := flag.String("addr", ":7000", "Gateway HTTP address")
	nodesFile := flag.String("nodes", "", "Nodes configuration file (JSON)")
	flag.Parse()

	nodeAddrs := make(map[string]string)

	if *nodesFile != "" {
		data, err := os.ReadFile(*nodesFile)
		if err != nil {
			log.Fatalf("Failed to read nodes file: %v", err)
		}
		if err := json.Unmarshal(data, &nodeAddrs); err != nil {
			log.Fatalf("Failed to parse nodes file: %v", err)
		}
	}

	gw := gateway.NewGateway(nodeAddrs)
	gw.StartHealthCheck()

	httpServer := gateway.NewHttpServer(gw, *addr)
	go func() {
		log.Printf("Starting gateway on %s", *addr)
		if err := httpServer.Start(); err != nil {
			log.Fatalf("Gateway HTTP server failed: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("Shutting down gateway...")
	gw.Stop()
}
