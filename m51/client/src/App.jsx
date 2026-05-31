import { useState, useEffect } from 'react';
import signalingClient from './lib/signalingClient.js';
import webrtcManager from './lib/webrtcManager.js';
import RoomManager from './components/RoomManager.jsx';
import ConnectionMonitor from './components/ConnectionMonitor.jsx';
import FileTransfer from './components/FileTransfer.jsx';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [peerRefreshTrigger, setPeerRefreshTrigger] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        await signalingClient.connect('ws://localhost:8080');
        setIsConnected(true);
        setupSignalingHandlers();
      } catch (error) {
        console.error('Failed to connect to signaling server:', error);
      }
    };

    init();

    return () => {
      webrtcManager.closeAllConnections();
      signalingClient.disconnect();
    };
  }, []);

  const setupSignalingHandlers = () => {
    signalingClient.on('SIGNAL', async (message) => {
      const { senderPeerId, signal } = message;
      await webrtcManager.handleSignal(senderPeerId, signal);
    });

    signalingClient.on('PEER_JOINED', (message) => {
      const peerId = message.peer.id;
      if (!webrtcManager.peerConnections.has(peerId)) {
        webrtcManager.createPeerConnection(peerId, true);
      }
      setPeerRefreshTrigger(t => t + 1);
    });

    webrtcManager.on('binaryData', (data) => {
      webrtcManager.emit('CHUNK_DATA', data);
    });
  };

  const handlePeerUpdate = () => {
    setPeerRefreshTrigger(t => t + 1);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🌐 WebRTC P2P 文件传输平台</h1>
        <p>
          去中心化 · 端到端加密 · Mesh 网络传输
          {isConnected && (
            <span style={{ marginLeft: '10px', color: '#10b981' }}>● 已连接信令服务器</span>
          )}
        </p>
      </header>

      <div className="main-content">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <FileTransfer />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <RoomManager onPeerUpdate={handlePeerUpdate} />
          <ConnectionMonitor refreshTrigger={peerRefreshTrigger} />
        </div>
      </div>
    </div>
  );
}

export default App;
