package bpf

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net"
	"time"

	"github.com/cilium/ebpf"
)

type LatencyEvent struct {
	Pid       uint32
	Tid       uint32
	LatencyNs uint64
	EnterTs   uint64
	ReturnTs  uint64
	Comm      [16]byte
}

const LatencyEventSize = 48

const (
	EventTypeLatency        = 1
	EventTypeRetransmit     = 2
	EventTypeHighLatencyStack = 3
)

type EventHeader struct {
	EventType uint32
	Pid       uint32
	Tid       uint32
	Timestamp uint64
	Comm      [16]byte
}

const EventHeaderSize = 32

type LatencyWithStackEvent struct {
	Hdr       EventHeader
	LatencyNs uint64
	StackID   uint32
	Daddr     uint32
	Dport     uint16
	Pad       uint16
}

const LatencyWithStackEventSize = 56

type RetransmitEvent struct {
	Hdr     EventHeader
	StackID uint32
	Saddr   uint32
	Daddr   uint32
	Sport   uint16
	Dport   uint16
	Seq     uint32
	State   uint32
}

const RetransmitEventSize = 56

type StackFrame struct {
	IP       uint64
	Symbol   string
	Location string
}

type StackTrace struct {
	StackID uint32
	Frames  []StackFrame
}

type FlameGraphNode struct {
	Name      string           `json:"name"`
	Value     int64            `json:"value"`
	Children  []*FlameGraphNode `json:"children,omitempty"`
	LatencyNs int64            `json:"latency_ns,omitempty"`
	Count     int64            `json:"count,omitempty"`
}

type FlameGraphData struct {
	Nodes       []*FlameGraphNode `json:"nodes"`
	GeneratedAt time.Time         `json:"generated_at"`
	WindowSec   int               `json:"window_sec"`
	TotalEvents int64             `json:"total_events"`
	MaxLatencyNs int64            `json:"max_latency_ns"`
}

func ParseLatencyWithStackEvent(raw []byte) (*LatencyWithStackEvent, error) {
	if len(raw) < LatencyWithStackEventSize {
		return nil, fmt.Errorf("event too short: %d bytes", len(raw))
	}

	le := binary.LittleEndian
	ev := &LatencyWithStackEvent{}
	ev.Hdr.EventType = le.Uint32(raw[0:4])
	ev.Hdr.Pid = le.Uint32(raw[4:8])
	ev.Hdr.Tid = le.Uint32(raw[8:12])
	ev.Hdr.Timestamp = le.Uint64(raw[16:24])
	copy(ev.Hdr.Comm[:], raw[24:40])

	ev.LatencyNs = le.Uint64(raw[40:48])
	ev.StackID = le.Uint32(raw[48:52])
	ev.Daddr = le.Uint32(raw[52:56])
	ev.Dport = le.Uint16(raw[56:58])
	ev.Pad = le.Uint16(raw[58:60])

	return ev, nil
}

func ParseRetransmitEvent(raw []byte) (*RetransmitEvent, error) {
	if len(raw) < RetransmitEventSize {
		return nil, fmt.Errorf("event too short: %d bytes", len(raw))
	}

	le := binary.LittleEndian
	ev := &RetransmitEvent{}
	ev.Hdr.EventType = le.Uint32(raw[0:4])
	ev.Hdr.Pid = le.Uint32(raw[4:8])
	ev.Hdr.Tid = le.Uint32(raw[8:12])
	ev.Hdr.Timestamp = le.Uint64(raw[16:24])
	copy(ev.Hdr.Comm[:], raw[24:40])

	ev.StackID = le.Uint32(raw[40:44])
	ev.Saddr = le.Uint32(raw[44:48])
	ev.Daddr = le.Uint32(raw[48:52])
	ev.Sport = le.Uint16(raw[52:54])
	ev.Dport = le.Uint16(raw[54:56])
	ev.Seq = le.Uint32(raw[56:60])
	ev.State = le.Uint32(raw[60:64])

	return ev, nil
}

func (ev *RetransmitEvent) SrcIP() string {
	return intToIP(ev.Saddr).String()
}

func (ev *RetransmitEvent) DstIP() string {
	return intToIP(ev.Daddr).String()
}

func (ev *LatencyWithStackEvent) DstIP() string {
	return intToIP(ev.Daddr).String()
}

func intToIP(ip uint32) net.IP {
	return net.IPv4(
		byte(ip),
		byte(ip>>8),
		byte(ip>>16),
		byte(ip>>24),
	)
}

func CommToString(comm [16]byte) string {
	end := 0
	for i, b := range comm {
		if b == 0 {
			end = i
			break
		}
	}
	if end == 0 {
		end = len(comm)
	}
	return string(comm[:end])
}

func TCPStateToString(state uint32) string {
	states := map[uint32]string{
		1:  "ESTABLISHED",
		2:  "SYN_SENT",
		3:  "SYN_RECV",
		4:  "FIN_WAIT1",
		5:  "FIN_WAIT2",
		6:  "TIME_WAIT",
		7:  "CLOSE",
		8:  "CLOSE_WAIT",
		9:  "LAST_ACK",
		10: "LISTEN",
		11: "CLOSING",
	}
	if s, ok := states[state]; ok {
		return s
	}
	return fmt.Sprintf("UNKNOWN_%d", state)
}

func LoadLatencyCollectionFromBytes(bpfObj []byte) (*ebpf.Collection, error) {
	spec, err := LoadLatencySpecFromBytes(bpfObj)
	if err != nil {
		return nil, err
	}
	coll, err := ebpf.NewCollection(spec)
	if err != nil {
		return nil, fmt.Errorf("create BPF collection: %w", err)
	}
	return coll, nil
}

func LoadLatencySpecFromBytes(bpfObj []byte) (*ebpf.CollectionSpec, error) {
	reader := bytes.NewReader(bpfObj)
	spec, err := ebpf.LoadCollectionSpecFromReader(reader)
	if err != nil {
		return nil, fmt.Errorf("load BPF collection spec: %w", err)
	}
	return spec, nil
}

func LoadLatencyCollectionFromFile(path string) (*ebpf.Collection, error) {
	spec, err := ebpf.LoadCollectionSpec(path)
	if err != nil {
		return nil, fmt.Errorf("load BPF spec from %s: %w", path, err)
	}
	coll, err := ebpf.NewCollection(spec)
	if err != nil {
		return nil, fmt.Errorf("create BPF collection: %w", err)
	}
	return coll, nil
}

func LoadLatencySpecFromFile(path string) (*ebpf.CollectionSpec, error) {
	spec, err := ebpf.LoadCollectionSpec(path)
	if err != nil {
		return nil, fmt.Errorf("load BPF spec from %s: %w", path, err)
	}
	return spec, nil
}
