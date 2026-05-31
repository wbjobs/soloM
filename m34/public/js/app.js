class App {
  constructor() {
    this.webrtcManager = null;
    this.whiteboard = null;
    this.userId = null;
    this.roomId = null;
    this.peerListInterval = null;
    this.currentMetrics = null;
    this.throttleInterval = 50;
    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.loginPanel = document.getElementById('login');
    this.mainPanel = document.getElementById('main');
    this.roomIdInput = document.getElementById('roomId');
    this.userIdInput = document.getElementById('userId');
    this.joinBtn = document.getElementById('joinBtn');
    this.leaveBtn = document.getElementById('leaveBtn');
    this.currentRoomSpan = document.getElementById('currentRoom');
    this.currentUserSpan = document.getElementById('currentUser');
    this.peerCountSpan = document.getElementById('peerCount');
    this.peersList = document.getElementById('peersList');

    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');

    this.strokeColorInput = document.getElementById('strokeColor');
    this.strokeWidthInput = document.getElementById('strokeWidth');
    this.widthValueSpan = document.getElementById('widthValue');
    this.toolSelect = document.getElementById('tool');
    this.clearBtn = document.getElementById('clearBtn');

    this.startScreenShareBtn = document.getElementById('startScreenShare');
    this.stopScreenShareBtn = document.getElementById('stopScreenShare');
    this.myScreenDiv = document.getElementById('myScreen');
    this.myScreenVideo = this.myScreenDiv.querySelector('video');
    this.peerScreensDiv = document.getElementById('peerScreens');

    this.rttValue = document.getElementById('rttValue');
    this.rttGauge = document.getElementById('rttGauge');
    this.packetLossValue = document.getElementById('packetLossValue');
    this.packetLossGauge = document.getElementById('packetLossGauge');
    this.bandwidthValue = document.getElementById('bandwidthValue');
    this.bandwidthGauge = document.getElementById('bandwidthGauge');
    this.qualityValue = document.getElementById('qualityValue');
    this.qualityBadge = document.getElementById('qualityBadge');
    this.jitterValue = document.getElementById('jitterValue');
    this.jitterGauge = document.getElementById('jitterGauge');
    this.throttleIntervalEl = document.getElementById('throttleInterval');
    this.throttleStatus = document.getElementById('throttleStatus');
  }

  bindEvents() {
    this.joinBtn.addEventListener('click', () => this.joinRoom());
    this.leaveBtn.addEventListener('click', () => this.leaveRoom());

    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    this.strokeColorInput.addEventListener('change', (e) => {
      if (this.whiteboard) {
        this.whiteboard.setColor(e.target.value);
      }
    });

    this.strokeWidthInput.addEventListener('input', (e) => {
      this.widthValueSpan.textContent = e.target.value;
      if (this.whiteboard) {
        this.whiteboard.setWidth(parseInt(e.target.value));
      }
    });

    this.toolSelect.addEventListener('change', (e) => {
      if (this.whiteboard) {
        this.whiteboard.setTool(e.target.value);
      }
    });

    this.clearBtn.addEventListener('click', () => {
      if (this.whiteboard) {
        this.whiteboard.clear();
      }
    });

    this.startScreenShareBtn.addEventListener('click', () => this.startScreenShare());
    this.stopScreenShareBtn.addEventListener('click', () => this.stopScreenShare());

    window.addEventListener('resize', () => {
      if (this.whiteboard) {
        this.whiteboard.resize();
      }
    });
  }

  joinRoom() {
    const roomId = this.roomIdInput.value.trim();
    const userId = this.userIdInput.value.trim();

    if (!roomId || !userId) {
      alert('请输入房间号和用户名');
      return;
    }

    this.roomId = roomId;
    this.userId = userId;
    this.throttleInterval = 50;

    this.webrtcManager = new WebRTCManager(
      userId,
      roomId,
      (peerId, data) => this.handleMessage(peerId, data),
      (peerId, stream) => this.handleStream(peerId, stream),
      (metrics) => this.handleNetworkMetrics(metrics)
    );

    this.whiteboard = new Whiteboard(
      'whiteboardCanvas',
      (data) => {
        if (this.webrtcManager) {
          this.webrtcManager.broadcastMessage(data);
        }
      },
      () => this.getThrottleInterval()
    );

    this.webrtcManager.onDataChannelOpen = (peerId) => {
      this.handleDataChannelOpen(peerId);
    };

    this.webrtcManager.connect();

    this.showMainPanel();
    this.updatePeerList();
    this.resetDashboard();

    if (this.peerListInterval) {
      clearInterval(this.peerListInterval);
    }
    this.peerListInterval = setInterval(() => this.updatePeerList(), 2000);
  }

  resetDashboard() {
    this.rttValue.textContent = '--';
    this.packetLossValue.textContent = '--';
    this.bandwidthValue.textContent = '--';
    this.qualityValue.textContent = '--';
    this.jitterValue.textContent = '--';
    this.throttleIntervalEl.textContent = '--';

    this.rttGauge.style.width = '0%';
    this.packetLossGauge.style.width = '0%';
    this.bandwidthGauge.style.width = '0%';
    this.jitterGauge.style.width = '0%';

    this.qualityBadge.textContent = '检测中';
    this.qualityBadge.className = 'quality-badge';
    this.throttleStatus.textContent = '正常';
    this.throttleStatus.className = 'throttle-status';
  }

  getThrottleInterval() {
    return this.throttleInterval;
  }

  handleNetworkMetrics(metrics) {
    this.currentMetrics = metrics;
    this.updateDashboard(metrics);
    this.adaptiveThrottle(metrics);
  }

  updateDashboard(metrics) {
    const { rtt, packetLoss, bandwidth, jitter } = metrics;
    const quality = this.webrtcManager ? this.webrtcManager.getNetworkQuality() : 0;

    if (rtt > 0) {
      this.rttValue.textContent = rtt;
      const rttPercent = Math.min(100, (rtt / 500) * 100);
      this.rttGauge.style.width = rttPercent + '%';
      this.rttGauge.className = 'gauge-fill' +
        (rtt > 300 ? ' danger' : rtt > 150 ? ' warning' : '');
    }

    if (packetLoss >= 0) {
      this.packetLossValue.textContent = packetLoss.toFixed(1);
      const lossPercent = Math.min(100, packetLoss * 10);
      this.packetLossGauge.style.width = lossPercent + '%';
      this.packetLossGauge.className = 'gauge-fill' +
        (packetLoss > 5 ? ' danger' : packetLoss > 2 ? ' warning' : '');
    }

    if (bandwidth > 0) {
      this.bandwidthValue.textContent = bandwidth;
      const bwPercent = Math.min(100, (bandwidth / 2000) * 100);
      this.bandwidthGauge.style.width = bwPercent + '%';
      this.bandwidthGauge.className = 'gauge-fill' +
        (bandwidth < 100 ? ' danger' : bandwidth < 300 ? ' warning' : '');
    }

    if (jitter > 0) {
      this.jitterValue.textContent = jitter;
      const jitterPercent = Math.min(100, (jitter / 100) * 100);
      this.jitterGauge.style.width = jitterPercent + '%';
      this.jitterGauge.className = 'gauge-fill' +
        (jitter > 50 ? ' danger' : jitter > 20 ? ' warning' : '');
    }

    this.qualityValue.textContent = quality;
    let qualityClass = '';
    let qualityText = '';
    if (quality >= 90) { qualityClass = 'excellent'; qualityText = '优秀'; }
    else if (quality >= 70) { qualityClass = 'good'; qualityText = '良好'; }
    else if (quality >= 50) { qualityClass = 'fair'; qualityText = '一般'; }
    else { qualityClass = 'poor'; qualityText = '较差'; }
    this.qualityBadge.textContent = qualityText;
    this.qualityBadge.className = 'quality-badge ' + qualityClass;

    const rttCard = this.rttValue.closest('.metric-card');
    const lossCard = this.packetLossValue.closest('.metric-card');
    rttCard.className = 'metric-card' + (rtt > 300 ? ' danger' : rtt > 150 ? ' warning' : '');
    lossCard.className = 'metric-card' + (packetLoss > 5 ? ' danger' : packetLoss > 2 ? ' warning' : '');
  }

  adaptiveThrottle(metrics) {
    const { rtt, packetLoss, bandwidth } = metrics;
    let newInterval = 50;
    let throttleLevel = 'normal';

    if (rtt > 300 || packetLoss > 5 || (bandwidth > 0 && bandwidth < 100)) {
      newInterval = 200;
      throttleLevel = 'heavy';
    } else if (rtt > 150 || packetLoss > 2 || (bandwidth > 0 && bandwidth < 300)) {
      newInterval = 100;
      throttleLevel = 'active';
    } else if (rtt > 80 || packetLoss > 1 || (bandwidth > 0 && bandwidth < 500)) {
      newInterval = 75;
      throttleLevel = 'active';
    } else {
      newInterval = 50;
      throttleLevel = 'normal';
    }

    if (this.throttleInterval !== newInterval) {
      this.throttleInterval = newInterval;
      this.throttleIntervalEl.textContent = newInterval;

      const throttleText = throttleLevel === 'heavy' ? '重度节流' :
                           throttleLevel === 'active' ? '轻度节流' : '正常';
      this.throttleStatus.textContent = throttleText;
      this.throttleStatus.className = 'throttle-status ' +
        (throttleLevel !== 'normal' ? throttleLevel : '');

      const sampleRate = throttleLevel === 'heavy' ? 3 :
                         throttleLevel === 'active' ? 2 : 1;
      if (this.whiteboard) {
        this.whiteboard.setThrottleParameters({
          interval: newInterval,
          sampleRate
        });
      }
    } else if (this.throttleIntervalEl.textContent === '--') {
      this.throttleIntervalEl.textContent = newInterval;
    }
  }

  handleDataChannelOpen(peerId) {
    if (this.whiteboard) {
      const syncData = this.whiteboard.getSyncData();
      this.webrtcManager.sendDataToPeer(peerId, syncData);
    }
  }

  leaveRoom() {
    if (this.peerListInterval) {
      clearInterval(this.peerListInterval);
      this.peerListInterval = null;
    }

    if (this.webrtcManager) {
      this.webrtcManager.disconnect();
      this.webrtcManager = null;
    }
    this.whiteboard = null;
    this.stopScreenShare();
    this.showLoginPanel();
  }

  handleMessage(peerId, data) {
    if (data.type === 'draw') {
      if (this.whiteboard) {
        this.whiteboard.drawRemote(data);
      }
    } else if (data.type === 'clear') {
      if (this.whiteboard) {
        this.whiteboard.remoteClear();
      }
    } else if (data.type === 'canvas-sync') {
      if (this.whiteboard) {
        this.whiteboard.applyCanvasSync(data);
      }
    }
  }

  handleStream(peerId, stream) {
    let screenItem = document.getElementById(`screen-${peerId}`);

    if (!screenItem) {
      screenItem = document.createElement('div');
      screenItem.id = `screen-${peerId}`;
      screenItem.className = 'screen-item';
      screenItem.innerHTML = `
        <h3>${peerId} 的屏幕</h3>
        <video autoplay playsinline></video>
      `;
      this.peerScreensDiv.appendChild(screenItem);
    }

    const video = screenItem.querySelector('video');
    video.srcObject = stream;
  }

  async startScreenShare() {
    if (!this.webrtcManager) return;

    try {
      const stream = await this.webrtcManager.startScreenShare();
      this.myScreenVideo.srcObject = stream;
      this.myScreenDiv.classList.remove('hidden');
      this.startScreenShareBtn.classList.add('hidden');
      this.stopScreenShareBtn.classList.remove('hidden');

      stream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };
    } catch (error) {
      console.error('Screen share failed:', error);
      alert('屏幕共享失败，请确保已授予权限');
    }
  }

  stopScreenShare() {
    if (this.webrtcManager) {
      this.webrtcManager.stopScreenShare();
    }
    this.myScreenVideo.srcObject = null;
    this.myScreenDiv.classList.add('hidden');
    this.startScreenShareBtn.classList.remove('hidden');
    this.stopScreenShareBtn.classList.add('hidden');
  }

  switchTab(tabName) {
    this.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    this.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === tabName);
    });

    if (tabName === 'whiteboard' && this.whiteboard) {
      setTimeout(() => this.whiteboard.resize(), 100);
    }
  }

  updatePeerList() {
    if (!this.webrtcManager) return;

    const peers = this.webrtcManager.getPeerIds();
    const connectedPeers = this.webrtcManager.getConnectedPeerIds
      ? this.webrtcManager.getConnectedPeerIds()
      : peers;

    this.peerCountSpan.textContent = peers.length;

    this.peersList.innerHTML = '';

    peers.forEach(peerId => {
      const isConnected = connectedPeers.includes(peerId);
      const card = document.createElement('div');
      card.className = 'peer-card';
      card.innerHTML = `
        <h4>${peerId}</h4>
        <span class="status ${isConnected ? '' : 'offline'}">${isConnected ? '在线' : '重连中...'}</span>
      `;
      this.peersList.appendChild(card);
    });

    if (peers.length === 0) {
      this.peersList.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">暂无其他参与者</p>';
    }
  }

  showMainPanel() {
    this.loginPanel.classList.add('hidden');
    this.mainPanel.classList.remove('hidden');
    this.currentRoomSpan.textContent = this.roomId;
    this.currentUserSpan.textContent = this.userId;

    setTimeout(() => {
      if (this.whiteboard) {
        this.whiteboard.resize();
      }
    }, 100);
  }

  showLoginPanel() {
    this.loginPanel.classList.remove('hidden');
    this.mainPanel.classList.add('hidden');
    this.peerScreensDiv.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
