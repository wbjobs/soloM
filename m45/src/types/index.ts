export interface ContainerInfo {
  Id: string
  Names: string[]
  Image: string
  State: string
  Status: string
  Ports: Array<{
    IP?: string
    PrivatePort: number
    PublicPort?: number
    Type: string
  }>
  Created: number
}

export interface MatchPosition {
  start: number
  end: number
}

export interface LogEntry {
  id: string
  message: string
  isStderr: boolean
  timestamp: number
  matches?: MatchPosition[]
}
