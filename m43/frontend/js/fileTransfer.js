class FileTransfer {
    constructor(signalingClient) {
        this.signaling = signalingClient;
        this.CHUNK_SIZE = 16384;
        this.MAX_BUFFERED_AMOUNT = 1024 * 256;
        this.WINDOW_SIZE = 50;
        this.RETRY_TIMEOUT = 5000;
        this.MAX_RETRIES = 5;
        this.activeTransfers = new Map();
        this.receivedFiles = new Map();
        this.pendingChunks = new Map();
        this.retryTimers = new Map();
        this.onTransferUpdate = null;
        this.onTransferComplete = null;
        this.onLog = null;
        this.setupSignalingCallbacks();
    }

    setupSignalingCallbacks() {
        this.signaling.onDataChannelBufferedAmountLow = (peerId) => {
            this.handleBufferLow(peerId);
        };

        this.signaling.onDataChannelError = (peerId, error) => {
            this.log(`DataChannel 错误，暂停所有传输 (${peerId}): ${error}`, 'error');
            this.pauseTransfersForPeer(peerId);
        };
    }

    log(message, type = 'info') {
        if (this.onLog && typeof this.onLog instanceof Function) {
            this.onLog(message, type);
        }
    }

    async sendFile(file, peerId) {
        const transferId = this.generateTransferId();
        const fileInfo = {
            id: transferId,
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
            checksum: await this.generateFileChecksum(file)
        };

        const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);

        this.activeTransfers.set(transferId, {
            file,
            fileInfo,
            peerId,
            offset: 0,
            currentChunk: 0,
            totalChunks,
            status: 'pending',
            paused: false,
            pendingAck: new Map(),
            windowStart: 0,
            retryCount: 0
        });

        this.pendingChunks.set(transferId, []);

        this.notifyTransferUpdate(transferId, 'pending', 0);
        this.log(`准备发送文件: ${file.name} (${this.formatFileSize(file.size)}, ${totalChunks} 个分片)`, 'info');

        const metadata = {
            type: 'file-metadata',
            transferId,
            fileInfo,
            totalChunks
        };
        
        if (!this.signaling.sendToPeer(peerId, JSON.stringify(metadata))) {
            this.log(`发送文件元数据失败，连接可能已断开`, 'error');
            this.activeTransfers.delete(transferId);
            this.pendingChunks.delete(transferId);
            return null;
        }

        return transferId;
    }

    async generateFileChecksum(file) {
        if (file.size > 100 * 1024 * 1024) {
            return 'large-file-skip-checksum';
        }
        
        try {
            const sampleSize = Math.min(file.size, 1024 * 1024);
            const sample = file.slice(0, sampleSize);
            const arrayBuffer = await sample.arrayBuffer();
            const hashArray = new Uint8Array(arrayBuffer);
            let hash = 0;
            for (let i = 0; i < hashArray.length; i++) {
                hash = ((hash << 5) - hash) + hashArray[i];
                hash |= 0;
            }
            return hash.toString(36);
        } catch (e) {
            return 'checksum-error';
        }
    }

    resumeTransfer(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (transfer && transfer.paused) {
            transfer.paused = false;
            transfer.retryCount = 0;
            this.notifyTransferUpdate(transferId, 'transferring', transfer.offset);
            this.log(`恢复传输: ${transfer.fileInfo.name}`, 'info');
            this.fillWindow(transferId);
        }
    }

    pauseTransfer(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (transfer) {
            transfer.paused = true;
            this.clearRetryTimers(transferId);
            this.notifyTransferUpdate(transferId, 'paused', transfer.offset);
            this.log(`暂停传输: ${transfer.fileInfo.name}`, 'warning');
        }
    }

    cancelTransfer(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (transfer) {
            transfer.paused = true;
            this.clearRetryTimers(transferId);
            this.activeTransfers.delete(transferId);
            this.pendingChunks.delete(transferId);
            
            try {
                this.signaling.sendToPeer(transfer.peerId, JSON.stringify({
                    type: 'file-cancel',
                    transferId
                }));
            } catch (e) {
                this.log(`发送取消消息失败: ${e.message}`, 'warning');
            }
            
            this.log(`取消传输: ${transfer.fileInfo.name}`, 'warning');
        }
    }

    pauseTransfersForPeer(peerId) {
        this.activeTransfers.forEach((transfer, transferId) => {
            if (transfer.peerId === peerId) {
                this.pauseTransfer(transferId);
            }
        });
    }

    clearRetryTimers(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (transfer) {
            transfer.pendingAck.forEach((_, chunkIndex) => {
                const timerKey = `${transferId}-${chunkIndex}`;
                const timer = this.retryTimers.get(timerKey);
                if (timer) {
                    clearTimeout(timer);
                    this.retryTimers.delete(timerKey);
                }
            });
        }
    }

    async fillWindow(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (!transfer || transfer.paused) return;

        const channel = this.signaling.dataChannels.get(transfer.peerId);
        if (!channel || channel.readyState !== 'open') {
            this.log(`DataChannel 未就绪，等待恢复...`, 'warning');
            transfer.paused = true;
            return;
        }

        while (transfer.currentChunk < transfer.totalChunks && 
               transfer.pendingAck.size < this.WINDOW_SIZE &&
               !transfer.paused) {

            if (channel.bufferedAmount > this.MAX_BUFFERED_AMOUNT) {
                this.log(`缓冲区已满 (${channel.bufferedAmount} bytes)，等待 drained...`, 'info');
                break;
            }

            await this.sendChunk(transferId, transfer.currentChunk);
            transfer.currentChunk++;
        }
    }

    async sendChunk(transferId, chunkIndex) {
        const transfer = this.activeTransfers.get(transferId);
        if (!transfer) return false;

        const { file, fileInfo, peerId } = transfer;
        const start = chunkIndex * this.CHUNK_SIZE;
        const end = Math.min(start + this.CHUNK_SIZE, fileInfo.size);

        try {
            const chunk = file.slice(start, end);
            const arrayBuffer = await chunk.arrayBuffer();

            const chunkHeader = {
                type: 'file-chunk',
                transferId,
                chunkIndex,
                offset: start,
                size: arrayBuffer.byteLength,
                timestamp: Date.now()
            };

            const headerBytes = new TextEncoder().encode(JSON.stringify(chunkHeader));
            const headerLength = new Uint32Array([headerBytes.length]);

            const fullMessage = new Uint8Array(4 + headerBytes.length + arrayBuffer.byteLength);
            fullMessage.set(new Uint8Array(headerLength.buffer), 0);
            fullMessage.set(headerBytes, 4);
            fullMessage.set(new Uint8Array(arrayBuffer), 4 + headerBytes.length);

            const channel = this.signaling.dataChannels.get(peerId);
            if (!channel || channel.readyState !== 'open') {
                throw new Error('DataChannel not open');
            }

            try {
                channel.send(fullMessage);
            } catch (sendError) {
                this.log(`发送分片 ${chunkIndex} 失败: ${sendError.message}`, 'error');
                this.scheduleRetry(transferId, chunkIndex);
                return false;
            }

            transfer.pendingAck.set(chunkIndex, {
                sentAt: Date.now(),
                size: arrayBuffer.byteLength
            });

            this.scheduleRetry(transferId, chunkIndex);

            return true;

        } catch (error) {
            this.log(`读取或发送分片 ${chunkIndex} 失败: ${error.message}`, 'error');
            this.scheduleRetry(transferId, chunkIndex);
            return false;
        }
    }

    scheduleRetry(transferId, chunkIndex) {
        const timerKey = `${transferId}-${chunkIndex}`;
        
        const existingTimer = this.retryTimers.get(timerKey);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(async () => {
            await this.handleChunkTimeout(transferId, chunkIndex);
        }, this.RETRY_TIMEOUT);

        this.retryTimers.set(timerKey, timer);
    }

    async handleChunkTimeout(transferId, chunkIndex) {
        const transfer = this.activeTransfers.get(transferId);
        if (!transfer || !transfer.pendingAck.has(chunkIndex)) {
            this.retryTimers.delete(`${transferId}-${chunkIndex}`);
            return;
        }

        const pendingInfo = transfer.pendingAck.get(chunkIndex);
        const pendingEntry = this.pendingChunks.get(transferId);
        if (!pendingEntry) {
            pendingEntry = [];
            this.pendingChunks.set(transferId, pendingEntry);
        }

        if (!pendingEntry.includes(chunkIndex)) {
            pendingEntry.push(chunkIndex);
        }

        if (pendingEntry.length > this.WINDOW_SIZE / 2) {
            this.log(`过多未确认分片 (${pendingEntry.length})，可能网络不稳定`, 'warning');
        }

        if (transfer.retryCount >= this.MAX_RETRIES) {
            this.log(`传输超时，重试次数已达上限 (${this.MAX_RETRIES})，暂停传输`, 'error');
            transfer.paused = true;
            this.notifyTransferUpdate(transferId, 'paused', transfer.offset);
            return;
        }

        transfer.retryCount++;
        this.log(`分片 ${chunkIndex} 超时，第 ${transfer.retryCount} 次重试...`, 'warning');
        await this.sendChunk(transferId, chunkIndex);
    }

    handleBufferLow(peerId) {
        this.log(`DataChannel 缓冲区已清空，继续发送 (${peerId})`, 'info');
        this.activeTransfers.forEach((transfer, transferId) => {
            if (transfer.peerId === peerId && !transfer.paused) {
                this.fillWindow(transferId);
            }
        });
    }

    handleMessage(peerId, data) {
        if (typeof data === 'string') {
            try {
                this.handleTextMessage(peerId, data);
            } catch (error) {
                this.log(`处理文本消息失败: ${error.message}`, 'error');
            }
        } else if (data instanceof ArrayBuffer) {
            try {
                this.handleBinaryMessage(peerId, data);
            } catch (error) {
                this.log(`处理二进制消息失败: ${error.message}`, 'error');
            }
        }
    }

    handleTextMessage(peerId, message) {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'file-metadata':
                this.handleFileMetadata(peerId, data);
                break;
            case 'file-request-resume':
                this.handleResumeRequest(peerId, data);
                break;
            case 'file-complete':
                this.handleFileComplete(peerId, data);
                break;
            case 'file-cancel':
                this.handleFileCancel(peerId, data);
                break;
            case 'file-ack':
                this.handleChunkAck(peerId, data);
                break;
        }
    }

    handleBinaryMessage(peerId, buffer) {
        try {
            const view = new DataView(buffer);
            const headerLength = view.getUint32(0, true);
            
            if (headerLength > buffer.byteLength - 4) {
                this.log('无效的消息格式: 头部长度超出范围', 'error');
                return;
            }
            
            const headerBytes = new Uint8Array(buffer, 4, headerLength);
            const header = JSON.parse(new TextDecoder().decode(headerBytes));

            if (header.type === 'file-chunk') {
                const chunkData = new Uint8Array(buffer, 4 + headerLength, header.size);
                this.handleFileChunk(peerId, header, chunkData);
            }
        } catch (error) {
            this.log(`解析二进制消息失败: ${error.message}`, 'error');
            this.log(`消息大小: ${buffer.byteLength} bytes`, 'error');
        }
    }

    handleFileMetadata(peerId, data) {
        const { transferId, fileInfo, totalChunks } = data;
        
        this.receivedFiles.set(transferId, {
            fileInfo,
            peerId,
            chunks: new Map(),
            receivedSize: 0,
            totalChunks,
            receivedChunks: 0,
            status: 'pending',
            lastChunkTime: Date.now()
        });

        this.notifyTransferUpdate(transferId, 'pending', 0);
        this.log(`接收文件: ${fileInfo.name} (${this.formatFileSize(fileInfo.size)}, ${totalChunks} 个分片)`, 'info');

        const resumeRequest = {
            type: 'file-request-resume',
            transferId,
            offset: 0
        };
        
        if (!this.signaling.sendToPeer(peerId, JSON.stringify(resumeRequest))) {
            this.log(`发送恢复请求失败`, 'error');
        }
    }

    handleResumeRequest(peerId, data) {
        const { transferId, offset } = data;
        const transfer = this.activeTransfers.get(transferId);
        
        if (transfer) {
            const startChunk = Math.floor(offset / this.CHUNK_SIZE);
            transfer.currentChunk = startChunk;
            transfer.windowStart = startChunk;
            transfer.offset = offset;
            transfer.status = 'transferring';
            transfer.retryCount = 0;
            
            transfer.pendingAck.clear();
            
            this.log(`从分片 ${startChunk} (偏移量 ${offset}) 开始传输`, 'info');
            this.fillWindow(transferId);
        }
    }

    handleFileChunk(peerId, header, chunkData) {
        const { transferId, chunkIndex, offset, size } = header;
        const receive = this.receivedFiles.get(transferId);
        
        if (!receive) {
            this.log(`收到未知传输的分片: ${transferId}`, 'warning');
            return;
        }

        if (receive.chunks.has(chunkIndex)) {
            this.log(`收到重复分片 ${chunkIndex}，已忽略`, 'info');
            this.sendAck(peerId, transferId, chunkIndex);
            return;
        }

        receive.chunks.set(chunkIndex, {
            data: chunkData,
            offset,
            size
        });
        receive.receivedSize += size;
        receive.receivedChunks++;
        receive.lastChunkTime = Date.now();

        const progress = Math.floor((receive.receivedSize / receive.fileInfo.size) * 100);
        this.notifyTransferUpdate(transferId, 'transferring', receive.receivedSize);

        this.sendAck(peerId, transferId, chunkIndex);

        if (receive.receivedChunks >= receive.totalChunks) {
            this.assembleFile(transferId);
        }
    }

    sendAck(peerId, transferId, chunkIndex) {
        const ack = {
            type: 'file-ack',
            transferId,
            chunkIndex,
            receivedAt: Date.now()
        };
        
        try {
            this.signaling.sendToPeer(peerId, JSON.stringify(ack));
        } catch (e) {
            this.log(`发送 ACK 失败: ${e.message}`, 'warning');
        }
    }

    handleChunkAck(peerId, data) {
        const { transferId, chunkIndex } = data;
        const transfer = this.activeTransfers.get(transferId);
        
        if (!transfer) return;

        transfer.pendingAck.delete(chunkIndex);
        transfer.retryCount = 0;

        const timerKey = `${transferId}-${chunkIndex}`;
        const timer = this.retryTimers.get(timerKey);
        if (timer) {
            clearTimeout(timer);
            this.retryTimers.delete(timerKey);
        }

        const pendingEntry = this.pendingChunks.get(transferId);
        if (pendingEntry) {
            const idx = pendingEntry.indexOf(chunkIndex);
            if (idx > -1) {
                pendingEntry.splice(idx, 1);
            }
        }

        let minUnacked = transfer.totalChunks;
        for (let i = transfer.windowStart; i < transfer.currentChunk; i++) {
            if (transfer.pendingAck.has(i)) {
                minUnacked = i;
                break;
            }
            transfer.windowStart = i + 1;
            transfer.offset = (i + 1) * this.CHUNK_SIZE;
        }

        this.notifyTransferUpdate(transferId, 'transferring', transfer.offset);

        if (!transfer.paused) {
            this.fillWindow(transferId);
        }
    }

    async assembleFile(transferId) {
        const receive = this.receivedFiles.get(transferId);
        if (!receive) return;

        this.log(`正在组装文件: ${receive.fileInfo.name}`, 'info');
        this.notifyTransferUpdate(transferId, 'transferring', receive.fileInfo.size);

        try {
            const chunks = [];
            for (let i = 0; i < receive.totalChunks; i++) {
                const chunk = receive.chunks.get(i);
                if (!chunk) {
                    throw new Error(`缺少分片 ${i}`);
                }
                chunks.push(chunk.data);
            }

            const blob = new Blob(chunks, { type: receive.fileInfo.type });
            const url = URL.createObjectURL(blob);
            
            this.downloadFile(url, receive.fileInfo.name);
            URL.revokeObjectURL(url);
            
            this.signaling.sendToPeer(receive.peerId, JSON.stringify({
                type: 'file-complete',
                transferId
            }));
            
            this.notifyTransferUpdate(transferId, 'completed', receive.fileInfo.size);
            this.log(`文件接收完成: ${receive.fileInfo.name}`, 'success');
            
            if (this.onTransferComplete) {
                this.onTransferComplete(transferId, receive.fileInfo, 'receive');
            }
            
            this.receivedFiles.delete(transferId);

        } catch (error) {
            this.log(`组装文件失败: ${error.message}`, 'error');
            this.notifyTransferUpdate(transferId, 'error', receive.receivedSize);
        }
    }

    handleFileComplete(peerId, data) {
        const { transferId } = data;
        const transfer = this.activeTransfers.get(transferId);
        
        if (transfer) {
            this.clearRetryTimers(transferId);
            this.activeTransfers.delete(transferId);
            this.pendingChunks.delete(transferId);
            this.notifyTransferUpdate(transferId, 'completed', transfer.fileInfo.size);
            this.log(`文件发送完成: ${transfer.fileInfo.name}`, 'success');
            
            if (this.onTransferComplete) {
                this.onTransferComplete(transferId, transfer.fileInfo, 'send');
            }
        }
    }

    handleFileCancel(peerId, data) {
        const { transferId } = data;
        const receive = this.receivedFiles.get(transferId);
        
        if (receive) {
            this.notifyTransferUpdate(transferId, 'cancelled', receive.receivedSize);
            this.log(`传输被取消: ${receive.fileInfo.name}`, 'warning');
            this.receivedFiles.delete(transferId);
        }

        const sendTransfer = this.activeTransfers.get(transferId);
        if (sendTransfer) {
            this.clearRetryTimers(transferId);
            this.activeTransfers.delete(transferId);
            this.pendingChunks.delete(transferId);
            this.notifyTransferUpdate(transferId, 'cancelled', sendTransfer.offset);
        }
    }

    downloadFile(url, filename) {
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (error) {
            this.log(`下载文件失败: ${error.message}`, 'error');
        }
    }

    notifyTransferUpdate(transferId, status, bytesProcessed) {
        if (this.onTransferUpdate) {
            this.onTransferUpdate({
                transferId,
                status,
                bytesProcessed
            });
        }
    }

    generateTransferId() {
        return 'transfer_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getTransferInfo(transferId) {
        const sendTransfer = this.activeTransfers.get(transferId);
        if (sendTransfer) {
            return {
                ...sendTransfer.fileInfo,
                direction: 'send',
                status: sendTransfer.status,
                bytesProcessed: sendTransfer.offset,
                paused: sendTransfer.paused,
                totalChunks: sendTransfer.totalChunks,
                currentChunk: sendTransfer.currentChunk
            };
        }

        const receiveTransfer = this.receivedFiles.get(transferId);
        if (receiveTransfer) {
            return {
                ...receiveTransfer.fileInfo,
                direction: 'receive',
                status: receiveTransfer.status,
                bytesProcessed: receiveTransfer.receivedSize,
                totalChunks: receiveTransfer.totalChunks,
                receivedChunks: receiveTransfer.receivedChunks
            };
        }

        return null;
    }

    destroy() {
        this.activeTransfers.forEach((_, transferId) => {
            this.clearRetryTimers(transferId);
        });
        this.retryTimers.forEach(timer => clearTimeout(timer));
        this.retryTimers.clear();
    }
}
