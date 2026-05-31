import { ref } from 'vue'

class WebSocketClient {
  constructor() {
    this.ws = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 1000
    this.isConnected = ref(false)
    this.flameData = ref(null)
    this.heatmapData = ref([])
    this.metrics = ref({ received: 0, processed: 0, dropped: 0, ringbufLost: 0 })
    this.lastUpdate = ref(null)
    this.listeners = []
  }

  connect(url = 'ws://localhost:8080/ws') {
    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.isConnected.value = true
        this.reconnectAttempts = 0
        this.notifyListeners('connected')
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'update') {
            this.flameData.value = data.flame
            this.heatmapData.value = data.heatmap
            if (data.metrics) {
              this.metrics.value = data.metrics
            }
            this.lastUpdate.value = new Date(data.timestamp * 1000)
            this.notifyListeners('update', data)
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.isConnected.value = false
        this.notifyListeners('error', error)
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.isConnected.value = false
        this.notifyListeners('disconnected')
        this.scheduleReconnect(url)
      }
    } catch (e) {
      console.error('Failed to create WebSocket:', e)
      this.scheduleReconnect(url)
    }
  }

  scheduleReconnect(url) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
      setTimeout(() => this.connect(url), delay)
    } else {
      console.error('Max reconnect attempts reached')
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  on(event, callback) {
    this.listeners.push({ event, callback })
  }

  off(event, callback) {
    this.listeners = this.listeners.filter(
      l => !(l.event === event && l.callback === callback)
    )
  }

  notifyListeners(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => l.callback(data))
  }
}

export const wsClient = new WebSocketClient()

export function useWebSocket() {
  return {
    isConnected: wsClient.isConnected,
    flameData: wsClient.flameData,
    heatmapData: wsClient.heatmapData,
    metrics: wsClient.metrics,
    lastUpdate: wsClient.lastUpdate,
    connect: wsClient.connect.bind(wsClient),
    disconnect: wsClient.disconnect.bind(wsClient),
    on: wsClient.on.bind(wsClient),
    off: wsClient.off.bind(wsClient)
  }
}
