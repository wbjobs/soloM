class SignalingClient {
  constructor() {
    this.ws = null;
    this.peerId = null;
    this.roomId = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect(url = 'ws://localhost:8080') {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.startHeartbeat();
        };

        this.ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
          if (message.type === 'PEER_ID') {
            this.peerId = message.peerId;
            resolve(message.peerId);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          this.stopHeartbeat();
          this.attemptReconnect(url);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  attemptReconnect(url) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      setTimeout(() => {
        this.connect(url).catch(() => {});
      }, 2000 * this.reconnectAttempts);
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'HEARTBEAT' });
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  handleMessage(message) {
    const callback = this.listeners.get(message.type);
    if (callback) {
      callback(message);
    }
  }

  on(type, callback) {
    this.listeners.set(type, callback);
  }

  off(type) {
    this.listeners.delete(type);
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  joinRoom(roomId, metadata = {}) {
    this.roomId = roomId;
    this.send({
      type: 'JOIN_ROOM',
      roomId,
      metadata
    });
  }

  leaveRoom() {
    if (this.roomId) {
      this.send({ type: 'LEAVE_ROOM' });
      this.roomId = null;
    }
  }

  sendSignal(targetPeerId, signal) {
    this.send({
      type: 'SIGNAL',
      targetPeerId,
      signal
    });
  }

  updateMetadata(metadata) {
    this.send({
      type: 'UPDATE_METADATA',
      metadata
    });
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
    this.listeners.clear();
  }
}

export default new SignalingClient();
