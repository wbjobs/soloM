class SignalingClient {
    constructor() {
        this.clientId = this.generateClientId();
        this.ws = null;
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.iceGatheringTimers = new Map();
        this.iceConnectionTimers = new Map();
        this.roomId = null;
        this.password = null;
        this.encryptionEnabled = false;
        this.onPeerConnected = null;
        this.onPeerDisconnected = null;
        this.onDataChannelMessage = null;
        this.onDataChannelBufferedAmountLow = null;
        this.onDataChannelError = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onLog = null;
        this.ICE_GATHERING_TIMEOUT = 10000;
        this.ICE_CONNECTION_TIMEOUT = 30000;
        this.iceServers = this.getDefaultIceServers();
    }

    generateClientId() {
        return 'client_' + Math.random().toString(36).substr(2, 9);
    }

    getDefaultIceServers() {
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            {
                urls: 'turn:turn.cloudflare.com:3478?transport=udp',
                username: 'webrtc',
                credential: 'webrtc'
            },
            {
                urls: 'turn:turn.cloudflare.com:3478?transport=tcp',
                username: 'webrtc',
                credential: 'webrtc'
            },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ];
    }

    setIceServers(servers) {
        this.iceServers = servers;
    }

    async encryptData(data) {
        if (!this.encryptionEnabled || !window.cryptoUtils) {
            return data;
        }
        try {
            return await window.cryptoUtils.encrypt(data, this.password);
        } catch (error) {
            this.log(`加密失败: ${error.message}`, 'error');
            throw error;
        }
    }

    async decryptData(encryptedData) {
        if (!this.encryptionEnabled || !window.cryptoUtils) {
            return encryptedData;
        }
        try {
            return await window.cryptoUtils.decrypt(encryptedData, this.password);
        } catch (error) {
            this.log(`解密失败: ${error.message}，请确认房间密码是否正确`, 'error');
            throw error;
        }
    }

    log(message, type = 'info') {
        if (this.onLog && typeof this.onLog instanceof Function) {
            this.onLog(message, type);
        }
    }

    async connect(roomId, password = '') {
        this.roomId = roomId;
        this.password = password;
        this.encryptionEnabled = password && password.length > 0;
        
        if (this.encryptionEnabled) {
            this.log('信令加密已启用 (AES-GCM)', 'info');
        } else {
            this.log('警告: 未设置房间密码，信令交换将不加密', 'warning');
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.clientId}`;
        
        this.log(`正在连接到信令服务器: ${wsUrl}`, 'info');

        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.log('WebSocket 连接成功', 'success');
                this.send({
                    type: 'join',
                    roomId: roomId
                });
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    this.log(`解析消息失败: ${error.message}`, 'error');
                }
            };

            this.ws.onerror = (error) => {
                this.log(`WebSocket 错误: ${error}`, 'error');
                reject(error);
            };

            this.ws.onclose = (event) => {
                this.log(`WebSocket 连接已关闭 (code: ${event.code})`, 'warning');
                this.clearAllTimers();
                if (this.onDisconnected) {
                    this.onDisconnected();
                }
            };

            resolve();
        });
    }

    disconnect() {
        this.send({
            type: 'leave',
            roomId: this.roomId
        });

        this.clearAllTimers();

        this.peerConnections.forEach((pc, peerId) => {
            try {
                pc.close();
            } catch (e) {
                this.log(`关闭 PeerConnection 失败: ${e.message}`, 'warning');
            }
        });
        this.peerConnections.clear();
        this.dataChannels.clear();

        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {
                this.log(`关闭 WebSocket 失败: ${e.message}`, 'warning');
            }
        }
        this.ws = null;
        
        this.password = null;
        this.encryptionEnabled = false;
        this.log('已清除房间密码', 'info');
    }

    clearAllTimers() {
        this.iceGatheringTimers.forEach(timer => clearTimeout(timer));
        this.iceConnectionTimers.forEach(timer => clearTimeout(timer));
        this.iceGatheringTimers.clear();
        this.iceConnectionTimers.clear();
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
                return true;
            } catch (error) {
                this.log(`发送信令消息失败: ${error.message}`, 'error');
                return false;
            }
        }
        return false;
    }

    async handleMessage(message) {
        switch (message.type) {
            case 'joined':
                this.log(`已加入房间: ${message.roomId}`, 'success');
                if (this.onConnected) {
                    this.onConnected(message.clients);
                }
                break;

            case 'peer-joined':
                this.log(`新设备加入: ${message.clientId}`, 'info');
                await this.createPeerConnection(message.clientId, true);
                break;

            case 'peer-left':
                this.log(`设备离开: ${message.clientId}`, 'warning');
                this.cleanupPeer(message.clientId);
                if (this.onPeerDisconnected) {
                    this.onPeerDisconnected(message.clientId);
                }
                break;

            case 'offer':
                this.log(`收到来自 ${message.from} 的 Offer`, 'info');
                try {
                    const decryptedSdp = await this.decryptData(message.sdp);
                    await this.handleOffer(message.from, decryptedSdp);
                } catch (error) {
                    this.log(`处理 Offer 失败: ${error.message}`, 'error');
                }
                break;

            case 'answer':
                this.log(`收到来自 ${message.from} 的 Answer`, 'info');
                try {
                    const decryptedSdp = await this.decryptData(message.sdp);
                    await this.handleAnswer(message.from, decryptedSdp);
                } catch (error) {
                    this.log(`处理 Answer 失败: ${error.message}`, 'error');
                }
                break;

            case 'ice-candidate':
                this.log(`收到来自 ${message.from} 的 ICE Candidate`, 'info');
                try {
                    const decryptedCandidate = message.candidate ? await this.decryptData(message.candidate) : null;
                    await this.handleIceCandidate(message.from, decryptedCandidate);
                } catch (error) {
                    this.log(`处理 ICE Candidate 失败: ${error.message}`, 'error');
                }
                break;

            case 'ice-restart':
                this.log(`收到来自 ${message.from} 的 ICE 重启请求`, 'warning');
                await this.handleIceRestart(message.from);
                break;
        }
    }

    async createPeerConnection(peerId, isInitiator) {
        if (this.peerConnections.has(peerId)) {
            return this.peerConnections.get(peerId);
        }

        this.log(`创建与 ${peerId} 的 PeerConnection`, 'info');

        const pcConfig = {
            iceServers: this.iceServers,
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };

        this.log(`ICE 配置: ${pcConfig.iceServers.length} 个服务器`, 'info');

        const pc = new RTCPeerConnection(pcConfig);

        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                this.log(`收集到 ICE Candidate: ${event.candidate.candidate.substr(0, 60)}...`, 'info');
                try {
                    const encryptedCandidate = await this.encryptData(event.candidate);
                    this.send({
                        type: 'ice-candidate',
                        targetId: peerId,
                        candidate: encryptedCandidate,
                        encrypted: this.encryptionEnabled
                    });
                } catch (error) {
                    this.log(`加密 ICE Candidate 失败: ${error.message}`, 'error');
                }
            } else {
                this.log('ICE 候选收集完成', 'info');
                this.clearIceGatheringTimer(peerId);
                this.send({
                    type: 'ice-candidate',
                    targetId: peerId,
                    candidate: null
                });
            }
        };

        pc.onicegatheringstatechange = () => {
            this.log(`ICE 收集状态: ${pc.iceGatheringState} (${peerId})`, 'info');
            if (pc.iceGatheringState === 'complete') {
                this.clearIceGatheringTimer(peerId);
            } else if (pc.iceGatheringState === 'gathering') {
                this.startIceGatheringTimer(peerId, pc);
            }
        };

        pc.oniceconnectionstatechange = () => {
            this.log(`ICE 连接状态: ${pc.iceConnectionState} (${peerId})`, 'info');
            
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                this.clearIceConnectionTimer(peerId);
            } else if (pc.iceConnectionState === 'checking') {
                this.startIceConnectionTimer(peerId, pc);
            } else if (pc.iceConnectionState === 'failed') {
                this.log(`ICE 连接失败，尝试重启 ICE (${peerId})`, 'error');
                this.handleIceFailure(peerId, pc);
            } else if (pc.iceConnectionState === 'disconnected') {
                this.log(`ICE 连接断开，尝试重新连接 (${peerId})`, 'warning');
                this.handleIceDisconnection(peerId, pc);
            }
        };

        pc.onconnectionstatechange = () => {
            this.log(`连接状态: ${pc.connectionState} (${peerId})`, 'info');
            if (pc.connectionState === 'connected') {
                this.clearIceConnectionTimer(peerId);
                this.log(`与 ${peerId} 连接成功!`, 'success');
                if (this.onPeerConnected) {
                    this.onPeerConnected(peerId);
                }
            } else if (pc.connectionState === 'failed') {
                this.log(`与 ${peerId} 连接失败`, 'error');
                this.handleIceFailure(peerId, pc);
            }
        };

        pc.onsignalingstatechange = () => {
            this.log(`信令状态: ${pc.signalingState} (${peerId})`, 'info');
        };

        pc.ondatachannel = (event) => {
            this.log(`收到 DataChannel: ${event.channel.label} (${peerId})`, 'info');
            this.setupDataChannel(peerId, event.channel);
        };

        this.peerConnections.set(peerId, pc);

        if (isInitiator) {
            try {
                const dataChannel = pc.createDataChannel('data-channel', {
                    ordered: true,
                    maxRetransmits: 5
                });
                this.setupDataChannel(peerId, dataChannel);
                
                this.log(`创建 Offer (${peerId})`, 'info');
                const offer = await pc.createOffer({
                    iceRestart: false,
                    voiceActivityDetection: false
                });
                await pc.setLocalDescription(offer);
                
                this.startIceGatheringTimer(peerId, pc);
                
                const encryptedSdp = await this.encryptData(offer);
                this.send({
                    type: 'offer',
                    targetId: peerId,
                    sdp: encryptedSdp,
                    encrypted: this.encryptionEnabled
                });
            } catch (error) {
                this.log(`创建 Offer 失败: ${error.message}`, 'error');
                this.cleanupPeer(peerId);
            }
        }

        return pc;
    }

    setupDataChannel(peerId, channel) {
        channel.bufferedAmountLowThreshold = 1024 * 256;

        channel.onopen = () => {
            this.log(`DataChannel 已打开 (${peerId})`, 'success');
        };

        channel.onmessage = (event) => {
            if (this.onDataChannelMessage) {
                this.onDataChannelMessage(peerId, event.data);
            }
        };

        channel.onbufferedamountlow = () => {
            this.log(`DataChannel 缓冲区低于阈值 (${peerId}): ${channel.bufferedAmount} bytes`, 'info');
            if (this.onDataChannelBufferedAmountLow) {
                this.onDataChannelBufferedAmountLow(peerId);
            }
        };

        channel.onclose = () => {
            this.log(`DataChannel 已关闭 (${peerId})`, 'warning');
        };

        channel.onerror = (error) => {
            this.log(`DataChannel 错误 (${peerId}): ${error.message || error}`, 'error');
            if (this.onDataChannelError) {
                this.onDataChannelError(peerId, error);
            }
        };

        this.dataChannels.set(peerId, channel);
    }

    startIceGatheringTimer(peerId, pc) {
        this.clearIceGatheringTimer(peerId);
        
        const timer = setTimeout(() => {
            this.log(`ICE 收集超时 (${this.ICE_GATHERING_TIMEOUT}ms)，强制完成收集 (${peerId})`, 'warning');
            
            if (pc.iceGatheringState === 'gathering' && pc.localDescription) {
                this.log(`使用当前 SDP 作为最终描述 (${peerId})`, 'info');
                this.send({
                    type: 'ice-candidate',
                    targetId: peerId,
                    candidate: null
                });
            }
        }, this.ICE_GATHERING_TIMEOUT);
        
        this.iceGatheringTimers.set(peerId, timer);
    }

    clearIceGatheringTimer(peerId) {
        const timer = this.iceGatheringTimers.get(peerId);
        if (timer) {
            clearTimeout(timer);
            this.iceGatheringTimers.delete(peerId);
        }
    }

    startIceConnectionTimer(peerId, pc) {
        this.clearIceConnectionTimer(peerId);
        
        const timer = setTimeout(() => {
            this.log(`ICE 连接超时 (${this.ICE_CONNECTION_TIMEOUT}ms) (${peerId})`, 'error');
            this.handleIceFailure(peerId, pc);
        }, this.ICE_CONNECTION_TIMEOUT);
        
        this.iceConnectionTimers.set(peerId, timer);
    }

    clearIceConnectionTimer(peerId) {
        const timer = this.iceConnectionTimers.get(peerId);
        if (timer) {
            clearTimeout(timer);
            this.iceConnectionTimers.delete(peerId);
        }
    }

    async handleIceFailure(peerId, pc) {
        this.log(`处理 ICE 失败 (${peerId})`, 'warning');
        
        try {
            if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
                this.log(`尝试 ICE 重启 (${peerId})`, 'info');
                
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                
                this.startIceGatheringTimer(peerId, pc);
                this.startIceConnectionTimer(peerId, pc);
                
                const encryptedSdp = await this.encryptData(offer);
                this.send({
                    type: 'offer',
                    targetId: peerId,
                    sdp: encryptedSdp,
                    encrypted: this.encryptionEnabled
                });
            }
        } catch (error) {
            this.log(`ICE 重启失败: ${error.message}`, 'error');
            this.log('建议检查网络环境或使用 TURN 服务器', 'warning');
        }
    }

    async handleIceDisconnection(peerId, pc) {
        this.log(`处理 ICE 断开 (${peerId})`, 'warning');
        
        setTimeout(async () => {
            if (pc.iceConnectionState === 'disconnected') {
                this.log(`连接仍未恢复，尝试 ICE 重启 (${peerId})`, 'warning');
                await this.handleIceFailure(peerId, pc);
            }
        }, 3000);
    }

    async handleIceRestart(peerId) {
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            this.log(`收到 ICE 重启请求 (${peerId})`, 'info');
            await this.handleIceFailure(peerId, pc);
        }
    }

    async handleOffer(from, sdp) {
        try {
            const pc = await this.createPeerConnection(from, false);
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            
            this.log(`创建 Answer (${from})`, 'info');
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            this.startIceGatheringTimer(from, pc);
            
            const encryptedSdp = await this.encryptData(answer);
            this.send({
                type: 'answer',
                targetId: from,
                sdp: encryptedSdp,
                encrypted: this.encryptionEnabled
            });
        } catch (error) {
            this.log(`处理 Offer 失败: ${error.message}`, 'error');
        }
    }

    async handleAnswer(from, sdp) {
        try {
            const pc = this.peerConnections.get(from);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            }
        } catch (error) {
            this.log(`处理 Answer 失败: ${error.message}`, 'error');
        }
    }

    async handleIceCandidate(from, candidate) {
        try {
            const pc = this.peerConnections.get(from);
            if (pc && candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else if (pc && candidate === null) {
                this.log(`对端 ICE 收集完成 (${from})`, 'info');
            }
        } catch (error) {
            this.log(`添加 ICE Candidate 失败: ${error.message}`, 'warning');
        }
    }

    cleanupPeer(peerId) {
        this.clearIceGatheringTimer(peerId);
        this.clearIceConnectionTimer(peerId);
        
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            try {
                pc.close();
            } catch (e) {
                this.log(`关闭 PeerConnection 失败: ${e.message}`, 'warning');
            }
            this.peerConnections.delete(peerId);
        }
        
        const channel = this.dataChannels.get(peerId);
        if (channel) {
            try {
                channel.close();
            } catch (e) {
                this.log(`关闭 DataChannel 失败: ${e.message}`, 'warning');
            }
            this.dataChannels.delete(peerId);
        }
    }

    sendToPeer(peerId, data) {
        const channel = this.dataChannels.get(peerId);
        if (channel && channel.readyState === 'open') {
            try {
                channel.send(data);
                return true;
            } catch (error) {
                this.log(`发送数据失败 (${peerId}): ${error.message}`, 'error');
                return false;
            }
        }
        this.log(`DataChannel 未就绪 (${peerId}), state: ${channel ? channel.readyState : 'null'}`, 'warning');
        return false;
    }

    getChannelBufferedAmount(peerId) {
        const channel = this.dataChannels.get(peerId);
        if (channel) {
            return channel.bufferedAmount;
        }
        return -1;
    }

    getChannelReadyState(peerId) {
        const channel = this.dataChannels.get(peerId);
        if (channel) {
            return channel.readyState;
        }
        return 'closed';
    }

    broadcast(data) {
        let successCount = 0;
        this.dataChannels.forEach((channel, peerId) => {
            if (channel.readyState === 'open') {
                try {
                    channel.send(data);
                    successCount++;
                } catch (error) {
                    this.log(`广播失败 (${peerId}): ${error.message}`, 'error');
                }
            }
        });
        return successCount;
    }

    getConnectedPeers() {
        const peers = [];
        this.peerConnections.forEach((pc, peerId) => {
            if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                peers.push(peerId);
            }
        });
        return peers;
    }
}
