import { ref, readonly } from 'vue'
import type { WsMessageType } from '@/types'

type MessageHandler = (data: unknown) => void

const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`

let ws: WebSocket | null = null
const connected = ref(false)
const reconnectAttempts = ref(0)
const maxReconnectAttempts = 10
const reconnectDelay = 3000
const heartbeatInterval = 30000

let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
const handlers = new Map<WsMessageType, Set<MessageHandler>>()

function clearTimers() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }))
    }
  }, heartbeatInterval)
}

function handleMessage(event: MessageEvent) {
  try {
    const msg = JSON.parse(event.data) as { type?: string; data?: unknown }
    if (msg.type === 'pong') return
    if (msg.type && handlers.has(msg.type as WsMessageType)) {
      const typeHandlers = handlers.get(msg.type as WsMessageType)
      if (typeHandlers) {
        typeHandlers.forEach(handler => handler(msg.data))
      }
    }
  } catch {
    // ignore parse errors
  }
}

function connect() {
  clearTimers()
  if (ws) {
    ws.close()
    ws = null
  }

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    connected.value = true
    reconnectAttempts.value = 0
    startHeartbeat()
  }

  ws.onclose = () => {
    connected.value = false
    clearTimers()
    if (reconnectAttempts.value < maxReconnectAttempts) {
      const delay = reconnectDelay * Math.pow(1.5, reconnectAttempts.value)
      reconnectTimer = setTimeout(() => {
        reconnectAttempts.value++
        connect()
      }, Math.min(delay, 30000))
    }
  }

  ws.onerror = () => {
    ws?.close()
  }

  ws.onmessage = handleMessage
}

function disconnect() {
  clearTimers()
  reconnectAttempts.value = maxReconnectAttempts
  if (ws) {
    ws.close()
    ws = null
  }
  connected.value = false
}

function on(type: WsMessageType, handler: MessageHandler) {
  if (!handlers.has(type)) {
    handlers.set(type, new Set())
  }
  handlers.get(type)!.add(handler)
}

function off(type: WsMessageType, handler: MessageHandler) {
  const typeHandlers = handlers.get(type)
  if (typeHandlers) {
    typeHandlers.delete(handler)
    if (typeHandlers.size === 0) {
      handlers.delete(type)
    }
  }
}

function send(data: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

export function useWebSocket() {
  return {
    connected: readonly(connected),
    reconnectAttempts: readonly(reconnectAttempts),
    connect,
    disconnect,
    on,
    off,
    send
  }
}
