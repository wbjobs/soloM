const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new Map();

app.use(express.static('../client/dist'));

app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const [id, room] of rooms) {
    if (room.peers.size > 0) {
      roomList.push({
        id,
        peerCount: room.peers.size,
        hasSender: room.metadata !== null,
        fileName: room.metadata ? room.metadata.fileName : null,
        fileSize: room.metadata ? room.metadata.fileSize : null,
      });
    }
  }
  res.json(roomList);
});

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (room && room.peers.size === 0) {
    rooms.delete(roomId);
  }
}

function broadcastPeerList(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const peerList = [];
  for (const [id, ws] of room.peers) {
    peerList.push({ peerId: id });
  }
  for (const [, peer] of room.peers) {
    if (peer.readyState === 1) {
      peer.send(JSON.stringify({
        type: 'peer-list',
        peers: peerList,
        myPeerId: peer.id,
      }));
    }
  }
}

function broadcastToRoom(roomId, message, excludePeerId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [pid, peer] of room.peers) {
    if (pid !== excludePeerId && peer.readyState === 1) {
      peer.send(JSON.stringify(message));
    }
  }
}

wss.on('connection', (ws) => {
  ws.id = uuidv4();
  ws.roomId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create': {
        const roomId = msg.roomId || uuidv4().slice(0, 8);
        if (!rooms.has(roomId)) {
          rooms.set(roomId, { peers: new Map(), metadata: null });
        }
        const room = rooms.get(roomId);
        room.peers.set(ws.id, ws);
        ws.roomId = roomId;

        if (msg.metadata) {
          room.metadata = msg.metadata;
        }

        ws.send(JSON.stringify({
          type: 'created',
          roomId,
          peerId: ws.id,
        }));

        broadcastPeerList(roomId);
        break;
      }

      case 'join': {
        const roomId = msg.roomId;
        if (!rooms.has(roomId)) {
          ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
          return;
        }
        const room = rooms.get(roomId);

        room.peers.set(ws.id, ws);
        ws.roomId = roomId;

        ws.send(JSON.stringify({
          type: 'joined',
          roomId,
          peerId: ws.id,
          metadata: room.metadata,
          existingPeers: [...room.peers.keys()].filter((id) => id !== ws.id),
        }));

        broadcastPeerList(roomId);

        for (const [otherId, otherPeer] of room.peers) {
          if (otherId !== ws.id) {
            otherPeer.send(JSON.stringify({
              type: 'peer-joined',
              peerId: ws.id,
              isInitiator: true,
              remotePeerId: ws.id,
            }));
            ws.send(JSON.stringify({
              type: 'ready',
              isInitiator: false,
              remotePeerId: otherId,
            }));
          }
        }
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        if (!ws.roomId) return;
        const room = rooms.get(ws.roomId);
        if (!room) return;

        const target = room.peers.get(msg.targetPeerId);
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({
            ...msg,
            fromPeerId: ws.id,
          }));
        }
        break;
      }

      case 'metadata': {
        if (!ws.roomId) return;
        const room = rooms.get(ws.roomId);
        if (room) {
          room.metadata = msg.metadata;
          broadcastToRoom(ws.roomId, {
            type: 'metadata',
            metadata: msg.metadata,
            fromPeerId: ws.id,
          }, ws.id);
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (room) {
        room.peers.delete(ws.id);
        if (room.peers.size === 0) {
          rooms.delete(ws.roomId);
        } else {
          broadcastToRoom(ws.roomId, {
            type: 'peer-left',
            peerId: ws.id,
          }, ws.id);
          broadcastPeerList(ws.roomId);
          cleanupRoom(ws.roomId);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`信令服务器运行在 http://localhost:${PORT}`);
});
