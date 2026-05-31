import { verifyChunk } from './fileChunker';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const DATA_CHANNEL_LABEL = 'file-transfer';
const CHUNK_BUFFER_THRESHOLD = 1024 * 512;
const SLIDING_WINDOW_SIZE = 4;
const ACK_BATCH_INTERVAL = 200;
const GAP_CHECK_INTERVAL = 1500;
const RESEND_MAX_RETRIES = 8;
const BITMAP_BROADCAST_INTERVAL = 2000;

function createBitmap(totalChunks) {
  return new Uint8Array(Math.ceil(totalChunks / 8));
}

function setBitmap(bitmap, index) {
  const byte = Math.floor(index / 8);
  const bit = index % 8;
  bitmap[byte] |= (1 << bit);
}

function clearBitmap(bitmap, index) {
  const byte = Math.floor(index / 8);
  const bit = index % 8;
  bitmap[byte] &= ~(1 << bit);
}

function hasBitmap(bitmap, index) {
  const byte = Math.floor(index / 8);
  const bit = index % 8;
  return (bitmap[byte] & (1 << bit)) !== 0;
}

function countBitmapSet(bitmap, totalChunks) {
  let count = 0;
  for (let i = 0; i < totalChunks; i++) {
    if (hasBitmap(bitmap, i)) count++;
  }
  return count;
}

class PeerConnection {
  constructor(signaling, remotePeerId, isInitiator, service) {
    this.signaling = signaling;
    this.remotePeerId = remotePeerId;
    this.isInitiator = isInitiator;
    this.service = service;
    this.pc = null;
    this.dataChannel = null;
    this.connected = false;
    this.bitmap = null;

    this.sendWindowInFlight = new Map();
    this.receiveAckPending = new Set();
    this.resendCounts = new Map();

    this.sendWindowBase = 0;
    this.sendBytesSent = 0;
    this.bytesFromPeer = 0;

    this.ackTimer = null;
    this.bitmapTimer = null;
    this.gapTimer = null;

    this._create();
  }

