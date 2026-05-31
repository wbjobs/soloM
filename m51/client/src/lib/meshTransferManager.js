import webrtcManager from './webrtcManager.js';
import { readChunkFromFile, crc32, chunksToBlob, downloadFile, CHUNK_SIZE } from './fileChunker.js';

const ACK_TIMEOUT_MS = 5000;
const MAX_RETRIES = 5;
const MAX_INFLIGHT_PER_PEER = 4;
const MAX_PENDING_INCOMING = 64;
const INCOMING_STORE_LIMIT = 512;
const STATE_PERSIST_PREFIX = 'webrtc_transfer_state_';

function createBitmap(totalChunks) {
  return new Uint8Array(Math.ceil(totalChunks / 8));
}

function setBitmapBit(bitmap, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  bitmap[byteIndex] |= (1 << bitIndex);
}

function getBitmapBit(bitmap, index) {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  return (bitmap[byteIndex] & (1 << bitIndex)) !== 0;
}

function bitmapToBase64(bitmap) {
  return btoa(String.fromCharCode.apply(null, bitmap));
}

function base64ToBitmap(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

class MeshTransferManager {
  constructor() {
    this.outgoingTransfers = new Map();
    this.incomingTransfers = new Map();
    this.persistedIncomingStates = new Map();
    this.listeners = new Map();
    this._timers = new Map();
    this._inflightChunks = new Map();
    this._downloadURLs = new Map();
    this._peerTransferRates = new Map();
    this.setupListeners();
    this._loadPersistedStates();
  }

  setupListeners() {
    webrtcManager.on('FILE_OFFER', (data) => {
      this.handleFileOffer(data);
    });

    webrtcManager.on('CHUNK_REQUEST', (data) => {
      this.handleChunkRequest(data);
    });

    webrtcManager.on('CHUNK_DATA', (data) => {
      this.handleChunkData(data);
    });

    webrtcManager.on('TRANSFER_COMPLETE', (data) => {
      this.handleTransferComplete(data);
    });

    webrtcManager.on('CHUNK_ACK', (data) => {
      this.handleChunkAck(data);
    });

    webrtcManager.on('peerDisconnected', (peerId) => {
      this.handlePeerFailure(peerId);
    });

    webrtcManager.on('peerReconnected', (peerId) => {
      this.handlePeerReconnected(peerId);
    });

    webrtcManager.on('FILE_STATE_SYNC', (data) => {
      this.handleFileStateSync(data);
    });

    webrtcManager.on('FILE_STATE_REQUEST', (data) => {
      this.handleFileStateRequest(data);
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  _setTimer(key, fn, delay) {
    this._clearTimer(key);
    this._timers.set(key, setTimeout(fn, delay));
  }

  _clearTimer(key) {
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key));
      this._timers.delete(key);
    }
  }

  _loadPersistedStates() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STATE_PERSIST_PREFIX)) {
          const transferHash = key.substring(STATE_PERSIST_PREFIX.length);
          const state = JSON.parse(localStorage.getItem(key));
          this.persistedIncomingStates.set(transferHash, {
            ...state,
            receivedBitmap: base64ToBitmap(state.receivedBitmapBase64),
            createdAt: state.createdAt
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load persisted transfer states:', e);
    }
  }

  _persistIncomingState(transfer) {
    try {
      const transferHash = transfer.fileInfo.hash;
      const state = {
        transferHash,
        fileName: transfer.fileInfo.name,
        fileSize: transfer.fileInfo.size,
        fileType: transfer.fileInfo.type,
        totalChunks: transfer.fileInfo.totalChunks,
        chunkHashes: transfer.fileInfo.chunkHashes,
        receivedBitmapBase64: bitmapToBase64(transfer.receivedBitmap),
        createdAt: transfer.startTime
      };
      localStorage.setItem(STATE_PERSIST_PREFIX + transferHash, JSON.stringify(state));
      this.persistedIncomingStates.set(transferHash, {
        ...state,
        receivedBitmap: transfer.receivedBitmap
      });
    } catch (e) {
      console.warn('Failed to persist transfer state:', e);
    }
  }

  _removePersistedState(transferHash) {
    try {
      localStorage.removeItem(STATE_PERSIST_PREFIX + transferHash);
      this.persistedIncomingStates.delete(transferHash);
    } catch (e) {
      console.warn('Failed to remove persisted state:', e);
    }
  }

  startOutgoingTransfer(fileInfo) {
    const transferId = `${fileInfo.hash}_${Date.now()}`;

    const transfer = {
      id: transferId,
      fileInfo: {
        name: fileInfo.name,
        size: fileInfo.size,
        type: fileInfo.type,
        hash: fileInfo.hash,
        totalChunks: fileInfo.totalChunks,
        chunkHashes: fileInfo.chunkHashes
      },
      file: fileInfo.file,
      chunkStatus: new Array(fileInfo.totalChunks).fill('pending'),
      chunkRetries: new Array(fileInfo.totalChunks).fill(0),
      peerAckCounts: new Map(),
      startTime: Date.now(),
      bytesSent: 0,
      acknowledged: 0
    };

    this.outgoingTransfers.set(transferId, transfer);
    this.broadcastFileOffer(transferId, transfer.fileInfo);

    return transferId;
  }

  broadcastFileOffer(transferId, fileInfo) {
    const connectedPeers = webrtcManager.getConnectedPeers();

    connectedPeers.forEach(peerId => {
      webrtcManager.sendJSON(peerId, {
        type: 'FILE_OFFER',
        transferId,
        fileInfo,
        senderId: webrtcManager.peerId
      });
    });

    this.emit('transferStarted', {
      transferId,
      fileInfo,
      peerCount: connectedPeers.length
    });
  }

  handleFileOffer(data) {
    const { transferId, fileInfo, peerId } = data;

    const existing = this.incomingTransfers.get(transferId);
    if (existing) {
      existing.sources.add(peerId);
      this.sendFileStateSync(peerId, transferId);
      return;
    }

    const persistedState = this.persistedIncomingStates.get(fileInfo.hash);
    let isResume = false;
    let receivedBitmap = createBitmap(fileInfo.totalChunks);
    let receivedChunks = new Set();

    if (persistedState && 
        persistedState.totalChunks === fileInfo.totalChunks &&
        persistedState.chunkHashes?.length === fileInfo.chunkHashes?.length) {
      isResume = true;
      receivedBitmap = persistedState.receivedBitmap;
      for (let i = 0; i < fileInfo.totalChunks; i++) {
        if (getBitmapBit(receivedBitmap, i)) {
          receivedChunks.add(i);
        }
      }
      this.emit('transferResuming', {
        transferId,
        fileInfo,
        resumedChunks: receivedChunks.size
      });
    }

    const transfer = {
      id: transferId,
      fileInfo,
      chunks: new Map(),
      pendingChunks: [],
      requestedChunks: new Set(),
      receivedChunks,
      receivedBitmap,
      failedChunks: new Map(),
      startTime: Date.now(),
      bytesReceived: 0,
      sources: new Set([peerId]),
      inflightCount: 0,
      blobURL: null,
      isResume
    };

    this.incomingTransfers.set(transferId, transfer);

    this.emit('incomingFileOffer', {
      transferId,
      fileInfo,
      fromPeer: peerId,
      isResume,
      resumedChunks: receivedChunks.size
    });
  }

  acceptTransfer(transferId) {
    const transfer = this.incomingTransfers.get(transferId);
    if (!transfer) return;

    Array.from(transfer.sources).forEach(peerId => {
      this.sendFileStateSync(peerId, transferId);
    });

    this.startMeshDownload(transferId, transfer);
  }

  sendFileStateSync(peerId, transferId) {
    const transfer = this.incomingTransfers.get(transferId);
    if (!transfer) return;

    webrtcManager.sendJSON(peerId, {
      type: 'FILE_STATE_SYNC',
      transferId,
      fileHash: transfer.fileInfo.hash,
      totalChunks: transfer.fileInfo.totalChunks,
      receivedBitmapBase64: bitmapToBase64(transfer.receivedBitmap)
    });
  }

  handleFileStateSync(data) {
    const { peerId, transferId, receivedBitmapBase64, totalChunks } = data;
    const transfer = this.outgoingTransfers.get(transferId);
    if (!transfer) return;

    const receivedBitmap = base64ToBitmap(receivedBitmapBase64);
    let resumedCount = 0;
    for (let i = 0; i < totalChunks; i++) {
      if (getBitmapBit(receivedBitmap, i)) {
        if (transfer.chunkStatus[i] === 'pending') {
          transfer.chunkStatus[i] = 'acknowledged';
          transfer.acknowledged++;
        }
        resumedCount++;
      }
    }

    if (resumedCount > 0) {
      this.emit('transferResumedPeer', {
        transferId,
        peerId,
        resumedCount,
        totalChunks
      });
    }
  }

  handleFileStateRequest(data) {
    const { peerId, transferId } = data;
    const transfer = this.incomingTransfers.get(transferId);
    if (!transfer) return;

    this.sendFileStateSync(peerId, transferId);
  }

  startMeshDownload(transferId, transfer) {
    const { totalChunks } = transfer.fileInfo;
    const sources = Array.from(transfer.sources);

    const chunksPerPeer = Math.ceil(totalChunks / sources.length);

    sources.forEach((peerId, peerIndex) => {
      const startChunk = peerIndex * chunksPerPeer;
      const endChunk = Math.min(startChunk + chunksPerPeer, totalChunks);

      for (let i = startChunk; i < endChunk; i++) {
        if (!transfer.receivedChunks.has(i)) {
          transfer.pendingChunks.push({ index: i, peerId });
        }
      }
    });

    this.scheduleChunkRequests(transferId);

    this.emit('downloadStarted', {
      transferId,
      fileInfo: transfer.fileInfo,
      sourceCount: sources.length,
      resumedChunks: transfer.receivedChunks.size,
      remainingChunks: totalChunks - transfer.receivedChunks.size
    });
  }

  scheduleChunkRequests(transferId) {
    const transfer = this.incomingTransfers.get(transferId);
    if (!transfer || transfer.pendingChunks.length === 0) return;

    const peerInflight = new Map();

    while (transfer.pendingChunks.length > 0) {
      const available = transfer.pendingChunks.filter(item => {
        const current = peerInflight.get(item.peerId) || 0;
        return current < MAX_INFLIGHT_PER_PEER;
      });

      if (available.length === 0) break;

      const item = available[0];
      transfer.pendingChunks.splice(transfer.pendingChunks.indexOf(item), 1);

      if (transfer.receivedChunks.has(item.index) || transfer.requestedChunks.has(item.index)) {
        continue;
      }

      this.requestChunk(item.peerId, transferId, item.index);
      transfer.requestedChunks.add(item.index);
      transfer.inflightCount++;
      peerInflight.set(item.peerId, (peerInflight.get(item.peerId) || 0) + 1);

      const timerKey = `${transferId}_${item.index}`;
      this._setTimer(timerKey, () => {
        this.handleChunkTimeout(transferId, item.index, item.peerId);
      }, ACK_TIMEOUT_MS);
    }
  }

  requestChunk(peerId, transferId, chunkIndex) {
    webrtcManager.sendJSON(peerId, {
      type: 'CHUNK_REQUEST',
      transferId,
      chunkIndex
    });
  }

  async handleChunkRequest(data) {
    const { peerId, transferId, chunkIndex } = data;
    const transfer = this.outgoingTransfers.get(transferId);

    if (!transfer) return;
    if (chunkIndex < 0 || chunkIndex >= transfer.fileInfo.totalChunks) return;
    if (transfer.chunkStatus[chunkIndex] === 'acknowledged') return;

    let chunkData;
    try {
      chunkData = await readChunkFromFile(transfer.file, chunkIndex, CHUNK_SIZE);
    } catch (error) {
      console.error(`Failed to read chunk ${chunkIndex}:`, error);
      return;
    }
    if (!chunkData) return;

    const chunkCrc = crc32(chunkData);

    const headerSize = 12;
    const transferIdBytes = new TextEncoder().encode(transferId);
    const payload = new Uint8Array(headerSize + transferIdBytes.length + chunkData.byteLength);
    const view = new DataView(payload.buffer);

    view.setInt32(0, chunkIndex);
    view.setInt32(4, transferIdBytes.length);
    view.setUint32(8, chunkCrc);

    payload.set(transferIdBytes, headerSize);
    payload.set(new Uint8Array(chunkData), headerSize + transferIdBytes.length);

    const sent = webrtcManager.send(peerId, payload.buffer);

    if (sent) {
      if (transfer.chunkStatus[chunkIndex] === 'pending') {
        transfer.chunkStatus[chunkIndex] = 'sent';
      }
      transfer.bytesSent += chunkData.byteLength;

      const peerRate = this._peerTransferRates.get(peerId) || { uploadBytes: 0, lastUpdate: 0 };
      peerRate.uploadBytes += chunkData.byteLength;
      peerRate.lastUpdate = Date.now();
      this._peerTransferRates.set(peerId, peerRate);

      this.emit('chunkSent', {
        transferId,
        chunkIndex,
        peerId,
        bytesSent: transfer.bytesSent,
        progress: (transfer.bytesSent / transfer.fileInfo.size) * 100,
        chunkSize: chunkData.byteLength
      });
    }
  }

  handleChunkData(data) {
    const { peerId, data: binaryData } = data;

    try {
      const view = new DataView(binaryData);
      const chunkIndex = view.getInt32(0);
      const transferIdLength = view.getInt32(4);
      const receivedCrc = view.getUint32(8);

      const transferIdBytes = new Uint8Array(binaryData, 12, transferIdLength);
      const transferId = new TextDecoder().decode(transferIdBytes);
      const chunkData = binaryData.slice(12 + transferIdLength);

      const actualCrc = crc32(chunkData);
      if (actualCrc !== receivedCrc) {
        console.warn(`CRC mismatch for chunk ${chunkIndex}: expected ${receivedCrc}, got ${actualCrc}`);
        this._clearTimer(`${transferId}_${chunkIndex}`);

        const transfer = this.incomingTransfers.get(transferId);
        if (transfer) {
          transfer.requestedChunks.delete(chunkIndex);
          transfer.inflightCount = Math.max(0, transfer.inflightCount - 1);

          const retryCount = transfer.failedChunks.get(chunkIndex) || 0;
          if (retryCount < MAX_RETRIES) {
            transfer.failedChunks.set(chunkIndex, retryCount + 1);
            transfer.pendingChunks.push({ index: chunkIndex, peerId });
            this.scheduleChunkRequests(transferId);
          } else {
            console.error(`Chunk ${chunkIndex} failed after ${MAX_RETRIES} retries`);
            this.emit('chunkFailed', { transferId, chunkIndex, reason: 'crc_mismatch_max_retries' });
          }
        }
        return;
      }

      const transfer = this.incomingTransfers.get(transferId);
      if (!transfer) return;

      this._clearTimer(`${transferId}_${chunkIndex}`);

      if (transfer.receivedChunks.has(chunkIndex)) {
        webrtcManager.sendJSON(peerId, {
          type: 'CHUNK_ACK',
          transferId,
          chunkIndex
        });
        transfer.inflightCount = Math.max(0, transfer.inflightCount - 1);
        this.scheduleChunkRequests(transferId);
        return;
      }

      if (transfer.chunks.size >= INCOMING_STORE_LIMIT) {
        let oldestIndex = null;
        let oldestSize = Infinity;
        for (const [idx, chunk] of transfer.chunks) {
          if (chunk.lastAccess < oldestSize) {
            oldestSize = chunk.lastAccess;
            oldestIndex = idx;
          }
        }
        if (oldestIndex !== null) {
          transfer.chunks.delete(oldestIndex);
        }
      }

      transfer.chunks.set(chunkIndex, {
        index: chunkIndex,
        data: chunkData,
        lastAccess: Date.now()
      });
      transfer.receivedChunks.add(chunkIndex);
      setBitmapBit(transfer.receivedBitmap, chunkIndex);
      transfer.requestedChunks.delete(chunkIndex);
      transfer.failedChunks.delete(chunkIndex);
      transfer.bytesReceived += chunkData.byteLength;
      transfer.inflightCount = Math.max(0, transfer.inflightCount - 1);

      const peerRate = this._peerTransferRates.get(peerId) || { downloadBytes: 0, lastUpdate: 0 };
      peerRate.downloadBytes = (peerRate.downloadBytes || 0) + chunkData.byteLength;
      peerRate.lastUpdate = Date.now();
      this._peerTransferRates.set(peerId, peerRate);

      webrtcManager.sendJSON(peerId, {
        type: 'CHUNK_ACK',
        transferId,
        chunkIndex
      });

      this._persistIncomingState(transfer);

      const progress = (transfer.receivedChunks.size / transfer.fileInfo.totalChunks) * 100;

      this.emit('chunkReceived', {
        transferId,
        chunkIndex,
        peerId,
        bytesReceived: transfer.bytesReceived,
        progress,
        chunkSize: chunkData.byteLength
      });

      if (transfer.receivedChunks.size === transfer.fileInfo.totalChunks) {
        this.completeIncomingTransfer(transferId);
      } else {
        this.scheduleChunkRequests(transferId);
      }
    } catch (error) {
      console.error('Error parsing chunk data:', error);
    }
  }

  handleChunkAck(data) {
    const { peerId, transferId, chunkIndex } = data;
    const transfer = this.outgoingTransfers.get(transferId);

    if (!transfer) return;

    if (transfer.chunkStatus[chunkIndex] === 'sent') {
      transfer.chunkStatus[chunkIndex] = 'acknowledged';
      transfer.acknowledged++;
    }

    const progress = (transfer.acknowledged / transfer.fileInfo.totalChunks) * 100;

    this.emit('transferProgress', {
      transferId,
      progress,
      acknowledged: transfer.acknowledged,
      total: transfer.fileInfo.totalChunks
    });

    if (transfer.acknowledged === transfer.fileInfo.totalChunks) {
      this.completeOutgoingTransfer(transferId);
    }
  }

  handleChunkTimeout(transferId, chunkIndex, originalPeerId) {
    const transfer = this.incomingTransfers.get(transferId);
    if (!transfer) return;

    if (transfer.receivedChunks.has(chunkIndex)) return;

    transfer.requestedChunks.delete(chunkIndex);
    transfer.inflightCount = Math.max(0, transfer.inflightCount - 1);

    const retryCount = transfer.failedChunks.get(chunkIndex) || 0;

    if (retryCount < MAX_RETRIES) {
      const newRetryCount = retryCount + 1;
      transfer.failedChunks.set(chunkIndex, newRetryCount);

      const sources = Array.from(transfer.sources);
      const nextPeerIndex = (sources.indexOf(originalPeerId) + newRetryCount) % sources.length;
      const nextPeer = sources[nextPeerIndex];

      transfer.pendingChunks.push({ index: chunkIndex, peerId: nextPeer });
      this.scheduleChunkRequests(transferId);

      this.emit('chunkRetry', {
        transferId,
        chunkIndex,
        retryCount: newRetryCount,
        fromPeer: nextPeer
      });
    } else {
      console.error(`Chunk ${chunkIndex} timed out after ${MAX_RETRIES} retries`);
      this.emit('chunkFailed', { transferId, chunkIndex, reason: 'timeout_max_retries' });
    }
  }

  handlePeerReconnected(peerId) {
    this.incomingTransfers.forEach((transfer, transferId) => {
      if (transfer.sources.has(peerId) && !transfer.blobURL) {
        webrtcManager.sendJSON(peerId, {
          type: 'FILE_STATE_REQUEST',
          transferId
        });

        for (let i = 0; i < transfer.fileInfo.totalChunks; i++) {
          if (!transfer.receivedChunks.has(i) && !transfer.requestedChunks.has(i)) {
            const isPending = transfer.pendingChunks.some(item => item.index === i);
            if (!isPending) {
              transfer.pendingChunks.push({ index: i, peerId });
            }
          }
        }

        this.scheduleChunkRequests(transferId);
      }
    });

    this.outgoingTransfers.forEach((transfer, transferId) => {
      if (webrtcManager.getConnectedPeers().includes(peerId)) {
        webrtcManager.sendJSON(peerId, {
          type: 'FILE_OFFER',
          transferId,
          fileInfo: transfer.fileInfo,
          senderId: webrtcManager.peerId
        });
      }
    });

    this.emit('peerReconnected', { peerId });
  }

  handlePeerFailure(peerId) {
    this.incomingTransfers.forEach((transfer, transferId) => {
      if (!transfer.sources.has(peerId)) return;

      const inflight = transfer.pendingChunks.filter(
        item => item.peerId === peerId && !transfer.receivedChunks.has(item.index)
      );

      inflight.forEach(item => {
        this._clearTimer(`${transferId}_${item.index}`);
        transfer.requestedChunks.delete(item.index);
        transfer.inflightCount = Math.max(0, transfer.inflightCount - 1);

        const retryCount = transfer.failedChunks.get(item.index) || 0;
        if (retryCount < MAX_RETRIES) {
          const sources = Array.from(transfer.sources).filter(id => id !== peerId);
          if (sources.length > 0) {
            const nextPeer = sources[retryCount % sources.length];
            transfer.pendingChunks.push({ index: item.index, peerId: nextPeer });
          }
        }
      });

      transfer.sources.delete(peerId);
      this.scheduleChunkRequests(transferId);
    });
  }

  completeIncomingTransfer(transferId) {
    const transfer = this.incomingTransfers.get(transferId);
    if (!transfer) return;

    for (let i = 0; i < transfer.fileInfo.totalChunks; i++) {
      if (!transfer.receivedChunks.has(i)) {
        console.error(`Missing chunk ${i} at completion, transfer incomplete`);
        this.emit('transferError', {
          transferId,
          reason: 'missing_chunks',
          missingCount: transfer.fileInfo.totalChunks - transfer.receivedChunks.size
        });
        return;
      }
    }

    const sortedChunks = Array.from(transfer.chunks.values()).sort((a, b) => a.index - b.index);
    const blob = new Blob(
      sortedChunks.map(c => c.data),
      { type: transfer.fileInfo.type }
    );

    const blobURL = URL.createObjectURL(blob);
    this._downloadURLs.set(transferId, blobURL);

    webrtcManager.broadcast({
      type: 'TRANSFER_COMPLETE',
      transferId,
      peerId: webrtcManager.peerId
    });

    this.emit('transferComplete', {
      transferId,
      fileInfo: transfer.fileInfo,
      blobURL,
      duration: Date.now() - transfer.startTime,
      bytesReceived: transfer.bytesReceived
    });

    this._removePersistedState(transfer.fileInfo.hash);

    transfer.chunks.clear();
    transfer.blobURL = blobURL;
  }

  completeOutgoingTransfer(transferId) {
    const transfer = this.outgoingTransfers.get(transferId);
    if (!transfer) return;

    this.emit('outgoingTransferComplete', {
      transferId,
      fileInfo: transfer.fileInfo,
      duration: Date.now() - transfer.startTime,
      bytesSent: transfer.bytesSent
    });

    this.outgoingTransfers.delete(transferId);
  }

  handleTransferComplete(data) {
    const { transferId, peerId } = data;
    this.emit('peerTransferComplete', {
      transferId,
      peerId
    });
  }

  downloadCompletedFile(transferId) {
    const transfer = this.incomingTransfers.get(transferId);
    if (!transfer) return;

    if (transfer.blobURL) {
      const a = document.createElement('a');
      a.href = transfer.blobURL;
      a.download = transfer.fileInfo.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const sortedChunks = Array.from(transfer.chunks.values()).sort((a, b) => a.index - b.index);
    const blob = new Blob(
      sortedChunks.map(c => c.data),
      { type: transfer.fileInfo.type }
    );
    downloadFile(blob, transfer.fileInfo.name);
  }

  cleanupTransfer(transferId) {
    const blobURL = this._downloadURLs.get(transferId);
    if (blobURL) {
      URL.revokeObjectURL(blobURL);
      this._downloadURLs.delete(transferId);
    }

    const incoming = this.incomingTransfers.get(transferId);
    if (incoming) {
      this._removePersistedState(incoming.fileInfo.hash);
    }

    this.incomingTransfers.delete(transferId);
    this.outgoingTransfers.delete(transferId);

    const timerKeysToDelete = [];
    this._timers.forEach((_, key) => {
      if (key.startsWith(transferId + '_')) {
        timerKeysToDelete.push(key);
      }
    });
    timerKeysToDelete.forEach(key => this._clearTimer(key));
  }

  getTransferStatus(transferId) {
    const incoming = this.incomingTransfers.get(transferId);
    const outgoing = this.outgoingTransfers.get(transferId);

    if (incoming) {
      return {
        type: 'incoming',
        fileInfo: incoming.fileInfo,
        received: incoming.receivedChunks.size,
        total: incoming.fileInfo.totalChunks,
        progress: (incoming.receivedChunks.size / incoming.fileInfo.totalChunks) * 100,
        sources: incoming.sources.size,
        inflight: incoming.inflightCount,
        pending: incoming.pendingChunks.length,
        failed: incoming.failedChunks.size,
        blobURL: incoming.blobURL,
        isResume: incoming.isResume,
        resumedChunks: incoming.isResume ? incoming.receivedChunks.size : 0
      };
    }

    if (outgoing) {
      return {
        type: 'outgoing',
        fileInfo: outgoing.fileInfo,
        acknowledged: outgoing.acknowledged,
        total: outgoing.fileInfo.totalChunks,
        progress: (outgoing.acknowledged / outgoing.fileInfo.totalChunks) * 100
      };
    }

    return null;
  }

  getAllTransfers() {
    const transfers = [];

    this.incomingTransfers.forEach((transfer, id) => {
      transfers.push({
        id,
        type: 'incoming',
        status: this.getTransferStatus(id)
      });
    });

    this.outgoingTransfers.forEach((transfer, id) => {
      transfers.push({
        id,
        type: 'outgoing',
        status: this.getTransferStatus(id)
      });
    });

    return transfers;
  }

  getPeerTransferRates() {
    const rates = {};
    this._peerTransferRates.forEach((rate, peerId) => {
      const webRtcSpeed = webrtcManager.getPeerSpeed(peerId);
      rates[peerId] = {
        uploadSpeed: webRtcSpeed.uploadSpeed,
        downloadSpeed: webRtcSpeed.downloadSpeed,
        totalUploadBytes: rate.uploadBytes || 0,
        totalDownloadBytes: rate.downloadBytes || 0
      };
    });

    webrtcManager.getConnectedPeers().forEach(peerId => {
      if (!rates[peerId]) {
        const webRtcSpeed = webrtcManager.getPeerSpeed(peerId);
        rates[peerId] = {
          uploadSpeed: webRtcSpeed.uploadSpeed,
          downloadSpeed: webRtcSpeed.downloadSpeed,
          totalUploadBytes: 0,
          totalDownloadBytes: 0
        };
      }
    });

    return rates;
  }

  getPersistedStates() {
    return Array.from(this.persistedIncomingStates.entries()).map(([hash, state]) => ({
      hash,
      fileName: state.fileName,
      fileSize: state.fileSize,
      totalChunks: state.totalChunks,
      receivedCount: Array.from(state.receivedBitmap).reduce((count, byte) => {
        let bits = 0;
        for (let i = 0; i < 8; i++) {
          if (byte & (1 << i)) bits++;
        }
        return count + bits;
      }, 0)
    }));
  }

  addPeerToTransfer(transferId, peerId) {
    const transfer = this.incomingTransfers.get(transferId);
    if (!transfer) return;

    transfer.sources.add(peerId);

    this.sendFileStateSync(peerId, transferId);

    for (let i = 0; i < transfer.fileInfo.totalChunks; i++) {
      if (!transfer.receivedChunks.has(i) && !transfer.requestedChunks.has(i)) {
        const isPending = transfer.pendingChunks.some(item => item.index === i);
        if (!isPending) {
          transfer.pendingChunks.push({ index: i, peerId });
        }
      }
    }

    this.scheduleChunkRequests(transferId);
  }

  cancelTransfer(transferId) {
    this.cleanupTransfer(transferId);
    this.emit('transferCancelled', { transferId });
  }
}

export default new MeshTransferManager();
