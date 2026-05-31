package collector

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

type Metrics struct {
	CPUPercent    float64
	CPUHistory    []float64
	MemoryUsed    uint64
	MemoryTotal   uint64
	MemoryPercent float64
	SwapUsed      uint64
	SwapTotal     uint64
	SwapPercent   float64
	DiskReads     uint64
	DiskWrites    uint64
	DiskReadRate  float64
	DiskWriteRate float64
	NetRecv       uint64
	NetSent       uint64
	NetRecvRate   float64
	NetSentRate   float64
	Processes     []ProcessInfo
}

type ProcessInfo struct {
	PID         int32
	Name        string
	MemoryPercent float32
	MemoryRSS   uint64
	CPUPercent  float64
}

type Collector struct {
	mu           sync.RWMutex
	metrics      Metrics
	historySize  int
	prevDiskIO   map[string]disk.IOCountersStat
	prevNetIO    map[string]net.IOCountersStat
	prevTime     time.Time
}

func NewCollector(historySize int) *Collector {
	return &Collector{
		historySize: historySize,
		metrics: Metrics{
			CPUHistory: make([]float64, 0, historySize),
		},
		prevDiskIO: make(map[string]disk.IOCountersStat),
		prevNetIO:  make(map[string]net.IOCountersStat),
		prevTime:   time.Now(),
	}
}

func (c *Collector) Start(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	c.Collect()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.Collect()
		}
	}
}

func (c *Collector) Collect() {
	now := time.Now()
	interval := now.Sub(c.prevTime).Seconds()
	if interval <= 0 {
		interval = 1.0
	}

	cpuPercent, _ := cpu.Percent(100*time.Millisecond, false)
	memInfo, _ := mem.VirtualMemory()
	swapInfo, _ := mem.SwapMemory()
	diskIO, _ := disk.IOCounters()
	netIO, _ := net.IOCounters(true)
	procs, _ := process.Processes()

	c.mu.Lock()
	defer c.mu.Unlock()

	if len(cpuPercent) > 0 {
		c.metrics.CPUPercent = cpuPercent[0]
		c.metrics.CPUHistory = append(c.metrics.CPUHistory, cpuPercent[0])
		if len(c.metrics.CPUHistory) > c.historySize {
			c.metrics.CPUHistory = c.metrics.CPUHistory[1:]
		}
	}

	if memInfo != nil {
		c.metrics.MemoryUsed = memInfo.Used
		c.metrics.MemoryTotal = memInfo.Total
		c.metrics.MemoryPercent = memInfo.UsedPercent
	}

	if swapInfo != nil {
		c.metrics.SwapUsed = swapInfo.Used
		c.metrics.SwapTotal = swapInfo.Total
		c.metrics.SwapPercent = swapInfo.UsedPercent
	}

	var totalRead, totalWrite uint64
	for _, v := range diskIO {
		totalRead += v.ReadBytes
		totalWrite += v.WriteBytes
	}

	if len(c.prevDiskIO) > 0 {
		var prevRead, prevWrite uint64
		for _, v := range c.prevDiskIO {
			prevRead += v.ReadBytes
			prevWrite += v.WriteBytes
		}
		c.metrics.DiskReadRate = float64(totalRead-prevRead) / interval
		c.metrics.DiskWriteRate = float64(totalWrite-prevWrite) / interval
	}
	c.metrics.DiskReads = totalRead
	c.metrics.DiskWrites = totalWrite
	c.prevDiskIO = diskIO

	var totalRecv, totalSent uint64
	for _, v := range netIO {
		totalRecv += v.BytesRecv
		totalSent += v.BytesSent
	}

	if len(c.prevNetIO) > 0 {
		var prevRecv, prevSent uint64
		for _, v := range c.prevNetIO {
			prevRecv += v.BytesRecv
			prevSent += v.BytesSent
		}
		c.metrics.NetRecvRate = float64(totalRecv-prevRecv) / interval
		c.metrics.NetSentRate = float64(totalSent-prevSent) / interval
	}
	c.metrics.NetRecv = totalRecv
	c.metrics.NetSent = totalSent
	c.prevNetIO = netIO

	c.metrics.Processes = c.getTopProcesses(procs, 10)
	c.prevTime = now
}

func (c *Collector) getTopProcesses(procs []*process.Process, limit int) []ProcessInfo {
	var processList []ProcessInfo

	for _, p := range procs {
		name, _ := p.Name()
		memPercent, _ := p.MemoryPercent()
		memInfo, _ := p.MemoryInfo()
		cpuPercent, _ := p.CPUPercent()

		var rss uint64
		if memInfo != nil {
			rss = memInfo.RSS
		}

		processList = append(processList, ProcessInfo{
			PID:          p.Pid,
			Name:         name,
			MemoryPercent: memPercent,
			MemoryRSS:    rss,
			CPUPercent:   cpuPercent,
		})
	}

	sort.Slice(processList, func(i, j int) bool {
		return processList[i].MemoryPercent > processList[j].MemoryPercent
	})

	if len(processList) > limit {
		processList = processList[:limit]
	}

	return processList
}

func (c *Collector) GetMetrics() Metrics {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.metrics
}

func (c *Collector) GetDiskPartitions() []disk.PartitionStat {
	partitions, _ := disk.Partitions(true)
	var result []disk.PartitionStat
	for _, p := range partitions {
		if p.Fstype != "" {
			result = append(result, p)
		}
	}
	return result
}

func (c *Collector) GetDiskUsage(path string) *disk.UsageStat {
	usage, _ := disk.Usage(path)
	return usage
}

func (c *Collector) GetNetInterfaces() []net.InterfaceStat {
	ifaces, _ := net.Interfaces()
	return ifaces
}