  _create() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendIceCandidate(this.remotePeerId, event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      switch (this.pc.connectionState) {
        case 'connected':
          this.connected = true;
          this.service._onPeerConnected(this.remotePeerId);
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          this.connected = false;
          this.service._onPeerDisconnected(this.remotePeerId);
          break;
        default:
          break;
      }
    };

    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this._setupDataChannel();
    };

    if (this.isInitiator) {
      this.dataChannel = this.pc.createDataChannel(DATA_CHANNEL_LABEL, {
        ordered: false,
        maxRetransmits: 3,
      });
      this.dataChannel.bufferedAmountLowThreshold = CHUNK_BUFFER_THRESHOLD;
      this._setupDataChannel();
      this._doCreateOffer();
    }
  }

  async _doCreateOffer() {
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.signaling.sendOffer(this.remotePeerId, offer);
    } catch (e) {
      console.error(`[Peer ${this.remotePeerId.slice(0, 8)}] Offer error:`, e);
    }
  }

  async handleOffer(sdp) {
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.signaling.sendAnswer(this.remotePeerId, answer);
    } catch (e) {
      console.error(`[Peer ${this.remotePeerId.slice(0, 8)}] Offer handle error:`, e);
    }
  }

  async handleAnswer(sdp) {
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (e) {
      console.error(`[Peer ${this.remotePeerId.slice(0, 8)}] Answer handle error:`, e);
    }
  }

  async handleIceCandidate(candidate) {
    if (candidate) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error(`[Peer ${this.remotePeerId.slice(0, 8)}] ICE error:`, e);
      }
    }
  }

  _setupDataChannel() {
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      this.connected = true;
      this.service._onPeerConnected(this.remotePeerId);
      this._startAckTimer();
      this._startBitmapTimer();
      this._startGapTimer();

      if (this.service.myBitmap && this.service.totalChunks) {
        this._sendBitmap();
      }
    };

    this.dataChannel.onclose = () => {
      this.connected = false;
      this._stopTimers();
      this.service._onPeerDisconnected(this.remotePeerId);
    };

    this.dataChannel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this._handleControlMessage(JSON.parse(event.data));
      } else {
        this._handleChunkData(event.data);
      }
    };
  }

  _handleControlMessage(msg) {
    switch (msg.type) {
      case 'metadata':
        this.service._handleMetadata(msg.metadata);
        break;

      case 'bitmap':
        this._handleBitmap(msg.bitmap);
        break;

      case 'request-chunk':
        for (const idx of msg.indices) {
          this._sendSingleChunk(idx);
        }
        break;

      case 'ack-batch':
        this._handleAckBatch(msg.indices);
        break;

      case 'cancel-chunk':
        for (const idx of msg.indices) {
          this.sendWindowInFlight.delete(idx);
        }
        this.service._scheduleRarestFirst();
        break;

      default:
        break;
    }
  }

  _handleBitmap(bitmapArray) {
    this.bitmap = new Uint8Array(bitmapArray);
    if (this.service.totalChunks) {
      const count = countBitmapSet(this.bitmap, this.service.totalChunks);
      console.log(`[Peer ${this.remotePeerId.slice(0, 8)}] has ${count}/${this.service.totalChunks} chunks`);
    }
    this.service._onPeerBitmapUpdated(this.remotePeerId);
    this.service._scheduleRarestFirst();
  }

  _sendBitmap() {
    if (!this.service.myBitmap || !this._canSendControl()) return;
    this._sendControl({
      type: 'bitmap',
      bitmap: Array.from(this.service.myBitmap),
    });
  }

  async _handleChunkData(data) {
    if (!this.service.totalChunks) return;

    const view = new DataView(data);
    const chunkIndex = view.getUint32(0);
    const chunkData = data.slice(4);

    if (hasBitmap(this.service.myBitmap, chunkIndex)) {
      this.receiveAckPending.add(chunkIndex);
      return;
    }

    const expectedHash = this.service.chunkHashes[chunkIndex];
    if (expectedHash) {
      const isValid = await verifyChunk(chunkData, expectedHash);
      if (!isValid) {
        this.service._requestChunkFrom(chunkIndex);
        return;
      }
    }

    this.service._storeChunk(chunkIndex, chunkData, this.remotePeerId);
    this.bytesFromPeer += chunkData.byteLength;
    this.receiveAckPending.add(chunkIndex);

    this.service._cancelDuplicateRequests(chunkIndex, this.remotePeerId);
    this.service._scheduleRarestFirst();
  }

  _handleAckBatch(indices) {
    for (const idx of indices) {
      this.sendWindowInFlight.delete(idx);
    }
    while (
      this.sendWindowInFlight.size > 0 &&
      !this.sendWindowInFlight.has(this.sendWindowBase)
    ) {
      this.sendWindowBase++;
    }
    this.service._scheduleRarestFirst();
  }

  _detectAndRequestMissing() {
    if (!this.service.totalChunks) return;

    const total = this.service.totalChunks;
    const highestReceived = this.service._getHighestReceivedChunk();
    if (highestReceived < 1) return;

    const checkEnd = Math.min(highestReceived + 16, total);
    const missing = [];

    for (let i = 0; i < checkEnd; i++) {
      if (!hasBitmap(this.service.myBitmap, i)) {
        const retryCount = this.resendCounts.get(i) || 0;
        if (retryCount < RESEND_MAX_RETRIES && !this.service._isChunkRequested(i)) {
          missing.push(i);
          this.resendCounts.set(i, retryCount + 1);
        }
      }
    }

    if (missing.length > 0) {
      this.service._requestChunks(missing);
    }
  }

  _startAckTimer() {
    this.ackTimer = setInterval(() => {
      if (this.receiveAckPending.size > 0 && this._canSendControl()) {
        this._sendControl({
          type: 'ack-batch',
          indices: [...this.receiveAckPending],
        });
        this.receiveAckPending.clear();
      }
    }, ACK_BATCH_INTERVAL);
  }

  _startBitmapTimer() {
    this.bitmapTimer = setInterval(() => {
      this._sendBitmap();
    }, BITMAP_BROADCAST_INTERVAL);
  }

  _startGapTimer() {
    this.gapTimer = setInterval(() => {
      this._detectAndRequestMissing();
    }, GAP_CHECK_INTERVAL);
  }

  _stopTimers() {
    if (this.ackTimer) clearInterval(this.ackTimer);
    if (this.bitmapTimer) clearInterval(this.bitmapTimer);
    if (this.gapTimer) clearInterval(this.gapTimer);
    this.ackTimer = null;
    this.bitmapTimer = null;
    this.gapTimer = null;
  }

  _canSendControl() {
    return this.dataChannel && this.dataChannel.readyState === 'open';
  }

  _sendControl(msg) {
    if (this._canSendControl()) {
      this.dataChannel.send(JSON.stringify(msg));
    }
  }

  canSendChunk(chunkIndex) {
    if (!this.bitmap) return false;
    if (!hasBitmap(this.bitmap, chunkIndex)) return false;
    if (this.sendWindowInFlight.size >= SLIDING_WINDOW_SIZE) return false;
    if (this.sendWindowInFlight.has(chunkIndex)) return false;
    if (this.dataChannel.bufferedAmount > CHUNK_BUFFER_THRESHOLD) return false;
    return true;
  }

  async sendChunk(chunkIndex) {
    if (!this.service.chunkReader) return;
    if (this.sendWindowInFlight.has(chunkIndex)) return;

    this.sendWindowInFlight.set(chunkIndex, Date.now());

    try {
      const buffer = await this.service.chunkReader.readChunk(chunkIndex);

      const payload = new Uint8Array(4 + buffer.byteLength);
      new DataView(payload.buffer).setUint32(0, chunkIndex);
      payload.set(new Uint8Array(buffer), 4);

      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(payload.buffer);
        this.sendBytesSent += buffer.byteLength;
      }
    } catch (e) {
      console.error(`[Peer ${this.remotePeerId.slice(0, 8)}] send chunk ${chunkIndex} error:`, e);
      this.sendWindowInFlight.delete(chunkIndex);
    }
  }

  async _sendSingleChunk(chunkIndex) {
    if (!this.service.chunkReader) return;
    try {
      const buffer = await this.service.chunkReader.readChunk(chunkIndex);
      const payload = new Uint8Array(4 + buffer.byteLength);
      new DataView(payload.buffer).setUint32(0, chunkIndex);
      payload.set(new Uint8Array(buffer), 4);
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(payload.buffer);
      }
    } catch (e) {
      console.error(`[Peer ${this.remotePeerId.slice(0, 8)}] resend chunk ${chunkIndex} error:`, e);
    }
  }

  close() {
    this._stopTimers();
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch {}
      this.dataChannel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch {}
      this.pc = null;
    }
    this.connected = false;
  }
}

