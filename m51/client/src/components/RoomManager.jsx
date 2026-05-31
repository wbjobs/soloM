import { useState, useEffect } from 'react';
import signalingClient from '../lib/signalingClient.js';
import webrtcManager from '../lib/webrtcManager.js';

function RoomManager({ onPeerUpdate }) {
  const [roomId, setRoomId] = useState('');
  const [joinedRoom, setJoinedRoom] = useState(null);
  const [roomPeers, setRoomPeers] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const handleRoomJoined = (message) => {
      setJoinedRoom(message.roomId);
      setRoomPeers(message.peers.filter(p => p.id !== signalingClient.peerId));
      setIsConnecting(false);
      
      message.peers.forEach(peer => {
        if (peer.id !== signalingClient.peerId && !webrtcManager.peerConnections.has(peer.id)) {
          webrtcManager.createPeerConnection(peer.id, true);
        }
      });
    };

    const handlePeerJoined = (message) => {
      setRoomPeers(prev => {
        const exists = prev.find(p => p.id === message.peer.id);
        if (!exists) {
          return [...prev, message.peer];
        }
        return prev.map(p => p.id === message.peer.id ? message.peer : p);
      });
    };

    const handlePeerLeft = (message) => {
      setRoomPeers(prev => prev.filter(p => p.id !== message.peerId));
      webrtcManager.closeConnection(message.peerId);
    };

    signalingClient.on('ROOM_JOINED', handleRoomJoined);
    signalingClient.on('PEER_JOINED', handlePeerJoined);
    signalingClient.on('PEER_LEFT', handlePeerLeft);

    webrtcManager.on('peerConnected', (peerId) => {
      onPeerUpdate && onPeerUpdate();
    });

    webrtcManager.on('peerDisconnected', (peerId) => {
      onPeerUpdate && onPeerUpdate();
    });

    return () => {
      signalingClient.off('ROOM_JOINED');
      signalingClient.off('PEER_JOINED');
      signalingClient.off('PEER_LEFT');
    };
  }, [onPeerUpdate]);

  const joinRoom = () => {
    if (!roomId.trim()) return;
    setIsConnecting(true);
    signalingClient.joinRoom(roomId.trim(), {
      joinedAt: Date.now()
    });
  };

  const leaveRoom = () => {
    signalingClient.leaveRoom();
    webrtcManager.closeAllConnections();
    setJoinedRoom(null);
    setRoomPeers([]);
  };

  const generateRoomId = () => {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(randomId);
  };

  return (
    <div className="card">
      <h2>房间管理</h2>
      
      {!joinedRoom ? (
        <>
          <div className="form-group">
            <label>房间 ID</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="输入或生成房间 ID"
              onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="btn btn-primary" 
              onClick={joinRoom}
              disabled={isConnecting || !roomId.trim()}
              style={{ flex: 1 }}
            >
              {isConnecting ? '连接中...' : '加入房间'}
            </button>
            <button 
              className="btn btn-success" 
              onClick={generateRoomId}
              disabled={isConnecting}
            >
              生成
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="room-info">
            <span>当前房间:</span>
            <span className="room-id">{joinedRoom}</span>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
              我的 ID: <span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>
                {signalingClient.peerId?.substring(0, 8)}...
              </span>
            </span>
          </div>

          <button 
            className="btn btn-danger" 
            onClick={leaveRoom}
            style={{ width: '100%', marginBottom: '20px' }}
          >
            离开房间
          </button>

          <div>
            <h3 style={{ marginBottom: '10px', fontSize: '1rem' }}>
              房间成员 ({roomPeers.length})
            </h3>
            {roomPeers.length === 0 ? (
              <div className="no-peers">
                暂无其他成员，等待他人加入...
              </div>
            ) : (
              <div className="peer-list">
                {roomPeers.map(peer => (
                  <PeerItem key={peer.id} peer={peer} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PeerItem({ peer }) {
  const [state, setState] = useState('connecting');

  useEffect(() => {
    const checkState = () => {
      const peerState = webrtcManager.getPeerState(peer.id);
      if (peerState.dataChannelState === 'open') {
        setState('connected');
      } else if (peerState.connectionState === 'failed' || peerState.connectionState === 'disconnected') {
        setState('disconnected');
      } else {
        setState('connecting');
      }
    };

    checkState();
    
    const interval = setInterval(checkState, 1000);
    return () => clearInterval(interval);
  }, [peer.id]);

  return (
    <div className={`peer-item ${state}`}>
      <div>
        <div className="peer-id">{peer.id.substring(0, 8)}...</div>
      </div>
      <div className="peer-status">
        <span className={`status-dot ${state}`}></span>
        <span style={{ fontSize: '0.8rem' }}>
          {state === 'connected' ? '已连接' : state === 'connecting' ? '连接中' : '已断开'}
        </span>
      </div>
    </div>
  );
}

export default RoomManager;
