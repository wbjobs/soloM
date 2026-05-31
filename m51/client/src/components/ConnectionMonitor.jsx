import { useState, useEffect } from 'react';
import webrtcManager from '../lib/webrtcManager.js';
import signalingClient from '../lib/signalingClient.js';
import meshTransferManager from '../lib/meshTransferManager.js';
import { formatSpeed, formatFileSize } from '../lib/fileChunker.js';

function ConnectionMonitor({ refreshTrigger }) {
  const [peerStates, setPeerStates] = useState([]);
  const [peerRates, setPeerRates] = useState({});
  const [persistedStates, setPersistedStates] = useState([]);
  const [stats, setStats] = useState({
    totalConnections: 0,
    connected: 0,
    connecting: 0,
    disconnected: 0
  });

  useEffect(() => {
    const updateStates = () => {
      const states = webrtcManager.getAllPeerStates();
      setPeerStates(states);
      
      setStats({
        totalConnections: states.length,
        connected: states.filter(s => s.dataChannelState === 'open').length,
        connecting: states.filter(s => 
          s.connectionState === 'connecting' || 
          s.connectionState === 'new' ||
          s.connectionState === 'checking'
        ).length,
        disconnected: states.filter(s => 
          s.connectionState === 'disconnected' || 
          s.connectionState === 'failed' ||
          s.connectionState === 'closed'
        ).length
      });
    };

    const updateRates = () => {
      setPeerRates(meshTransferManager.getPeerTransferRates());
    };

    const updatePersisted = () => {
      setPersistedStates(meshTransferManager.getPersistedStates());
    };

    updateStates();
    updateRates();
    updatePersisted();

    const interval = setInterval(updateStates, 1000);
    const ratesInterval = setInterval(updateRates, 500);

    webrtcManager.on('speedUpdate', updateRates);

    return () => {
      clearInterval(interval);
      clearInterval(ratesInterval);
    };
  }, [refreshTrigger]);

  return (
    <div className="card">
      <h2>连接状态监控</h2>
      
      <div className="transfer-stats">
        <div className="stat-box">
          <div className="stat-value">{stats.totalConnections}</div>
          <div className="stat-label">总连接数</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#10b981' }}>{stats.connected}</div>
          <div className="stat-label">已连接</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#f59e0b' }}>{stats.connecting}</div>
          <div className="stat-label">连接中</div>
        </div>
      </div>

      {persistedStates.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ marginBottom: '10px', fontSize: '1rem' }}>
            💾 断点续传记录 ({persistedStates.length})
          </h3>
          <div style={{ 
            padding: '12px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            fontSize: '0.85rem'
          }}>
            {persistedStates.map(state => (
              <div key={state.hash} style={{ 
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{ color: '#fff', marginBottom: '3px' }}>{state.fileName}</div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                  {formatFileSize(state.fileSize)} · 
                  <span style={{ color: '#f59e0b', marginLeft: '5px' }}>
                    已完成 {state.receivedCount}/{state.totalChunks} 分片
                  </span>
                  <span style={{ marginLeft: '5px' }}>
                    ({Math.round(state.receivedCount / state.totalChunks * 100)}%)
                  </span>
                </div>
                <div className="progress-bar" style={{ marginTop: '5px' }}>
                  <div 
                    className="progress-fill" 
                    style={{ 
                      width: `${state.receivedCount / state.totalChunks * 100}%`,
                      background: 'linear-gradient(90deg, #f59e0b, #eab308)'
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <MeshVisualization peers={peerStates} peerRates={peerRates} />

      {peerStates.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ marginBottom: '10px', fontSize: '1rem' }}>详细状态</h3>
          <div className="peer-list">
            {peerStates.map(state => {
              const rate = peerRates[state.peerId];
              const isConnected = state.dataChannelState === 'open';
              const isReconnecting = state.connectionState === 'checking' || state.connectionState === 'connecting';
              
              return (
                <div key={state.peerId} className={`peer-item ${
                  isConnected ? 'connected' : 
                  state.connectionState === 'failed' ? 'disconnected' : ''
                }`} style={{ padding: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div className="peer-id">
                      {state.peerId.substring(0, 8)}...
                      {isReconnecting && (
                        <span style={{ 
                          marginLeft: '8px', 
                          fontSize: '0.7rem', 
                          color: '#f59e0b',
                          animation: 'pulse 1s infinite'
                        }}>
                          🔄 重连中...
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>
                      {state.connectionState} / {state.dataChannelState}
                    </div>
                    {isConnected && rate && (
                      <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span style={{ color: '#06b6d4' }}>↑ {formatSpeed(rate.uploadSpeed)}</span>
                          <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                            总计: {formatFileSize(rate.totalUploadBytes + rate.totalDownloadBytes)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <div style={{ flex: 1 }}>
                            <MiniSpeedBar 
                              speed={rate.uploadSpeed} 
                              color="#06b6d4" 
                              label="↑"
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <MiniSpeedBar 
                              speed={rate.downloadSpeed} 
                              color="#10b981" 
                              label="↓"
                            />
                          </div>
                        </div>
                        <div style={{ marginTop: '4px', color: '#10b981' }}>
                          ↓ {formatSpeed(rate.downloadSpeed)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="peer-status">
                    <span className={`status-dot ${
                      isConnected ? 'connected' : 
                      state.connectionState === 'failed' || state.connectionState === 'disconnected' ? 'disconnected' : 'connecting'
                    }`}></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniSpeedBar({ speed, color, label }) {
  const maxSpeed = 10 * 1024 * 1024;
  const percentage = Math.min(100, (speed / maxSpeed) * 100);

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '4px',
      fontSize: '0.7rem'
    }}>
      <span style={{ color, width: '12px' }}>{label}</span>
      <div style={{ 
        flex: 1, 
        height: '3px', 
        background: 'rgba(255,255,255,0.1)', 
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{ 
          width: `${percentage}%`, 
          height: '100%', 
          background: color,
          transition: 'width 0.3s ease'
        }}></div>
      </div>
    </div>
  );
}

function MeshVisualization({ peers, peerRates }) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const connectedPeers = peers.filter(p => p.dataChannelState === 'open');

  const getNodePositions = () => {
    const positions = [];
    const centerX = 50;
    const centerY = 50;
    const radius = 35;

    positions.push({
      id: 'self',
      x: centerX,
      y: centerY,
      isSelf: true
    });

    connectedPeers.forEach((peer, index) => {
      const angle = (2 * Math.PI * index) / connectedPeers.length - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      positions.push({
        id: peer.peerId,
        x,
        y,
        isSelf: false,
        rate: peerRates[peer.peerId]
      });
    });

    return positions;
  };

  const positions = getNodePositions();

  const renderLines = () => {
    const lines = [];
    const selfPos = positions.find(p => p.isSelf);
    
    positions.filter(p => !p.isSelf).forEach((pos, index) => {
      const dx = pos.x - selfPos.x;
      const dy = pos.y - selfPos.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      const totalSpeed = pos.rate ? pos.rate.uploadSpeed + pos.rate.downloadSpeed : 0;
      const opacity = Math.min(1, 0.3 + (totalSpeed / (5 * 1024 * 1024)) * 0.7);

      lines.push(
        <div
          key={`line-${index}`}
          className="mesh-line"
          style={{
            left: `${selfPos.x}%`,
            top: `${selfPos.y}%`,
            width: `${length}%`,
            transform: `rotate(${angle}deg)`,
            opacity,
            background: totalSpeed > 0 
              ? 'linear-gradient(90deg, rgba(6, 182, 212, 0.8), rgba(16, 185, 129, 0.8))'
              : 'linear-gradient(90deg, rgba(79, 70, 229, 0.3), rgba(6, 182, 212, 0.3))'
          }}
        />
      );
    });

    return lines;
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <h3 style={{ marginBottom: '10px', fontSize: '1rem' }}>Mesh 网络拓扑</h3>
      <div 
        className="mesh-visualization"
        ref={(el) => {
          if (el && dimensions.width === 0) {
            const rect = el.getBoundingClientRect();
            setDimensions({ width: rect.width, height: rect.height });
          }
        }}
      >
        {renderLines()}
        {positions.map((pos) => (
          <div
            key={pos.id}
            className={`mesh-node ${pos.isSelf ? 'self' : 'peer'}`}
            style={{
              left: `calc(${pos.x}% - 20px)`,
              top: `calc(${pos.y}% - 20px)`
            }}
            title={pos.isSelf ? '你' : (pos.rate ? 
              `↑${formatSpeed(pos.rate.uploadSpeed)} ↓${formatSpeed(pos.rate.downloadSpeed)}` : 
              'Peer')}
          >
            {pos.isSelf ? '你' : 'P'}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '10px', textAlign: 'center', color: '#6b7280', fontSize: '0.8rem' }}>
        {connectedPeers.length > 0 
          ? `Mesh 网络: ${connectedPeers.length + 1} 个节点` 
          : '暂无 P2P 连接'}
      </div>
    </div>
  );
}

export default ConnectionMonitor;
