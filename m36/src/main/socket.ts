import * as net from 'net'
import * as fs from 'fs'

interface SocketServerOptions {
  onMessage: (message: any) => void
  onConnect: () => void
  onDisconnect: () => void
  onError: (error: Error) => void
}

export function createSocketServer(socketPath: string, options: SocketServerOptions) {
  let server: net.Server | null = null
  let client: net.Socket | null = null
  let buffer = ''

  function cleanupSocketFile() {
    if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
      try {
        fs.unlinkSync(socketPath)
      } catch (e) {
        console.warn('Failed to clean up socket file:', e)
      }
    }
  }

  function parseBuffer() {
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)

      if (line.trim()) {
        try {
          const message = JSON.parse(line)
          options.onMessage(message)
        } catch (e) {
          console.error('Failed to parse message:', line, e)
        }
      }
    }
  }

  async function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      cleanupSocketFile()

      server = net.createServer((socket) => {
        if (client) {
          socket.end(JSON.stringify({ type: 'error', data: 'Another client already connected' }))
          return
        }

        client = socket
        options.onConnect()

        socket.on('data', (data) => {
          buffer += data.toString()
          parseBuffer()
        })

        socket.on('end', () => {
          client = null
          buffer = ''
          options.onDisconnect()
        })

        socket.on('error', (error) => {
          options.onError(error)
        })
      })

      server.on('error', (error) => {
        options.onError(error)
        reject(error)
      })

      if (process.platform === 'win32') {
        server.listen(socketPath, () => {
          console.log('Windows named pipe server listening on', socketPath)
          resolve()
        })
      } else {
        server.listen(socketPath, () => {
          console.log('Unix socket server listening on', socketPath)
          fs.chmodSync(socketPath, 0o600)
          resolve()
        })
      }
    })
  }

  async function stop(): Promise<void> {
    return new Promise((resolve) => {
      if (client) {
        client.end()
        client = null
      }

      if (server) {
        server.close(() => {
          server = null
          cleanupSocketFile()
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  function send(message: any): boolean {
    if (!client || client.writableEnded) {
      return false
    }

    try {
      const data = JSON.stringify(message) + '\n'
      client.write(data)
      return true
    } catch (e) {
      console.error('Failed to send message:', e)
      return false
    }
  }

  return {
    start,
    stop,
    send,
  }
}