export class WebRTCService {
  constructor(signalingClient) {
    this.signaling = signalingClient;
    this.peers = new Map();

    this.sendChunkReader = null;
    this.metadata = null;
    this.totalChunks = 0;
    this.chunkHashes = [];
    this.myBitmap = null;

    this.receivedChunks = [];
    this.chunkSources = new Map();
    this.pendingRequests = new Map();
    this.lastProgressUpdate = 0;

    this.onConnected = null;
    this.onDisconnected = null;
    this.onProgress = null;
    this.onTransferComplete = null;
    this.onTransferError = null;
    this.onMetadataReceived = null;
    this.onPeersUpdated = null;

    this.scheduleTimer = null;
    this.transferStartTime = null;
    this.totalBytes = 0;
    this.bytesReceived = 0;

    this._setupSignalingHandlers();
  }

  _setupSignalingHandlers() {
    this.signaling.on('ready', (msg) => {
      const remotePeerId = msg.remotePeerId;
      const isInitiator = msg.isInitiator;

      if (!this.peers.has(remotePeerId)) {
        const peer = new PeerConnection(this.signaling, remotePeerId, isInitiator, this);
        this.peers.set(remotePeerId, peer);
      }
    });

    this.signaling.on('offer', (msg) => {
      const fromPeerId = msg.fromPeerId;
      let peer = this.peers.get(fromPeerId);
      if (!peer) {
        peer = new PeerConnection(this.signaling, fromPeerId, false, this);
        this.peers.set(fromPeerId, peer);
      }
      peer.handleOffer(msg.sdp);
    });

    this.signaling.on('answer', (msg) => {
      const peer = this.peers.get(msg.fromPeerId);
      if (peer) peer.handleAnswer(msg.sdp);
    });

    this.signaling.on('ice-candidate', (msg) => {
      const peer = this.peers.get(msg.fromPeerId);
      if (peer) peer.handleIceCandidate(msg.candidate);
    });

    this.signaling.on('peer-left', (msg) => {
      const peerId = msg.peerId;
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.close();
        this.peers.delete(peerId);
      }
      this._notifyPeersUpdated();
    });

