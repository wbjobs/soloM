package aggregator

import (
	"sort"
	"sync"
	"time"

	"github.com/cloudmon/netwatch/internal/k8s"
	"github.com/cloudmon/netwatch/internal/model"
)

type edgeKey struct {
	Source string
	Target string
}

type edgeStats struct {
	retransmits []uint32
	latencies  []uint64
	sampleCount uint32
}

type subscriber struct {
	topology chan model.TopologyData
	heatmap  chan model.HeatmapData
	done     chan struct{}
}

type Aggregator struct {
	discoverer *k8s.Discoverer
	retransmit chan model.TCPRetransmitEvent
	latency    chan model.TCPLatencyEvent
	alertCh    chan model.ServiceEdge
	edges      map[edgeKey]*edgeStats
	nodes      map[string]model.ServiceEndpoint
	mu         sync.RWMutex
	subs       map[*subscriber]struct{}
	subMu      sync.RWMutex
	done       chan struct{}
	window     time.Duration
	iqrK       float64
	maxSamples int
}

func New(discoverer *k8s.Discoverer, retransmitCh chan model.TCPRetransmitEvent, latencyCh chan model.TCPLatencyEvent, alertCh chan model.ServiceEdge) *Aggregator {
	return &Aggregator{
		discoverer: discoverer,
		retransmit: retransmitCh,
		latency:    latencyCh,
		alertCh:    alertCh,
		edges:      make(map[edgeKey]*edgeStats),
		nodes:      make(map[string]model.ServiceEndpoint),
		subs:       make(map[*subscriber]struct{}),
		done:       make(chan struct{}),
		window:     5 * time.Second,
		iqrK:       2.5,
		maxSamples: 10000,
	}
}

func (a *Aggregator) Start() {
	go a.collect()
	go a.aggregate()
}

func (a *Aggregator) Stop() {
	close(a.done)
	a.subMu.Lock()
	for sub := range a.subs {
		close(sub.done)
	}
	a.subMu.Unlock()
}

func (a *Aggregator) Subscribe() (*subscriber, error) {
	sub := &subscriber{
		topology: make(chan model.TopologyData, 16),
		heatmap:  make(chan model.HeatmapData, 64),
		done:     make(chan struct{}),
	}
	a.subMu.Lock()
	a.subs[sub] = struct{}{}
	a.subMu.Unlock()
	return sub, nil
}

func (a *Aggregator) Unsubscribe(sub *subscriber) {
	a.subMu.Lock()
	delete(a.subs, sub)
	a.subMu.Unlock()
	close(sub.done)
}

func (a *Aggregator) GetTopology() model.TopologyData {
	a.mu.RLock()
	defer a.mu.RUnlock()

	nodes := make([]model.ServiceEndpoint, 0, len(a.nodes))
	for _, n := range a.nodes {
		nodes = append(nodes, n)
	}

	edges := make([]model.ServiceEdge, 0, len(a.edges))
	for key, stats := range a.edges {
		edges = append(edges, a.buildEdge(key, stats))
	}

	return model.TopologyData{
		Nodes:     nodes,
		Edges:     edges,
		Timestamp: time.Now(),
	}
}

func (a *Aggregator) GetHeatmap(source, target string) model.HeatmapData {
	a.mu.RLock()
	defer a.mu.RUnlock()

	key := edgeKey{Source: source, Target: target}
	stats, ok := a.edges[key]
	if !ok {
		return model.HeatmapData{
			SourceService: source,
			TargetService: target,
			Latencies:     []model.LatencyBucket{},
			Timestamp:     time.Now(),
		}
	}

	return model.HeatmapData{
		SourceService: source,
		TargetService: target,
		Latencies:     buildBuckets(filterLatencyOutliers(stats.latencies, a.iqrK)),
		Timestamp:     time.Now(),
	}
}

func (a *Aggregator) GetEdgeMetrics(source, target string) (model.ServiceEdge, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	key := edgeKey{Source: source, Target: target}
	stats, ok := a.edges[key]
	if !ok {
		return model.ServiceEdge{}, false
	}
	return a.buildEdge(key, stats), true
}

