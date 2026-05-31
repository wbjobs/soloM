import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';
import { sync as YSync, awareness as YAwareness } from 'y-protocols';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Buffer } from 'buffer';
import Snippet from '../models/Snippet';
import SnippetVersion from '../models/SnippetVersion';

const messageYjsSyncStep1 = 0;
const messageYjsSyncStep2 = 1;
const messageYjsUpdate = 2;
const messageYjsAwareness = 3;

interface Client {
  ws: WebSocket;
  userId: string;
  username: string;
  awareness: YAwareness.Awareness;
}

interface DocumentRoom {
  ydoc: Y.Doc;
  awareness: YAwareness.Awareness;
  clients: Set<Client>;
  snippetId: string;
  userId: string;
  currentVersion: number;
  saveTimeout?: NodeJS.Timeout;
  updateHandler: (update: Uint8Array, origin: any) => void;
  awarenessHandler: (
    { added, updated, removed }:
    { added: Array<number>, updated: Array<number>, removed: Array<number> },
    origin: any
  ) => void;
}

const rooms = new Map<string, DocumentRoom>();
const SAVE_DEBOUNCE_MS = 2000;
const MAX_VERSION_HISTORY = 10;

const setupYWebsocket = (wss: WebSocketServer) => {
  wss.on('connection', (ws: WebSocket, request) => {
    const token = new URL(request.url || '', `ws://${request.headers.host}`).searchParams.get('token');
    const docName = new URL(request.url || '', `ws://${request.headers.host}`).pathname.slice(1).split('?')[0];

    if (!token) {
      ws.close(1008, 'Authentication required');
      return;
    }

    let decodedToken: { id: string; username: string };
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { id: string; username: string };
    } catch (error) {
      ws.close(1008, 'Invalid token');
      return;
    }

    const clientAwareness = new YAwareness.Awareness(new Y.Doc());

    const client: Client = {
      ws,
      userId: decodedToken.id,
      username: decodedToken.username,
      awareness: clientAwareness
    };

    ws.on('message', async (message: Buffer) => {
      try {
        await handleMessage(new Uint8Array(message), docName, client);
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      handleDisconnect(docName, client);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
};

const handleMessage = async (message: Uint8Array, docName: string, client: Client) => {
  const room = await getOrCreateRoom(docName, client.userId, client.username);
  if (!room) {
    client.ws.close(1008, 'Snippet not found or access denied');
    return;
  }

  room.clients.add(client);

  try {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case messageYjsSyncStep1:
        handleSyncStep1(decoder, room, client);
        break;
      case messageYjsSyncStep2:
        handleSyncStep2(decoder, room, client);
        break;
      case messageYjsUpdate:
        handleUpdate(decoder, room, client);
        break;
      case messageYjsAwareness:
        handleAwareness(decoder, room, client);
        break;
      default:
        console.log(`Unknown message type: ${messageType}`);
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
};

const handleSyncStep1 = (decoder: decoding.Decoder, room: DocumentRoom, client: Client) => {
  const clientStateVector = decoding.readVarUint8Array(decoder);

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageYjsSyncStep2);
  YSync.writeSyncStep2(encoder, room.ydoc, clientStateVector);
  const update = encoding.toUint8Array(encoder);
  client.ws.send(Buffer.from(update));

  const encoder2 = encoding.createEncoder();
  encoding.writeVarUint(encoder2, messageYjsSyncStep1);
  YSync.writeSyncStep1(encoder2, room.ydoc);
  const serverStateVector = encoding.toUint8Array(encoder2);
  client.ws.send(Buffer.from(serverStateVector));

  if (room.awareness.states.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageYjsAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      YAwareness.encodeAwarenessUpdate(
        room.awareness,
        Array.from(room.awareness.states.keys())
      )
    );
    const awarenessUpdate = encoding.toUint8Array(awarenessEncoder);
    client.ws.send(Buffer.from(awarenessUpdate));
  }
};

const handleSyncStep2 = (decoder: decoding.Decoder, room: DocumentRoom, client: Client) => {
  Y.transact(room.ydoc, () => {
    YSync.readSyncStep2(decoder, room.ydoc, client);
  }, client);

  scheduleSave(room, client.username);
};

const handleUpdate = (decoder: decoding.Decoder, room: DocumentRoom, client: Client) => {
  const update = decoding.readVarUint8Array(decoder);
  
  Y.transact(room.ydoc, () => {
    Y.applyUpdate(room.ydoc, update, client);
  }, client);
};

const handleAwareness = (decoder: decoding.Decoder, room: DocumentRoom, client: Client) => {
  const update = decoding.readVarUint8Array(decoder);
  YAwareness.applyAwarenessUpdate(room.awareness, update, client);
};

const getOrCreateRoom = async (docName: string, userId: string, username: string): Promise<DocumentRoom | null> => {
  let room = rooms.get(docName);
  
  if (room) {
    if (room.userId !== userId) {
      return null;
    }
    return room;
  }

  const snippet = await Snippet.findOne({ ydocId: docName, userId });
  
  if (!snippet) {
    return null;
  }

  const ydoc = new Y.Doc();
  const awareness = new YAwareness.Awareness(ydoc);
  
  if (snippet.snapshot && snippet.snapshot.length > 0) {
    try {
      Y.applyUpdate(ydoc, new Uint8Array(snippet.snapshot));
    } catch (error) {
      console.error('Error applying snapshot:', error);
    }
  }

  room = {
    ydoc,
    awareness,
    clients: new Set<Client>(),
    snippetId: docName,
    userId,
    currentVersion: snippet.version || 0,
    updateHandler: () => {},
    awarenessHandler: () => {}
  } as DocumentRoom;

  const updateHandler = (update: Uint8Array, origin: any) => {
    if (origin === null || origin === undefined) {
      scheduleSave(room!, 'server');
      return;
    }
    
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageYjsUpdate);
    encoding.writeVarUint8Array(encoder, update);
    const message = encoding.toUint8Array(encoder);
    
    broadcastToClients(room!, message, origin);
    scheduleSave(room!, origin?.username || 'server');
  };

  const awarenessHandler = (
    { added, updated, removed }:
    { added: Array<number>, updated: Array<number>, removed: Array<number> },
    origin: any
  ) => {
    const changedClients = added.concat(updated).concat(removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageYjsAwareness);
    encoding.writeVarUint8Array(
      encoder,
      YAwareness.encodeAwarenessUpdate(room!.awareness, changedClients)
    );
    const message = encoding.toUint8Array(encoder);
    
    broadcastToClients(room!, message, origin);
  };

  room.updateHandler = updateHandler;
  room.awarenessHandler = awarenessHandler;

  ydoc.on('update', updateHandler);
  awareness.on('change', awarenessHandler);

  rooms.set(docName, room);
  return room;
};

const broadcastToClients = (room: DocumentRoom, message: Uint8Array, sender: any) => {
  room.clients.forEach((client) => {
    const isSender = sender && (
      sender === client ||
      (sender.ws && sender.ws === client.ws)
    );
    
    if (!isSender && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(Buffer.from(message));
    }
  });
};

const scheduleSave = (room: DocumentRoom, username: string) => {
  if (room.saveTimeout) {
    clearTimeout(room.saveTimeout);
  }

  room.saveTimeout = setTimeout(async () => {
    await saveDocument(room, username);
  }, SAVE_DEBOUNCE_MS);
};

const saveDocument = async (room: DocumentRoom, username: string) => {
  try {
    const snapshot = Y.encodeStateAsUpdate(room.ydoc);
    const titleText = room.ydoc.getText('title').toString();
    
    room.currentVersion += 1;
    const newVersion = room.currentVersion;

    await Snippet.findOneAndUpdate(
      { ydocId: room.snippetId },
      {
        snapshot: Buffer.from(snapshot),
        version: newVersion,
        title: titleText,
        lastModifiedBy: username,
        updatedAt: new Date()
      }
    );

    await SnippetVersion.create({
      ydocId: room.snippetId,
      userId: room.userId,
      snapshot: Buffer.from(snapshot),
      title: titleText,
      version: newVersion,
      modifiedBy: username,
      description: `版本 ${newVersion}`
    });

    const versionCount = await SnippetVersion.countDocuments({ ydocId: room.snippetId });
    if (versionCount > MAX_VERSION_HISTORY) {
      const oldestVersions = await SnippetVersion
        .find({ ydocId: room.snippetId })
        .sort({ version: 1 })
        .limit(versionCount - MAX_VERSION_HISTORY)
        .select('_id');
      
      const idsToRemove = oldestVersions.map((v) => v._id);
      await SnippetVersion.deleteMany({ _id: { $in: idsToRemove } });
    }
  } catch (error) {
    console.error('Error saving document:', error);
  }
};

const handleDisconnect = (docName: string, client: Client) => {
  const room = rooms.get(docName);
  if (!room) return;

  room.clients.delete(client);

  const changedClients = Array.from(client.awareness.states.keys()) as Array<number>;
  if (changedClients.length > 0) {
    YAwareness.applyAwarenessUpdate(
      room.awareness,
      YAwareness.encodeAwarenessUpdate(room.awareness, changedClients, {
        user: null
      }),
      client
    );
  }

  client.awareness.destroy();

  if (room.clients.size === 0) {
    if (room.saveTimeout) {
      clearTimeout(room.saveTimeout);
    }
    
    room.ydoc.off('update', room.updateHandler);
    room.awareness.off('change', room.awarenessHandler);
    
    saveDocument(room, client.username).finally(() => {
      room.ydoc.destroy();
      room.awareness.destroy();
      rooms.delete(docName);
    });
  }
};

export const rollbackToVersion = async (ydocId: string, targetVersion: number, userId: string, username: string): Promise<boolean> => {
  const room = rooms.get(ydocId);
  
  const versionRecord = await SnippetVersion.findOne({ ydocId, version: targetVersion, userId });
  if (!versionRecord) {
    return false;
  }

  const targetSnapshot = new Uint8Array(versionRecord.snapshot);
  
  if (room) {
    const currentTitle = room.ydoc.getText('title').toString();
    const currentContent = room.ydoc.getText('content').toString();

    const rollbackDoc = new Y.Doc();
    Y.applyUpdate(rollbackDoc, targetSnapshot);
    const targetTitle = rollbackDoc.getText('title').toString();
    const targetContent = rollbackDoc.getText('content').toString();
    rollbackDoc.destroy();

    Y.transact(room.ydoc, () => {
      const titleText = room.ydoc.getText('title');
      titleText.delete(0, titleText.length);
      titleText.insert(0, targetTitle);

      const contentText = room.ydoc.getText('content');
      contentText.delete(0, contentText.length);
      contentText.insert(0, targetContent);
    }, { type: 'rollback', username });

    const fullUpdate = Y.encodeStateAsUpdate(room.ydoc);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageYjsUpdate);
    encoding.writeVarUint8Array(encoder, fullUpdate);
    const message = encoding.toUint8Array(encoder);
    
    room.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(Buffer.from(message));
      }
    });

    room.currentVersion += 1;
    const newVersion = room.currentVersion;
    const titleText = room.ydoc.getText('title').toString();

    await Snippet.findOneAndUpdate(
      { ydocId },
      {
        snapshot: Buffer.from(fullUpdate),
        version: newVersion,
        title: titleText,
        lastModifiedBy: username,
        updatedAt: new Date()
      }
    );

    await SnippetVersion.create({
      ydocId,
      userId,
      snapshot: Buffer.from(fullUpdate),
      title: titleText,
      version: newVersion,
      modifiedBy: username,
      description: `回滚到版本 ${targetVersion}`
    });

    const versionCount = await SnippetVersion.countDocuments({ ydocId });
    if (versionCount > MAX_VERSION_HISTORY) {
      const oldestVersions = await SnippetVersion
        .find({ ydocId })
        .sort({ version: 1 })
        .limit(versionCount - MAX_VERSION_HISTORY)
        .select('_id');
      
      const idsToRemove = oldestVersions.map((v) => v._id);
      await SnippetVersion.deleteMany({ _id: { $in: idsToRemove } });
    }
  } else {
    const snippet = await Snippet.findOne({ ydocId, userId });
    if (!snippet) {
      return false;
    }

    const newVersion = (snippet.version || 0) + 1;

    await Snippet.findOneAndUpdate(
      { ydocId },
      {
        snapshot: Buffer.from(targetSnapshot),
        version: newVersion,
        title: versionRecord.title,
        lastModifiedBy: username,
        updatedAt: new Date()
      }
    );

    await SnippetVersion.create({
      ydocId,
      userId,
      snapshot: Buffer.from(targetSnapshot),
      title: versionRecord.title,
      version: newVersion,
      modifiedBy: username,
      description: `回滚到版本 ${targetVersion}`
    });

    const versionCount = await SnippetVersion.countDocuments({ ydocId });
    if (versionCount > MAX_VERSION_HISTORY) {
      const oldestVersions = await SnippetVersion
        .find({ ydocId })
        .sort({ version: 1 })
        .limit(versionCount - MAX_VERSION_HISTORY)
        .select('_id');
      
      const idsToRemove = oldestVersions.map((v) => v._id);
      await SnippetVersion.deleteMany({ _id: { $in: idsToRemove } });
    }
  }

  return true;
};

export default setupYWebsocket;
