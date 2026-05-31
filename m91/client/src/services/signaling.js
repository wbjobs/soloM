const WS_URL = `ws://${window.location.hostname}:8080/ws`;

export class SignalingClient {
  constructor() {
    this.ws = null;
    this.peerId = null;
    this.roomId = null;
    this.peers = [];
    this.handlers = {};
    this.reconnectTimer = null;
  }

  on(event, handler) {
    this.handlers[event] = handler;
  }

  _emit(event, data) {
    if (this.handlers[event]) {
      this.handlers[event](data);
    }
  }

  getPeers() {
    return [...this.peers];
  }

  hasPeers() {
    return this.peers.length > 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this._emit('connected', {});
        resolve();
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        this._handleMessage(msg);
      };

      this.ws.onerror = (err) => {
        this._emit('error', err);
        reject(err);
      };

      this.ws.onclose = () => {
        this._emit('disconnected', {});
        this._scheduleReconnect();
      };
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, 3000);
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'created':
        this.peerId = msg.peerId;
        this.roomId = msg.roomId;
        this._emit('created', msg);
        break;

      case 'joined':
        this.peerId = msg.peerId;
        this.roomId = msg.roomId;
        this._emit('joined', msg);
        break;

      case 'ready':
        this._emit('ready', msg);
        break;

      case 'offer':
        this._emit('offer', msg);
        break;

      case 'answer':
        this._emit('answer', msg);
        break;

      case 'ice-candidate':
        this._emit('ice-candidate', msg);
        break;

      case 'peer-list':
        this.peers = msg.peers.map((p) => p.peerId).filter((id) => id !== this.peerId);
        this._emit('peer-list', msg);
        break;

      case 'peer-left':
        this.peers = this.peers.filter((id) => id !== msg.peerId);
        this._emit('peer-left', msg);
        break;

      case 'peer-joined':
        this.peers = [...this.peers, msg.peerId].filter((v, i, a) => a.indexOf(v) === i);
        this._emit('ready', msg);
        break;

      case 'metadata':
        this._emit('metadata', msg);
        break;

      case 'error':
        this._emit('error', msg);
        break;

      default:
        break;
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  createRoom(metadata) {
    this.send({
      type: 'create',
      metadata: metadata || null,
    });
  }

  joinRoom(roomId) {
    this.send({
      type: 'join',
      roomId,
    });
  }

  sendOffer(targetPeerId, sdp) {
    this.send({
      type: 'offer',
      targetPeerId,
      sdp,
    });
  }

  sendAnswer(targetPeerId, sdp) {
    this.send({
      type: 'answer',
      targetPeerId,
      sdp,
    });
  }

  sendIceCandidate(targetPeerId, candidate) {
    this.send({
      type: 'ice-candidate',
      targetPeerId,
      candidate,
    });
  }

  sendMetadata(metadata) {
    this.send({
      type: 'metadata',
      metadata,
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
