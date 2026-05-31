import { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, powerMonitor, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import si from 'systeminformation'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface RecordedSample {
  timestamp: number
  cpuUsage: number
  cpuTemperature: number
  memoryPercentage: number
  memoryUsed: number
  memoryTotal: number
  diskRead: number
  diskWrite: number
  networkUpload: number
  networkDownload: number
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let dataInterval: NodeJS.Timeout | null = null
let lastNetworkStats: any = null
let lastDiskStats: any = null
let cpuAlertThreshold = 90
let alertCooldown = false
let isWindowVisible = true
const FOREGROUND_INTERVAL = 1000
const BACKGROUND_INTERVAL = 5000

const RECORDING_DURATION_MS = 5 * 60 * 1000
let recordingBuffer: RecordedSample[] = []
let isRecording = false

const clearDataInterval = () => {
  if (dataInterval) {
    clearInterval(dataInterval)
    dataInterval = null
  }
}

const updateDataInterval = () => {
  clearDataInterval()
  const interval = isWindowVisible ? FOREGROUND_INTERVAL : BACKGROUND_INTERVAL
  
  dataInterval = setInterval(async () => {
    const data = await getSystemData()
    if (data) {
      if (isRecording) {
        pushRecordingSample(data)
      }
      if (mainWindow && isWindowVisible) {
        mainWindow.webContents.send('system-data', data)
      }
    }
  }, interval)
}

const pushRecordingSample = (data: any) => {
  const sample: RecordedSample = {
    timestamp: data.timestamp,
    cpuUsage: data.cpu.usage,
    cpuTemperature: data.cpu.temperature,
    memoryPercentage: data.memory.percentage,
    memoryUsed: data.memory.used,
    memoryTotal: data.memory.total,
    diskRead: data.disk.read,
    diskWrite: data.disk.write,
    networkUpload: data.network.upload,
    networkDownload: data.network.download,
  }
  recordingBuffer.push(sample)
  const cutoff = Date.now() - RECORDING_DURATION_MS
  while (recordingBuffer.length > 0 && recordingBuffer[0].timestamp < cutoff) {
    recordingBuffer.shift()
  }
}

const generateTraceEvents = (samples: RecordedSample[]): object[] => {
  const events: object[] = []

  for (const s of samples) {
    const tsUs = s.timestamp * 1000

    events.push({
      name: 'CPU Usage',
      cat: 'cpu',
      ph: 'C',
      ts: tsUs,
      pid: 1,
      tid: 1,
      args: { usage: s.cpuUsage, temperature: s.cpuTemperature },
    })

    events.push({
      name: 'Memory',
      cat: 'memory',
      ph: 'C',
      ts: tsUs,
      pid: 1,
      tid: 2,
      args: { percentage: s.memoryPercentage, used: s.memoryUsed },
    })

    events.push({
      name: 'Disk I/O',
      cat: 'disk',
      ph: 'C',
      ts: tsUs,
      pid: 1,
      tid: 3,
      args: { read: s.diskRead, write: s.diskWrite },
    })

    events.push({
      name: 'Network',
      cat: 'network',
      ph: 'C',
      ts: tsUs,
      pid: 1,
      tid: 4,
      args: { upload: s.networkUpload, download: s.networkDownload },
    })
  }

  return events
}

const exportTraceFile = async (): Promise<{ success: boolean; path?: string; error?: string }> => {
  if (recordingBuffer.length === 0) {
    return { success: false, error: '没有可导出的录制数据' }
  }

  const traceData = {
    traceEvents: generateTraceEvents(recordingBuffer),
    displayTimeUnit: 'ms',
    metadata: {
      product: 'System Monitor',
      description: 'System resource trace recorded by System Monitor',
      recordedAt: new Date().toISOString(),
      sampleCount: recordingBuffer.length,
      duration: `${((recordingBuffer[recordingBuffer.length - 1].timestamp - recordingBuffer[0].timestamp) / 1000).toFixed(1)}s`,
    },
  }

  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: '导出 Trace 文件',
      defaultPath: `system-monitor-${new Date().toISOString().replace(/[:.]/g, '-')}.trace`,
      filters: [
        { name: 'Chrome Trace Files', extensions: ['trace'] },
        { name: 'JSON Files', extensions: ['json'] },
      ],
    })

    if (canceled || !filePath) {
      return { success: false, error: '用户取消了导出' }
    }

    fs.writeFileSync(filePath, JSON.stringify(traceData, null, 0), 'utf-8')
    return { success: true, path: filePath }
  } catch (error: any) {
    return { success: false, error: error.message || '导出失败' }
  }
}

const getMacCpuTemperature = async (): Promise<number> => {
  try {
    const { stdout } = await execAsync('powermetrics --samplers smc -i1 -n1 2>/dev/null | grep -i "cpu die temperature"', { timeout: 2000 })
    const match = stdout.match(/(\d+\.?\d*)/)
    if (match) {
      return parseFloat(match[1])
    }
  } catch {
    try {
      const { stdout } = await execAsync('sysctl machdep.xcpm.cpu_thermal_level 2>/dev/null', { timeout: 1000 })
      const match = stdout.match(/(\d+)/)
      if (match) {
        return parseInt(match[1])
      }
    } catch {
    }
  }
  return 0
}

