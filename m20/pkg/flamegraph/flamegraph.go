package flamegraph

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/latency-tracer/bpf"
)

type Symbol struct {
	Name     string
	Location string
}

type SymbolCache struct {
	mu    sync.RWMutex
	cache map[uint64]Symbol
	kallsymsPath string
}

func NewSymbolCache() *SymbolCache {
	return &SymbolCache{
		cache: make(map[uint64]Symbol),
		kallsymsPath: "/proc/kallsyms",
	}
}

func (sc *SymbolCache) Lookup(ip uint64) Symbol {
	sc.mu.RLock()
	if sym, ok := sc.cache[ip]; ok {
		sc.mu.RUnlock()
		return sym
	}
	sc.mu.RUnlock()

	sym := sc.resolveSymbol(ip)
	sc.mu.Lock()
	sc.cache[ip] = sym
	sc.mu.Unlock()
	return sym
}

func (sc *SymbolCache) resolveSymbol(ip uint64) Symbol {
	f, err := os.Open(sc.kallsymsPath)
	if err != nil {
		return Symbol{
			Name:     fmt.Sprintf("0x%x", ip),
			Location: "[unknown]",
		}
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}

		addr, err := parseHex(fields[0])
		if err != nil {
			continue
		}

		if addr == ip {
			return Symbol{
				Name:     fields[2],
				Location: "[" + fields[1] + "]",
			}
		}
	}

	return Symbol{
		Name:     fmt.Sprintf("0x%x", ip),
		Location: "[unknown]",
	}
}

func parseHex(s string) (uint64, error) {
	var v uint64
	_, err := fmt.Sscanf(s, "%x", &v)
	return v, err
}

type StackEvent struct {
	Event      interface{}
	StackID    uint32
	StackIPs   []uint64
	Symbols    []Symbol
	PID        uint32
	Comm       string
	Timestamp  uint64
	LatencyNs  uint64
	EventType  uint32
}

type StackStore struct {
	mu         sync.RWMutex
	events     []*StackEvent
	symCache   *SymbolCache
	maxEvents  int
	window     time.Duration
}

func NewStackStore(maxEvents int, window time.Duration) *StackStore {
	return &StackStore{
		events:    make([]*StackEvent, 0, maxEvents),
		symCache:  NewSymbolCache(),
		maxEvents: maxEvents,
		window:    window,
	}
}

func (ss *StackStore) Add(ev *StackEvent) {
	ss.mu.Lock()
	defer ss.mu.Unlock()

	if len(ss.events) >= ss.maxEvents {
		ss.events = ss.events[1:]
	}
	ss.events = append(ss.events, ev)
}

func (ss *StackStore) prune() {
	cutoff := time.Now().Add(-ss.window).UnixNano()
	valid := ss.events[:0]
	for _, ev := range ss.events {
		if int64(ev.Timestamp) >= cutoff {
			valid = append(valid, ev)
		}
	}
	ss.events = valid
}

func (ss *StackStore) GetAll() []*StackEvent {
	ss.mu.RLock()
	defer ss.mu.RUnlock()

	result := make([]*StackEvent, len(ss.events))
	copy(result, ss.events)
	return result
}

func (ss *StackStore) GenerateFlameGraph(filterPID *uint32) *bpf.FlameGraphData {
	ss.mu.Lock()
	ss.prune()
	events := make([]*StackEvent, len(ss.events))
	copy(events, ss.events)
	ss.mu.Unlock()

	root := &bpf.FlameGraphNode{
		Name:  "root",
		Value: 0,
	}

	var totalLatency int64
	var maxLatency int64
	var eventCount int64

	for _, ev := range events {
		if filterPID != nil && ev.PID != *filterPID {
			continue
		}

		eventCount++
		latency := int64(ev.LatencyNs)
		if latency <= 0 {
			latency = 1
		}
		totalLatency += latency
		if latency > maxLatency {
			maxLatency = latency
		}

		current := root
		current.Value += latency
		current.LatencyNs += latency
		current.Count++

		for i := len(ev.Symbols) - 1; i >= 0; i-- {
			sym := ev.Symbols[i]
			child := findOrCreateChild(current, sym.Name)
			child.Value += latency
			child.LatencyNs += latency
			child.Count++
			current = child
		}
	}

	return &bpf.FlameGraphData{
		Nodes:       []*bpf.FlameGraphNode{root},
		GeneratedAt: time.Now(),
		WindowSec:   int(ss.window.Seconds()),
		TotalEvents: eventCount,
		MaxLatencyNs: maxLatency,
	}
}

func findOrCreateChild(parent *bpf.FlameGraphNode, name string) *bpf.FlameGraphNode {
	for _, child := range parent.Children {
		if child.Name == name {
			return child
		}
	}
	child := &bpf.FlameGraphNode{Name: name}
	parent.Children = append(parent.Children, child)
	return child
}

func (ss *StackStore) ResolveStack(stackID uint32, stackIPs []uint64) []Symbol {
	symbols := make([]Symbol, 0, len(stackIPs))
	for _, ip := range stackIPs {
		if ip == 0 {
			break
		}
		symbols = append(symbols, ss.symCache.Lookup(ip))
	}
	return symbols
}

func ParseStackIPs(raw []byte) []uint64 {
	ips := make([]uint64, 0, 128)
	for i := 0; i+8 <= len(raw); i += 8 {
		ip := binary.LittleEndian.Uint64(raw[i : i+8])
		if ip == 0 {
			break
		}
		ips = append(ips, ip)
	}
	return ips
}

func GenerateFoldedFormat(events []*StackEvent) string {
	var sb strings.Builder
	for _, ev := range events {
		var stack []string
		for i := len(ev.Symbols) - 1; i >= 0; i-- {
			stack = append(stack, ev.Symbols[i].Name)
		}
		if len(stack) == 0 {
			continue
		}
		weight := ev.LatencyNs
		if weight <= 0 {
			weight = 1
		}
		sb.WriteString(strings.Join(stack, ";"))
		sb.WriteString(fmt.Sprintf(" %d\n", weight))
	}
	return sb.String()
}

var hexRegex = regexp.MustCompile(`^[0-9a-fA-F]+$`)

func (ss *StackStore) SymbolCache() *SymbolCache {
	return ss.symCache
}
