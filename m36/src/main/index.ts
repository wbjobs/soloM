import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { createSocketServer } from './socket'
import { PythonManager } from './pythonManager'
import { DataAggregator } from './dataAggregator'
import { setupIpcHandlers } from './ipcHandlers'
import { ruleEngine } from './ruleEngine'
import {
  initAuditDatabase,
  closeAuditDatabase,
  queryAuditLogs,
  getAuditStats,
  acknowledgeAlert,
  acknowledgeAllAlerts,
  cleanupOldAuditLogs,
  type AuditLogQueryOptions,
} from './auditDatabase'
import type { AppConfig, CollectorStatus, SecurityAlert, SyscallEvent } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'

let mainWindow: BrowserWindow | null = null
let socketServer: ReturnType<typeof createSocketServer> | null = null
let pythonManager: PythonManager | null = null
let dataAggregator: DataAggregator | null = null
let currentConfig: AppConfig = DEFAULT_CONFIG
let isCollectorRunning = false

let lastRendererPushTime = 0
const RENDERER_PUSH_INTERVAL = 100
let pendingRendererBatch: SyscallEvent[] = []
let rendererPushTimer: NodeJS.Timeout | null = null

const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\ebpf-auditor-pipe'
  : path.join(app.getPath('temp'), 'ebpf-auditor.sock')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#0a0e17',
    titleBarStyle: 'hiddenInset',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function pushEventsToRenderer(events: SyscallEvent[]) {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (events.length === 0) return

  pendingRendererBatch.push(...events)

  if (pendingRendererBatch.length >= 200) {
    flushRendererBatch()
    return
  }

  if (!rendererPushTimer) {
    rendererPushTimer = setTimeout(() => {
      flushRendererBatch()
    }, RENDERER_PUSH_INTERVAL)
  }
}

function flushRendererBatch() {
  if (rendererPushTimer) {
    clearTimeout(rendererPushTimer)
    rendererPushTimer = null
  }

  if (pendingRendererBatch.length === 0) return

  const batch = pendingRendererBatch.splice(0, pendingRendererBatch.length)

  if (!mainWindow || mainWindow.isDestroyed()) return

  try {
    mainWindow.webContents.send('syscall:batch', batch)
  } catch {
    pendingRendererBatch.unshift(...batch)
  }
}

async function startCollector(config: AppConfig): Promise<boolean> {
  try {
    if (isCollectorRunning) {
      return true
    }

    currentConfig = config

    if (!socketServer) {
      socketServer = createSocketServer(SOCKET_PATH, {
        onMessage: handleSocketMessage,
        onConnect: handleSocketConnect,
        onDisconnect: handleSocketDisconnect,
        onError: handleSocketError,
      })
      await socketServer.start()
    }

    if (!pythonManager) {
      pythonManager = new PythonManager(SOCKET_PATH, {
        onExit: handlePythonExit,
        onError: handlePythonError,
      })
    }

    if (!dataAggregator) {
      dataAggregator = new DataAggregator({
        onHeatmapUpdate: (data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('heatmap:update', data)
          }
        },
        onProcessTreeUpdate: (data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('processtree:update', data)
          }
        },
        onStatsUpdate: (data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('stats:update', data)
          }
        },
        onBatchEvents: (events) => {
          pushEventsToRenderer(events)
        },
        config: currentConfig,
      })
    } else {
      dataAggregator.updateConfig(currentConfig)
    }

    ruleEngine.setRules(currentConfig.securityRules || [])

    await pythonManager.start(currentConfig)
    isCollectorRunning = true

    sendCollectorStatus()
    return true
  } catch (error) {
    console.error('Failed to start collector:', error)
    isCollectorRunning = false
    sendCollectorStatus()
    return false
  }
}

async function stopCollector(): Promise<boolean> {
  try {
    isCollectorRunning = false

    flushRendererBatch()

    if (pythonManager) {
      await pythonManager.stop()
      pythonManager = null
    }

    if (socketServer) {
      await socketServer.stop()
      socketServer = null
    }

    if (dataAggregator) {
      dataAggregator.stop()
      dataAggregator = null
    }

    sendCollectorStatus()
    return true
  } catch (error) {
    console.error('Failed to stop collector:', error)
    return false
  }
}

