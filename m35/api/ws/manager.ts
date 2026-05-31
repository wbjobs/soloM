import type { WebSocket } from 'ws'
import type { WebSocketServer } from 'ws'

const subscribers = new Map<string, Set<WebSocket>>()
let wssInstance: WebSocketServer | null = null

export function initWebSocket(wss: WebSocketServer) {
  wssInstance = wss

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const taskId = url.searchParams.get('taskId')

    if (!taskId) {
      ws.close(4001, 'Missing taskId')
      return
    }

    if (!subscribers.has(taskId)) {
      subscribers.set(taskId, new Set())
    }
    subscribers.get(taskId)!.add(ws)

    ws.on('close', () => {
      const subs = subscribers.get(taskId)
      if (subs) {
        subs.delete(ws)
        if (subs.size === 0) {
          subscribers.delete(taskId)
        }
      }
    })

    ws.on('error', () => {
      const subs = subscribers.get(taskId)
      if (subs) {
        subs.delete(ws)
        if (subs.size === 0) {
          subscribers.delete(taskId)
        }
      }
    })
  })
}

export function getWss(): WebSocketServer {
  if (!wssInstance) throw new Error('WebSocket server not initialized')
  return wssInstance
}

export function broadcastToTask(taskId: string, data: object) {
  const subs = subscribers.get(taskId)
  if (!subs || subs.size === 0) return

  const message = JSON.stringify(data)
  const deadSockets: WebSocket[] = []

  for (const ws of subs) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message)
    } else if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) {
      deadSockets.push(ws)
    }
  }

  for (const ws of deadSockets) {
    subs.delete(ws)
  }
}

export function broadcastBinaryToTask(taskId: string, data: Buffer) {
  const subs = subscribers.get(taskId)
  if (!subs || subs.size === 0) return

  const deadSockets: WebSocket[] = []

  for (const ws of subs) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data)
    } else if (ws.readyState === ws.CLOSED || ws.readyState === ws.CLOSING) {
      deadSockets.push(ws)
    }
  }

  for (const ws of deadSockets) {
    subs.delete(ws)
  }
}

export function getSubscriberCount(taskId: string): number {
  return subscribers.get(taskId)?.size ?? 0
}
