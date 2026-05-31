class App {
    constructor() {
        this.signaling = new SignalingClient();
        this.fileTransfer = null;
        this.clipboardSync = null;
        this.transfers = new Map();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupSignalingCallbacks();
        
        const storedRoom = localStorage.getItem('webrtc-room');
        if (storedRoom) {
            document.getElementById('roomId').value = storedRoom;
        }
        
        const storedName = localStorage.getItem('webrtc-name');
        if (storedName) {
            document.getElementById('clientName').value = storedName;
        }
    }

    setupEventListeners() {
        document.getElementById('generateRoomBtn').addEventListener('click', () => {
            const roomId = this.generateRoomId();
            document.getElementById('roomId').value = roomId;
        });

        document.getElementById('connectBtn').addEventListener('click', () => {
            this.connect();
        });

        document.getElementById('disconnectBtn').addEventListener('click', () => {
            this.disconnect();
        });

        const dropZone = document.getElementById('dropZone');
        dropZone.addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        document.getElementById('clipboardSyncToggle').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.clipboardSync.enable();
            } else {
                this.clipboardSync.disable();
            }
        });

        document.getElementById('copyClipboardBtn').addEventListener('click', () => {
            const content = document.getElementById('clipboardContent').value;
            if (content && this.clipboardSync) {
                this.clipboardSync.copyToLocal(content);
            }
        });

        document.getElementById('sendClipboardBtn').addEventListener('click', () => {
            if (this.clipboardSync) {
                this.clipboardSync.sendLocalClipboard();
            }
        });

        document.getElementById('clearLogBtn').addEventListener('click', () => {
            document.getElementById('logContainer').innerHTML = '';
        });
    }

    setupSignalingCallbacks() {
        this.signaling.onLog = (message, type) => {
            this.log(message, type);
        };

        this.signaling.onConnected = (clients) => {
            this.updateConnectionStatus('connected');
            this.updatePeersList(clients);
        };

        this.signaling.onDisconnected = () => {
            this.updateConnectionStatus('disconnected');
            this.updatePeersList([]);
        };

        this.signaling.onPeerConnected = (peerId) => {
            this.updatePeersList(this.signaling.getConnectedPeers());
            this.updateClipboardControls(true);
        };

        this.signaling.onPeerDisconnected = (peerId) => {
            this.updatePeersList(this.signaling.getConnectedPeers());
            const peers = this.signaling.getConnectedPeers();
            if (peers.length === 0) {
                this.updateClipboardControls(false);
            }
        };

        this.signaling.onDataChannelMessage = (peerId, data) => {
            if (this.fileTransfer) {
                this.fileTransfer.handleMessage(peerId, data);
            }
            if (this.clipboardSync) {
                this.clipboardSync.handleMessage(peerId, data);
            }
        };
    }

    generateRoomId() {
        return Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    async connect() {
        const roomId = document.getElementById('roomId').value.trim();
        const clientName = document.getElementById('clientName').value.trim();
        const roomPassword = document.getElementById('roomPassword').value;

        if (!roomId) {
            this.log('请输入房间号', 'warning');
            return;
        }

        if (!clientName) {
            this.log('请输入设备名称', 'warning');
            return;
        }

        if (!roomPassword) {
            if (!confirm('未设置房间密码，信令交换将不加密。是否继续？')) {
                return;
            }
        }

        localStorage.setItem('webrtc-room', roomId);
        localStorage.setItem('webrtc-name', clientName);

        this.updateConnectionStatus('connecting');
        
        try {
            await this.signaling.connect(roomId, roomPassword);
            
            this.fileTransfer = new FileTransfer(this.signaling);
            this.fileTransfer.onLog = (message, type) => this.log(message, type);
            this.fileTransfer.onTransferUpdate = (update) => this.handleTransferUpdate(update);
            
            this.clipboardSync = new ClipboardSync(this.signaling);
            this.clipboardSync.onLog = (message, type) => this.log(message, type);
            this.clipboardSync.onClipboardReceived = (content, peerId, timestamp) => {
                document.getElementById('clipboardContent').value = content;
            };

            document.getElementById('connectBtn').disabled = true;
            document.getElementById('disconnectBtn').disabled = false;
            document.getElementById('roomId').disabled = true;
            document.getElementById('clientName').disabled = true;
            document.getElementById('roomPassword').disabled = true;

        } catch (error) {
            this.log(`连接失败: ${error.message}`, 'error');
            this.updateConnectionStatus('disconnected');
        }
    }

    disconnect() {
        if (this.clipboardSync) {
            this.clipboardSync.disable();
            this.clipboardSync.destroy();
            this.clipboardSync = null;
        }
        
        if (this.fileTransfer) {
            this.fileTransfer.destroy();
            this.fileTransfer = null;
        }
        
        this.transfers.clear();
        
        this.signaling.disconnect();
        
        document.getElementById('connectBtn').disabled = false;
        document.getElementById('disconnectBtn').disabled = true;
        document.getElementById('roomId').disabled = false;
        document.getElementById('clientName').disabled = false;
        document.getElementById('roomPassword').disabled = false;
        document.getElementById('roomPassword').value = '';
        document.getElementById('clipboardSyncToggle').disabled = true;
        document.getElementById('clipboardSyncToggle').checked = false;
        document.getElementById('sendClipboardBtn').disabled = true;

        this.log('已断开连接', 'info');
    }

    handleFiles(files) {
        const peers = this.signaling.getConnectedPeers();
        
        if (peers.length === 0) {
            this.log('没有已连接的设备', 'warning');
            return;
        }

        Array.from(files).forEach(file => {
            peers.forEach(peerId => {
                const transferId = this.fileTransfer.sendFile(file, peerId);
                this.transfers.set(transferId, {
                    file,
                    peerId,
                    direction: 'send'
                });
                this.addTransferItem(transferId, file, 'send', peerId);
            });
        });
    }

    handleTransferUpdate(update) {
        const { transferId, status, bytesProcessed } = update;
        
        if (!this.transfers.has(transferId)) {
            const info = this.fileTransfer.getTransferInfo(transferId);
            if (info) {
                this.transfers.set(transferId, {
                    file: info,
                    direction: info.direction
                });
                this.addTransferItem(transferId, info, info.direction, 'unknown');
            }
        }

        this.updateTransferItem(transferId, status, bytesProcessed);
    }

    addTransferItem(transferId, file, direction, peerId) {
        const transferList = document.getElementById('transferList');
        
        const info = this.fileTransfer.getTransferInfo(transferId) || {};
        const size = file.size || 0;
        
        const item = document.createElement('div');
        item.className = 'transfer-item';
        item.id = `transfer-${transferId}`;
        item.innerHTML = `
            <div class="transfer-item-header">
                <span class="transfer-item-name" title="${file.name}">${file.name}</span>
                <span class="transfer-item-size">${this.formatFileSize(size)}</span>
                <span class="transfer-item-status pending">等待中</span>
            </div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width: 0%"></div>
            </div>
            <div style="font-size: 0.85rem; color: #888; margin-bottom: 8px;">
                ${direction === 'send' ? '发送到' : '接收自'}: ${peerId} | 
                <span class="progress-text">0%</span>
            </div>
            ${direction === 'send' ? `
            <div class="transfer-item-actions">
                <button class="pause-btn secondary-btn" data-transfer="${transferId}">暂停</button>
                <button class="resume-btn secondary-btn" data-transfer="${transferId}" style="display:none;">继续</button>
                <button class="cancel-btn danger-btn" data-transfer="${transferId}">取消</button>
            </div>
            ` : ''}
        `;
        
        transferList.insertBefore(item, transferList.firstChild);

        if (direction === 'send') {
            item.querySelector('.pause-btn').addEventListener('click', () => {
                this.fileTransfer.pauseTransfer(transferId);
                item.querySelector('.pause-btn').style.display = 'none';
                item.querySelector('.resume-btn').style.display = 'inline-block';
            });

            item.querySelector('.resume-btn').addEventListener('click', () => {
                this.fileTransfer.resumeTransfer(transferId);
                item.querySelector('.pause-btn').style.display = 'inline-block';
                item.querySelector('.resume-btn').style.display = 'none';
            });

            item.querySelector('.cancel-btn').addEventListener('click', () => {
                this.fileTransfer.cancelTransfer(transferId);
            });
        }
    }

    updateTransferItem(transferId, status, bytesProcessed) {
        const item = document.getElementById(`transfer-${transferId}`);
        if (!item) return;

        const info = this.fileTransfer.getTransferInfo(transferId);
        if (!info) return;

        const progress = Math.floor((bytesProcessed / info.size) * 100);
        
        item.querySelector('.progress-bar-fill').style.width = `${progress}%`;
        item.querySelector('.progress-text').textContent = `${progress}% (${this.formatFileSize(bytesProcessed)} / ${this.formatFileSize(info.size)})`;

        const statusEl = item.querySelector('.transfer-item-status');
        statusEl.className = `transfer-item-status ${status}`;
        
        const statusText = {
            'pending': '等待中',
            'transferring': '传输中',
            'completed': '已完成',
            'paused': '已暂停',
            'cancelled': '已取消',
            'error': '错误'
        };
        statusEl.textContent = statusText[status] || status;

        if (status === 'completed' || status === 'cancelled' || status === 'error') {
            const actions = item.querySelector('.transfer-item-actions');
            if (actions) {
                actions.style.display = 'none';
            }
        }
        
        if (status === 'error') {
            const retryBtn = document.createElement('button');
            retryBtn.className = 'primary-btn';
            retryBtn.textContent = '重试';
            retryBtn.style.marginTop = '8px';
            retryBtn.onclick = () => {
                const peers = this.signaling.getConnectedPeers();
                if (peers.length > 0) {
                    const file = this.transfers.get(transferId)?.file;
                    if (file) {
                        this.handleFiles([file]);
                    }
                }
            };
            item.appendChild(retryBtn);
        }
    }

    updateConnectionStatus(status) {
        const statusEl = document.getElementById('connectionStatus');
        statusEl.className = `status ${status}`;
        
        const statusText = {
            'connected': '已连接',
            'disconnected': '未连接',
            'connecting': '连接中...'
        };
        statusEl.textContent = statusText[status] || status;
    }

    updatePeersList(clients) {
        const list = document.getElementById('peersList');
        list.innerHTML = '';

        clients.forEach(clientId => {
            if (clientId !== this.signaling.clientId) {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${clientId}</span>
                    <span class="peer-status"></span>
                `;
                list.appendChild(li);
            }
        });

        if (clients.length <= 1) {
            const li = document.createElement('li');
            li.innerHTML = '<span style="color: #888;">暂无其他设备连接</span>';
            list.appendChild(li);
        }
    }

    updateClipboardControls(enabled) {
        document.getElementById('clipboardSyncToggle').disabled = !enabled;
        document.getElementById('sendClipboardBtn').disabled = !enabled;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    log(message, type = 'info') {
        const logContainer = document.getElementById('logContainer');
        const timestamp = new Date().toLocaleTimeString();
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
        
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});
