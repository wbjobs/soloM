import * as Y from 'yjs';
import * as encoding from 'lib0/encoding.js';
import * as decoding from 'lib0/decoding.js';
import * as syncProtocol from 'y-protocols/sync.js';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import { createMutex } from 'lib0/mutex.js';

const messageSync = 0;
const messageAwareness = 1;
const messageAuth = 2;

const closeConn = (doc, conn) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    if (doc.conns.size === 0 && doc.gc) {
      doc.gc = true;
    }
  }
  conn.close();
};

const send = (conn, m) => {
  if (conn.readyState === 1) {
    conn.send(m, (err) => {
      if (err != null) {
        closeConn(conn);
      }
    });
  }
};

const readMessage = (conn, doc, message, mux) => {
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);
  
  switch (messageType) {
    case messageSync:
      encoding.writeVarUint(encoder, messageSync);
      
      mux(() => {
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
      });
      
      if (encoding.length(encoder) > 1) {
        send(conn, encoding.toUint8Array(encoder));
      }
      break;
    case messageAwareness: {
      const awarenessUpdate = decoding.readVarUint8Array(decoder);
      mux(() => {
        awarenessProtocol.applyAwarenessUpdate(doc.awareness, awarenessUpdate, conn);
      });
      break;
    }
    case messageAuth: {
      break;
    }
  }
};

const setupWSConnection = (conn, req, { docName = 'default', gc = true, ydoc } = {}) => {
  conn.binaryType = 'arraybuffer';
  
  if (!ydoc) {
    return;
  }

  ydoc.gc = gc;
  if (!ydoc.conns) {
    ydoc.conns = new Map();
    ydoc.awareness = new awarenessProtocol.Awareness(ydoc);
  }

  const mux = createMutex();

  ydoc.conns.set(conn, new Set());

  let pendingSyncStep2 = null;

  conn.on('message', (message) => {
    mux(() => {
      readMessage(conn, ydoc, new Uint8Array(message), mux);
    });
  });

  conn.on('close', () => {
    closeConn(ydoc, conn);
  });

  const awarenessChangeHandler = ({ added, updated, removed }, origin) => {
    if (origin === conn) return;
    
    const changedClients = added.concat(updated).concat(removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(ydoc.awareness, changedClients)
    );
    const buff = encoding.toUint8Array(encoder);
    ydoc.conns.forEach((_, c) => {
      if (c !== conn) {
        send(c, buff);
      }
    });
  };
  
  ydoc.awareness.on('update', awarenessChangeHandler);

  const updateHandler = (update, origin, doc) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    ydoc.conns.forEach((_, c) => {
      if (c !== origin) {
        send(c, message);
      }
    });
  };
  
  ydoc.on('update', updateHandler);

  mux(() => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, ydoc);
    send(conn, encoding.toUint8Array(encoder));
    
    const awarenessStates = ydoc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(ydoc.awareness, Array.from(awarenessStates.keys()))
      );
      send(conn, encoding.toUint8Array(encoder));
    }
  });
};

export { setupWSConnection, messageSync, messageAwareness, messageAuth };
