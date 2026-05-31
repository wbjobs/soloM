import React from 'react';

export default function ConnectionStatus({ signalingState, webrtcState, roomId, peerId }) {
  const statusColor = (connected) => (connected ? '#4caf50' : '#f44336');
  const statusText = (connected, label) => (connected ? `${label} 已连接` : `${label} 未连接`);

  return (
    <div className="connection-status">
      <div className="status-item">
        <span
          className="status-dot"
          style={{ backgroundColor: statusColor(signalingState) }}
        />
        <span>{statusText(signalingState, '信令服务器')}</span>
      </div>
      <div className="status-item">
        <span
          className="status-dot"
          style={{ backgroundColor: statusColor(webrtcState) }}
        />
        <span>{statusText(webrtcState, 'WebRTC')}</span>
      </div>
      {roomId && (
        <div className="status-item">
          <span className="status-label">房间:</span>
          <span className="status-value">{roomId}</span>
        </div>
      )}
      {peerId && (
        <div className="status-item">
          <span className="status-label">ID:</span>
          <span className="status-value">{peerId.slice(0, 8)}</span>
        </div>
      )}
    </div>
  );
}
