const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  clientTracking: true,
  pingInterval: 15000,
  pingTimeout: 10000
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function removeUserFromRoom(userId, roomId, ws) {
  const room = rooms.get(roomId);
  if (!room) return;

  const existing = room.get(userId);
  if (existing && existing.ws !== ws) {
    return;
  }

  room.delete(userId);

  room.forEach((peer) => {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify({
        type: 'peer-left',
        peerId: userId
      }));
    }
  });

  if (room.size === 0) {
    rooms.delete(roomId);
  }

  console.log(`User ${userId} removed from room ${roomId}`);
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let userId = null;
  ws._isAlive = true;

  ws.on('pong', () => {
    ws._isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join':
          handleJoin(ws, data);
          break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          handleSignaling(data);
          break;
        case 'leave':
          handleLeave(ws);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    handleLeave(ws);
  });

  function handleJoin(ws, data) {
    const { roomId, userId: id } = data;
    userId = id;
    currentRoom = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const room = rooms.get(roomId);
    const existing = room.get(userId);
    if (existing) {
      if (existing.ws === ws) {
        return;
      }
      try {
        existing.ws.removeAllListeners();
        existing.ws.close();
      } catch (e) {
        // ignore
      }
      room.delete(userId);
    }

    const peers = Array.from(room.keys());

    room.set(userId, { ws, userId });

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'joined',
        userId,
        peers: peers.filter(p => p !== userId)
      }));
    }

    room.forEach((peer) => {
      if (peer.userId !== userId && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(JSON.stringify({
          type: 'peer-joined',
          peerId: userId
        }));
      }
    });

    console.log(`User ${userId} joined room ${roomId} (peers: ${peers.length})`);
  }

  function handleSignaling(data) {
    const { to, from } = data;
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);

    if (room && room.has(to)) {
      const peer = room.get(to);
      if (peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(JSON.stringify(data));
      }
    }
  }

  function handleLeave(ws) {
    if (!currentRoom || !userId) return;

    removeUserFromRoom(userId, currentRoom, ws);

    currentRoom = null;
    userId = null;
  }
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws._isAlive) {
      ws.terminate();
      return;
    }
    ws._isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
