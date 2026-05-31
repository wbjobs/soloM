import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

const COMPACTION_DB_NAME = 'CRDTCompactionDB';
const COMPACTION_DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const COMPACTION_THRESHOLD = 500;
const COMPACTION_INTERVAL_MS = 60000;

class CompactionManager {
  constructor() {
    this.db = null;
    this.initPromise = this._initDB();
  }

  async _initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(COMPACTION_DB_NAME, COMPACTION_DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'roomName' });
        }
      };
    });
  }

  async _waitForInit() {
    if (!this.db) {
      await this.initPromise;
    }
  }

  async saveSnapshot(roomName, ydoc) {
    await this._waitForInit();
    const snapshot = Y.encodeStateAsUpdate(ydoc);
    const docSize = ydoc.getText('monaco')?.length || 0;

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(SNAPSHOT_STORE, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_STORE);
      const request = store.put({
        roomName,
        snapshot,
        docSize,
        timestamp: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadSnapshot(roomName) {
    await this._waitForInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(SNAPSHOT_STORE, 'readonly');
      const store = tx.objectStore(SNAPSHOT_STORE);
      const request = store.get(roomName);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSnapshot(roomName) {
    await this._waitForInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(SNAPSHOT_STORE, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_STORE);
      const request = store.delete(roomName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllSnapshots() {
    await this._waitForInit();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(SNAPSHOT_STORE, 'readonly');
      const store = tx.objectStore(SNAPSHOT_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
}

const compactionManager = new CompactionManager();

class EnhancedIndexedDBPersistence {
  constructor(roomName, ydoc) {
    this.roomName = roomName;
    this.ydoc = ydoc;
    this.provider = null;
    this._synced = false;
    this._listeners = new Map();
    this._updateCount = 0;
    this._compactionTimer = null;
    this._isCompacting = false;
  }

  async initialize() {
    this.emit('loadingProgress', { phase: 'snapshot', progress: 0 });

    const snapshot = await compactionManager.loadSnapshot(this.roomName);

    if (snapshot && snapshot.snapshot) {
      this.emit('loadingProgress', { phase: 'snapshot', progress: 50 });
      try {
        Y.applyUpdate(this.ydoc, snapshot.snapshot);
        console.log(`[EnhancedIDB] 快照加载完成, 文档大小: ${snapshot.docSize} 字符`);
      } catch (err) {
        console.warn('[EnhancedIDB] 快照加载失败，将使用增量数据:', err);
      }
    }

    this.emit('loadingProgress', { phase: 'incremental', progress: 60 });

    this.provider = new IndexeddbPersistence(
      `crdt-editor-${this.roomName}`,
      this.ydoc
    );

    return new Promise((resolve) => {
      if (this.provider.synced) {
        this._onSynced();
        resolve();
      } else {
        this.provider.on('synced', () => {
          this._onSynced();
          resolve();
        });
      }
    });
  }

  _onSynced() {
    this._synced = true;
    this.emit('loadingProgress', { phase: 'complete', progress: 100 });
    this.emit('synced');

    this._startPeriodicCompaction();

    this._updateCountListener = () => {
      this._updateCount++;
      if (this._updateCount >= COMPACTION_THRESHOLD) {
        this._triggerCompaction();
      }
    };
    this.ydoc.on('update', this._updateCountListener);
  }

  _startPeriodicCompaction() {
    if (this._compactionTimer) {
      clearInterval(this._compactionTimer);
    }
    this._compactionTimer = setInterval(() => {
      this._triggerCompaction();
    }, COMPACTION_INTERVAL_MS);
  }

  async _triggerCompaction() {
    if (this._isCompacting) return;

    this._isCompacting = true;
    try {
      await compactionManager.saveSnapshot(this.roomName, this.ydoc);
      this._updateCount = 0;
      console.log('[EnhancedIDB] 文档压缩完成');
    } catch (err) {
      console.error('[EnhancedIDB] 文档压缩失败:', err);
    } finally {
      this._isCompacting = false;
    }
  }

  get synced() {
    return this._synced;
  }

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(callback);
    }
  }

  emit(event, ...args) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).forEach((cb) => cb(...args));
    }
  }

  destroy() {
    if (this._compactionTimer) {
      clearInterval(this._compactionTimer);
      this._compactionTimer = null;
    }
    if (this._updateCountListener) {
      this.ydoc.off('update', this._updateCountListener);
    }
    if (this.provider) {
      this.provider.destroy();
    }
    this._listeners.clear();
  }
}

export { compactionManager, EnhancedIndexedDBPersistence };
export default EnhancedIndexedDBPersistence;
