import { useEffect, useState, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { v4 as uuidv4 } from 'uuid';

const USER_COLORS = [
  '#007acc', '#d97706', '#059669', '#dc2626', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#2563eb'
];

const docCache = new Map();
const persistenceCache = new Map();

export function useYjs(roomId, userName) {
  const [ydoc, setYdoc] = useState(null);
  const [provider, setProvider] = useState(null);
  const [awareness, setAwareness] = useState(null);
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('disconnected');
  const [isLoading, setIsLoading] = useState(true);
  
  const clientIdRef = useRef(uuidv4());
  const colorRef = useRef(USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]);
  const isSyncingRef = useRef(false);
  const localUpdateCountRef = useRef(0);
  const providerRef = useRef(null);

  const getOrCreateDoc = useCallback((roomId) => {
    if (docCache.has(roomId)) {
      return docCache.get(roomId);
    }

    const ydoc = new Y.Doc({
      guid: `room-${roomId}`,
      gc: true,
      gcFilter: () => true
    });

    docCache.set(roomId, ydoc);
    return ydoc;
  }, []);

  const getOrCreatePersistence = useCallback((roomId, ydoc) => {
    if (persistenceCache.has(roomId)) {
      return persistenceCache.get(roomId);
    }

    const persistence = new IndexeddbPersistence(
      `yjs-crdt-editor-${roomId}`,
      ydoc
    );

    persistenceCache.set(roomId, persistence);
    return persistence;
  }, []);

  useEffect(() => {
    if (!roomId) return;

    const ydoc = getOrCreateDoc(roomId);
    setIsLoading(true);
    isSyncingRef.current = true;
    localUpdateCountRef.current = 0;

    const persistence = getOrCreatePersistence(roomId, ydoc);

    const provider = new WebsocketProvider(
      'ws://localhost:3001',
      roomId,
      ydoc,
      {
        connect: false,
        params: { room: roomId },
        maxBackoffTime: 2500,
        resyncInterval: -1
      }
    );

    providerRef.current = provider;

    const awareness = provider.awareness;

    const handleStatus = ({ status }) => {
      setStatus(status);
      
      if (status === 'connected') {
        const syncTimeout = setTimeout(() => {
          isSyncingRef.current = false;
          setIsLoading(false);
        }, 500);
        
        return () => clearTimeout(syncTimeout);
      }
    };

    const handleAwarenessChange = () => {
      const states = awareness.getStates();
      const userList = Array.from(states.entries())
        .filter(([_, state]) => state.user)
        .map(([id, state]) => ({
          id,
          name: state.user.name,
          color: state.user.color,
          cursor: state.cursor
        }));
      setUsers(userList);
    };

    const handleSync = (isSynced, event) => {
      if (isSynced) {
        isSyncingRef.current = false;
        setIsLoading(false);
      }
    };

    const handleDocUpdate = (update, origin, doc) => {
      if (origin !== 'y-websocket' && origin !== 'y-indexeddb') {
        localUpdateCountRef.current++;
      }
    };

    const handlePersistenceSynced = () => {
      if (status === 'connected') {
        isSyncingRef.current = false;
        setIsLoading(false);
      }
      provider.connect();
    };

    provider.on('status', handleStatus);
    provider.on('sync', handleSync);
    awareness.on('change', handleAwarenessChange);
    ydoc.on('update', handleDocUpdate);
    persistence.on('synced', handlePersistenceSynced);

    persistence.whenSynced.then(() => {
      setIsLoading(false);
      isSyncingRef.current = false;
      
      if (!provider.wsconnected) {
        provider.connect();
      }
    });

    setYdoc(ydoc);
    setProvider(provider);
    setAwareness(awareness);

    return () => {
      provider.off('status', handleStatus);
      provider.off('sync', handleSync);
      awareness.off('change', handleAwarenessChange);
      ydoc.off('update', handleDocUpdate);
      persistence.off('synced', handlePersistenceSynced);

      awareness.setLocalState(null);
      provider.disconnect();
      
      providerRef.current = null;
    };
  }, [roomId, getOrCreateDoc, getOrCreatePersistence]);

  const updateUserName = useCallback((newName) => {
    if (awareness) {
      awareness.setLocalStateField('user', {
        name: newName,
        color: colorRef.current,
        id: clientIdRef.current
      });
    }
  }, [awareness]);

  useEffect(() => {
    if (awareness && userName) {
      updateUserName(userName);
    }
  }, [awareness, userName, updateUserName]);

  const forceSync = useCallback(() => {
    if (providerRef.current) {
      if (providerRef.current.wsconnected) {
        providerRef.current.disconnect();
      }
      setTimeout(() => {
        if (providerRef.current) {
          providerRef.current.connect();
        }
      }, 100);
    }
  }, []);

  const getDocState = useCallback(() => {
    if (!ydoc) return null;
    return {
      version: Y.encodeStateVector(ydoc),
      content: ydoc.getText('monaco').toString(),
      localUpdates: localUpdateCountRef.current
    };
  }, [ydoc]);

  return {
    ydoc,
    provider,
    awareness,
    users,
    status,
    isLoading,
    updateUserName,
    forceSync,
    getDocState,
    clientId: clientIdRef.current,
    userColor: colorRef.current
  };
}
