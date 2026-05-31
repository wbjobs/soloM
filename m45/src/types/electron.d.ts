export interface MatchPosition {
  start: number
  end: number
}

export interface LogBatchEntry {
  log: string
  isStderr: boolean
  matches?: MatchPosition[]
}

export interface DockerAPI {
  listContainers: () => Promise<any[]>
  getContainerLogs: (containerId: string) => Promise<string>
  streamLogs: (containerId: string, filterPattern?: string, caseSensitive?: boolean) => void
  stopLogs: (containerId?: string) => void
  resetLogCount: (containerId: string) => void
  updateFilter: (containerId: string, pattern: string, caseSensitive?: boolean) => Promise<{ valid: boolean; error?: string }>
  onLogBatch: (callback: (data: { containerId: string; entries: LogBatchEntry[] }) => void) => void
  onLogDropped: (callback: (data: { containerId: string; totalDropped: number; maxLines: number }) => void) => void
  onLogError: (callback: (error: string) => void) => void
  onLogEnd: (callback: () => void) => void
  onStreamStarted: (callback: () => void) => void
  removeLogListeners: () => void
  execCommand: (command: string) => Promise<{ stdout: string; stderr: string }>
  startContainer: (containerId: string) => Promise<{ success: boolean }>
  stopContainer: (containerId: string) => Promise<{ success: boolean }>
  restartContainer: (containerId: string) => Promise<{ success: boolean }>
  removeContainer: (containerId: string) => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    dockerAPI: DockerAPI
  }
}

export {}
