const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = new Map();
const peers = new Map();

class RoomManager {
  static createRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        peers: new Map(),
        createdAt: Date.now()
      });
    }
    return rooms.get(roomId);
  }

  static getRoom(roomId) {
    return rooms.get(roomId);
  }

  static joinRoom(roomId, peerId, ws, metadata = {}) {
    const room = this.createRoom(roomId);
    room.peers.set(peerId, {
      id: peerId,
      ws,
      metadata,
      joinedAt: Date.now()
    });
    return room;
  }

  static leaveRoom(roomId, peerId) {
    const room = rooms.get(roomId);
    if (room) {
      room.peers.delete(peerId);
      if (room.peers.size === 0) {
        rooms.delete(roomId);
      }
    }
  }

  static getRoomPeers(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.peers.values()).map(p => ({
      id: p.id,
      metadata: p.metadata
    }));
  }

  static broadcastToRoom(roomId, senderId, message) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    room.peers.forEach((peer, peerId) => {
      if (peerId !== senderId && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(JSON.stringify(message));
      }
    });
  }

  static sendToPeer(peerId, message) {
    const peer = peers.get(peerId);
    if (peer && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(message));
    }
  }
}

wss.on('connection', (ws) => {
  const peerId = uuidv4();
  
  peers.set(peerId, {
    id: peerId,
    ws,
    roomId: null,
    metadata: {}
  });

  ws.send(JSON.stringify({
    type: 'PEER_ID',
    peerId
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, peerId, message);
    } catch (error) {
      console.error('Message parsing error:', error);
    }
  });

  ws.on('close', () => {
    handlePeerDisconnect(peerId);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    handlePeerDisconnect(peerId);
  });
});

function handleMessage(ws, peerId, message) {
  const peer = peers.get(peerId);
  if (!peer) return;

  switch (message.type) {
    case 'JOIN_ROOM':
      handleJoinRoom(peer, message);
      break;
    case 'LEAVE_ROOM':
      handleLeaveRoom(peer);
      break;
    case 'SIGNAL':
      handleSignal(peer, message);
      break;
    case 'UPDATE_METADATA':
      handleUpdateMetadata(peer, message);
      break;
    case 'HEARTBEAT':
      ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK', timestamp: Date.now() }));
      break;
    default:
      console.log('Unknown message type:', message.type);
  }
}

function handleJoinRoom(peer, message) {
  const { roomId, metadata } = message;
  
  if (peer.roomId) {
    handleLeaveRoom(peer);
  }

  peer.roomId = roomId;
  peer.metadata = metadata || {};

  const room = RoomManager.joinRoom(roomId, peer.id, peer.ws, peer.metadata);
  
  peer.ws.send(JSON.stringify({
    type: 'ROOM_JOINED',
    roomId,
    peers: RoomManager.getRoomPeers(roomId)
  }));

  RoomManager.broadcastToRoom(roomId, peer.id, {
    type: 'PEER_JOINED',
    roomId,
    peer: {
      id: peer.id,
      metadata: peer.metadata
    }
  });
}

function handleLeaveRoom(peer) {
  if (!peer.roomId) return;

  const roomId = peer.roomId;
  
  RoomManager.leaveRoom(roomId, peer.id);
  
  RoomManager.broadcastToRoom(roomId, peer.id, {
    type: 'PEER_LEFT',
    roomId,
    peerId: peer.id
  });

  peer.roomId = null;
}

function handleSignal(peer, message) {
  const { targetPeerId, signal } = message;
  
  RoomManager.sendToPeer(targetPeerId, {
    type: 'SIGNAL',
    senderPeerId: peer.id,
    signal
  });
}

function handleUpdateMetadata(peer, message) {
  const { metadata } = message;
  peer.metadata = { ...peer.metadata, ...metadata };

  if (peer.roomId) {
    RoomManager.broadcastToRoom(peer.roomId, peer.id, {
      type: 'PEER_UPDATED',
      peerId: peer.id,
      metadata: peer.metadata
    });
  }
}

function handlePeerDisconnect(peerId) {
  const peer = peers.get(peerId);
  if (peer) {
    if (peer.roomId) {
      handleLeaveRoom(peer);
    }
    peers.delete(peerId);
  }
}

app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    peerCount: room.peers.size,
    createdAt: room.createdAt
  }));
  res.json(roomList);
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    id: room.id,
    peerCount: room.peers.size,
    peers: RoomManager.getRoomPeers(room.id),
    createdAt: room.createdAt
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});
