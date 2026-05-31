import { create } from 'zustand'
import type {
  AppConfig,
  AuditLogEntry,
  CollectorStatus,
  HeatmapData,
  ProcessNode,
  SecurityAlert,
  SecurityRule,
  StatsData,
  SyscallEvent,
} from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'

interface DropStats {
  kernel: number
  backpressure: number
  rateLimited: number
  bufferSize: number
}

interface AuditStats {
  totalLogs: number
  totalAlerts: number
  unacknowledgedAlerts: number
  severityCounts: { severity: string; count: number }[]
}

interface AppState {
  config: AppConfig
  collectorStatus: CollectorStatus
  events: SyscallEvent[]
  heatmapData: HeatmapData | null
  processTree: ProcessNode | null
  statsData: StatsData | null
  selectedEvent: SyscallEvent | null
  showConfig: boolean
  error: string | null
  demoMode: boolean
  dropStats: DropStats | null

  securityAlerts: SecurityAlert[]
  auditLogs: AuditLogEntry[]
  auditStats: AuditStats | null
  showRulesPanel: boolean
  showAuditPanel: boolean

  setConfig: (config: AppConfig) => void
  setCollectorStatus: (status: CollectorStatus) => void
  addEvent: (event: SyscallEvent) => void
  addEvents: (events: SyscallEvent[]) => void
  setHeatmapData: (data: HeatmapData) => void
  setProcessTree: (tree: ProcessNode) => void
  setStatsData: (data: StatsData) => void
  setSelectedEvent: (event: SyscallEvent | null) => void
  setShowConfig: (show: boolean) => void
  setError: (error: string | null) => void
  setDemoMode: (demo: boolean) => void
  setDropStats: (stats: DropStats) => void
  clearData: () => void

  addSecurityAlerts: (alerts: SecurityAlert[]) => void
  setAuditLogs: (logs: AuditLogEntry[]) => void
  setAuditStats: (stats: AuditStats) => void
  addSecurityRule: (rule: SecurityRule) => void
  updateSecurityRule: (rule: SecurityRule) => void
  deleteSecurityRule: (ruleId: string) => void
  setShowRulesPanel: (show: boolean) => void
  setShowAuditPanel: (show: boolean) => void
  clearSecurityAlerts: () => void
}

const MAX_EVENTS = 5000

class RingBuffer<T> {
  private buffer: (T | null)[]
  private head = 0
  private tail = 0
  private count = 0
  private capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
    this.buffer = new Array(capacity).fill(null)
  }

  push(item: T): void {
    this.buffer[this.tail] = item
    this.tail = (this.tail + 1) % this.capacity
    if (this.count === this.capacity) {
      this.head = (this.head + 1) % this.capacity
    } else {
      this.count++
    }
  }

  pushMany(items: T[]): void {
    for (const item of items) {
      this.push(item)
    }
  }

  toArray(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity
      const item = this.buffer[idx]
      if (item !== null) {
        result.push(item)
      }
    }
    return result
  }

  getLatest(n: number): T[] {
    const start = Math.max(0, this.count - n)
    const result: T[] = []
    for (let i = start; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity
      const item = this.buffer[idx]
      if (item !== null) {
        result.push(item)
      }
    }
    return result
  }

  get length(): number {
    return this.count
  }

  clear(): void {
    this.head = 0
    this.tail = 0
    this.count = 0
    this.buffer.fill(null)
  }
}

const eventRingBuffer = new RingBuffer<SyscallEvent>(MAX_EVENTS)

export const useStore = create<AppState>((set, get) => ({
  config: DEFAULT_CONFIG,
  collectorStatus: {
    running: false,
    connected: false,
    eventCount: 0,
    startTime: null,
    error: null,
  },
  events: [],
  heatmapData: null,
  processTree: null,
  statsData: null,
  selectedEvent: null,
  showConfig: false,
  error: null,
  demoMode: true,
  dropStats: null,

  securityAlerts: [],
  auditLogs: [],
  auditStats: null,
  showRulesPanel: false,
  showAuditPanel: false,

  setConfig: (config) => set({ config }),
  setCollectorStatus: (status) => set({ collectorStatus: status }),

  addEvent: (event) => {
    eventRingBuffer.push(event)
    if (eventRingBuffer.length % 10 === 0 || eventRingBuffer.length < 50) {
      set({ events: eventRingBuffer.toArray() })
    }
  },

  addEvents: (newEvents) => {
    eventRingBuffer.pushMany(newEvents)
    set({ events: eventRingBuffer.getLatest(500) })
  },

  setHeatmapData: (data) => set({ heatmapData: data }),
  setProcessTree: (tree) => set({ processTree: tree }),
  setStatsData: (data) => set({ statsData: data }),
  setSelectedEvent: (event) => set({ selectedEvent: event }),
  setShowConfig: (show) => set({ showConfig: show }),
  setError: (error) => set({ error }),
  setDemoMode: (demo) => set({ demoMode: demo }),
  setDropStats: (stats) => set({ dropStats: stats }),

  addSecurityAlerts: (alerts) => {
    set((state) => ({
      securityAlerts: [...alerts, ...state.securityAlerts].slice(0, 100),
    }))
  },

  setAuditLogs: (logs) => set({ auditLogs: logs }),
  setAuditStats: (stats) => set({ auditStats: stats }),

  addSecurityRule: (rule) => {
    set((state) => ({
      config: {
        ...state.config,
        securityRules: [...state.config.securityRules, rule],
      },
    }))
  },

  updateSecurityRule: (rule) => {
    set((state) => ({
      config: {
        ...state.config,
        securityRules: state.config.securityRules.map((r) =>
          r.id === rule.id ? rule : r
        ),
      },
    }))
  },

  deleteSecurityRule: (ruleId) => {
    set((state) => ({
      config: {
        ...state.config,
        securityRules: state.config.securityRules.filter((r) => r.id !== ruleId),
      },
    }))
  },

  setShowRulesPanel: (show) => set({ showRulesPanel: show }),
  setShowAuditPanel: (show) => set({ showAuditPanel: show }),

  clearSecurityAlerts: () => set({ securityAlerts: [] }),

  clearData: () => {
    eventRingBuffer.clear()
    set({
      events: [],
      heatmapData: null,
      processTree: null,
      statsData: null,
      dropStats: null,
    })
  },
}))

export { RingBuffer, MAX_EVENTS }
