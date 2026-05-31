package agent

import (
	"encoding/binary"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/perf"
	"github.com/latency-tracer/bpf"
	"github.com/latency-tracer/pkg/flamegraph"
	"github.com/latency-tracer/pkg/metrics"
	"github.com/latency-tracer/pkg/namespace"
)

type Agent struct {
	collection   *ebpf.Collection
	links        []link.Link
	reader       *perf.Reader
	stackReader  *perf.Reader
	aggregator   *metrics.LatencyAggregator
	nsCache      *namespace.PidNamespaceCache
	stackStore   *flamegraph.StackStore
	done         chan struct{}
	bpfObjPath   string
	cfg          Config
	retransmitCount uint64
	highLatencyCount uint64
}

type Config struct {
	MetricsWindowSeconds    int
	BPFObjectPath           string
	MaxLatencyNs            uint64
	CleanupIntervalSeconds  int
	EntryTTLSeconds         int
	HighLatencyThresholdNs  uint64
	FlameGraphWindowSeconds int
	MaxStackEvents          int
	EnableRetransmit        bool
	EnableStackTraces       bool
}

func DefaultConfig() Config {
	return Config{
		MetricsWindowSeconds:    60,
		BPFObjectPath:           "bpf/latency_kern.o",
		MaxLatencyNs:            5_000_000_000,
		CleanupIntervalSeconds:  30,
		EntryTTLSeconds:         10,
		HighLatencyThresholdNs:  100_000_000,
		FlameGraphWindowSeconds: 300,
		MaxStackEvents:          10000,
		EnableRetransmit:        true,
		EnableStackTraces:       true,
	}
}

func NewAgent(cfg Config) (*Agent, error) {
	aggregator := metrics.NewLatencyAggregator(
		time.Duration(cfg.MetricsWindowSeconds) * time.Second,
	)

	stackStore := flamegraph.NewStackStore(
		cfg.MaxStackEvents,
		time.Duration(cfg.FlameGraphWindowSeconds)*time.Second,
	)

	return &Agent{
		aggregator: aggregator,
		nsCache:    namespace.NewPidNamespaceCache(),
		stackStore: stackStore,
		done:       make(chan struct{}),
		bpfObjPath: cfg.BPFObjectPath,
		cfg:        cfg,
	}, nil
}

func NewAgentWithAggregator(aggr *metrics.LatencyAggregator) *Agent {
	cfg := DefaultConfig()
	return &Agent{
		aggregator: aggr,
		nsCache:    namespace.NewPidNamespaceCache(),
		stackStore: flamegraph.NewStackStore(
			cfg.MaxStackEvents,
			time.Duration(cfg.FlameGraphWindowSeconds)*time.Second,
		),
		done: make(chan struct{}),
		cfg:  cfg,
	}
}

func (a *Agent) Start() error {
	if err := a.loadEBPF(); err != nil {
		return fmt.Errorf("load eBPF programs: %w", err)
	}

	if err := a.attachProbes(); err != nil {
		return fmt.Errorf("attach probes: %w", err)
	}

	if err := a.initPerfReader(); err != nil {
		return fmt.Errorf("init perf reader: %w", err)
	}

	go a.readEvents()
	if a.cfg.EnableStackTraces {
		go a.readStackEvents()
	}
	go a.cleanupLoop()

	log.Printf("Agent started. max_latency=%dns cleanup=%ds high_latency_threshold=%dns retransmit=%v stacks=%v",
		a.cfg.MaxLatencyNs, a.cfg.CleanupIntervalSeconds, a.cfg.HighLatencyThresholdNs,
		a.cfg.EnableRetransmit, a.cfg.EnableStackTraces)
	return nil
}

func (a *Agent) Stop() {
	close(a.done)

	if a.reader != nil {
		a.reader.Close()
	}
	if a.stackReader != nil {
		a.stackReader.Close()
	}

	for _, l := range a.links {
		l.Close()
	}

	if a.collection != nil {
		a.collection.Close()
	}

	log.Printf("Agent stopped. retransmits=%d high_latencies=%d",
		a.retransmitCount, a.highLatencyCount)
}

func (a *Agent) Aggregator() *metrics.LatencyAggregator {
	return a.aggregator
}

func (a *Agent) StackStore() *flamegraph.StackStore {
	return a.stackStore
}

func (a *Agent) RetransmitCount() uint64 {
	return a.retransmitCount
}

func (a *Agent) HighLatencyCount() uint64 {
	return a.highLatencyCount
}

func (a *Agent) GetFlameGraph(pidFilter *uint32) *bpf.FlameGraphData {
	return a.stackStore.GenerateFlameGraph(pidFilter)
}

func (a *Agent) loadEBPF() error {
	coll, err := bpf.LoadLatencyCollectionFromFile(a.bpfObjPath)
	if err != nil {
		return fmt.Errorf("load BPF from %s: %w", a.bpfObjPath, err)
	}
	a.collection = coll
	return nil
}

