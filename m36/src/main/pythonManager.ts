import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import * as fs from 'fs'
import type { AppConfig } from '@shared/types'

interface PythonManagerOptions {
  onExit: (code: number) => void
  onError: (error: Error) => void
}

export class PythonManager {
  private process: ChildProcess | null = null
  private socketPath: string
  private options: PythonManagerOptions

  constructor(socketPath: string, options: PythonManagerOptions) {
    this.socketPath = socketPath
    this.options = options
  }

  async start(config: AppConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, '../../ebpf/collector.py')
      
      if (!fs.existsSync(scriptPath)) {
        reject(new Error(`Python collector script not found at ${scriptPath}`))
        return
      }

      const args = [
        scriptPath,
        '--socket', this.socketPath,
        '--syscalls', config.monitoredSyscalls.join(','),
        '--interval', config.updateInterval.toString(),
      ]

      if (config.processWhitelist.length > 0) {
        args.push('--whitelist', config.processWhitelist.join(','))
      }

      if (config.processBlacklist.length > 0) {
        args.push('--blacklist', config.processBlacklist.join(','))
      }

      console.log('Starting Python collector with args:', args)

      this.process = spawn('python3', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
      })

      let startupError = ''
      let resolved = false

      this.process.stdout?.on('data', (data) => {
        const output = data.toString()
        console.log('[Python stdout]:', output)
        
        if (!resolved && output.includes('Collector started')) {
          resolved = true
          resolve()
        }
      })

      this.process.stderr?.on('data', (data) => {
        const output = data.toString()
        console.error('[Python stderr]:', output)
        startupError += output
      })

      this.process.on('error', (error) => {
        console.error('Python process error:', error)
        if (!resolved) {
          resolved = true
          reject(new Error(`Failed to start Python process: ${error.message}\n${startupError}`))
        } else {
          this.options.onError(error)
        }
      })

      this.process.on('exit', (code) => {
        console.log('Python process exited with code:', code)
        if (!resolved) {
          resolved = true
          reject(new Error(`Python process exited unexpectedly with code ${code}\n${startupError}`))
        } else {
          this.options.onExit(code || 0)
        }
        this.process = null
      })

      setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error(`Python collector startup timeout\n${startupError}`))
        }
      }, 10000)
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.process) {
        resolve()
        return
      }

      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL')
        }
      }, 5000)

      this.process.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.process.kill('SIGTERM')
    })
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }
}
