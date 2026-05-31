package metrics

import (
	"fmt"
	"math"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

type LatencyRecord struct {
	LatencyNs uint64
	Timestamp time.Time
}

type MetricsKey struct {
	PID       uint32
	Namespace string
}

type LatencyAggregator struct {
	mu      sync.RWMutex
	records map[MetricsKey][]LatencyRecord

	avgLatency   *prometheus.Desc
	p99Latency   *prometheus.Desc
	countTotal   *prometheus.Desc
	sumLatency   *prometheus.Desc

	window time.Duration
}

func NewLatencyAggregator(window time.Duration) *LatencyAggregator {
	return &LatencyAggregator{
		records: make(map[MetricsKey][]LatencyRecord),
		window:  window,
		avgLatency: prometheus.NewDesc(
			"tcp_sendmsg_kernel_latency_avg_ns",
			"Average kernel processing latency of tcp_sendmsg in nanoseconds",
			[]string{"pid", "namespace"},
			nil,
		),
		p99Latency: prometheus.NewDesc(
			"tcp_sendmsg_kernel_latency_p99_ns",
			"P99 kernel processing latency of tcp_sendmsg in nanoseconds",
			[]string{"pid", "namespace"},
			nil,
		),
		countTotal: prometheus.NewDesc(
			"tcp_sendmsg_kernel_latency_count_total",
			"Total number of tcp_sendmsg latency samples collected",
			[]string{"pid", "namespace"},
			nil,
		),
		sumLatency: prometheus.NewDesc(
			"tcp_sendmsg_kernel_latency_sum_ns",
			"Total sum of tcp_sendmsg kernel latency in nanoseconds",
			[]string{"pid", "namespace"},
			nil,
		),
	}
}

func (la *LatencyAggregator) Record(key MetricsKey, latencyNs uint64) {
	la.mu.Lock()
	defer la.mu.Unlock()

	rec := LatencyRecord{
		LatencyNs: latencyNs,
		Timestamp: time.Now(),
	}
	la.records[key] = append(la.records[key], rec)
}

func (la *LatencyAggregator) prune() {
	cutoff := time.Now().Add(-la.window)
	for k, recs := range la.records {
		valid := recs[:0]
		for _, r := range recs {
			if r.Timestamp.After(cutoff) {
				valid = append(valid, r)
			}
		}
		if len(valid) == 0 {
			delete(la.records, k)
		} else {
			la.records[k] = valid
		}
	}
}

func (la *LatencyAggregator) Describe(ch chan<- *prometheus.Desc) {
	ch <- la.avgLatency
	ch <- la.p99Latency
	ch <- la.countTotal
	ch <- la.sumLatency
}

func (la *LatencyAggregator) Collect(ch chan<- prometheus.Metric) {
	la.mu.Lock()
	la.prune()
	snapshot := make(map[MetricsKey][]LatencyRecord, len(la.records))
	for k, v := range la.records {
		recs := make([]LatencyRecord, len(v))
		copy(recs, v)
		snapshot[k] = recs
	}
	la.mu.Unlock()

	for key, recs := range snapshot {
		pidStr := formatPID(key.PID)
		nsStr := key.Namespace
		if nsStr == "" {
			nsStr = "unknown"
		}

		var sum uint64
		latencies := make([]float64, len(recs))
		for i, r := range recs {
			latencies[i] = float64(r.LatencyNs)
			sum += r.LatencyNs
		}
		sort.Float64s(latencies)

		avg := float64(sum) / float64(len(recs))
		p99 := percentile(latencies, 99)

		ch <- prometheus.MustNewConstMetric(
			la.avgLatency, prometheus.GaugeValue, avg, pidStr, nsStr,
		)
		ch <- prometheus.MustNewConstMetric(
			la.p99Latency, prometheus.GaugeValue, p99, pidStr, nsStr,
		)
		ch <- prometheus.MustNewConstMetric(
			la.countTotal, prometheus.CounterValue, float64(len(recs)), pidStr, nsStr,
		)
		ch <- prometheus.MustNewConstMetric(
			la.sumLatency, prometheus.CounterValue, float64(sum), pidStr, nsStr,
		)
	}
}

func percentile(sorted []float64, pct float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}
	rank := pct / 100.0 * float64(len(sorted)-1)
	lower := int(math.Floor(rank))
	upper := lower + 1
	if upper >= len(sorted) {
		return sorted[len(sorted)-1]
	}
	frac := rank - float64(lower)
	return sorted[lower]*(1-frac) + sorted[upper]*frac
}

func formatPID(pid uint32) string {
	return fmt.Sprintf("%d", pid)
}

func (la *LatencyAggregator) PruneDeadPIDs() {
	la.mu.Lock()
	defer la.mu.Unlock()

	for key := range la.records {
		if !IsPidAlive(key.PID) {
			delete(la.records, key)
		}
	}
}

func IsPidAlive(pid uint32) bool {
	_, err := os.Stat(fmt.Sprintf("/proc/%d", pid))
	return err == nil
}