func (a *Agent) attachProbes() error {
	enterProg := a.collection.Programs["trace_tcp_sendmsg_enter"]
	if enterProg == nil {
		return fmt.Errorf("program trace_tcp_sendmsg_enter not found")
	}

	kpEnter, err := link.Kprobe("tcp_sendmsg", enterProg, nil)
	if err != nil {
		return fmt.Errorf("attach kprobe/tcp_sendmsg: %w", err)
	}
	a.links = append(a.links, kpEnter)

	returnProg := a.collection.Programs["trace_tcp_sendmsg_return"]
	if returnProg == nil {
		return fmt.Errorf("program trace_tcp_sendmsg_return not found")
	}

	kpReturn, err := link.Kretprobe("tcp_sendmsg", returnProg, nil)
	if err != nil {
		return fmt.Errorf("attach kretprobe/tcp_sendmsg: %w", err)
	}
	a.links = append(a.links, kpReturn)

	if a.cfg.EnableRetransmit {
		retransProg := a.collection.Programs["tracepoint_tcp_retransmit_skb"]
		if retransProg != nil {
			tp, err := link.Tracepoint("tcp", "tcp_retransmit_skb", retransProg, nil)
			if err != nil {
				log.Printf("Warning: could not attach tcp_retransmit_skb tracepoint: %v", err)
			} else {
				a.links = append(a.links, tp)
				log.Println("Attached tracepoint/tcp_retransmit_skb")
			}
		}
	}

	log.Println("Attached kprobe and kretprobe to tcp_sendmsg")
	return nil
}

func (a *Agent) initPerfReader() error {
	eventsMap := a.collection.Maps["events"]
	if eventsMap == nil {
		return fmt.Errorf("BPF map 'events' not found")
	}

	rd, err := perf.NewReader(eventsMap, os.Getpagesize()*64)
	if err != nil {
		return fmt.Errorf("create perf reader: %w", err)
	}
	a.reader = rd

	if a.cfg.EnableStackTraces {
		stackEventsMap := a.collection.Maps["stack_events"]
		if stackEventsMap == nil {
			log.Printf("Warning: BPF map 'stack_events' not found")
		} else {
			sr, err := perf.NewReader(stackEventsMap, os.Getpagesize()*64)
			if err != nil {
				return fmt.Errorf("create stack perf reader: %w", err)
			}
			a.stackReader = sr
		}
	}

	return nil
}

func (a *Agent) readEvents() {
	for {
		select {
		case <-a.done:
			return
		default:
		}

		record, err := a.reader.Read()
		if err != nil {
			if IsClosed(err) {
				return
			}
			log.Printf("Error reading perf event: %v", err)
			continue
		}

		if record.LostSamples != 0 {
			log.Printf("Lost %d perf events", record.LostSamples)
			continue
		}

		event, err := parseEvent(record.RawSample)
		if err != nil {
			log.Printf("Error parsing event: %v", err)
			continue
		}

		if event.LatencyNs > a.cfg.MaxLatencyNs {
			log.Printf("Dropping outlier latency: pid=%d comm=%s latency=%dns (max=%dns)",
				event.Pid, event.Comm, event.LatencyNs, a.cfg.MaxLatencyNs)
			continue
		}

		if event.ReturnTs <= event.EnterTs {
			log.Printf("Dropping invalid timestamp: pid=%d enter=%d return=%d",
				event.Pid, event.EnterTs, event.ReturnTs)
			continue
		}

		if !namespace.IsPidAlive(event.Pid) {
			continue
		}

		nsInfo := a.nsCache.Get(event.Pid)
		nsLabel := nsInfo.NetNamespace
		if nsLabel == "" {
			nsLabel = nsInfo.CgroupID
		}
		if nsLabel == "" {
			nsLabel = "host"
		}

		key := metrics.MetricsKey{
			PID:       event.Pid,
			Namespace: nsLabel,
		}
		a.aggregator.Record(key, event.LatencyNs)
	}
}

func (a *Agent) readStackEvents() {
	if a.stackReader == nil {
		return
	}

	stackTracesMap := a.collection.Maps["stack_traces"]
	if stackTracesMap == nil {
		log.Printf("Warning: BPF map 'stack_traces' not found")
		return
	}

	for {
		select {
		case <-a.done:
			return
		default:
		}

		record, err := a.stackReader.Read()
		if err != nil {
			if IsClosed(err) {
				return
			}
			log.Printf("Error reading stack event: %v", err)
			continue
		}

		if record.LostSamples != 0 {
			log.Printf("Lost %d stack events", record.LostSamples)
			continue
		}

		a.processStackEvent(record.RawSample, stackTracesMap)
	}
}

