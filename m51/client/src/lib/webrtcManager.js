import signalingClient from './signalingClient.js';

const BUFFERED_AMOUNT_HIGH_WATERMARK = 1024 * 1024;
const BUFFERED_AMOUNT_LOW_WATERMARK = 256 * 1024;
const SEND_QUEUE_POLL_INTERVAL = 50;
const SPEED_SAMPLE_WINDOW = 10;
const SPEED_UPDATE_INTERVAL = 500;

class WebRTCManager {
  constructor() {
    this.peerConnections = new Map();
    this.dataChannels = new Map();
    this.listeners = new Map();
    this.connectionStats = new Map();
    this.sendQueues = new Map();
    this.peerByteStats = new Map();
    this.peerSpeedStats = new Map();
    this.previousIceStates = new Map();
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    this._startSpeedMonitor();
  }

  getConfiguration() {
    return {
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10
    };
  }

  createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(this.getConfiguration());

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingClient.sendSignal(peerId, {
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      this.updateConnectionState(peerId, pc.connectionState);
      this.emit('connectionStateChange', {
        peerId,
        state: pc.connectionState
      });
    };

    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    pc.oniceconnectionstatechange = () => {
      const newState = pc.iceConnectionState;
      const prevState = this.previousIceStates.get(peerId);

      if (prevState && 
          (prevState === 'disconnected' || prevState === 'failed' || prevState === 'checking') &&
          newState === 'connected') {
        this.emit('peerReconnected', peerId);
      }
      this.previousIceStates.set(peerId, newState);

      this.emit('iceConnectionStateChange', {
        peerId,
        state: newState
      });
    };

    const dataChannel = pc.createDataChannel('file-transfer', {
      ordered: true,
      maxRetransmits: 30
    });
    this.setupDataChannel(peerId, dataChannel);

    this.peerConnections.set(peerId, pc);
    this.sendQueues.set(peerId, []);

    if (isInitiator) {
      this.initiateConnection(peerId);
    }

    return pc;
  }

