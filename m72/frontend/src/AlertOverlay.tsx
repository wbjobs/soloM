import { VibrationAlert } from './types'

function formatAlertTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return ts
  }
}

function AlertOverlay({ alerts }: { alerts: VibrationAlert[] }) {
  return (
    <div className="alert-overlay">
      <div className="alert-backdrop" />
      <div className="alert-panel">
        <div className="alert-header">
          <div className="alert-header-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 4L2 24H26L14 4Z" fill="#ef4444" stroke="#dc2626" strokeWidth="1.5"/>
              <path d="M14 11V16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="14" cy="20" r="1.5" fill="white"/>
            </svg>
          </div>
          <div className="alert-header-text">
            <h2>震动异常警报</h2>
            <span>{alerts.length} 台设备检测到震动频率标准差异常</span>
          </div>
          <div className="alert-live-badge">
            <span className="alert-live-dot" />
            LIVE
          </div>
        </div>

        <div className="alert-list">
          {alerts.map(alert => (
            <div key={alert.device_id} className="alert-item">
              <div className="alert-item-left">
                <div className="alert-device-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="2" y="2" width="16" height="16" rx="3" fill="#7f1d1d" stroke="#ef4444" strokeWidth="1"/>
                    <path d="M6 10L9 7L11 13L14 10" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="alert-item-info">
                  <span className="alert-device-name">{alert.device_id}</span>
                  <span className="alert-detail">
                    标准差 <strong>{alert.std_dev}</strong> Hz &nbsp;|&nbsp; 均值 {alert.mean} Hz &nbsp;|&nbsp; 样本数 {alert.sample_count}
                  </span>
                </div>
              </div>
              <div className="alert-item-right">
                <div className="alert-threshold-bar">
                  <div className="alert-threshold-label">阈值 {alert.threshold} Hz</div>
                  <div className="alert-threshold-track">
                    <div
                      className="alert-threshold-fill"
                      style={{ width: `${Math.min((alert.std_dev / (alert.threshold * 2)) * 100, 100)}%` }}
                    />
                    <div
                      className="alert-threshold-marker"
                      style={{ left: `${(alert.threshold / (alert.threshold * 2)) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="alert-time">{formatAlertTime(alert.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="alert-footer">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="#fca5a5" strokeWidth="1.5"/>
            <path d="M8 5V9" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11.5" r="0.75" fill="#fca5a5"/>
          </svg>
          <span>此警报不可关闭，直到设备震动频率恢复正常后自动消除</span>
        </div>
      </div>
    </div>
  )
}

export default AlertOverlay
