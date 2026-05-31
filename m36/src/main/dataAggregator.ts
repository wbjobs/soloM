import type { AppConfig, HeatmapData, HeatmapDataPoint, ProcessNode, StatsData, SyscallEvent } from '@shared/types'

interface DataAggregatorOptions {
  onHeatmapUpdate: (data: HeatmapData) => void
  onProcessTreeUpdate: (data: ProcessNode) => void
  onStatsUpdate: (data: StatsData) => void
  onBatchEvents: (events: SyscallEvent[]) => void
  config: AppConfig
}

export class DataAggregator {
  private options: DataAggregatorOptions
  private config: AppConfig
  private events: SyscallEvent[] = []
  private eventCount = 0
  private startTime: number | null = null
  private processMap = new Map<number, ProcessNode>()
  private heatmapBuckets = new Map<string, { count: number; totalDuration: number }>()
  private heatmapInterval: NodeJS.Timeout | null = null
  private statsInterval: NodeJS.Timeout | null = null
  private eventsPerSecondWindow: number[] = []

  private pendingEvents: SyscallEvent[] = []
  private pendingFlushTimer: NodeJS.Timeout | null = null
  private flushIntervalMs = 200
  private maxPendingSize = 500

  private heatmapDirty = false
  private processTreeDirty = false
  private heatmapDebounceTimer: NodeJS.Timeout | null = null
  private processTreeDebounceTimer: NodeJS.Timeout | null = null
  private debounceMs = 500

  private droppedCount = 0
  private kernelDroppedCount = 0
  private lastIncomingRate = 0
  private incomingCountWindow: number[] = []

  constructor(options: DataAggregatorOptions) {
    this.options = options
    this.config = options.config
    this.startTime = Date.now()
    this.startIntervals()
    this.startPendingFlush()
  }

  updateConfig(config: AppConfig) {
    this.config = config
  }

  private startIntervals() {
    this.heatmapInterval = setInterval(() => {
      this.updateHeatmap()
    }, this.config.updateInterval)

    this.statsInterval = setInterval(() => {
      this.updateStats()
    }, this.config.updateInterval)
  }

  private startPendingFlush() {
    this.pendingFlushTimer = setInterval(() => {
      this.flushPendingEvents()
    }, this.flushIntervalMs)
  }

  private flushPendingEvents() {
    if (this.pendingEvents.length === 0) return

    const batch = this.pendingEvents.splice(0, this.pendingEvents.length)
    this.options.onBatchEvents(batch)
  }

  addEvent(event: SyscallEvent) {
    this.eventCount++

    const now = Math.floor(Date.now() / 1000)
    if (!this.incomingCountWindow.includes(now)) {
      this.incomingCountWindow.push(now)
      if (this.incomingCountWindow.length > 10) {
        this.incomingCountWindow.shift()
      }
    }

    this.events.push(event)
    if (this.events.length > this.config.maxLogEntries) {
      this.events = this.events.slice(-this.config.maxLogEntries)
    }

    this.pendingEvents.push(event)

    this.updateProcessMapIncremental(event)
    this.updateHeatmapBucket(event)

    if (this.pendingEvents.length >= this.maxPendingSize) {
      this.flushPendingEvents()
    }
  }

  addEvents(events: SyscallEvent[]) {
    for (const event of events) {
      this.eventCount++
      this.events.push(event)
      this.updateProcessMapIncremental(event)
      this.updateHeatmapBucket(event)
    }

    if (this.events.length > this.config.maxLogEntries) {
      this.events = this.events.slice(-this.config.maxLogEntries)
    }

    this.pendingEvents.push(...events)

    if (this.pendingEvents.length >= this.maxPendingSize) {
      this.flushPendingEvents()
    }

    const now = Math.floor(Date.now() / 1000)
    if (!this.incomingCountWindow.includes(now)) {
      this.incomingCountWindow.push(now)
      if (this.incomingCountWindow.length > 10) {
        this.incomingCountWindow.shift()
      }
    }
  }

  recordDropped(count: number, source: 'kernel' | 'backpressure' | 'rate_limit') {
    if (source === 'kernel') {
      this.kernelDroppedCount += count
    }
    this.droppedCount += count
  }

  getDropStats() {
    return {
      totalDropped: this.droppedCount,
      kernelDropped: this.kernelDroppedCount,
    }
  }

  private updateProcessMapIncremental(event: SyscallEvent) {
    const { pid, ppid, comm, timestamp } = event

    let node = this.processMap.get(pid)
    if (!node) {
      node = {
        pid,
        ppid,
        name: comm,
        cmdline: comm,
        startTime: timestamp,
        children: [],
        syscallCount: {},
        totalSyscalls: 0,
      }
      this.processMap.set(pid, node)
    }

    node.syscallCount[event.syscall] = (node.syscallCount[event.syscall] || 0) + 1
    node.totalSyscalls++

    if (ppid && ppid !== pid) {
      let parent = this.processMap.get(ppid)
      if (!parent) {
        parent = {
          pid: ppid,
          ppid: 0,
          name: 'unknown',
          cmdline: 'unknown',
          startTime: timestamp,
          children: [],
          syscallCount: {},
          totalSyscalls: 0,
        }
        this.processMap.set(ppid, parent)
      }

      if (!parent.children.find((c) => c.pid === pid)) {
        parent.children.push(node)
      }
    }

    this.processTreeDirty = true
    this.debounceProcessTreeUpdate()
  }

