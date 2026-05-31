import React from 'react';
import './ConnectionStatus.css';

const ConnectionStatus = ({ isOnline, isConnected, isSynced, wasOffline }) => {
  const getStatus = () => {
    if (!isOnline) {
      return {
        status: 'offline',
        text: '离线模式',
        color: '#e74c3c',
        icon: '🔴',
      };
    }
    if (!isConnected) {
      return {
        status: 'connecting',
        text: '连接中...',
        color: '#f39c12',
        icon: '🟡',
      };
    }
    if (!isSynced) {
      return {
        status: 'syncing',
        text: '同步中...',
        color: '#3498db',
        icon: '🔵',
      };
    }
    return {
      status: 'online',
      text: '已连接',
      color: '#2ecc71',
      icon: '🟢',
    };
  };

  const status = getStatus();

  return (
    <div className={`connection-status ${wasOffline ? 'just-reconnected' : ''}`}>
      <span className="status-icon">{status.icon}</span>
      <span className="status-text" style={{ color: status.color }}>
        {status.text}
      </span>
      {wasOffline && (
        <span className="reconnect-badge">
          ✓ 已恢复连接
        </span>
      )}
    </div>
  );
};

export default ConnectionStatus;
