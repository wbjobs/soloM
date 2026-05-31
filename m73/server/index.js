const http = require('http');
const WebSocket = require('ws');
const { Level } = require('level');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');

const PORT = process.env.PORT || 1234;
const db = new Level('./data/docs', { valueEncoding: 'binary' });

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');

const docs = new Map();
const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;

class Document {
  constructor(name) {
    this.name = name;
    this.yDoc = new Y.Doc();
    this.connections = new Map();
    this.awareness = new awarenessProtocol.Awareness(this.yDoc);
    this.version = 0;
    this.updateLog = [];
    this.maxLogSize = 1000;
    
    this.yDoc.on('update', (update, origin) => {
      this.version++;
      this.updateLog.push({ version: this.version, update: new Uint8Array(update) });
      if (this.updateLog.length > this.maxLogSize) {
        this.updateLog.shift();
      }
      this.persist();
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.broadcast(message, null);
    });

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changedClients = added.concat(updated).concat(removed);
      const encoderAwareness = encoding.createEncoder();
      encoding.writeVarUint(encoderAwareness, messageAwareness);
      awarenessProtocol.writeAwarenessUpdate(encoderAwareness, changedClients, this.awareness);
      const message = encoding.toUint8Array(encoderAwareness);
      this.broadcast(message, origin);
    });
  }

  async persist() {
    try {
      const snapshot = Y.encodeStateAsUpdate(this.yDoc);
      await db.put(`doc:${this.name}`, Buffer.from(snapshot));
      await db.put(`version:${this.name}`, this.version.toString());
    } catch (err) {
      console.error('Failed to persist document:', err);
    }
  }

  async load() {
    try {
      const data = await db.get(`doc:${this.name}`);
      if (data) {
        Y.applyUpdate(this.yDoc, new Uint8Array(data));
      }
      const versionStr = await db.get(`version:${this.name}`);
      this.version = parseInt(versionStr) || 0;
    } catch (err) {
      if (err.status !== 404) {
        console.error('Failed to load document:', err);
      }
    }
  }

  getUpdatesSince(sinceVersion) {
    return this.updateLog.filter(entry => entry.version > sinceVersion).map(entry => entry.update);
  }

  broadcast(message, origin) {
    this.connections.forEach((connInfo, conn) => {
      if (conn !== origin && conn.readyState === wsReadyStateOpen) {
        try {
          conn.send(message);
        } catch (e) {
          console.error('Send error:', e);
        }
      }
    });
  }

  addConnection(conn) {
    this.connections.set(conn, {
      connectedAt: Date.now(),
      lastMessageAt: Date.now()
    });
  }

  updateConnectionActivity(conn) {
    const info = this.connections.get(conn);
    if (info) {
      info.lastMessageAt = Date.now();
    }
  }

  removeConnection(conn) {
    this.connections.delete(conn);
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [conn.clientId],
      null
    );
  }
}

async function getDocument(name) {
  if (!docs.has(name)) {
    const doc = new Document(name);
    await doc.load();
    docs.set(name, doc);
  }
  return docs.get(name);
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('CRDT Collaborative Editor Server\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', async (conn, req) => {
  const docName = req.url.slice(1).split('?')[0] || 'default';
  const doc = await getDocument(docName);
  
  conn.clientId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  conn.isAlive = true;
  
  doc.addConnection(conn);

  const heartbeatInterval = setInterval(() => {
    if (conn.readyState === wsReadyStateOpen) {
      try {
        conn.ping();
      } catch (e) {
        clearInterval(heartbeatInterval);
      }
    }
  }, HEARTBEAT_INTERVAL);

  conn.on('pong', () => {
    conn.isAlive = true;
    doc.updateConnectionActivity(conn);
  });

  conn.on('ping', () => {
    conn.isAlive = true;
    doc.updateConnectionActivity(conn);
  });

  const syncMessageHandler = (encoder, decoder) => {
    syncProtocol.readSyncMessage(decoder, encoder, doc.yDoc, conn);
    if (encoding.length(encoder) > 1) {
      conn.send(encoding.toUint8Array(encoder));
    }
  };

  const awarenessMessageHandler = (decoder) => {
    awarenessProtocol.applyAwarenessUpdate(
      doc.awareness,
      decoding.readVarUint8Array(decoder),
      conn
    );
  };

  const queryAwarenessHandler = (encoder) => {
    const users = Array.from(doc.awareness.getStates().entries())
      .filter(([_, state]) => state.user)
      .map(([clientId, state]) => ({
        clientId,
        name: state.user.name,
        color: state.user.color
      }));
    console.log('Active users:', users.length);
  };

  const onMessage = (message) => {
    try {
      conn.isAlive = true;
      doc.updateConnectionActivity(conn);
      
      const decoder = decoding.createDecoder(message);
      const encoder = encoding.createEncoder();
      const messageType = decoding.readVarUint(decoder);
      
      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          syncMessageHandler(encoder, decoder);
          break;
        case messageAwareness:
          awarenessMessageHandler(decoder);
          break;
        case messageQueryAwareness:
          queryAwarenessHandler(encoder);
          break;
      }
    } catch (err) {
      console.error('Message handling error:', err);
    }
  };

  const sendFullSync = () => {
    const stateVector = Y.encodeStateVector(doc.yDoc);
    const update = Y.encodeStateAsUpdate(doc.yDoc);
    
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep2(encoder, update);
    conn.send(encoding.toUint8Array(encoder));
    
    const encoder2 = encoding.createEncoder();
    encoding.writeVarUint(encoder2, messageSync);
    syncProtocol.writeSyncStep1(encoder2, doc.yDoc);
    conn.send(encoding.toUint8Array(encoder2));
  };

  const sendSyncStep1 = () => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc.yDoc);
    conn.send(encoding.toUint8Array(encoder));
    
    if (doc.awareness.getStates().size > 0) {
      const encoderAwareness = encoding.createEncoder();
      encoding.writeVarUint(encoderAwareness, messageAwareness);
      awarenessProtocol.writeAwarenessUpdate(
        encoderAwareness,
        Array.from(doc.awareness.getStates().keys()),
        doc.awareness
      );
      conn.send(encoding.toUint8Array(encoderAwareness));
    }
  };

  conn.on('message', (data) => {
    onMessage(new Uint8Array(data));
  });

  conn.on('close', () => {
    clearInterval(heartbeatInterval);
    doc.removeConnection(conn);
    if (doc.connections.size === 0) {
      doc.persist().then(() => {
        docs.delete(docName);
      });
    }
  });

  conn.on('error', (err) => {
    console.error('WebSocket error:', err);
  });

  sendSyncStep1();
  sendFullSync();
});

server.listen(PORT, () => {
  console.log(`🚀 CRDT Editor Server running on port ${PORT}`);
  console.log(`📄 Document storage: LevelDB at ./data/docs`);
  console.log(`💓 Heartbeat: ${HEARTBEAT_INTERVAL}ms interval, ${HEARTBEAT_TIMEOUT}ms timeout`);
});