function handleSocketMessage(message: any) {
  if (!dataAggregator) return

  switch (message.type) {
    case 'handshake':
      console.log('Python collector connected:', message.data)
      sendCollectorStatus()
      break

    case 'event': {
      const event = message.data as SyscallEvent
      dataAggregator.addEvent(event)
      checkRulesAndEmitAlerts([event])
      break
    }

    case 'batch': {
      const events = message.data as SyscallEvent[]
      dataAggregator.addEvents(events)
      checkRulesAndEmitAlerts(events)
      break
    }

    case 'dropped_alert': {
      const dropInfo = message.data
      if (dropInfo.kernel_dropped > 0) {
        dataAggregator.recordDropped(dropInfo.kernel_dropped, 'kernel')
      }
      if (dropInfo.backpressure_dropped > 0) {
        dataAggregator.recordDropped(dropInfo.backpressure_dropped, 'backpressure')
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('collector:dropped', {
          kernel: dropInfo.total_kernel_dropped || 0,
          backpressure: dropInfo.backpressure_dropped || 0,
          rateLimited: dropInfo.rate_limited_dropped || 0,
          bufferSize: dropInfo.buffer_size || 0,
        })
      }
      break
    }

    case 'status':
      console.log('Collector status:', message.data)
      break

    case 'error':
      console.error('Collector error:', message.data)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('collector:error', message.data)
      }
      break
  }
}

function handleSocketConnect() {
  console.log('Python collector connected via socket')
  sendCollectorStatus()
}

function handleSocketDisconnect() {
  console.log('Python collector disconnected')
  sendCollectorStatus()
}

function handleSocketError(error: Error) {
  console.error('Socket error:', error)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('collector:error', error.message)
  }
}

function checkRulesAndEmitAlerts(events: SyscallEvent[]): void {
  const allAlerts: SecurityAlert[] = []

  for (const event of events) {
    const result = ruleEngine.processEvent(event)
    if (result.matched) {
      allAlerts.push(...result.alerts)
    }
  }

  if (allAlerts.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('security:alerts', allAlerts)
  }
}

function handlePythonExit(code: number) {
  console.log('Python process exited with code:', code)
  isCollectorRunning = false
  sendCollectorStatus()
}

function handlePythonError(error: Error) {
  console.error('Python process error:', error)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('collector:error', error.message)
  }
}

function getCollectorStatus(): CollectorStatus {
  const dropStats = dataAggregator?.getDropStats()
  return {
    running: isCollectorRunning,
    connected: pythonManager?.isRunning() || false,
    eventCount: dataAggregator?.getEventCount() || 0,
    startTime: dataAggregator?.getStartTime() || null,
    error: (dropStats && dropStats.totalDropped > 0)
      ? `数据丢失: 内核 ${dropStats.kernelDropped} / 总计 ${dropStats.totalDropped}`
      : null,
  }
}

function sendCollectorStatus() {
  const status = getCollectorStatus()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('collector:status', status)
  }
}

function exportData(options: any): string {
  if (!dataAggregator) {
    throw new Error('Collector not running')
  }
  return dataAggregator.exportData(options)
}

app.whenReady().then(() => {
  initAuditDatabase()
  ruleEngine.setRules(currentConfig.securityRules || [])

  createWindow()
  setupIpcHandlers(ipcMain, {
    startCollector,
    stopCollector,
    getConfig: () => currentConfig,
    setConfig: (config: AppConfig) => {
      currentConfig = config
      ruleEngine.setRules(config.securityRules || [])
      return true
    },
    getCollectorStatus,
    exportData,
  })

  ipcMain.handle('audit:getLogs', (_event, options: AuditLogQueryOptions) => {
    return queryAuditLogs(options)
  })

  ipcMain.handle('audit:getStats', () => {
    return getAuditStats()
  })

  ipcMain.handle('audit:acknowledgeAlert', (_event, alertId: string) => {
    acknowledgeAlert(alertId)
    return true
  })

  ipcMain.handle('audit:acknowledgeAllAlerts', () => {
    acknowledgeAllAlerts()
    return true
  })

  ipcMain.handle('audit:cleanupOldLogs', (_event, maxAgeDays: number) => {
    return cleanupOldAuditLogs(maxAgeDays)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  await stopCollector()
  closeAuditDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  await stopCollector()
  closeAuditDatabase()
})
