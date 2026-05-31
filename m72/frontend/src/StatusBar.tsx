function StatusBar({ connected, deviceCount, messageCount, alertCount }: {
  connected: boolean
  deviceCount: number
  messageCount: number
  alertCount: number
}) {
  return (
    <div className="status-bar">
      <div className="status-item">
        <span className={`status-dot ${connected ? 'dot-online' : 'dot-offline'}`} />
        <span className="status-label">{connected ? 'SSE 已连接' : '连接断开'}</span>
      </div>
      <div className="status-divider" />
      <div className="status-item">
        <span className="status-label">设备</span>
        <span className="status-value">{deviceCount}</span>
      </div>
      <div className="status-divider" />
      <div className="status-item">
        <span className="status-label">消息</span>
        <span className="status-value">{messageCount}</span>
      </div>
      {alertCount > 0 && (
        <>
          <div className="status-divider" />
          <div className="status-item status-item-alert">
            <span className="alert-indicator-dot" />
            <span className="status-label">警报</span>
            <span className="status-value status-value-alert">{alertCount}</span>
          </div>
        </>
      )}
    </div>
  )
}

export default StatusBar
