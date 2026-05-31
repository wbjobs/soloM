import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import Docker from 'dockerode'
import { exec } from 'child_process'

let mainWindow: BrowserWindow | null = null

function createDockerInstance(): Docker {
  if (process.platform === 'win32') {
    return new Docker({
      socketPath: '//./pipe/docker_engine',
    })
  }

  const socketPath = process.env.DOCKER_HOST
    ? process.env.DOCKER_HOST.replace('unix://', '')
    : '/var/run/docker.sock'

  return new Docker({ socketPath })
}

const docker = createDockerInstance()

const MAX_LOG_LINES = 5000
const MAX_SINGLE_LOG_LENGTH = 10000
const LOG_BATCH_INTERVAL = 50
const MAX_BATCH_SIZE = 200

interface LogEntry {
  log: string
  isStderr: boolean
  matches?: Array<{ start: number; end: number }>
}

interface FilterConfig {
  pattern: string
  caseSensitive: boolean
}

class LogStreamManager {
  private activeStreams: Map<string, any> = new Map()
  private batchBuffers: Map<string, LogEntry[]> = new Map()
  private batchTimers: Map<string, NodeJS.Timeout> = new Map()
  private lineCounters: Map<string, number> = new Map()
  private dropCounters: Map<string, number> = new Map()
  private filterPatterns: Map<string, FilterConfig | null> = new Map()
  private compiledRegex: Map<string, RegExp | null> = new Map()
  private matchedCounts: Map<string, number> = new Map()

  setFilter(containerId: string, pattern: string, caseSensitive: boolean = false): { valid: boolean; error?: string } {
    if (!pattern) {
      this.filterPatterns.set(containerId, null)
      this.compiledRegex.set(containerId, null)
      return { valid: true }
    }

    try {
      const flags = caseSensitive ? 'g' : 'gi'
      const regex = new RegExp(pattern, flags)
      this.filterPatterns.set(containerId, { pattern, caseSensitive })
      this.compiledRegex.set(containerId, regex)
      return { valid: true }
    } catch (err: any) {
      return { valid: false, error: err.message }
    }
  }

  private findMatches(log: string, regex: RegExp | null): { filtered: boolean; matches?: Array<{ start: number; end: number }> } {
    if (!regex) {
      return { filtered: true }
    }

    const matchPositions: Array<{ start: number; end: number }> = []
    let match: RegExpExecArray | null
    let hasMatch = false

    const regexClone = new RegExp(regex.source, regex.flags)

    while ((match = regexClone.exec(log)) !== null) {
      hasMatch = true
      if (match[0].length === 0) {
        break
      }
      matchPositions.push({ start: match.index, end: match.index + match[0].length })
      if (match.index === regexClone.lastIndex) {
        regexClone.lastIndex++
      }
    }

    if (!hasMatch) {
      return { filtered: false }
    }

    return { filtered: true, matches: matchPositions }
  }

  startStream(event: Electron.IpcMainEvent, containerId: string, filterPattern?: string, caseSensitive?: boolean) {
    this.stopStream(containerId)

    const filterResult = this.setFilter(containerId, filterPattern || '', caseSensitive || false)
    if (!filterResult.valid) {
      event.reply('docker:logError', `正则表达式错误: ${filterResult.error}`)
      return
    }

    this.matchedCounts.set(containerId, 0)

    const container = docker.getContainer(containerId)
    this.lineCounters.set(containerId, 0)
    this.dropCounters.set(containerId, 0)
    this.batchBuffers.set(containerId, [])

    container.logs(
      {
        follow: true,
        stdout: true,
        stderr: true,
        stream: true,
        tail: 50,
      },
      (err, stream) => {
        if (err) {
          event.reply('docker:logError', err.message)
          return
        }

        this.activeStreams.set(containerId, stream)

        if (stream) {
          stream.on('data', (chunk: Buffer) => {
            const header = chunk.slice(0, 8)
            const isStderr = header[0] === 2
            let log = chunk.slice(8).toString('utf8')

            if (log.length > MAX_SINGLE_LOG_LENGTH) {
              log = log.substring(0, MAX_SINGLE_LOG_LENGTH) + `... [截断，原始长度: ${log.length}]`
            }

            const regex = this.compiledRegex.get(containerId) || null
            const filterResult = this.findMatches(log, regex)

            if (!filterResult.filtered) {
              return
            }

            const currentCount = this.lineCounters.get(containerId) || 0
            if (currentCount >= MAX_LOG_LINES) {
              const dropCount = this.dropCounters.get(containerId) || 0
              this.dropCounters.set(containerId, dropCount + 1)
              if (dropCount === 0 || dropCount % 100 === 0) {
                event.reply('docker:logDropped', {
                  containerId,
                  totalDropped: dropCount + 1,
                  maxLines: MAX_LOG_LINES,
                })
              }
              return
            }

            this.lineCounters.set(containerId, currentCount + 1)
            const matchedCount = this.matchedCounts.get(containerId) || 0
            this.matchedCounts.set(containerId, matchedCount + 1)

            const buffer = this.batchBuffers.get(containerId) || []
            buffer.push({ log, isStderr, matches: filterResult.matches })
            this.batchBuffers.set(containerId, buffer)

            if (buffer.length >= MAX_BATCH_SIZE) {
              this.flushBatch(event, containerId)
            } else if (!this.batchTimers.has(containerId)) {
              const timer = setTimeout(() => {
                this.flushBatch(event, containerId)
              }, LOG_BATCH_INTERVAL)
              this.batchTimers.set(containerId, timer)
            }
          })

          stream.on('error', (streamErr: Error) => {
            event.reply('docker:logError', streamErr.message)
          })

          stream.on('end', () => {
            this.flushBatch(event, containerId)
            event.reply('docker:logEnd')
          })
        }
      }
    )

    event.reply('docker:streamStarted')
  }

