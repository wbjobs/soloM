const Y = require('yjs');
const { mutex } = require('lib0/mutex');
const ws = require('ws');

const docs = new Map();
const messageSync = 0;
const messageAwareness = 1;
const messageAuth = 2;

const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';

const persistenceDir = process.env.YPERSISTENCE;
let persistence = null;
if (typeof persistenceDir === 'string') {
  console.info('Persisting documents to "' + persistenceDir + '"');
  const LeveldbPersistence = require('y-leveldb').LeveldbPersistence;
  const ldb = new LeveldbPersistence(persistenceDir);
  persistence = {
    provider: ldb,
    bindState: async (docName, ydoc) => {
      const persistedYdoc = await ldb.getYDoc(docName);
      const newUpdates = Y.encodeStateAsUpdate(ydoc);
      ldb.storeUpdate(docName, newUpdates);
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
      ydoc.on('update', (update) => {
        ldb.storeUpdate(docName, update);
      });
    },
    writeState: async (docName, ydoc) => {},
  };
}

const closeConn = (doc, conn) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    controlledIds.forEach((clientId) => {
      if (doc.awareness) {
        doc.awareness.states.delete(clientId);
        doc.awareness.emit('change', [
          { added: [], removed: [clientId], current: [] },
          'local',
        ]);
      }
    });
  }
  conn.close();
};

const send = (conn, m) => {
  if (conn.readyState !== ws.CONNECTING && conn.readyState !== ws.OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(m, (err) => {
      if (err != null) {
        closeConn(doc, conn);
      }
    });
  } catch (e) {
    closeConn(doc, conn);
  }
};

const messageListener = (conn, doc, m) => {
  const encoder = new Y.Encoder();
  const decoder = new Y.Decoder(m);
  const messageType = decoder.readVarUint();
  switch (messageType) {
    case messageSync: {
      encoder.writeVarUint(messageSync);
      const syncMessageType = decoder.readVarUint();
      switch (syncMessageType) {
        case 0: {
          Y.writeSyncStep1(encoder, doc);
          send(conn, encoder.toArrayBuffer());
          const encoder2 = new Y.Encoder();
          encoder2.writeVarUint(messageSync);
          Y.writeSyncStep2(encoder2, doc, decoder);
          send(conn, encoder2.toArrayBuffer());
          break;
        }
        case 1: {
          Y.applyUpdate(doc, Y.readSyncStep2(decoder));
          break;
        }
        case 2: {
          Y.readUpdate(decoder);
          break;
        }
      }
      break;
    }
    case messageAwareness: {
      Y.applyAwarenessUpdate(doc.awareness, new Uint8Array(decoder.rest()), conn);
      break;
    }
    case messageAuth: {
      break;
    }
  }
};

const setupWSConnection = (
  conn,
  req,
  { docName = (req.url || '').slice(1).split('?')[0], gc = gcEnabled } = {}
) => {
  conn.binaryType = 'arraybuffer';
  if (docName.length === 0) {
    docName = 'default';
  }
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    docName = roomParam;
  }

  let doc = docs.get(docName);
  if (doc === undefined) {
    doc = new Y.Doc({ gc });
    doc.gc = gc;
    doc.conns = new Map();
    doc.name = docName;
    doc.mux = mutex();
    doc.awareness = new Y.Awareness(doc);
    docs.set(docName, doc);

    if (persistence !== null) {
      persistence.bindState(docName, doc).then(() => {
        doc.emit('loaded');
      });
    }
  }

  const controlledIds = new Set();
  doc.conns.set(conn, controlledIds);

  conn.on('message', (m) => {
    doc.mux(() => {
      messageListener(conn, doc, new Uint8Array(m));
    });
  });

  const updateHandler = (update, origin) => {
    if (origin !== conn) {
      const encoder = new Y.Encoder();
      encoder.writeVarUint(messageSync);
      Y.writeUpdate(encoder, update);
      send(conn, encoder.toArrayBuffer());
    }
  };
  doc.on('update', updateHandler);

  const awarenessChangeHandler = ({ added, updated, removed }, _conn) => {
    const changedClients = added.concat(updated).concat(removed);
    const encoder = new Y.Encoder();
    encoder.writeVarUint(messageAwareness);
    Y.writeVarUint8Array(
      encoder,
      Y.encodeAwarenessUpdate(doc.awareness, changedClients)
    );
    send(conn, encoder.toArrayBuffer());
  };
  doc.awareness.on('change', awarenessChangeHandler);

  conn.on('close', () => {
    closeConn(doc, conn);
    if (doc.conns.size === 0 && persistence !== null) {
      persistence.writeState(docName, doc).then(() => {
        doc.destroy();
        docs.delete(docName);
      });
    }
    doc.off('update', updateHandler);
    doc.awareness.off('change', awarenessChangeHandler);
  });

  const encoder = new Y.Encoder();
  encoder.writeVarUint(messageSync);
  Y.writeSyncStep1(encoder, doc);
  send(conn, encoder.toArrayBuffer());

  if (doc.awareness.states.size > 0) {
    const encoderAwareness = new Y.Encoder();
    encoderAwareness.writeVarUint(messageAwareness);
    Y.writeVarUint8Array(
      encoderAwareness,
      Y.encodeAwarenessUpdate(doc.awareness, Array.from(doc.awareness.states.keys()))
    );
    send(conn, encoderAwareness.toArrayBuffer());
  }
};

module.exports = { setupWSConnection, docs };