func (a *Aggregator) collect() {
	for {
		select {
		case <-a.done:
			return
		case evt := <-a.retransmit:
			a.processRetransmit(evt)
		case evt := <-a.latency:
			a.processLatency(evt)
		}
	}
}

func (a *Aggregator) processRetransmit(evt model.TCPRetransmitEvent) {
	srcSvc, srcOk := a.discoverer.LookupByIP(evt.SrcIP)
	dstSvc, dstOk := a.discoverer.LookupByIP(evt.DstIP)

	if !srcOk || !dstOk {
		return
	}

	srcName := srcSvc.Namespace + "/" + srcSvc.Name
	dstName := dstSvc.Namespace + "/" + dstSvc.Name

	key := edgeKey{Source: srcName, Target: dstName}

	a.mu.Lock()
	defer a.mu.Unlock()

	a.nodes[srcName] = srcSvc
	a.nodes[dstName] = dstSvc

	stats, ok := a.edges[key]
	if !ok {
		stats = &edgeStats{}
		a.edges[key] = stats
	}

	stats.retransmits = append(stats.retransmits, evt.Count)
	if len(stats.retransmits) > a.maxSamples {
		stats.retransmits = stats.retransmits[len(stats.retransmits)-a.maxSamples:]
	}
	stats.sampleCount++
}

func (a *Aggregator) processLatency(evt model.TCPLatencyEvent) {
	srcSvc, srcOk := a.discoverer.LookupByIP(evt.SrcIP)
	dstSvc, dstOk := a.discoverer.LookupByIP(evt.DstIP)

	if !srcOk || !dstOk {
		return
	}

	srcName := srcSvc.Namespace + "/" + srcSvc.Name
	dstName := dstSvc.Namespace + "/" + dstSvc.Name

	key := edgeKey{Source: srcName, Target: dstName}

	a.mu.Lock()
	defer a.mu.Unlock()

	a.nodes[srcName] = srcSvc
	a.nodes[dstName] = dstSvc

	stats, ok := a.edges[key]
	if !ok {
		stats = &edgeStats{}
		a.edges[key] = stats
	}

	stats.latencies = append(stats.latencies, evt.LatencyUS)
	if len(stats.latencies) > a.maxSamples {
		stats.latencies = stats.latencies[len(stats.latencies)-a.maxSamples:]
	}
	stats.sampleCount++
}

func (a *Aggregator) aggregate() {
	ticker := time.NewTicker(a.window)
	defer ticker.Stop()

	for {
		select {
		case <-a.done:
			return
		case <-ticker.C:
			topology := a.GetTopology()
			a.notifyTopology(topology)

			a.mu.RLock()
			for key, stats := range a.edges {
				edge := a.buildEdge(key, stats)
				if a.alertCh != nil {
					select {
					case a.alertCh <- edge:
					default:
					}
				}

				filtered := filterLatencyOutliers(stats.latencies, a.iqrK)
				if len(filtered) > 0 {
					heatmap := model.HeatmapData{
						SourceService: key.Source,
						TargetService: key.Target,
						Latencies:     buildBuckets(filtered),
						Timestamp:     time.Now(),
					}
					a.notifyHeatmap(heatmap)
				}
			}
			a.mu.RUnlock()

			a.pruneOldData()
		}
	}
}

func (a *Aggregator) pruneOldData() {
	a.mu.Lock()
	defer a.mu.Unlock()

	for key, stats := range a.edges {
		if stats.sampleCount == 0 {
			delete(a.edges, key)
			continue
		}
		if len(stats.latencies) > a.maxSamples {
			stats.latencies = stats.latencies[len(stats.latencies)-a.maxSamples:]
		}
		if len(stats.retransmits) > a.maxSamples {
			stats.retransmits = stats.retransmits[len(stats.retransmits)-a.maxSamples:]
		}
	}
}

