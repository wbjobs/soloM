package server

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/latency-tracer/bpf"
	"github.com/latency-tracer/pkg/agent"
	"github.com/latency-tracer/pkg/flamegraph"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type MetricsServer struct {
	addr     string
	registry *prometheus.Registry
	handler  http.Handler
	agent    *agent.Agent
}

type StatusResponse struct {
	Status            string `json:"status"`
	Uptime            string `json:"uptime"`
	RetransmitCount   uint64 `json:"retransmit_count"`
	HighLatencyCount  uint64 `json:"high_latency_count"`
	StackEventsStored int    `json:"stack_events_stored"`
	GeneratedAt       string `json:"generated_at"`
}

type StackEventResponse struct {
	Timestamp string              `json:"timestamp"`
	PID       uint32              `json:"pid"`
	Comm      string              `json:"comm"`
	LatencyNs uint64              `json:"latency_ns"`
	EventType string              `json:"event_type"`
	SrcIP     string              `json:"src_ip,omitempty"`
	DstIP     string              `json:"dst_ip,omitempty"`
	Sport     uint16              `json:"sport,omitempty"`
	Dport     uint16              `json:"dport,omitempty"`
	State     string              `json:"state,omitempty"`
	Stack     []string            `json:"stack"`
}

func NewMetricsServer(addr string, aggregator prometheus.Collector, a *agent.Agent) *MetricsServer {
	registry := prometheus.NewRegistry()
	registry.MustRegister(aggregator)

	return &MetricsServer{
		addr:     addr,
		registry: registry,
		handler:  promhttp.HandlerFor(registry, promhttp.HandlerOpts{}),
		agent:    a,
	}
}

func (s *MetricsServer) Start() error {
	mux := http.NewServeMux()
	mux.Handle("/metrics", s.handler)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/flamegraph", s.handleFlameGraph)
	mux.HandleFunc("/api/flamegraph/folded", s.handleFlameGraphFolded)
	mux.HandleFunc("/api/events/retransmits", s.handleRetransmits)
	mux.HandleFunc("/api/events/high-latencies", s.handleHighLatencies)

	log.Printf("Metrics server listening on %s", s.addr)
	return http.ListenAndServe(s.addr, withCORS(mux))
}

func (s *MetricsServer) Registry() *prometheus.Registry {
	return s.registry
}

func (s *MetricsServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (s *MetricsServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var stackCount int
	if s.agent != nil && s.agent.StackStore() != nil {
		stackCount = len(s.agent.StackStore().GetAll())
	}

	status := StatusResponse{
		Status:            "running",
		Uptime:            "N/A",
		RetransmitCount:   0,
		HighLatencyCount:  0,
		StackEventsStored: stackCount,
		GeneratedAt:       time.Now().Format(time.RFC3339),
	}

	if s.agent != nil {
		status.RetransmitCount = s.agent.RetransmitCount()
		status.HighLatencyCount = s.agent.HighLatencyCount()
	}

	json.NewEncoder(w).Encode(status)
}

func (s *MetricsServer) handleFlameGraph(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if s.agent == nil {
		http.Error(w, "agent not available", http.StatusServiceUnavailable)
		return
	}

	var pidFilter *uint32
	pidStr := r.URL.Query().Get("pid")
	if pidStr != "" {
		pid, err := strconv.ParseUint(pidStr, 10, 32)
		if err == nil {
			pidU32 := uint32(pid)
			pidFilter = &pidU32
		}
	}

	data := s.agent.GetFlameGraph(pidFilter)
	json.NewEncoder(w).Encode(data)
}

func (s *MetricsServer) handleFlameGraphFolded(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")

	if s.agent == nil || s.agent.StackStore() == nil {
		http.Error(w, "agent not available", http.StatusServiceUnavailable)
		return
	}

	events := s.agent.StackStore().GetAll()
	folded := flamegraph.GenerateFoldedFormat(events)
	w.Write([]byte(folded))
}

func (s *MetricsServer) handleRetransmits(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	s.handleStackEvents(w, r, bpf.EventTypeRetransmit)
}

func (s *MetricsServer) handleHighLatencies(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	s.handleStackEvents(w, r, bpf.EventTypeHighLatencyStack)
}

func (s *MetricsServer) handleStackEvents(w http.ResponseWriter, r *http.Request, eventTypeFilter uint32) {
	if s.agent == nil || s.agent.StackStore() == nil {
		http.Error(w, "agent not available", http.StatusServiceUnavailable)
		return
	}

	limit := 100
	limitStr := r.URL.Query().Get("limit")
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 1000 {
			limit = l
		}
	}

	events := s.agent.StackStore().GetAll()
	response := make([]StackEventResponse, 0, limit)

	for i := len(events) - 1; i >= 0 && len(response) < limit; i-- {
		ev := events[i]
		if ev.EventType != eventTypeFilter {
			continue
		}

		resp := StackEventResponse{
			Timestamp: time.Unix(0, int64(ev.Timestamp)).Format(time.RFC3339Nano),
			PID:       ev.PID,
			Comm:      ev.Comm,
			LatencyNs: ev.LatencyNs,
			EventType: eventTypeToString(ev.EventType),
		}

		switch e := ev.Event.(type) {
		case *bpf.RetransmitEvent:
			resp.SrcIP = e.SrcIP()
			resp.DstIP = e.DstIP()
			resp.Sport = e.Sport
			resp.Dport = e.Dport
			resp.State = bpf.TCPStateToString(e.State)
		case *bpf.LatencyWithStackEvent:
			resp.DstIP = e.DstIP()
			resp.Dport = e.Dport
		}

		stack := make([]string, 0, len(ev.Symbols))
		for j := len(ev.Symbols) - 1; j >= 0; j-- {
			stack = append(stack, ev.Symbols[j].Name)
		}
		resp.Stack = stack

		response = append(response, resp)
	}

	json.NewEncoder(w).Encode(response)
}

func eventTypeToString(et uint32) string {
	switch et {
	case bpf.EventTypeLatency:
		return "latency"
	case bpf.EventTypeRetransmit:
		return "retransmit"
	case bpf.EventTypeHighLatencyStack:
		return "high_latency"
	default:
		return "unknown"
	}
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		h.ServeHTTP(w, r)
	})
}
