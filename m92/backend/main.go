package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"ebpf-syscall-monitor/server"
)

func main() {
	useMock := flag.Bool("mock", false, "Run in mock mode without eBPF")
	dbPath := flag.String("db", "syscall_events.db", "SQLite database path (empty to disable persistence)")
	flag.Parse()

	log.Println("=== eBPF System Call Monitor ===")
	log.Printf("Starting server (mock mode: %v, db: %s)", *useMock, *dbPath)

	srv, err := server.NewMonitorServer(*useMock, *dbPath)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	errChan := make(chan error, 1)
	go func() {
		errChan <- srv.Start()
	}()

	select {
	case err := <-errChan:
		if err != nil {
			log.Fatalf("Server error: %v", err)
		}
	case sig := <-sigChan:
		log.Printf("Received signal: %v, shutting down...", sig)
	}

	log.Println("Server stopped")
}
