export interface Container {
  Id: string
  Names: string[]
  Image: string
  State: string
  Status: string
  Ports?: Port[]
  NetworkSettings?: NetworkSettings
}

export interface Port {
  IP?: string
  PrivatePort: number
  PublicPort?: number
  Type: string
}

export interface NetworkSettings {
  Networks: Record<string, Network>
}

export interface Network {
  IPAddress: string
  NetworkID: string
}

export interface ContainerStats {
  container_id: string
  container_name: string
  cpu_percent: number
  memory_usage: number
  memory_limit: number
  memory_percent: number
  network_rx: number
  network_tx: number
  timestamp: number
}

export interface MemoryHistoryPoint {
  timestamp: number
  memory_usage: number
  container_id: string
  container_name: string
}

export interface ContainerLink {
  source: string
  target: string
  link_type: string
}

export interface TopologyData {
  nodes: TopologyNode[]
  links: ContainerLink[]
}

export interface TopologyNode {
  id: string
  name: string
  cpu_percent: number
  memory_percent: number
  status: string
}

export interface LogEntry {
  timestamp: string
  message: string
  stream_type: string
}

export interface ImageLayer {
  id: string
  created: number
  created_by: string
  size: number
  comment: string
  tags: string[] | null
  parent_id: string | null
}

export interface CommandOutput {
  line: string
  stream_type: string
  is_error: boolean
}
