import { useEffect, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import type {
  AppConfig,
  AuditLogEntry,
  CollectorStatus,
  HeatmapData,
  ProcessNode,
  SecurityAlert,
  StatsData,
  SyscallEvent,
} from '@shared/types'

declare global {
  interface Window {
    electronAPI?: {
      ipcRenderer: {
        on: (channel: string, callback: (...args: any[]) => void) => void
        invoke: (channel: string, ...args: any[]) => Promise<any>
        removeListener: (channel: string, callback: (...args: any[]) => void) => void
      }
    }
  }
}

const hasElectron = typeof window !== 'undefined' && window.electronAPI

export function useIpc() {
  const {
    setConfig,
    setCollectorStatus,
    addEvents,
    setHeatmapData,
    setProcessTree,
    setStatsData,
    setError,
    setDropStats,
    clearData,
    addSecurityAlerts,
  } = useStore()

  const startCollector = useCallback(async (config: AppConfig): Promise<boolean> => {
    if (!hasElectron) {
      console.warn('Electron not available, running in demo mode')
      return false
    }
    try {
      clearData()
      return await window.electronAPI!.ipcRenderer.invoke('collector:start', config)
    } catch (error) {
      setError(String(error))
      return false
    }
  }, [clearData, setError])

  const stopCollector = useCallback(async (): Promise<boolean> => {
    if (!hasElectron) return false
    try {
      return await window.electronAPI!.ipcRenderer.invoke('collector:stop')
    } catch (error) {
      setError(String(error))
      return false
    }
  }, [setError])

  const getCollectorStatus = useCallback(async (): Promise<CollectorStatus | null> => {
    if (!hasElectron) return null
    try {
      return await window.electronAPI!.ipcRenderer.invoke('collector:status')
    } catch (error) {
      setError(String(error))
      return null
    }
  }, [setError])

  const getConfig = useCallback(async (): Promise<AppConfig | null> => {
    if (!hasElectron) return null
    try {
      return await window.electronAPI!.ipcRenderer.invoke('config:get')
    } catch (error) {
      setError(String(error))
      return null
    }
  }, [setError])

  const setConfigIpc = useCallback(async (config: AppConfig): Promise<boolean> => {
    if (!hasElectron) return false
    try {
      const result = await window.electronAPI!.ipcRenderer.invoke('config:set', config)
      if (result) {
        setConfig(config)
      }
      return result
    } catch (error) {
      setError(String(error))
      return false
    }
  }, [setConfig, setError])

  const exportData = useCallback(async (options: { format: 'json' | 'csv' }): Promise<string> => {
    if (!hasElectron) throw new Error('Electron not available')
    return await window.electronAPI!.ipcRenderer.invoke('data:export', options)
  }, [])

  const getAuditLogs = useCallback(async (options?: any): Promise<AuditLogEntry[]> => {
    if (!hasElectron) return []
    try {
      return await window.electronAPI!.ipcRenderer.invoke('audit:getLogs', options || {})
    } catch (error) {
      setError(String(error))
      return []
    }
  }, [setError])

  const getAuditStats = useCallback(async (): Promise<any | null> => {
    if (!hasElectron) return null
    try {
      return await window.electronAPI!.ipcRenderer.invoke('audit:getStats')
    } catch (error) {
      setError(String(error))
      return null
    }
  }, [setError])

  const acknowledgeAlert = useCallback(async (alertId: string): Promise<boolean> => {
    if (!hasElectron) return false
    try {
      return await window.electronAPI!.ipcRenderer.invoke('audit:acknowledgeAlert', alertId)
    } catch (error) {
      setError(String(error))
      return false
    }
  }, [setError])

  const acknowledgeAllAlerts = useCallback(async (): Promise<boolean> => {
    if (!hasElectron) return false
    try {
      return await window.electronAPI!.ipcRenderer.invoke('audit:acknowledgeAllAlerts')
    } catch (error) {
      setError(String(error))
      return false
    }
  }, [setError])

  useEffect(() => {
    if (!hasElectron) return

    const handleSyscallEvent = (_event: any, data: SyscallEvent) => {
      addEvents([data])
    }

    const handleSyscallBatch = (_event: any, data: SyscallEvent[]) => {
      addEvents(data)
    }

    const handleHeatmapUpdate = (_event: any, data: HeatmapData) => {
      setHeatmapData(data)
    }

    const handleProcessTreeUpdate = (_event: any, data: ProcessNode) => {
      setProcessTree(data)
    }

    const handleStatsUpdate = (_event: any, data: StatsData) => {
      setStatsData(data)
    }

    const handleCollectorStatus = (_event: any, data: CollectorStatus) => {
      setCollectorStatus(data)
    }

    const handleCollectorError = (_event: any, data: string) => {
      setError(data)
    }

    const handleCollectorDropped = (_event: any, data: { kernel: number; backpressure: number; rateLimited: number; bufferSize: number }) => {
      setDropStats(data)
    }

    const handleSecurityAlerts = (_event: any, data: SecurityAlert[]) => {
      addSecurityAlerts(data)
    }

    const { ipcRenderer } = window.electronAPI!

    ipcRenderer.on('syscall:event', handleSyscallEvent)
    ipcRenderer.on('syscall:batch', handleSyscallBatch)
    ipcRenderer.on('heatmap:update', handleHeatmapUpdate)
    ipcRenderer.on('processtree:update', handleProcessTreeUpdate)
    ipcRenderer.on('stats:update', handleStatsUpdate)
    ipcRenderer.on('collector:status', handleCollectorStatus)
    ipcRenderer.on('collector:error', handleCollectorError)
    ipcRenderer.on('collector:dropped', handleCollectorDropped)
    ipcRenderer.on('security:alerts', handleSecurityAlerts)

    getConfig().then((config) => {
      if (config) {
        setConfig(config)
      }
    })

    getCollectorStatus().then((status) => {
      if (status) {
        setCollectorStatus(status)
      }
    })

    return () => {
      ipcRenderer.removeListener('syscall:event', handleSyscallEvent)
      ipcRenderer.removeListener('syscall:batch', handleSyscallBatch)
      ipcRenderer.removeListener('heatmap:update', handleHeatmapUpdate)
      ipcRenderer.removeListener('processtree:update', handleProcessTreeUpdate)
      ipcRenderer.removeListener('stats:update', handleStatsUpdate)
      ipcRenderer.removeListener('collector:status', handleCollectorStatus)
      ipcRenderer.removeListener('collector:error', handleCollectorError)
      ipcRenderer.removeListener('collector:dropped', handleCollectorDropped)
      ipcRenderer.removeListener('security:alerts', handleSecurityAlerts)
    }
  }, [
    addEvents,
    addSecurityAlerts,
    getConfig,
    getCollectorStatus,
    setCollectorStatus,
    setConfig,
    setError,
    setDropStats,
    setHeatmapData,
    setProcessTree,
    setStatsData,
  ])

  return {
    startCollector,
    stopCollector,
    getCollectorStatus,
    getConfig,
    setConfig: setConfigIpc,
    exportData,
    hasElectron,
    getAuditLogs,
    getAuditStats,
    acknowledgeAlert,
    acknowledgeAllAlerts,
  }
}
