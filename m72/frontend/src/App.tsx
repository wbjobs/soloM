import { useState, useEffect, useRef, useCallback } from 'react'
import { SensorData, VibrationAlert } from './types'
import DeviceTable from './DeviceTable'
import StatusBar from './StatusBar'
import AlertOverlay from './AlertOverlay'

const SSE_URL = '/api/sse'
const DEVICES_URL = '/api/devices'

function App() {
  const [devices, setDevices] = useState<Map<string, SensorData>>(new Map())
  const [connected, setConnected] = useState(false)
  const [messageCount, setMessageCount] = useState(0)
  const [alerts, setAlerts] = useState<VibrationAlert[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchInitialDevices = useCallback(async () => {
    try {
      const res = await fetch(DEVICES_URL)
      if (!res.ok) return
      const data: SensorData[] = await res.json()
      setDevices(prev => {
        const next = new Map(prev)
        for (const d of data) {
          next.set(d.device_id, d)
        }
        return next
      })
    } catch {
      // will retry via SSE
    }
  }, [])

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(SSE_URL)
    eventSourceRef.current = es

    es.onopen = () => {
      setConnected(true)
    }

    es.addEventListener('data', (event: MessageEvent) => {
      try {
        const data: SensorData = JSON.parse(event.data)
        if (data.device_id) {
          setDevices(prev => {
            const next = new Map(prev)
            next.set(data.device_id, data)
            return next
          })
          setMessageCount(c => c + 1)
        }
      } catch {
        // ignore parse errors
      }
    })

    es.addEventListener('alert', (event: MessageEvent) => {
      try {
        const alert: VibrationAlert = JSON.parse(event.data)
        if (alert.device_id) {
          setAlerts(prev => {
            const filtered = prev.filter(a => a.device_id !== alert.device_id)
            return [...filtered, alert]
          })
        }
      } catch {
        // ignore parse errors
      }
    })

    es.onerror = () => {
      setConnected(false)
      es.close()
      eventSourceRef.current = null
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      reconnectTimer.current = setTimeout(connectSSE, 3000)
    }
  }, [])

  useEffect(() => {
    fetchInitialDevices()
    connectSSE()

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [fetchInitialDevices, connectSSE])

  const deviceList = Array.from(devices.values()).sort((a, b) =>
    a.device_id.localeCompare(b.device_id)
  )

  return (
    <div className="app">
      {alerts.length > 0 && <AlertOverlay alerts={alerts} />}

      <header className="header">
        <div className="header-content">
          <div className="logo-area">
            <div className="logo-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect x="2" y="2" width="28" height="28" rx="6" fill="#1e40af" />
                <path d="M8 20V12L12 16L16 10L20 16L24 12V20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="16" cy="22" r="2" fill="#60a5fa"/>
              </svg>
            </div>
            <div>
              <h1>工业传感器实时监控平台</h1>
              <p className="subtitle">MQTT Protocol Gateway &middot; Time-Series Data Monitor</p>
            </div>
          </div>
          <StatusBar connected={connected} deviceCount={devices.size} messageCount={messageCount} alertCount={alerts.length} />
        </div>
      </header>

      <main className="main">
        <div className="section-header">
          <h2>设备实时状态</h2>
          <span className="device-badge">{devices.size} 台在线</span>
        </div>
        <DeviceTable devices={deviceList} alerts={alerts} />

        <div className="stats-row">
          <StatCard
            title="平均温度"
            value={deviceList.length ? (deviceList.reduce((s, d) => s + d.temperature, 0) / deviceList.length).toFixed(1) + '°C' : '--'}
            color="#f97316"
          />
          <StatCard
            title="最高温度"
            value={deviceList.length ? Math.max(...deviceList.map(d => d.temperature)).toFixed(1) + '°C' : '--'}
            color="#ef4444"
          />
          <StatCard
            title="平均震动频率"
            value={deviceList.length ? (deviceList.reduce((s, d) => s + d.vibration_freq, 0) / deviceList.length).toFixed(1) + ' Hz' : '--'}
            color="#3b82f6"
          />
          <StatCard
            title="最大震动频率"
            value={deviceList.length ? Math.max(...deviceList.map(d => d.vibration_freq)).toFixed(1) + ' Hz' : '--'}
            color="#8b5cf6"
          />
        </div>
      </main>

      <footer className="footer">
        <span>分布式工业 MQTT 协议网关 &amp; 实时时序数据监控平台</span>
        <span>Gateway:1883 &middot; Redis Stream &middot; TimescaleDB &middot; SSE</span>
      </footer>
    </div>
  )
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="stat-card">
      <div className="stat-indicator" style={{ backgroundColor: color }} />
      <div className="stat-info">
        <span className="stat-title">{title}</span>
        <span className="stat-value" style={{ color }}>{value}</span>
      </div>
    </div>
  )
}

export default App
