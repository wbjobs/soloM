const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { setupWSConnection } = require('./y-websocket-server');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

const rooms = new Map();

function getRoomInfo(roomName) {
  const clients = [];
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.roomName === roomName) {
      clients.push({
        userId: client.userId,
        userName: client.userName,
        color: client.color,
      });
    }
  });
  return {
    name: roomName,
    userCount: clients.length,
    users: clients,
  };
}

app.get('/api/rooms', (req, res) => {
  const roomList = [];
  wss.clients.forEach((client) => {
    if (client.roomName && !roomList.find((r) => r.name === client.roomName)) {
      roomList.push(getRoomInfo(client.roomName));
    }
  });
  res.json(roomList);
});

app.get('/api/rooms/:roomName', (req, res) => {
  const { roomName } = req.params;
  res.json(getRoomInfo(roomName));
});

wss.on('connection', (conn, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomName = url.searchParams.get('room') || 'default';
  const userId = url.searchParams.get('userId');
  const userName = url.searchParams.get('userName') || 'Anonymous';
  const color = url.searchParams.get('color') || '#000000';

  conn.roomName = roomName;
  conn.userId = userId;
  conn.userName = userName;
  conn.color = color;

  console.log(`[WS] User connected: ${userName} (${userId}) in room: ${roomName}`);

  broadcastUserList(roomName);

  conn.on('close', () => {
    console.log(`[WS] User disconnected: ${userName} (${userId}) from room: ${roomName}`);
    setTimeout(() => broadcastUserList(roomName), 100);
  });

  conn.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'ping') {
        conn.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }
    } catch (e) {
    }
  });

  setupWSConnection(conn, req, {
    gc: true,
  });
});

function broadcastUserList(roomName) {
  const userList = [];
  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.roomName === roomName
    ) {
      userList.push({
        userId: client.userId,
        userName: client.userName,
        color: client.color,
      });
    }
  });

  const message = JSON.stringify({
    type: 'userList',
    users: userList,
  });

  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.roomName === roomName
    ) {
      client.send(message);
    }
  });
}

const PORT = process.env.PORT || 1234;

server.listen(PORT, () => {
  console.log(`[Server] CRDT Collaborative Editor Server running on port ${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`[Server] HTTP API endpoint: http://localhost:${PORT}`);
});
