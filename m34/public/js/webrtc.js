class WebRTCManager {
  constructor(userId, roomId, onMessage, onStream, onNetworkMetrics) {
    this.userId = userId;
    this.roomId = roomId;
    this.peers = new Map();
    this.dataChannels = new Map();
    this.localStream = null;
    this.onMessage = onMessage;
    this.onStream = onStream;
    this.onNetworkMetrics = onNetworkMetrics;
    this.ws = null;
    this.wsReconnectAttempts = 0;
    this.wsMaxReconnectAttempts = 10;
    this.wsReconnectBaseDelay = 1000;
    this.wsReconnectTimer = null;
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    this.reconnectTimers = new Map();
    this.onDataChannelOpen = null;
    this.heartbeatInterval = null;
    this.metricsInterval = null;
    this.rttProbeTimer = null;
    this.pendingRttProbes = new Map();
    this.networkMetrics = {
      rtt: 0,
      packetLoss: 0,
      bandwidth: 0,
      jitter: 0
    };
    this.statsCache = new Map();
  }

  connect() {
    this.connectWebSocket();
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);

    this.ws.onopen = () => {
      this.wsReconnectAttempts = 0;
      this.ws.send(JSON.stringify({
        type: 'join',
        roomId: this.roomId,
        userId: this.userId
      }));
      this.startHeartbeat();
      this.startMetricsCollection();
      this.startRttProbe();
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'pong') return;
      this.handleSignalingMessage(data);
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.attemptWebSocketReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  attemptWebSocketReconnect() {
    if (this.wsReconnectAttempts >= this.wsMaxReconnectAttempts) {
      console.error('Max WebSocket reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      this.wsReconnectBaseDelay * Math.pow(2, this.wsReconnectAttempts),
      30000
    );
    this.wsReconnectAttempts++;

    console.log(`WebSocket reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts})`);

    this.wsReconnectTimer = setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  handleSignalingMessage(data) {
    switch (data.type) {
      case 'joined':
        data.peers.forEach(peerId => {
          this.createPeerConnection(peerId, true);
        });
        break;
      case 'peer-joined':
        this.createPeerConnection(data.peerId, false);
        break;
      case 'offer':
        this.handleOffer(data);
        break;
      case 'answer':
        this.handleAnswer(data);
        break;
      case 'ice-candidate':
        this.handleIceCandidate(data);
        break;
      case 'peer-left':
        this.handlePeerLeave(data.peerId);
        break;
    }
  }

  closePeerConnection(peerId) {
    const reconnectTimer = this.reconnectTimers.get(peerId);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      this.reconnectTimers.delete(peerId);
    }

    if (this.peers.has(peerId)) {
      try {
        this.peers.get(peerId).close();
      } catch (e) {
        // ignore
      }
      this.peers.delete(peerId);
    }

    if (this.dataChannels.has(peerId)) {
      this.dataChannels.delete(peerId);
    }
  }

  createPeerConnection(peerId, isInitiator) {
    if (this.peers.has(peerId)) {
      const existingPc = this.peers.get(peerId);
      const state = existingPc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        return;
      }
      this.closePeerConnection(peerId);
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          to: peerId,
          from: this.userId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      if (this.onStream) {
        this.onStream(peerId, event.streams[0]);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`ICE connection with ${peerId}: ${state}`);

      if (state === 'failed' || state === 'disconnected') {
        this.schedulePeerReconnect(peerId);
      }

      if (state === 'connected' || state === 'completed') {
        const timer = this.reconnectTimers.get(peerId);
        if (timer) {
          clearTimeout(timer);
          this.reconnectTimers.delete(peerId);
        }
      }
    };

    const dataChannel = pc.createDataChannel('whiteboard', {
      ordered: true
    });
    this.setupDataChannel(peerId, dataChannel);

    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    this.peers.set(peerId, pc);

    if (isInitiator) {
      this.createOffer(peerId, pc);
    }
  }

  schedulePeerReconnect(peerId) {
    if (this.reconnectTimers.has(peerId)) return;

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(peerId);

      if (this.peers.has(peerId)) {
        const pc = this.peers.get(peerId);
        const state = pc.iceConnectionState;
        if (state === 'connected' || state === 'completed') return;

        console.log(`Reconnecting peer: ${peerId}`);
        this.closePeerConnection(peerId);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.createPeerConnection(peerId, true);
        }
      }
    }, 3000);

    this.reconnectTimers.set(peerId, timer);
  }

  setupDataChannel(peerId, channel) {
    channel.onopen = () => {
      console.log(`DataChannel with ${peerId} is open`);
      this.dataChannels.set(peerId, channel);

      if (this.onDataChannelOpen) {
        this.onDataChannelOpen(peerId);
      }
    };

    channel.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'rtt-probe') {
        const response = { type: 'rtt-response', probeId: data.probeId, timestamp: Date.now() };
        if (channel.readyState === 'open') {
          channel.send(JSON.stringify(response));
        }
        return;
      }

      if (data.type === 'rtt-response') {
        const probe = this.pendingRttProbes.get(data.probeId);
        if (probe) {
          const rtt = Date.now() - probe.timestamp;
          this.updateRtt(peerId, rtt);
          this.pendingRttProbes.delete(data.probeId);
        }
        return;
      }

      if (this.onMessage) {
        this.onMessage(peerId, data);
      }
    };

    channel.onclose = () => {
      console.log(`DataChannel with ${peerId} is closed`);
      this.dataChannels.delete(peerId);
    };

    channel.onerror = (error) => {
      console.error(`DataChannel error with ${peerId}:`, error);
    };
  }

  async createOffer(peerId, pc) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignalingMessage({
        type: 'offer',
        to: peerId,
        from: this.userId,
        sdp: offer
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      this.schedulePeerReconnect(peerId);
    }
  }

  async handleOffer(data) {
    const { from, sdp } = data;
    let pc = this.peers.get(from);

    if (!pc) {
      this.createPeerConnection(from, false);
      pc = this.peers.get(from);
    } else {
      const state = pc.iceConnectionState;
      if (state === 'closed') {
        this.closePeerConnection(from);
        this.createPeerConnection(from, false);
        pc = this.peers.get(from);
      }
    }

    try {
      if (pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } else {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignalingMessage({
        type: 'answer',
        to: from,
        from: this.userId,
        sdp: answer
      });
    } catch (error) {
      console.error('Error handling offer:', error);
      this.closePeerConnection(from);
    }
  }

  async handleAnswer(data) {
    const { from, sdp } = data;
    const pc = this.peers.get(from);

    if (pc) {
      try {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
      } catch (error) {
        console.error('Error handling answer:', error);
        this.closePeerConnection(from);
      }
    }
  }

  async handleIceCandidate(data) {
    const { from, candidate } = data;
    const pc = this.peers.get(from);

    if (pc && candidate) {
      try {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }

  handlePeerLeave(peerId) {
    this.closePeerConnection(peerId);

    const screenItem = document.getElementById(`screen-${peerId}`);
    if (screenItem) {
      screenItem.remove();
    }
  }

  sendSignalingMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendDataToPeer(peerId, message) {
    const channel = this.dataChannels.get(peerId);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
    }
  }

  broadcastMessage(message) {
    this.dataChannels.forEach((channel, peerId) => {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify(message));
      }
    });
  }

  async startScreenShare() {
    try {
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });

      this.peers.forEach(pc => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
          });
        }
      });

      return this.localStream;
    } catch (error) {
      console.error('Error starting screen share:', error);
      throw error;
    }
  }

  stopScreenShare() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;

      this.peers.forEach(pc => {
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            pc.removeTrack(sender);
          }
        });
      });
    }
  }

  getPeerIds() {
    return Array.from(this.peers.keys());
  }

  getConnectedPeerIds() {
    const connected = [];
    this.peers.forEach((pc, peerId) => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        connected.push(peerId);
      }
    });
    return connected;
  }

  disconnect() {
    this.stopHeartbeat();
    this.stopMetricsCollection();
    this.stopRttProbe();

    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();

    this.pendingRttProbes.clear();
    this.statsCache.clear();

    this.peers.forEach(pc => {
      try { pc.close(); } catch (e) { /* ignore */ }
    });
    this.peers.clear();
    this.dataChannels.clear();

    if (this.ws) {
      try { this.ws.close(); } catch (e) { /* ignore */ }
      this.ws = null;
    }

    this.stopScreenShare();
  }

  startMetricsCollection() {
    this.stopMetricsCollection();
    this.metricsInterval = setInterval(() => {
      this.collectNetworkMetrics();
    }, 1000);
  }

  stopMetricsCollection() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  startRttProbe() {
    this.stopRttProbe();
    let probeCounter = 0;
    this.rttProbeTimer = setInterval(() => {
      this.dataChannels.forEach((channel, peerId) => {
        if (channel.readyState === 'open') {
          const probeId = `${Date.now()}-${probeCounter++}`;
          this.pendingRttProbes.set(probeId, {
            peerId,
            timestamp: Date.now()
          });
          channel.send(JSON.stringify({
            type: 'rtt-probe',
            probeId
          }));
        }
      });

      const now = Date.now();
      this.pendingRttProbes.forEach((probe, probeId) => {
        if (now - probe.timestamp > 5000) {
          this.pendingRttProbes.delete(probeId);
        }
      });
    }, 2000);
  }

  stopRttProbe() {
    if (this.rttProbeTimer) {
      clearInterval(this.rttProbeTimer);
      this.rttProbeTimer = null;
    }
  }

  updateRtt(peerId, rtt) {
    const cache = this.statsCache.get(peerId) || { rtts: [] };
    cache.rtts.push(rtt);
    if (cache.rtts.length > 10) cache.rtts.shift();

    const avgRtt = cache.rtts.reduce((a, b) => a + b, 0) / cache.rtts.length;

    let jitter = 0;
    if (cache.rtts.length > 1) {
      const diffs = [];
      for (let i = 1; i < cache.rtts.length; i++) {
        diffs.push(Math.abs(cache.rtts[i] - cache.rtts[i - 1]));
      }
      jitter = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }

    cache.rtt = avgRtt;
    cache.jitter = jitter;
    this.statsCache.set(peerId, cache);

    this.aggregateMetrics();
  }

  async collectNetworkMetrics() {
    const results = [];

    for (const [peerId, pc] of this.peers.entries()) {
      try {
        const stats = await pc.getStats(null);
        let packetLoss = 0;
        let bandwidth = 0;
        let totalPacketsSent = 0;
        let totalPacketsLost = 0;

        stats.forEach(report => {
          if (report.type === 'outbound-rtp' && report.mediaType === 'application') {
            totalPacketsSent = report.packetsSent || 0;
            const prevStats = this.statsCache.get(peerId) || {};

            if (prevStats.packetsSent !== undefined && totalPacketsSent > prevStats.packetsSent) {
              const bitrate = (report.bytesSent - (prevStats.bytesSent || 0)) * 8 / 1000;
              bandwidth = Math.max(bandwidth, bitrate);
            }

            const cache = this.statsCache.get(peerId) || {};
            cache.packetsSent = totalPacketsSent;
            cache.bytesSent = report.bytesSent || 0;
            this.statsCache.set(peerId, cache);
          }

          if (report.type === 'remote-inbound-rtp' && report.mediaType === 'application') {
            totalPacketsLost = report.packetsLost || 0;
            const packetsReceived = report.packetsReceived || 0;
            const total = packetsReceived + totalPacketsLost;
            if (total > 0) {
              packetLoss = (totalPacketsLost / total) * 100;
            }
          }

          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const available = report.availableOutgoingBitrate;
            if (available) {
              bandwidth = Math.max(bandwidth, available / 1000);
            }
          }
        });

        const cache = this.statsCache.get(peerId) || {};
        cache.packetLoss = packetLoss;
        cache.bandwidth = Math.max(bandwidth, cache.bandwidth || 0);
        this.statsCache.set(peerId, cache);

        results.push({
          peerId,
          rtt: cache.rtt || 0,
          jitter: cache.jitter || 0,
          packetLoss,
          bandwidth: cache.bandwidth
        });

      } catch (e) {
        // ignore stats errors
      }
    }

    this.aggregateMetrics(results);
  }

  aggregateMetrics(peerResults = null) {
    if (!peerResults) {
      peerResults = [];
      for (const [peerId, cache] of this.statsCache.entries()) {
        peerResults.push({
          peerId,
          rtt: cache.rtt || 0,
          jitter: cache.jitter || 0,
          packetLoss: cache.packetLoss || 0,
          bandwidth: cache.bandwidth || 0
        });
      }
    }

    if (peerResults.length === 0) {
      this.networkMetrics = { rtt: 0, packetLoss: 0, bandwidth: 0, jitter: 0, peers: [] };
    } else {
      const rtts = peerResults.map(p => p.rtt).filter(r => r > 0);
      const losses = peerResults.map(p => p.packetLoss);
      const bws = peerResults.map(p => p.bandwidth).filter(b => b > 0);
      const jitters = peerResults.map(p => p.jitter).filter(j => j > 0);

      this.networkMetrics = {
        rtt: rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : 0,
        packetLoss: +(losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(2),
        bandwidth: bws.length ? Math.round(Math.max(...bws)) : 0,
        jitter: jitters.length ? Math.round(jitters.reduce((a, b) => a + b, 0) / jitters.length) : 0,
        peers: peerResults
      };
    }

    if (this.onNetworkMetrics) {
      this.onNetworkMetrics(this.networkMetrics);
    }
  }

  getCurrentBandwidth() {
    return this.networkMetrics.bandwidth || 0;
  }

  getNetworkQuality() {
    const { rtt, packetLoss, bandwidth } = this.networkMetrics;
    let score = 100;

    if (rtt > 300) score -= 40;
    else if (rtt > 150) score -= 20;
    else if (rtt > 80) score -= 10;

    if (packetLoss > 5) score -= 40;
    else if (packetLoss > 2) score -= 20;
    else if (packetLoss > 1) score -= 10;

    if (bandwidth > 0 && bandwidth < 100) score -= 30;
    else if (bandwidth > 0 && bandwidth < 300) score -= 15;
    else if (bandwidth > 0 && bandwidth < 500) score -= 5;

    return Math.max(0, score);
  }
}