  private flushBatch(event: Electron.IpcMainEvent, containerId: string) {
    const timer = this.batchTimers.get(containerId)
    if (timer) {
      clearTimeout(timer)
      this.batchTimers.delete(containerId)
    }

    const buffer = this.batchBuffers.get(containerId)
    if (buffer && buffer.length > 0) {
      event.reply('docker:logBatch', { containerId, entries: buffer })
      this.batchBuffers.set(containerId, [])
    }
  }

  stopStream(containerId: string) {
    const stream = this.activeStreams.get(containerId)
    if (stream) {
      stream.destroy()
      this.activeStreams.delete(containerId)
    }

    const timer = this.batchTimers.get(containerId)
    if (timer) {
      clearTimeout(timer)
      this.batchTimers.delete(containerId)
    }

    this.batchBuffers.delete(containerId)
    this.lineCounters.delete(containerId)
    this.dropCounters.delete(containerId)
    this.filterPatterns.delete(containerId)
    this.compiledRegex.delete(containerId)
    this.matchedCounts.delete(containerId)
  }

  resetLineCount(containerId: string) {
    this.lineCounters.set(containerId, 0)
    this.dropCounters.set(containerId, 0)
  }

  getMatchedCount(containerId: string): number {
    return this.matchedCounts.get(containerId) || 0
  }

  updateFilter(containerId: string, pattern: string, caseSensitive: boolean = false): { valid: boolean; error?: string } {
    return this.setFilter(containerId, pattern, caseSensitive)
  }
}

const logManager = new LogStreamManager()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('docker:listContainers', async () => {
  try {
    const containers = await docker.listContainers({ all: false })
    return containers
  } catch (error) {
    throw error
  }
})

ipcMain.handle('docker:getContainerLogs', async (_event, containerId: string) => {
  try {
    const container = docker.getContainer(containerId)
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      timestamps: false,
      tail: 100,
    })
    return logs.toString()
  } catch (error) {
    throw error
  }
})

ipcMain.on('docker:streamLogs', (event, containerId: string, filterPattern?: string, caseSensitive?: boolean) => {
  logManager.startStream(event, containerId, filterPattern, caseSensitive)
})

ipcMain.on('docker:stopLogs', (_event, containerId?: string) => {
  if (containerId) {
    logManager.stopStream(containerId)
  } else {
    for (const id of logManager['activeStreams'].keys()) {
      logManager.stopStream(id)
    }
  }
})

ipcMain.on('docker:resetLogCount', (_event, containerId: string) => {
  logManager.resetLineCount(containerId)
})

ipcMain.handle('docker:updateFilter', (event, containerId: string, pattern: string, caseSensitive: boolean = false) => {
  const result = logManager.updateFilter(containerId, pattern, caseSensitive)
  return result
})

ipcMain.handle('docker:execCommand', async (_event, command: string) => {
  return new Promise((resolve, reject) => {
    exec(`docker ${command}`, (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
})

ipcMain.handle('docker:startContainer', async (_event, containerId: string) => {
  const container = docker.getContainer(containerId)
  await container.start()
  return { success: true }
})

ipcMain.handle('docker:stopContainer', async (_event, containerId: string) => {
  const container = docker.getContainer(containerId)
  await container.stop()
  return { success: true }
})

ipcMain.handle('docker:restartContainer', async (_event, containerId: string) => {
  const container = docker.getContainer(containerId)
  await container.restart()
  return { success: true }
})

ipcMain.handle('docker:removeContainer', async (_event, containerId: string) => {
  const container = docker.getContainer(containerId)
  await container.remove({ force: true })
  return { success: true }
})
