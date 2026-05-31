import { SensorData, VibrationAlert } from './types'

function getTemperatureClass(temp: number): string {
  if (temp >= 70) return 'temp-critical'
  if (temp >= 50) return 'temp-warning'
  return 'temp-normal'
}

function getVibrationClass(freq: number): string {
  if (freq >= 200) return 'vib-critical'
  if (freq >= 150) return 'vib-warning'
  return 'vib-normal'
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ts
  }
}

function DeviceTable({ devices, alerts }: { devices: SensorData[]; alerts: VibrationAlert[] }) {
  const alertDeviceIds = new Set(alerts.map(a => a.device_id))
  const alertMap = new Map(alerts.map(a => [a.device_id, a]))

  if (devices.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="#64748b" strokeWidth="2" strokeDasharray="4 4"/>
            <path d="M24 14V24L30 30" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <p>等待传感器数据接入...</p>
        <span>确保 MQTT 网关与模拟器服务正在运行</span>
      </div>
    )
  }

  return (
    <div className="table-container">
      <table className="device-table">
        <thead>
          <tr>
            <th>设备 ID</th>
            <th>温度 (°C)</th>
            <th>震动频率 (Hz)</th>
            <th>更新时间</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {devices.map(d => {
            const hasAlert = alertDeviceIds.has(d.device_id)
            const alert = alertMap.get(d.device_id)
            return (
              <tr key={d.device_id} className={`device-row${hasAlert ? ' device-row-alert' : ''}`}>
                <td>
                  <div className="device-id-cell">
                    <span className={`device-dot${hasAlert ? ' device-dot-alert' : ''}`} />
                    <span className="device-name">{d.device_id}</span>
                  </div>
                </td>
                <td>
                  <div className="temp-cell">
                    <span className={`temp-badge ${getTemperatureClass(d.temperature)}`}>
                      {d.temperature.toFixed(2)}
                    </span>
                    <div className="temp-bar-bg">
                      <div
                        className="temp-bar-fill"
                        style={{
                          width: `${Math.min((d.temperature / 80) * 100, 100)}%`,
                          backgroundColor: d.temperature >= 70 ? '#ef4444' : d.temperature >= 50 ? '#f97316' : '#22c55e',
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td>
                  <div className="vib-cell">
                    <span className={`vib-badge ${getVibrationClass(d.vibration_freq)}`}>
                      {d.vibration_freq.toFixed(2)}
                    </span>
                    {hasAlert && alert && (
                      <span className="vib-stddev-label">
                        σ={alert.std_dev}
                      </span>
                    )}
                  </div>
                </td>
                <td className="timestamp-cell">{formatTimestamp(d.timestamp)}</td>
                <td>
                  {hasAlert ? (
                    <span className="status-badge status-alert">震动异常</span>
                  ) : (
                    <StatusIndicator temp={d.temperature} vib={d.vibration_freq} />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StatusIndicator({ temp, vib }: { temp: number; vib: number }) {
  if (temp >= 70 || vib >= 200) {
    return <span className="status-badge status-danger">异常</span>
  }
  if (temp >= 50 || vib >= 150) {
    return <span className="status-badge status-warning">警告</span>
  }
  return <span className="status-badge status-ok">正常</span>
}

export default DeviceTable
