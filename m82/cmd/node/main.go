package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"raft-kv-gateway/storage"
)

func main() {
	nodeID := flag.String("id", "node1", "node ID")
	httpAddr := flag.String("http", ":8001", "HTTP address")
	raftAddr := flag.String("raft", ":9001", "Raft address")
	dataDir := flag.String("data", "./data/node1", "data directory")
	bootstrap := flag.Bool("bootstrap", false, "bootstrap cluster")
	flag.Parse()

	store, err := storage.NewKVStore(*dataDir, *dataDir)
	if err != nil {
		log.Fatalf("Failed to create store: %v", err)
	}
	defer store.Close()

	node, err := storage.NewRaftNode(*nodeID, *dataDir, *raftAddr, *httpAddr, store, *bootstrap)
	if err != nil {
		log.Fatalf("Failed to create raft node: %v", err)
	}
	defer node.Close()

	node.WatchLeaderChanges()

	httpServer := storage.NewHttpServer(node, *httpAddr)
	go func() {
		log.Printf("Starting HTTP server on %s (Raft: %s)", *httpAddr, *raftAddr)
		if err := httpServer.Start(); err != nil {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("Shutting down...")
}