  async initiateConnection(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) return;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      signalingClient.sendSignal(peerId, {
        type: 'offer',
        sdp: offer
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  async handleSignal(senderPeerId, signal) {
    let pc = this.peerConnections.get(senderPeerId);

    switch (signal.type) {
      case 'offer':
        if (!pc) {
          pc = this.createPeerConnection(senderPeerId, false);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalingClient.sendSignal(senderPeerId, {
          type: 'answer',
          sdp: answer
        });
        break;

      case 'answer':
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
        break;

      case 'ice-candidate':
        if (pc && signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
        break;
    }
  }

  setupDataChannel(peerId, channel) {
    channel.binaryType = 'arraybuffer';

    this._initPeerStats(peerId);

    channel.onopen = () => {
      this.dataChannels.set(peerId, channel);
      this.emit('peerConnected', peerId);
    };

    channel.onclose = () => {
      this.dataChannels.delete(peerId);
      this.sendQueues.delete(peerId);
      this.emit('peerDisconnected', peerId);
    };

    channel.onerror = (error) => {
      console.error(`DataChannel error with ${peerId}:`, error);
    };

    channel.onmessage = (event) => {
      const byteSize = event.data.byteLength || (typeof event.data === 'string' ? event.data.length : 0);
      this._recordBytes(peerId, 'received', byteSize);
      this.handleDataMessage(peerId, event.data);
    };

    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_WATERMARK;

    channel.onbufferedamountlow = () => {
      this.flushSendQueue(peerId);
    };
  }

  _initPeerStats(peerId) {
    if (!this.peerByteStats.has(peerId)) {
      this.peerByteStats.set(peerId, {
        bytesSent: 0,
        bytesReceived: 0,
        lastSentAt: 0,
        lastReceivedAt: 0
      });
    }
    if (!this.peerSpeedStats.has(peerId)) {
      this.peerSpeedStats.set(peerId, {
        uploadSpeed: 0,
        downloadSpeed: 0,
        uploadSamples: [],
        downloadSamples: []
      });
    }
  }

  _recordBytes(peerId, direction, byteSize) {
    const stats = this.peerByteStats.get(peerId);
    if (!stats) return;

    const now = Date.now();
    if (direction === 'sent') {
      stats.bytesSent += byteSize;
      stats.lastSentAt = now;
      const speedStats = this.peerSpeedStats.get(peerId);
      if (speedStats) {
        speedStats.uploadSamples.push({ bytes: byteSize, timestamp: now });
      }
    } else if (direction === 'received') {
      stats.bytesReceived += byteSize;
      stats.lastReceivedAt = now;
      const speedStats = this.peerSpeedStats.get(peerId);
      if (speedStats) {
        speedStats.downloadSamples.push({ bytes: byteSize, timestamp: now });
      }
    }
  }

  _startSpeedMonitor() {
    this._speedInterval = setInterval(() => {
      const now = Date.now();
      this.peerSpeedStats.forEach((stats, peerId) => {
        const windowStart = now - SPEED_UPDATE_INTERVAL * SPEED_SAMPLE_WINDOW;

        stats.uploadSamples = stats.uploadSamples.filter(s => s.timestamp > windowStart);
        stats.downloadSamples = stats.downloadSamples.filter(s => s.timestamp > windowStart);

        const uploadBytes = stats.uploadSamples.reduce((sum, s) => sum + s.bytes, 0);
        const downloadBytes = stats.downloadSamples.reduce((sum, s) => sum + s.bytes, 0);
        const timeWindow = (SPEED_UPDATE_INTERVAL * SPEED_SAMPLE_WINDOW) / 1000;

        stats.uploadSpeed = uploadBytes / timeWindow;
        stats.downloadSpeed = downloadBytes / timeWindow;
      });

      this.emit('speedUpdate', this.getAllPeerSpeeds());
    }, SPEED_UPDATE_INTERVAL);
  }

  getPeerBytes(peerId) {
    return this.peerByteStats.get(peerId) || { bytesSent: 0, bytesReceived: 0 };
  }

  getPeerSpeed(peerId) {
    return this.peerSpeedStats.get(peerId) || { uploadSpeed: 0, downloadSpeed: 0 };
  }

  getAllPeerSpeeds() {
    const speeds = {};
    this.peerSpeedStats.forEach((stats, peerId) => {
      speeds[peerId] = {
        uploadSpeed: stats.uploadSpeed,
        downloadSpeed: stats.downloadSpeed
      };
    });
    return speeds;
  }

  resetPeerStats(peerId) {
    this._initPeerStats(peerId);
  }

  handleDataMessage(peerId, data) {
    let message;
    try {
      if (typeof data === 'string') {
        message = JSON.parse(data);
      } else {
        this.emit('binaryData', { peerId, data });
        return;
      }
    } catch (e) {
      this.emit('binaryData', { peerId, data });
      return;
    }

    if (message && message.type) {
      this.emit(message.type, { peerId, ...message });
    }
  }

  send(peerId, data) {
    const channel = this.dataChannels.get(peerId);
    if (!channel || channel.readyState !== 'open') {
      return false;
    }

    if (typeof data !== 'string' && channel.bufferedAmount >= BUFFERED_AMOUNT_HIGH_WATERMARK) {
      const queue = this.sendQueues.get(peerId);
      if (queue) {
        queue.push(data);
        this.scheduleQueueDrain(peerId);
      }
      return true;
    }

    try {
      channel.send(data);
      const byteSize = data.byteLength || (typeof data === 'string' ? data.length : 0);
      this._recordBytes(peerId, 'sent', byteSize);
      return true;
    } catch (error) {
      console.error(`Send error to ${peerId}:`, error);
      const queue = this.sendQueues.get(peerId);
      if (queue) {
        queue.push(data);
        this.scheduleQueueDrain(peerId);
      }
      return true;
    }
  }

  flushSendQueue(peerId) {
    const channel = this.dataChannels.get(peerId);
    const queue = this.sendQueues.get(peerId);
    if (!channel || channel.readyState !== 'open' || !queue || queue.length === 0) {
      return;
    }

    while (queue.length > 0 && channel.bufferedAmount < BUFFERED_AMOUNT_HIGH_WATERMARK) {
      const data = queue.shift();
      try {
        channel.send(data);
        const byteSize = data.byteLength || (typeof data === 'string' ? data.length : 0);
        this._recordBytes(peerId, 'sent', byteSize);
      } catch (error) {
        console.error(`Flush send error to ${peerId}:`, error);
        queue.unshift(data);
        break;
      }
    }

    if (queue.length > 0) {
      this.scheduleQueueDrain(peerId);
    }
  }

  scheduleQueueDrain(peerId) {
    if (this._drainTimers && this._drainTimers.has(peerId)) {
      return;
    }
    if (!this._drainTimers) {
      this._drainTimers = new Map();
    }
    const timer = setTimeout(() => {
      this._drainTimers.delete(peerId);
      this.flushSendQueue(peerId);
    }, SEND_QUEUE_POLL_INTERVAL);
    this._drainTimers.set(peerId, timer);
  }

  sendJSON(peerId, message) {
    return this.send(peerId, JSON.stringify(message));
  }

  broadcast(message) {
    const results = [];
    this.dataChannels.forEach((channel, peerId) => {
      if (channel.readyState === 'open') {
        this.sendJSON(peerId, message);
        results.push(peerId);
      }
    });
    return results;
  }

  getConnectedPeers() {
    const connected = [];
    this.dataChannels.forEach((channel, peerId) => {
      if (channel.readyState === 'open') {
        connected.push(peerId);
      }
    });
    return connected;
  }

  getPeerState(peerId) {
    const pc = this.peerConnections.get(peerId);
    const channel = this.dataChannels.get(peerId);

    return {
      peerId,
      connectionState: pc ? pc.connectionState : 'disconnected',
      dataChannelState: channel ? channel.readyState : 'closed'
    };
  }

  getAllPeerStates() {
    const states = [];
    this.peerConnections.forEach((pc, peerId) => {
      states.push(this.getPeerState(peerId));
    });
    return states;
  }

  updateConnectionState(peerId, state) {
    this.connectionStats.set(peerId, {
      state,
      updatedAt: Date.now()
    });
  }

  closeConnection(peerId) {
    const pc = this.peerConnections.get(peerId);
    const channel = this.dataChannels.get(peerId);

    if (channel) {
      channel.close();
      this.dataChannels.delete(peerId);
    }

    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    this.sendQueues.delete(peerId);
  }

  closeAllConnections() {
    this.peerConnections.forEach((_, peerId) => {
      this.closeConnection(peerId);
    });
  }

  destroy() {
    if (this._speedInterval) {
      clearInterval(this._speedInterval);
      this._speedInterval = null;
    }
    this.closeAllConnections();
    this.peerByteStats.clear();
    this.peerSpeedStats.clear();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  getBufferedAmount(peerId) {
    const channel = this.dataChannels.get(peerId);
    return channel ? channel.bufferedAmount : 0;
  }

  getQueueSize(peerId) {
    const queue = this.sendQueues.get(peerId);
    return queue ? queue.length : 0;
  }

}

export default new WebRTCManager();
