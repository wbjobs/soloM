import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dockerAPI', {
  listContainers: () => ipcRenderer.invoke('docker:listContainers'),
  getContainerLogs: (containerId: string) => ipcRenderer.invoke('docker:getContainerLogs', containerId),
  streamLogs: (containerId: string, filterPattern?: string, caseSensitive?: boolean) => 
    ipcRenderer.send('docker:streamLogs', containerId, filterPattern, caseSensitive),
  stopLogs: (containerId?: string) => ipcRenderer.send('docker:stopLogs', containerId),
  resetLogCount: (containerId: string) => ipcRenderer.send('docker:resetLogCount', containerId),
  updateFilter: (containerId: string, pattern: string, caseSensitive?: boolean) => 
    ipcRenderer.invoke('docker:updateFilter', containerId, pattern, caseSensitive),
  onLogBatch: (callback: (data: { containerId: string; entries: Array<{ log: string; isStderr: boolean; matches?: Array<{ start: number; end: number }> }> }) => void) => {
    ipcRenderer.on('docker:logBatch', (_event, data) => callback(data))
  },
  onLogDropped: (callback: (data: { containerId: string; totalDropped: number; maxLines: number }) => void) => {
    ipcRenderer.on('docker:logDropped', (_event, data) => callback(data))
  },
  onLogError: (callback: (error: string) => void) => {
    ipcRenderer.on('docker:logError', (_event, error) => callback(error))
  },
  onLogEnd: (callback: () => void) => {
    ipcRenderer.on('docker:logEnd', () => callback())
  },
  onStreamStarted: (callback: () => void) => {
    ipcRenderer.on('docker:streamStarted', () => callback())
  },
  removeLogListeners: () => {
    ipcRenderer.removeAllListeners('docker:logBatch')
    ipcRenderer.removeAllListeners('docker:logDropped')
    ipcRenderer.removeAllListeners('docker:logError')
    ipcRenderer.removeAllListeners('docker:logEnd')
    ipcRenderer.removeAllListeners('docker:streamStarted')
  },
  execCommand: (command: string) => ipcRenderer.invoke('docker:execCommand', command),
  startContainer: (containerId: string) => ipcRenderer.invoke('docker:startContainer', containerId),
  stopContainer: (containerId: string) => ipcRenderer.invoke('docker:stopContainer', containerId),
  restartContainer: (containerId: string) => ipcRenderer.invoke('docker:restartContainer', containerId),
  removeContainer: (containerId: string) => ipcRenderer.invoke('docker:removeContainer', containerId),
})

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
