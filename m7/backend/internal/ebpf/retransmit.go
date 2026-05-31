package ebpf

import (
	"bytes"
	_ "embed"
	"encoding/binary"
	"fmt"
	"net"
	"time"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cloudmon/netwatch/internal/model"
)

type retransmitKey struct {
	SrcIP   uint32
	DstIP   uint32
	SrcPort uint16
	DstPort uint16
	_       [4]byte
}

type retransmitEventC struct {
	SrcIP     uint32
	DstIP     uint32
	SrcPort   uint16
	DstPort   uint16
	PID       uint32
	Comm      [16]byte
	Timestamp uint64
	Count     uint32
}

//go:embed tcp_retransmit.o
var retransmitObj []byte

const (
	maxRetransmitCount  = uint32(100000)
	maxRetransmitPerSec = uint32(50000)
)

type RetransmitLoader struct {
	collection   *ebpf.Collection
	link         link.Link
	mapObj       *ebpf.Map
	Events       chan model.TCPRetransmitEvent
	done         chan struct{}
	interval     time.Duration
	lastSnapshot map[retransmitKey]uint32
}

func ipUint32ToString(ip uint32) string {
	b := make([]byte, 4)
	binary.LittleEndian.PutUint32(b, ip)
	return net.IP(b).String()
}

func NewRetransmitLoader() (*RetransmitLoader, error) {
	spec, err := ebpf.LoadCollectionSpecFromReader(bytes.NewReader(retransmitObj))
	if err != nil {
		return nil, fmt.Errorf("loading retransmit spec: %w", err)
	}

	coll, err := ebpf.NewCollection(spec)
	if err != nil {
		return nil, fmt.Errorf("creating retransmit collection: %w", err)
	}

	lnk, err := link.Tracepoint("tcp", "tcp_retransmit_skb", coll.Programs["trace_tcp_retransmit_skb"])
	if err != nil {
		coll.Close()
		return nil, fmt.Errorf("attaching retransmit tracepoint: %w", err)
	}

	return &RetransmitLoader{
		collection:   coll,
		link:         lnk,
		mapObj:       coll.Maps["retransmit_map"],
		Events:       make(chan model.TCPRetransmitEvent, 1024),
		done:         make(chan struct{}),
		interval:     time.Second,
		lastSnapshot: make(map[retransmitKey]uint32),
	}, nil
}

func (r *RetransmitLoader) Start() {
	go r.poll()
}

func (r *RetransmitLoader) Stop() {
	close(r.done)
	if r.link != nil {
		r.link.Close()
	}
	if r.collection != nil {
		r.collection.Close()
	}
}

func (r *RetransmitLoader) poll() {
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	var key retransmitKey
	var event retransmitEventC
	var keys []retransmitKey

	for {
		select {
		case <-r.done:
			return
		case <-ticker.C:
		}

		keys = keys[:0]
		currentSnapshot := make(map[retransmitKey]uint32)
		iterator := r.mapObj.Iterate()
		for iterator.Next(&key, &event) {
			keys = append(keys, key)

			if event.SrcIP == 0 && event.DstIP == 0 {
				continue
			}
			if event.Count > maxRetransmitCount {
				continue
			}

			delta := event.Count
			if prev, ok := r.lastSnapshot[key]; ok {
				if event.Count > prev {
					delta = event.Count - prev
				} else {
					delta = event.Count
				}
			}

			if delta > maxRetransmitPerSec {
				currentSnapshot[key] = event.Count
				continue
			}

			currentSnapshot[key] = event.Count

			comm := trimNull(event.Comm[:])

			r.Events <- model.TCPRetransmitEvent{
				SrcIP:     ipUint32ToString(event.SrcIP),
				DstIP:     ipUint32ToString(event.DstIP),
				SrcPort:   event.SrcPort,
				DstPort:   event.DstPort,
				PID:       event.PID,
				Comm:      comm,
				Timestamp: event.Timestamp,
				Count:     delta,
			}
		}

		r.lastSnapshot = currentSnapshot

		for _, k := range keys {
			_ = r.mapObj.Delete(&k)
		}
	}
}

func trimNull(b []byte) string {
	s := string(b)
	for i := 0; i < len(s); i++ {
		if s[i] == 0 {
			return s[:i]
		}
	}
	return s
}