func (a *Aggregator) notifyTopology(data model.TopologyData) {
	a.subMu.RLock()
	defer a.subMu.RUnlock()

	for sub := range a.subs {
		select {
		case sub.topology <- data:
		default:
		}
	}
}

func (a *Aggregator) notifyHeatmap(data model.HeatmapData) {
	a.subMu.RLock()
	defer a.subMu.RUnlock()

	for sub := range a.subs {
		select {
		case sub.heatmap <- data:
		default:
		}
	}
}

func (a *Aggregator) buildEdge(key edgeKey, stats *edgeStats) model.ServiceEdge {
	filteredRetransmits := filterRetransmitOutliers(stats.retransmits, a.iqrK)

	edge := model.ServiceEdge{
		Source:          key.Source,
		Target:          key.Target,
		RetransmitCount: totalRetransmits(filteredRetransmits),
		SampleCount:     stats.sampleCount,
		Timestamp:       time.Now(),
	}

	filteredLatencies := filterLatencyOutliers(stats.latencies, a.iqrK)

	if len(filteredLatencies) > 0 {
		sorted := make([]uint64, len(filteredLatencies))
		copy(sorted, filteredLatencies)
		sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

		var sum uint64
		for _, l := range sorted {
			sum += l
		}
		edge.AvgLatencyUS = float64(sum) / float64(len(sorted))
		edge.P50LatencyUS = float64(sorted[len(sorted)*50/100])
		edge.P99LatencyUS = float64(sorted[min(len(sorted)*99/100, len(sorted)-1)])
	}

	return edge
}

func filterLatencyOutliers(data []uint64, k float64) []uint64 {
	if len(data) < 4 {
		return data
	}

	sorted := make([]uint64, len(data))
	copy(sorted, data)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	q1Idx := len(sorted) / 4
	q3Idx := (len(sorted) * 3) / 4
	q1 := float64(sorted[q1Idx])
	q3 := float64(sorted[q3Idx])
	iqr := q3 - q1

	lowerBound := q1 - k*iqr
	upperBound := q3 + k*iqr

	if lowerBound < 0 {
		lowerBound = 0
	}

	filtered := make([]uint64, 0, len(data))
	for _, v := range data {
		fv := float64(v)
		if fv >= lowerBound && fv <= upperBound {
			filtered = append(filtered, v)
		}
	}

	return filtered
}

func filterRetransmitOutliers(data []uint32, k float64) []uint32 {
	if len(data) < 4 {
		return data
	}

	sorted := make([]uint32, len(data))
	copy(sorted, data)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	q1Idx := len(sorted) / 4
	q3Idx := (len(sorted) * 3) / 4
	q1 := float64(sorted[q1Idx])
	q3 := float64(sorted[q3Idx])
	iqr := q3 - q1

	upperBound := q3 + k*iqr

	filtered := make([]uint32, 0, len(data))
	for _, v := range data {
		if float64(v) <= upperBound {
			filtered = append(filtered, v)
		}
	}

	return filtered
}

func totalRetransmits(counts []uint32) uint32 {
	var total uint32
	for _, c := range counts {
		total += c
	}
	return total
}

func buildBuckets(latencies []uint64) []model.LatencyBucket {
	if len(latencies) == 0 {
		return nil
	}

	bucketRanges := []struct{ start, end uint64 }{
		{0, 100},
		{100, 500},
		{500, 1000},
		{1000, 5000},
		{5000, 10000},
		{10000, 50000},
		{50000, 100000},
		{100000, 500000},
		{500000, 1000000},
		{1000000, 5000000},
	}

	buckets := make([]model.LatencyBucket, len(bucketRanges))
	for i, r := range bucketRanges {
		buckets[i] = model.LatencyBucket{
			RangeStart: r.start,
			RangeEnd:   r.end,
		}
	}

	for _, l := range latencies {
		for i, r := range bucketRanges {
			if l >= r.start && l < r.end {
				buckets[i].Count++
				break
			}
			if i == len(bucketRanges)-1 {
				buckets[i].Count++
			}
		}
	}

	return buckets
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
