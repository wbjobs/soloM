export interface SyscallEvent {
  timestamp: number
  syscall: string
  pid: number
  ppid: number
  comm: string
  uid: number
  gid: number
  args: Record<string, any>
  retval: number
  duration: number
}

export interface ProcessNode {
  pid: number
  ppid: number
  name: string
  cmdline: string
  startTime: number
  children: ProcessNode[]
  syscallCount: Record<string, number>
  totalSyscalls: number
}

export interface HeatmapDataPoint {
  timeBucket: number
  syscall: string
  count: number
  avgDuration: number
}

export interface HeatmapData {
  timeRange: [number, number]
  syscalls: string[]
  data: HeatmapDataPoint[]
}

export type RuleOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'notIn' | 'regex'

export interface RuleCondition {
  field: 'syscall' | 'uid' | 'gid' | 'pid' | 'ppid' | 'comm' | 'args.arg0' | 'args.arg1' | 'args.arg2' | 'args.arg3'
  operator: RuleOperator
  value: string | number | string[] | number[]
}

export interface SecurityRule {
  id: string
  name: string
  description: string
  enabled: boolean
  severity: 'low' | 'medium' | 'high' | 'critical'
  conditions: RuleCondition[]
  operator: 'AND' | 'OR'
  action: {
    alert: boolean
    block: boolean
    log: boolean
  }
  createdAt: number
}

export interface SecurityAlert {
  id: string
  ruleId: string
  ruleName: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  event: SyscallEvent
  timestamp: number
  message: string
}

export interface AuditLogEntry {
  id: string
  event: SyscallEvent
  ruleId: string | null
  ruleName: string | null
  severity: 'low' | 'medium' | 'high' | 'critical' | null
  alertTriggered: boolean
  timestamp: number
}

export interface AppConfig {
  monitoredSyscalls: string[]
  processWhitelist: string[]
  processBlacklist: string[]
  updateInterval: number
  heatmapTimeWindow: number
  maxLogEntries: number
  autoStart: boolean
  sampleRate: number
  maxEventsPerSecond: number
  maxPendingEvents: number
  securityRules: SecurityRule[]
}

export interface StatsData {
  totalEvents: number
  activeProcesses: number
  eventsPerSecond: number
  alerts: number
  topSyscalls: { name: string; count: number }[]
  topProcesses: { name: string; pid: number; count: number }[]
}

export interface CollectorStatus {
  running: boolean
  connected: boolean
  eventCount: number
  startTime: number | null
  error: string | null
}

export type SocketMessageType = 'handshake' | 'event' | 'batch' | 'status' | 'config' | 'error'

export interface SocketMessage<T = any> {
  type: SocketMessageType
  data: T
  timestamp: number
}

export const DEFAULT_CONFIG: AppConfig = {
  monitoredSyscalls: ['open', 'openat', 'execve', 'execveat', 'read', 'write', 'close', 'fork', 'vfork', 'clone'],
  processWhitelist: [],
  processBlacklist: [],
  updateInterval: 1000,
  heatmapTimeWindow: 300,
  maxLogEntries: 5000,
  autoStart: true,
  sampleRate: 1,
  maxEventsPerSecond: 10000,
  maxPendingEvents: 5000,
  securityRules: [
    {
      id: 'rule-1',
      name: '禁止非 root 用户调用 bash',
      description: '检测非 root 用户执行 /bin/bash 或 bash 进程',
      enabled: true,
      severity: 'high',
      conditions: [
        { field: 'syscall', operator: 'in', value: ['execve', 'execveat'] },
        { field: 'comm', operator: 'contains', value: 'bash' },
        { field: 'uid', operator: 'ne', value: 0 },
      ],
      operator: 'AND',
      action: { alert: true, block: false, log: true },
      createdAt: Date.now(),
    },
    {
      id: 'rule-2',
      name: '检测敏感文件访问',
      description: '检测对 /etc/shadow 等敏感文件的读取操作',
      enabled: true,
      severity: 'critical',
      conditions: [
        { field: 'syscall', operator: 'in', value: ['open', 'openat', 'read'] },
        { field: 'uid', operator: 'ne', value: 0 },
      ],
      operator: 'AND',
      action: { alert: true, block: false, log: true },
      createdAt: Date.now(),
    },
    {
      id: 'rule-3',
      name: '检测高权限进程创建',
      description: '检测 root 用户创建新进程',
      enabled: false,
      severity: 'medium',
      conditions: [
        { field: 'syscall', operator: 'in', value: ['fork', 'clone', 'vfork'] },
        { field: 'uid', operator: 'eq', value: 0 },
      ],
      operator: 'AND',
      action: { alert: false, block: false, log: true },
      createdAt: Date.now(),
    },
  ],
}

export const SYSCALL_COLORS: Record<string, string> = {
  open: '#00f5d4',
  openat: '#00e5c4',
  execve: '#ff4757',
  execveat: '#ff6b7a',
  read: '#1e90ff',
  write: '#ffa502',
  close: '#a55eea',
  fork: '#2ed573',
  vfork: '#26c266',
  clone: '#20a858',
  default: '#6c757d',
}