    this.signaling.on('peer-list', () => {
      this._notifyPeersUpdated();
    });
  }

  _notifyPeersUpdated() {
    if (this.onPeersUpdated) {
      const peerInfos = [];
      for (const [peerId, peer] of this.peers) {
        peerInfos.push({
          peerId,
          connected: peer.connected,
          bytesSent: peer.sendBytesSent,
          bytesReceived: peer.bytesFromPeer,
          hasAllChunks: peer.bitmap && this.totalChunks
            ? countBitmapSet(peer.bitmap, this.totalChunks) === this.totalChunks
            : false,
        });
      }
      this.onPeersUpdated(peerInfos);
    }
  }

  _onPeerConnected(peerId) {
    if (this.metadata && this.totalChunks && !this.myBitmap) {
      this._initReceiverState();
    }

    const peer = this.peers.get(peerId);
    if (peer && this.myBitmap) {
      peer._sendBitmap();
    }

    const allConnected = [...this.peers.values()].every((p) => p.connected);
    if (allConnected && this.onConnected) {
      this.onConnected();
    }

    this._notifyPeersUpdated();
    this._scheduleRarestFirst();
  }

  _onPeerDisconnected(peerId) {
    const allConnected = this.peers.size > 0 && [...this.peers.values()].every((p) => p.connected);
    if (!allConnected && this.onDisconnected) {
      this.onDisconnected();
    }
    this._notifyPeersUpdated();

    for (const [chunkIndex, reqPeerId] of this.pendingRequests) {
      if (reqPeerId === peerId) {
        this.pendingRequests.delete(chunkIndex);
      }
    }
    this._scheduleRarestFirst();
  }

  _onPeerBitmapUpdated(peerId) {
    this._notifyPeersUpdated();
    this._scheduleRarestFirst();
  }

  _handleMetadata(metadata) {
    if (!this.metadata) {
      this.metadata = metadata;
      this.totalChunks = metadata.totalChunks;
      this.chunkHashes = metadata.chunkHashes;
      this.totalBytes = metadata.fileSize;
      this._initReceiverState();
      if (this.onMetadataReceived) {
        this.onMetadataReceived(metadata);
      }
    }
  }

  _initReceiverState() {
    if (!this.metadata) return;
    this.totalChunks = this.metadata.totalChunks;
    this.chunkHashes = this.metadata.chunkHashes;
    this.totalBytes = this.metadata.fileSize;
    this.receivedChunks = new Array(this.totalChunks).fill(null);
    this.myBitmap = createBitmap(this.totalChunks);
    this.chunkSources = new Map();
    this.pendingRequests = new Map();
    this.bytesReceived = 0;
    this.transferStartTime = Date.now();

    for (const [, peer] of this.peers) {
      if (peer.connected) {
        peer._sendBitmap();
      }
    }
    this._scheduleRarestFirst();
  }

  _storeChunk(index, data, sourcePeerId) {
    if (!this.myBitmap || hasBitmap(this.myBitmap, index)) return;

    this.receivedChunks[index] = { index, data };
    setBitmap(this.myBitmap, index);
    this.chunkSources.set(index, sourcePeerId);
    this.bytesReceived += data.byteLength;
    this.pendingRequests.delete(index);

    const now = Date.now();
    if (now - this.lastProgressUpdate > 100 || this.bytesReceived >= this.totalBytes) {
      this.lastProgressUpdate = now;
      const receivedCount = countBitmapSet(this.myBitmap, this.totalChunks);
      const elapsed = (now - this.transferStartTime) / 1000;
      const speed = elapsed > 0 ? this.bytesReceived / elapsed : 0;
      const progress = receivedCount / this.totalChunks;

      if (this.onProgress) {
        this.onProgress({
          bytesTransferred: this.bytesReceived,
          totalBytes: this.totalBytes,
          progress,
          speed,
          currentChunk: index,
          totalChunks: this.totalChunks,
          receivedCount,
          chunkSources: Object.fromEntries(this.chunkSources),
        });
      }
    }

    for (const [, peer] of this.peers) {
      if (peer.connected) {
        peer._sendBitmap();
      }
    }

    const receivedCount = countBitmapSet(this.myBitmap, this.totalChunks);
    if (receivedCount === this.totalChunks && this.onTransferComplete) {
      this.onTransferComplete(this.receivedChunks, this.metadata);
    }

    this._notifyPeersUpdated();
  }

  _getHighestReceivedChunk() {
    if (!this.myBitmap) return -1;
    for (let i = this.totalChunks - 1; i >= 0; i--) {
      if (hasBitmap(this.myBitmap, i)) return i;
    }
    return -1;
  }

  _isChunkRequested(index) {
    return this.pendingRequests.has(index);
  }

  _requestChunkFrom(index) {
    const peers = [];
    for (const [peerId, peer] of this.peers) {
      if (peer.connected && peer.bitmap && hasBitmap(peer.bitmap, index)) {
        peers.push(peerId);
      }
    }
    if (peers.length > 0) {
      const randomPeer = peers[Math.floor(Math.random() * peers.length)];
      const peer = this.peers.get(randomPeer);
      if (peer && peer._canSendControl()) {
        this.pendingRequests.set(index, randomPeer);
        peer._sendControl({ type: 'request-chunk', indices: [index] });
      }
    }
  }

  _requestChunks(indices) {
    const requestsByPeer = new Map();
    for (const idx of indices) {
      if (this.pendingRequests.has(idx)) continue;
      const candidates = [];
      for (const [peerId, peer] of this.peers) {
        if (peer.connected && peer.bitmap && hasBitmap(peer.bitmap, idx)) {
          candidates.push(peerId);
        }
      }
      if (candidates.length > 0) {
        const peerId = candidates[Math.floor(Math.random() * candidates.length)];
        if (!requestsByPeer.has(peerId)) requestsByPeer.set(peerId, []);
        requestsByPeer.get(peerId).push(idx);
        this.pendingRequests.set(idx, peerId);
      }
    }
    for (const [peerId, chunkIndices] of requestsByPeer) {
      const peer = this.peers.get(peerId);
      if (peer && peer._canSendControl()) {
        peer._sendControl({ type: 'request-chunk', indices: chunkIndices });
      }
    }
  }

  _cancelDuplicateRequests(chunkIndex, fromPeerId) {
    for (const [peerId, peer] of this.peers) {
      if (peerId !== fromPeerId && peer.connected && peer._canSendControl()) {
        peer._sendControl({ type: 'cancel-chunk', indices: [chunkIndex] });
      }
    }
  }

  _getRarestMissingChunk() {
    if (!this.myBitmap || !this.totalChunks) return null;

    const chunkAvailability = new Map();
    for (let i = 0; i < this.totalChunks; i++) {
      if (!hasBitmap(this.myBitmap, i) && !this.pendingRequests.has(i)) {
        let count = 0;
        for (const [, peer] of this.peers) {
          if (peer.connected && peer.bitmap && hasBitmap(peer.bitmap, i)) {
            count++;
          }
        }
        if (count > 0) {
          chunkAvailability.set(i, count);
        }
      }
    }

    if (chunkAvailability.size === 0) return null;

    const entries = [...chunkAvailability.entries()].sort((a, b) => a[1] - b[1]);
    const minCount = entries[0][1];
    const rarest = entries.filter((e) => e[1] === minCount);
    return rarest[Math.floor(Math.random() * rarest.length)][0];
  }

  _scheduleRarestFirst() {
    if (this.scheduleTimer) return;
    this.scheduleTimer = setTimeout(() => {
      this.scheduleTimer = null;
      this._doRarestFirst();
    }, 0);
  }

  _doRarestFirst() {
    if (!this.sendChunkReader || !this.totalChunks) return;

    let progress = false;
    let iterations = 0;
    const maxIterations = this.totalChunks;

    while (iterations < maxIterations) {
      iterations++;

      const requests = [...this.pendingRequests.entries()];
      let sentToPeer = false;

      for (const [chunkIndex, peerId] of requests) {
        const peer = this.peers.get(peerId);
        if (peer && peer.canSendChunk(chunkIndex)) {
          peer.sendChunk(chunkIndex);
          sentToPeer = true;
          progress = true;
        }
      }

      if (sentToPeer) continue;

      const rarestIndex = this._getRarestMissingChunk();
      if (rarestIndex === null) break;

      const candidates = [];
      for (const [peerId, peer] of this.peers) {
        if (peer.connected && peer.bitmap && hasBitmap(peer.bitmap, rarestIndex)) {
          const load = peer.sendWindowInFlight.size;
          candidates.push({ peerId, load });
        }
      }

      if (candidates.length === 0) break;

      candidates.sort((a, b) => a.load - b.load);
      const bestPeerId = candidates[0].peerId;
      const peer = this.peers.get(bestPeerId);

      if (peer && peer.canSendChunk(rarestIndex)) {
        this.pendingRequests.set(rarestIndex, bestPeerId);
        peer.sendChunk(rarestIndex);
        progress = true;
      } else {
        break;
      }
    }

    if (progress) {
      this._notifyPeersUpdated();
      this._scheduleRarestFirst();
    }
  }

  startFileTransfer(chunkReader, metadata) {
    this.sendChunkReader = chunkReader;
    this.metadata = metadata;
    this.totalChunks = metadata.totalChunks;
    this.chunkHashes = metadata.chunkHashes;
    this.totalBytes = metadata.fileSize;

    this.myBitmap = createBitmap(this.totalChunks);
    for (let i = 0; i < this.totalChunks; i++) {
      setBitmap(this.myBitmap, i);
    }

    this.transferStartTime = Date.now();
    this.receivedChunks = new Array(this.totalChunks).fill(null);

    for (const [, peer] of this.peers) {
      if (peer.connected) {
        peer._sendBitmap();
        peer._sendControl({ type: 'metadata', metadata });
      }
    }

    this._scheduleRarestFirst();
  }

  getConnectedPeers() {
    const result = [];
    for (const [peerId, peer] of this.peers) {
      result.push({
        peerId,
        connected: peer.connected,
        bytesSent: peer.sendBytesSent,
        bytesReceived: peer.bytesFromPeer,
        hasAllChunks: peer.bitmap && this.totalChunks
          ? countBitmapSet(peer.bitmap, this.totalChunks) === this.totalChunks
          : false,
      });
    }
    return result;
  }

  close() {
    if (this.scheduleTimer) {
      clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    for (const [, peer] of this.peers) {
      peer.close();
    }
    this.peers.clear();
  }
}