  private debounceProcessTreeUpdate() {
    if (this.processTreeDebounceTimer) {
      clearTimeout(this.processTreeDebounceTimer)
    }
    this.processTreeDebounceTimer = setTimeout(() => {
      if (this.processTreeDirty) {
        this.updateProcessTree()
        this.processTreeDirty = false
      }
    }, this.debounceMs)
  }

  private updateHeatmapBucket(event: SyscallEvent) {
    const timeBucket = Math.floor(event.timestamp / 1000)
    const key = `${timeBucket}:${event.syscall}`

    const existing = this.heatmapBuckets.get(key)
    if (existing) {
      existing.count++
      existing.totalDuration += event.duration
    } else {
      this.heatmapBuckets.set(key, { count: 1, totalDuration: event.duration })
    }

    this.heatmapDirty = true
  }

  private updateHeatmap() {
    if (!this.heatmapDirty) return

    const now = Date.now()
    const timeWindow = this.config.heatmapTimeWindow
    const oldestBucket = Math.floor((now - timeWindow * 1000) / 1000)

    const data: HeatmapDataPoint[] = []
    const syscallsSet = new Set<string>()

    for (const [key, value] of this.heatmapBuckets.entries()) {
      const [timeBucketStr, syscall] = key.split(':')
      const timeBucket = parseInt(timeBucketStr, 10)

      if (timeBucket < oldestBucket) {
        this.heatmapBuckets.delete(key)
        continue
      }

      syscallsSet.add(syscall)
      data.push({
        timeBucket,
        syscall,
        count: value.count,
        avgDuration: value.totalDuration / value.count,
      })
    }

    const heatmapData: HeatmapData = {
      timeRange: [oldestBucket * 1000, now],
      syscalls: Array.from(syscallsSet).sort(),
      data,
    }

    this.options.onHeatmapUpdate(heatmapData)
    this.heatmapDirty = false
  }

  private updateProcessTree() {
    const rootNode: ProcessNode = {
      pid: 0,
      ppid: 0,
      name: 'root',
      cmdline: 'System Process Tree',
      startTime: this.startTime || Date.now(),
      children: [],
      syscallCount: {},
      totalSyscalls: 0,
    }

    const rootProcesses: ProcessNode[] = []
    const allProcesses = Array.from(this.processMap.values())

    for (const node of allProcesses) {
      if (node.ppid === 0 || !this.processMap.has(node.ppid) || node.ppid === node.pid) {
        if (!rootProcesses.find((p) => p.pid === node.pid)) {
          rootProcesses.push(node)
        }
      }
    }

    rootNode.children = rootProcesses.sort((a, b) => b.totalSyscalls - a.totalSyscalls)

    this.options.onProcessTreeUpdate(rootNode)
  }

  private updateStats() {
    const syscallCounts = new Map<string, number>()
    const processCounts = new Map<number, { name: string; count: number }>()

    const recentEvents = this.events.slice(-1000)
    for (const event of recentEvents) {
      syscallCounts.set(event.syscall, (syscallCounts.get(event.syscall) || 0) + 1)

      const existing = processCounts.get(event.pid)
      if (existing) {
        existing.count++
      } else {
        processCounts.set(event.pid, { name: event.comm, count: 1 })
      }
    }

    const topSyscalls = Array.from(syscallCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    const topProcesses = Array.from(processCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([pid, data]) => ({ name: data.name, pid, count: data.count }))

    const eventsPerSecond = this.incomingCountWindow.length > 0
      ? Math.round(this.eventCount / Math.max(this.incomingCountWindow.length, 1))
      : 0

    this.lastIncomingRate = eventsPerSecond

    const stats: StatsData = {
      totalEvents: this.eventCount,
      activeProcesses: this.processMap.size,
      eventsPerSecond,
      alerts: this.droppedCount > 0 ? 1 : 0,
      topSyscalls,
      topProcesses,
    }

    this.options.onStatsUpdate(stats)
  }

  getEventCount(): number {
    return this.eventCount
  }

  getStartTime(): number | null {
    return this.startTime
  }

  getIncomingRate(): number {
    return this.lastIncomingRate
  }

  exportData(options: { format: 'json' | 'csv' }): string {
    if (options.format === 'json') {
      return JSON.stringify(this.events, null, 2)
    } else {
      const headers = ['timestamp', 'syscall', 'pid', 'ppid', 'comm', 'uid', 'gid', 'retval', 'duration']
      const rows = this.events.map((event) => [
        event.timestamp,
        event.syscall,
        event.pid,
        event.ppid,
        event.comm,
        event.uid,
        event.gid,
        event.retval,
        event.duration,
      ])
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    }
  }

  stop() {
    if (this.heatmapInterval) {
      clearInterval(this.heatmapInterval)
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
    }
    if (this.pendingFlushTimer) {
      clearInterval(this.pendingFlushTimer)
    }
    if (this.heatmapDebounceTimer) {
      clearTimeout(this.heatmapDebounceTimer)
    }
    if (this.processTreeDebounceTimer) {
      clearTimeout(this.processTreeDebounceTimer)
    }
    this.flushPendingEvents()
  }
}