const getCpuTemperature = async (): Promise<number> => {
  try {
    const cpuTemp = await si.cpuTemperature()
    if (cpuTemp.main && cpuTemp.main > 0) {
      return cpuTemp.main
    }
    
    if (process.platform === 'darwin') {
      return await getMacCpuTemperature()
    }
    
    return 0
  } catch {
    if (process.platform === 'darwin') {
      return await getMacCpuTemperature()
    }
    return 0
  }
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f172a',
    frame: true,
    title: 'System Monitor',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('show', () => {
    isWindowVisible = true
    updateDataInterval()
  })

  mainWindow.on('hide', () => {
    isWindowVisible = false
    updateDataInterval()
    lastNetworkStats = null
    lastDiskStats = null
  })

  mainWindow.on('minimize', (e) => {
    e.preventDefault()
    mainWindow?.hide()
  })
}

const createTray = () => {
  const iconSize = process.platform === 'win32' ? 16 : 22
  const icon = nativeImage.createFromPath(path.join(__dirname, '../public/tray-icon.png'))
  
  if (icon.isEmpty()) {
    const fallbackIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5gMVESkqC5IG+AAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAAAUSURBVDjLY2AYBaNgFIyCUTAKRsEAAH0AAd5xTn4AAAAASUVORK5CYII='
    )
    tray = new Tray(fallbackIcon.resize({ width: iconSize, height: iconSize }))
  } else {
    tray = new Tray(icon.resize({ width: iconSize, height: iconSize }))
  }
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开监控面板',
      click: () => {
        mainWindow?.show()
      },
    },
    {
      type: 'separator',
    },
    {
      label: '退出',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setToolTip('System Monitor')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
    }
  })
}

const formatBytes = (bytes: number): number => {
  return Math.round(bytes / 1024 / 1024 * 100) / 100
}

const getSystemData = async () => {
  try {
    const [cpuLoad, mem, processes, networkStats, diskStats] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.processes(),
      si.networkStats(),
      si.disksIO(),
    ])

    const cpuTemperature = await getCpuTemperature()
    const cpuUsage = Math.round(cpuLoad.currentLoad)

    let upload = 0
    let download = 0
    if (lastNetworkStats && networkStats.length > 0) {
      const timeDiff = (Date.now() - lastNetworkStats.time) / 1000
      upload = Math.max(0, (networkStats[0].tx_sec - lastNetworkStats.tx) / timeDiff)
      download = Math.max(0, (networkStats[0].rx_sec - lastNetworkStats.rx) / timeDiff)
    }
    if (networkStats.length > 0) {
      lastNetworkStats = {
        tx: networkStats[0].tx_sec,
        rx: networkStats[0].rx_sec,
        time: Date.now(),
      }
    }

    let diskRead = 0
    let diskWrite = 0
    if (lastDiskStats) {
      const timeDiff = (Date.now() - lastDiskStats.time) / 1000
      diskRead = Math.max(0, (diskStats.rIO - lastDiskStats.rIO) / timeDiff)
      diskWrite = Math.max(0, (diskStats.wIO - lastDiskStats.wIO) / timeDiff)
    }
    lastDiskStats = {
      rIO: diskStats.rIO,
      wIO: diskStats.wIO,
      time: Date.now(),
    }

    const topProcesses = processes.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 15)
      .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 10) / 10,
        memory: Math.round(p.mem * 10) / 10,
      }))

    if (cpuUsage > cpuAlertThreshold && !alertCooldown) {
      showAlert('CPU 占用过高', `当前 CPU 使用率: ${cpuUsage}%`)
      alertCooldown = true
      setTimeout(() => {
        alertCooldown = false
      }, 30000)
    }

    return {
      cpu: {
        usage: cpuUsage,
        temperature: Math.round(cpuTemperature),
        cores: cpuLoad.cpus.length,
      },
      memory: {
        used: formatBytes(mem.used),
        total: formatBytes(mem.total),
        percentage: Math.round((mem.used / mem.total) * 100),
      },
      disk: {
        read: Math.round(diskRead),
        write: Math.round(diskWrite),
      },
      network: {
        upload: formatBytes(upload),
        download: formatBytes(download),
      },
      processes: topProcesses,
      timestamp: Date.now(),
    }
  } catch (error) {
    console.error('Error fetching system data:', error)
    return null
  }
}

const showAlert = (title: string, message: string) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body: message,
      urgency: 'critical',
    })
    notification.show()
  }
  if (tray && process.platform === 'win32') {
    tray.displayBalloon({
      title,
      content: message,
    })
  }
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  updateDataInterval()

  powerMonitor.on('suspend', () => {
    clearDataInterval()
  })

  powerMonitor.on('resume', () => {
    lastNetworkStats = null
    lastDiskStats = null
    updateDataInterval()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  clearDataInterval()
  lastNetworkStats = null
  lastDiskStats = null
  recordingBuffer = []
})

app.on('quit', () => {
  clearDataInterval()
})

ipcMain.handle('get-system-data', async () => {
  return await getSystemData()
})

ipcMain.handle('set-alert-threshold', (_, threshold: number) => {
  cpuAlertThreshold = threshold
  return true
})

ipcMain.handle('start-recording', () => {
  isRecording = true
  recordingBuffer = []
  return { success: true, maxDurationMs: RECORDING_DURATION_MS }
})

ipcMain.handle('stop-recording', () => {
  isRecording = false
  return { success: true, sampleCount: recordingBuffer.length }
})

ipcMain.handle('get-recording-state', () => {
  return {
    isRecording,
    sampleCount: recordingBuffer.length,
    bufferDurationMs: recordingBuffer.length > 1
      ? recordingBuffer[recordingBuffer.length - 1].timestamp - recordingBuffer[0].timestamp
      : 0,
    maxDurationMs: RECORDING_DURATION_MS,
  }
})

ipcMain.handle('export-trace', async () => {
  return await exportTraceFile()
})
