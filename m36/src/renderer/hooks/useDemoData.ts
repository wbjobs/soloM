import { useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/store/useStore'
import type {
  HeatmapData,
  HeatmapDataPoint,
  ProcessNode,
  SecurityAlert,
  SecurityRule,
  StatsData,
  SyscallEvent,
} from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'

const demoSyscalls = ['open', 'openat', 'execve', 'read', 'write', 'close', 'fork', 'clone']
const demoProcesses = ['bash', 'python3', 'node', 'chrome', 'firefox', 'code', 'nginx', 'mysql']

function generateRandomEvent(): SyscallEvent {
  const syscall = demoSyscalls[Math.floor(Math.random() * demoSyscalls.length)]
  const comm = demoProcesses[Math.floor(Math.random() * demoProcesses.length)]
  const pid = Math.floor(Math.random() * 60000) + 1000
  const ppid = Math.random() > 0.3 ? Math.floor(Math.random() * 1000) + 1 : 1

  return {
    timestamp: Date.now(),
    syscall,
    pid,
    ppid,
    comm,
    uid: Math.random() > 0.7 ? 0 : Math.floor(Math.random() * 100) + 1000,
    gid: Math.random() > 0.7 ? 0 : Math.floor(Math.random() * 100) + 1000,
    args: {
      arg0: Math.floor(Math.random() * 1000),
      arg1: Math.floor(Math.random() * 1000),
      arg2: Math.floor(Math.random() * 1000),
    },
    retval: Math.random() > 0.1 ? Math.floor(Math.random() * 100) : -1,
    duration: Math.floor(Math.random() * 10000) + 100,
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj)
}

function matchEventToRule(event: SyscallEvent, rule: SecurityRule): boolean {
  if (!rule.enabled) return false
  if (rule.conditions.length === 0) return false

  const results = rule.conditions.map((condition) => {
    const value = getNestedValue(event, condition.field)
    const conditionValue = condition.value

    switch (condition.operator) {
      case 'eq':
        return value === conditionValue
      case 'ne':
        return value !== conditionValue
      case 'gt':
        return typeof value === 'number' && typeof conditionValue === 'number' && value > conditionValue
      case 'lt':
        return typeof value === 'number' && typeof conditionValue === 'number' && value < conditionValue
      case 'gte':
        return typeof value === 'number' && typeof conditionValue === 'number' && value >= conditionValue
      case 'lte':
        return typeof value === 'number' && typeof conditionValue === 'number' && value <= conditionValue
      case 'contains':
        return typeof value === 'string' && typeof conditionValue === 'string' && value.includes(conditionValue)
      case 'startsWith':
        return typeof value === 'string' && typeof conditionValue === 'string' && value.startsWith(conditionValue)
      case 'endsWith':
        return typeof value === 'string' && typeof conditionValue === 'string' && value.endsWith(conditionValue)
      case 'in':
        return Array.isArray(conditionValue) && (conditionValue as any[]).includes(value)
      case 'notIn':
        return Array.isArray(conditionValue) && !(conditionValue as any[]).includes(value)
      case 'regex':
        if (typeof conditionValue === 'string') {
          try {
            return typeof value === 'string' && new RegExp(conditionValue).test(value)
          } catch {
            return false
          }
        }
        return false
      default:
        return false
    }
  })

  if (rule.operator === 'AND') {
    return results.every((r) => r)
  } else {
    return results.some((r) => r)
  }
}

function generateAlert(event: SyscallEvent, rule: SecurityRule): SecurityAlert {
  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    event,
    timestamp: Date.now(),
    message: `[演示] 规则「${rule.name}」触发: ${event.comm} (PID ${event.pid}) 执行了 ${event.syscall}`,
  }
}

function generateProcessTree(): ProcessNode {
  const createNode = (pid: number, depth: number): ProcessNode => {
    const children: ProcessNode[] = []
    if (depth < 3 && Math.random() > 0.4) {
      const childCount = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < childCount; i++) {
        children.push(createNode(pid * 10 + i, depth + 1))
      }
    }

    const syscallCount: Record<string, number> = {}
    demoSyscalls.forEach((sys) => {
      if (Math.random() > 0.5) {
        syscallCount[sys] = Math.floor(Math.random() * 1000)
      }
    })

    return {
      pid,
      ppid: Math.floor(pid / 10),
      name: demoProcesses[pid % demoProcesses.length],
      cmdline: `${demoProcesses[pid % demoProcesses.length]} --arg1 --arg2`,
      startTime: Date.now() - Math.random() * 3600000,
      children,
      syscallCount,
      totalSyscalls: Object.values(syscallCount).reduce((a, b) => a + b, 0),
    }
  }

  return {
    pid: 0,
    ppid: 0,
    name: 'root',
    cmdline: 'System Process Tree',
    startTime: Date.now(),
    children: [1, 2, 3].map((pid) => createNode(pid, 0)),
    syscallCount: {},
    totalSyscalls: 0,
  }
}

