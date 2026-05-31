package model

import "time"

type TCPRetransmitEvent struct {
	SrcIP     string `json:"src_ip"`
	DstIP     string `json:"dst_ip"`
	SrcPort   uint16 `json:"src_port"`
	DstPort   uint16 `json:"dst_port"`
	PID       uint32 `json:"pid"`
	Comm      string `json:"comm"`
	Timestamp uint64 `json:"timestamp"`
	Count     uint32 `json:"count"`
}

type TCPLatencyEvent struct {
	SrcIP      string `json:"src_ip"`
	DstIP      string `json:"dst_ip"`
	SrcPort    uint16 `json:"src_port"`
	DstPort    uint16 `json:"dst_port"`
	PID        uint32 `json:"pid"`
	Comm       string `json:"comm"`
	ConnectNS  uint64 `json:"connect_ns"`
	LatencyUS  uint64 `json:"latency_us"`
}

type ServiceEndpoint struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	IP        string            `json:"ip"`
	Port      int32             `json:"port"`
	Labels    map[string]string `json:"labels"`
}

type ServiceEdge struct {
	Source          string    `json:"source"`
	Target          string    `json:"target"`
	RetransmitCount uint32    `json:"retransmit_count"`
	AvgLatencyUS    float64   `json:"avg_latency_us"`
	P50LatencyUS    float64   `json:"p50_latency_us"`
	P99LatencyUS    float64   `json:"p99_latency_us"`
	SampleCount     uint32    `json:"sample_count"`
	Timestamp       time.Time `json:"timestamp"`
}

type TopologyData struct {
	Nodes     []ServiceEndpoint `json:"nodes"`
	Edges     []ServiceEdge     `json:"edges"`
	Timestamp time.Time         `json:"timestamp"`
}

type LatencyBucket struct {
	RangeStart uint64 `json:"range_start"`
	RangeEnd   uint64 `json:"range_end"`
	Count      uint64 `json:"count"`
}

type HeatmapData struct {
	SourceService string          `json:"source_service"`
	TargetService string          `json:"target_service"`
	Latencies     []LatencyBucket `json:"latencies"`
	Timestamp     time.Time       `json:"timestamp"`
}
