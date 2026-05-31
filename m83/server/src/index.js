import { WebSocketServer } from 'ws';
import http from 'http';
import express from 'express';
import cors from 'cors';
import * as Y from 'yjs';
import { setupWSConnection } from './y-websocket.js';
import {
  storeUpdate,
  startSnapshotLoop,
  stopSnapshotLoop,
  forceSnapshot,
  getTimestamps,
  getStateAtTimestamp,
  getHistorySummary,
  useRedis,
} from './history-store.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const docs = new Map();
const docUpdateListeners = new Map();

const getDoc = (roomId) => {
  if (!docs.has(roomId)) {
    const ydoc = new Y.Doc();
    docs.set(roomId, ydoc);
    console.log(`Created room: ${roomId}`);

    startSnapshotLoop(roomId, ydoc);

    const updateListener = (update, origin) => {
      storeUpdate(roomId, update, Date.now()).catch((err) => {
        console.error(`[History] Failed to store update for room ${roomId}:`, err.message);
      });
    };
    ydoc.on('update', updateListener);
    docUpdateListeners.set(roomId, updateListener);
  }
  return docs.get(roomId);
};

wss.on('connection', (conn, req) => {
  const url = new URL(req.url, 'http://localhost');
  const roomId = url.searchParams.get('room') || 'default';

  console.log(`Client connected to room: ${roomId}`);

  const doc = getDoc(roomId);

  setupWSConnection(conn, req, {
    docName: roomId,
    ydoc: doc,
    gc: true
  });

  conn.on('close', () => {
    console.log(`Client disconnected from room: ${roomId}`);
  });
});

app.get('/api/rooms', (req, res) => {
  res.json({
    rooms: Array.from(docs.keys()),
    count: docs.size
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    persistence: useRedis ? 'redis' : 'memory'
  });
});

app.get('/api/rooms/:roomId/history', async (req, res) => {
  try {
    const { roomId } = req.params;
    const timestamps = await getTimestamps(roomId);
    const summary = await getHistorySummary(roomId);
    res.json({
      roomId,
      timestamps,
      summary,
    });
  } catch (err) {
    console.error('[API] History error:', err);
    res.status(500).json({ error: 'Failed to get history', message: err.message });
  }
});

app.get('/api/rooms/:roomId/snapshot', async (req, res) => {
  try {
    const { roomId } = req.params;
    const timestamp = parseInt(req.query.timestamp);

    if (!timestamp || isNaN(timestamp)) {
      return res.status(400).json({ error: 'timestamp query parameter is required' });
    }

    const state = await getStateAtTimestamp(roomId, timestamp);
    res.json({
      roomId,
      timestamp,
      content: state.content,
      state: state.state,
    });
  } catch (err) {
    console.error('[API] Snapshot error:', err);
    res.status(500).json({ error: 'Failed to get snapshot', message: err.message });
  }
});

app.post('/api/rooms/:roomId/snapshot', async (req, res) => {
  try {
    const { roomId } = req.params;
    const ydoc = docs.get(roomId);

    if (!ydoc) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const timestamp = await forceSnapshot(roomId, ydoc);
    res.json({ roomId, timestamp, message: 'Snapshot created' });
  } catch (err) {
    console.error('[API] Force snapshot error:', err);
    res.status(500).json({ error: 'Failed to create snapshot', message: err.message });
  }
});

app.post('/api/rooms/:roomId/restore', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { state } = req.body;

    if (!state) {
      return res.status(400).json({ error: 'state is required in request body' });
    }

    const ydoc = docs.get(roomId);
    if (!ydoc) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const stateBuffer = Buffer.from(state, 'base64');
    Y.applyUpdate(ydoc, stateBuffer);

    await forceSnapshot(roomId, ydoc);

    res.json({ roomId, message: 'State restored successfully' });
  } catch (err) {
    console.error('[API] Restore error:', err);
    res.status(500).json({ error: 'Failed to restore state', message: err.message });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready at ws://localhost:${PORT}`);
  console.log(`Persistence: ${useRedis ? 'Redis' : 'In-Memory (fallback)'}`);
});