func (a *Agent) processStackEvent(raw []byte, stackTracesMap *ebpf.Map) {
	if len(raw) < bpf.EventHeaderSize {
		return
	}

	le := binary.LittleEndian
	eventType := le.Uint32(raw[0:4])

	switch eventType {
	case bpf.EventTypeHighLatencyStack:
		ev, err := bpf.ParseLatencyWithStackEvent(raw)
		if err != nil {
			log.Printf("Error parsing latency stack event: %v", err)
			return
		}

		a.highLatencyCount++

		stackIPs := a.lookupStack(stackTracesMap, ev.StackID)
		symbols := a.stackStore.ResolveStack(ev.StackID, stackIPs)

		stackEv := &flamegraph.StackEvent{
			Event:     ev,
			StackID:   ev.StackID,
			StackIPs:  stackIPs,
			Symbols:   symbols,
			PID:       ev.Hdr.Pid,
			Comm:      bpf.CommToString(ev.Hdr.Comm),
			Timestamp: ev.Hdr.Timestamp,
			LatencyNs: ev.LatencyNs,
			EventType: eventType,
		}
		a.stackStore.Add(stackEv)

		if a.highLatencyCount%100 == 0 {
			log.Printf("High latency events: %d, last: pid=%d latency=%dns",
				a.highLatencyCount, ev.Hdr.Pid, ev.LatencyNs)
		}

	case bpf.EventTypeRetransmit:
		ev, err := bpf.ParseRetransmitEvent(raw)
		if err != nil {
			log.Printf("Error parsing retransmit event: %v", err)
			return
		}

		a.retransmitCount++

		stackIPs := a.lookupStack(stackTracesMap, ev.StackID)
		symbols := a.stackStore.ResolveStack(ev.StackID, stackIPs)

		stackEv := &flamegraph.StackEvent{
			Event:     ev,
			StackID:   ev.StackID,
			StackIPs:  stackIPs,
			Symbols:   symbols,
			PID:       ev.Hdr.Pid,
			Comm:      bpf.CommToString(ev.Hdr.Comm),
			Timestamp: ev.Hdr.Timestamp,
			LatencyNs: 1000000,
			EventType: eventType,
		}
		a.stackStore.Add(stackEv)

		if a.retransmitCount%100 == 0 {
			log.Printf("Retransmit events: %d, last: pid=%d src=%s:%d dst=%s:%d state=%s",
				a.retransmitCount, ev.Hdr.Pid, ev.SrcIP(), ev.Sport, ev.DstIP(), ev.Dport,
				bpf.TCPStateToString(ev.State))
		}
	}
}

func (a *Agent) lookupStack(stackTracesMap *ebpf.Map, stackID uint32) []uint64 {
	const maxDepth = 127
	ips := make([]uint64, maxDepth)

	err := stackTracesMap.Lookup(&stackID, ips)
	if err != nil {
		return nil
	}

	result := make([]uint64, 0, maxDepth)
	for _, ip := range ips {
		if ip == 0 {
			break
		}
		result = append(result, ip)
	}
	return result
}

func (a *Agent) cleanupLoop() {
	ticker := time.NewTicker(time.Duration(a.cfg.CleanupIntervalSeconds) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.done:
			return
		case <-ticker.C:
			a.performCleanup()
		}
	}
}

func (a *Agent) performCleanup() {
	startMap := a.collection.Maps["start_map"]
	if startMap == nil {
		return
	}

	now := time.Now().UnixNano()
	ttlNs := int64(a.cfg.EntryTTLSeconds) * int64(time.Second)

	var keysToDelete []uint64
	var key uint64
	var value struct {
		Ts uint64
	}

	iter := startMap.Iterate()
	for iter.Next(&key, &value) {
		age := now - int64(value.Ts)
		if age > ttlNs {
			keysToDelete = append(keysToDelete, key)
		}
	}

	if err := iter.Err(); err != nil {
		log.Printf("Error iterating start_map: %v", err)
	}

	for _, k := range keysToDelete {
		if err := startMap.Delete(&k); err != nil {
			log.Printf("Error deleting stale entry from start_map: key=%d err=%v", k, err)
		}
	}

	if len(keysToDelete) > 0 {
		log.Printf("Cleaned %d stale entries from start_map", len(keysToDelete))
	}

	a.nsCache.PruneDeadPIDs()
	a.aggregator.PruneDeadPIDs()
}

type LatencyEvent struct {
	Pid       uint32
	Tid       uint32
	LatencyNs uint64
	EnterTs   uint64
	ReturnTs  uint64
	Comm      string
}

func parseEvent(raw []byte) (*LatencyEvent, error) {
	if len(raw) < 48 {
		return nil, fmt.Errorf("event too short: %d bytes", len(raw))
	}

	le := binary.LittleEndian
	event := &LatencyEvent{
		Pid:       le.Uint32(raw[0:4]),
		Tid:       le.Uint32(raw[4:8]),
		LatencyNs: le.Uint64(raw[8:16]),
		EnterTs:   le.Uint64(raw[16:24]),
		ReturnTs:  le.Uint64(raw[24:32]),
	}

	commRaw := raw[32:48]
	end := 0
	for i, b := range commRaw {
		if b == 0 {
			end = i
			break
		}
	}
	if end == 0 {
		end = len(commRaw)
	}
	event.Comm = string(commRaw[:end])

	return event, nil
}

func IsClosed(err error) bool {
	return err != nil && (err.Error() == "reader closed" || err.Error() == "perf event reader closed")
}

func RunUntilSignal() {
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
}
