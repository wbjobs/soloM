import type { SimulationNodeDatum } from 'd3'

export interface ServiceNode extends SimulationNodeDatum {
  id: string
  name: string
  namespace: string
  ip: string
  port: number
  traffic: number
  status: 'healthy' | 'warning' | 'critical'
}

export interface ServiceEdge {
  source: string
  target: string
  latency: number
  latencyP50: number
  latencyP99: number
  retransmitCount: number
  retransmitRate: number
  connectionCount: number
  bandwidth: number
}

export interface TopologyData {
  nodes: ServiceNode[]
  edges: ServiceEdge[]
  timestamp: number
}

export interface LatencyMatrix {
  services: string[]
  values: LatencyCell[][]
}

export interface LatencyCell {
  source: string
  target: string
  avg: number
  p50: number
  p99: number
}

export interface TcpMetrics {
  timestamp: number
  retransmitRate: number
  connectionCount: number
  avgLatency: number
  errorRate: number
}

export interface LatencyDistribution {
  buckets: number[]
  counts: number[]
  unit: string
}

export interface ServiceHealth {
  id: string
  name: string
  status: 'healthy' | 'warning' | 'critical'
  uptime: number
  errorRate: number
  avgLatency: number
  requestRate: number
}

export interface DashboardStats {
  totalServices: number
  activeConnections: number
  avgLatency: number
  retransmitRate: number
  servicesDelta: number
  connectionsDelta: number
  latencyDelta: number
  retransmitDelta: number
}

export type WsMessageType = 'topology' | 'metrics' | 'health' | 'latency' | 'heatmap' | 'alert'

export interface WsMessage {
  type: WsMessageType
  data: unknown
  timestamp: number
}

export type AlertSeverity = 'warning' | 'critical'
export type AlertType = 'latency_spike' | 'retransmit_surge' | 'anomaly'

export interface Alert {
  id: string
  servicePair: string
  sourceService: string
  targetService: string
  type: AlertType
  severity: AlertSeverity
  message: string
  value: number
  baseline: number
  deviationPercent: number
  timestamp: number
  resolved: boolean
  ack: boolean
}

export interface WebhookConfig {
  url: string
  enabled: boolean
  headers: Record<string, string>
  secret: string
}

export type LatencyMode = 'avg' | 'p50' | 'p99'

export type TimeRange = '1m' | '5m' | '15m' | '30m' | '1h' | '6h' | '24h'
