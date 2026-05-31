package ebpf

import (
	"bytes"
	_ "embed"
	"encoding/binary"
	"fmt"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/perf"
	"github.com/cloudmon/netwatch/internal/model"
)

type latencyEventC struct {
	SrcIP     uint32
	DstIP     uint32
	SrcPort   uint16
	DstPort   uint16
	PID       uint32
	Comm      [16]byte
	ConnectNS uint64
	LatencyUS uint64
}

//go:embed tcp_latency.o
var latencyObj []byte

const (
	minValidLatencyUS = uint64(1)
	maxValidLatencyUS = uint64(30_000_000)
)

type LatencyLoader struct {
	collection *ebpf.Collection
	link       link.Link
	reader     *perf.Reader
	Events     chan model.TCPLatencyEvent
	done       chan struct{}
}

func NewLatencyLoader() (*LatencyLoader, error) {
	spec, err := ebpf.LoadCollectionSpecFromReader(bytes.NewReader(latencyObj))
	if err != nil {
		return nil, fmt.Errorf("loading latency spec: %w", err)
	}

	coll, err := ebpf.NewCollection(spec)
	if err != nil {
		return nil, fmt.Errorf("creating latency collection: %w", err)
	}

	lnk, err := link.Tracepoint("sock", "inet_sock_set_state", coll.Programs["trace_inet_sock_set_state"])
	if err != nil {
		coll.Close()
		return nil, fmt.Errorf("attaching latency tracepoint: %w", err)
	}

	rd, err := perf.NewReader(coll.Maps["latency_events"], 4096)
	if err != nil {
		lnk.Close()
		coll.Close()
		return nil, fmt.Errorf("creating perf reader: %w", err)
	}

	return &LatencyLoader{
		collection: coll,
		link:       lnk,
		reader:     rd,
		Events:     make(chan model.TCPLatencyEvent, 1024),
		done:       make(chan struct{}),
	}, nil
}

func (l *LatencyLoader) Start() {
	go l.read()
}

func (l *LatencyLoader) Stop() {
	close(l.done)
	if l.reader != nil {
		l.reader.Close()
	}
	if l.link != nil {
		l.link.Close()
	}
	if l.collection != nil {
		l.collection.Close()
	}
}

func (l *LatencyLoader) read() {
	for {
		select {
		case <-l.done:
			return
		default:
		}

		record, err := l.reader.Read()
		if err != nil {
			if perf.IsClosed(err) {
				return
			}
			continue
		}

		if record.LostSamples != 0 {
			continue
		}

		var event latencyEventC
		if err := binary.Read(bytes.NewReader(record.RawSample), binary.LittleEndian, &event); err != nil {
			continue
		}

		if event.LatencyUS < minValidLatencyUS || event.LatencyUS > maxValidLatencyUS {
			continue
		}

		if event.SrcIP == 0 && event.DstIP == 0 {
			continue
		}

		comm := trimNull(event.Comm[:])

		l.Events <- model.TCPLatencyEvent{
			SrcIP:     ipUint32ToString(event.SrcIP),
			DstIP:     ipUint32ToString(event.DstIP),
			SrcPort:   event.SrcPort,
			DstPort:   event.DstPort,
			PID:       event.PID,
			Comm:      comm,
			ConnectNS: event.ConnectNS,
			LatencyUS: event.LatencyUS,
		}
	}
}
