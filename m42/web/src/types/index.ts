export interface Cluster {
  id: string
  name: string
  mode: 'cluster' | 'standalone'
  addrs: string[]
  password?: string
  status: 'online' | 'offline' | 'partial'
  createdAt: string
}

export interface ClusterNode {
  id: string
  clusterId: string
  nodeId: string
  addr: string
  role: 'master' | 'slave'
  slots?: string
  masterId?: string
  status: 'online' | 'offline' | 'fail'
  memory: number
  connectedClients: number
  latencyMs: number
}

export interface SlowlogEntry {
  id: number
  clusterId: string
  nodeAddr: string
  slowlogId: number
  command: string
  commandFingerprint: string
  durationUs: number
  timestamp: string
  args?: string
}

export interface FingerprintStat {
  fingerprint: string
  count: number
  totalDurationUs: number
  avgDurationUs: number
  maxDurationUs: number
  percentage: number
}

export interface SlowlogStats {
  totalEntries: number
  avgDurationUs: number
  maxDurationUs: number
  minDurationUs: number
}

export interface DashboardOverview {
  clusterCount: number
  onlineClusters: number
  totalNodes: number
  onlineNodes: number
  slowlogCount24h: number
  slowlogLastHour: number
}