function generateHeatmapData(): HeatmapData {
  const now = Date.now()
  const timeRangeStart = now - DEFAULT_CONFIG.heatmapTimeWindow * 1000
  const bucketCount = DEFAULT_CONFIG.heatmapTimeWindow
  const data: HeatmapDataPoint[] = []

  for (let i = 0; i < bucketCount; i++) {
    const timeBucket = Math.floor((timeRangeStart + i * 1000) / 1000)
    for (const syscall of demoSyscalls) {
      if (Math.random() > 0.3) {
        const count = Math.floor(Math.random() * 100)
        data.push({
          timeBucket,
          syscall,
          count,
          avgDuration: Math.floor(Math.random() * 5000) + 100,
        })
      }
    }
  }

  return {
    timeRange: [timeRangeStart, now],
    syscalls: demoSyscalls,
    data,
  }
}

function generateStatsData(eventCount: number, processCount: number): StatsData {
  const topSyscalls = demoSyscalls
    .map((name) => ({ name, count: Math.floor(Math.random() * 10000) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const topProcesses = demoProcesses
    .map((name, i) => ({
      name,
      pid: 1000 + i * 100,
      count: Math.floor(Math.random() * 5000),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    totalEvents: eventCount,
    activeProcesses: processCount,
    eventsPerSecond: Math.floor(Math.random() * 500) + 50,
    alerts: Math.random() > 0.9 ? Math.floor(Math.random() * 10) : 0,
    topSyscalls,
    topProcesses,
  }
}

export function useDemoData() {
  const {
    demoMode,
    collectorStatus,
    addEvents,
    setHeatmapData,
    setProcessTree,
    setStatsData,
    setCollectorStatus,
    addSecurityAlerts,
    config,
  } = useStore()

  const eventCountRef = useRef(0)
  const processSetRef = useRef(new Set<number>())
  const lastHeatmapTimeRef = useRef(0)
  const lastProcessTreeTimeRef = useRef(0)
  const lastStatsTimeRef = useRef(0)
  const lastAlertTimeRef = useRef(0)

  const generateData = useCallback(() => {
    if (!demoMode || !collectorStatus.running) return

    const numEvents = Math.floor(Math.random() * 8) + 2
    const batch: SyscallEvent[] = []
    const alerts: SecurityAlert[] = []

    for (let i = 0; i < numEvents; i++) {
      const event = generateRandomEvent()
      batch.push(event)
      eventCountRef.current++
      processSetRef.current.add(event.pid)

      const rules = config.securityRules?.filter((r) => r.enabled) || []
      for (const rule of rules) {
        if (matchEventToRule(event, rule)) {
          const now = Date.now()
          if (now - lastAlertTimeRef.current > 3000) {
            alerts.push(generateAlert(event, rule))
            lastAlertTimeRef.current = now
          }
          break
        }
      }
    }

    addEvents(batch)

    if (alerts.length > 0) {
      addSecurityAlerts(alerts)
    }

    const now = Date.now()

    if (now - lastHeatmapTimeRef.current > 3000) {
      setHeatmapData(generateHeatmapData())
      lastHeatmapTimeRef.current = now
    }

    if (now - lastProcessTreeTimeRef.current > 5000) {
      setProcessTree(generateProcessTree())
      lastProcessTreeTimeRef.current = now
    }

    if (now - lastStatsTimeRef.current > 1000) {
      setStatsData(generateStatsData(eventCountRef.current, processSetRef.current.size))
      lastStatsTimeRef.current = now
    }

    setCollectorStatus({
      ...collectorStatus,
      eventCount: eventCountRef.current,
      connected: true,
    })
  }, [
    demoMode,
    collectorStatus,
    addEvents,
    addSecurityAlerts,
    config.securityRules,
    setHeatmapData,
    setProcessTree,
    setStatsData,
    setCollectorStatus,
  ])

  useEffect(() => {
    if (!demoMode) return

    const interval = setInterval(generateData, 200)

    return () => clearInterval(interval)
  }, [demoMode, generateData])

  const startDemo = useCallback(() => {
    eventCountRef.current = 0
    processSetRef.current.clear()
    lastHeatmapTimeRef.current = 0
    lastProcessTreeTimeRef.current = 0
    lastStatsTimeRef.current = 0
    setCollectorStatus({
      running: true,
      connected: true,
      eventCount: 0,
      startTime: Date.now(),
      error: null,
    })
    setHeatmapData(generateHeatmapData())
    setProcessTree(generateProcessTree())
    setStatsData(generateStatsData(0, 0))
  }, [setCollectorStatus, setHeatmapData, setProcessTree, setStatsData])

  const stopDemo = useCallback(() => {
    setCollectorStatus({
      running: false,
      connected: false,
      eventCount: eventCountRef.current,
      startTime: null,
      error: null,
    })
  }, [setCollectorStatus])

  return {
    startDemo,
    stopDemo,
  }
}
