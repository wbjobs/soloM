class ClipboardSync {
    constructor(signalingClient) {
        this.signaling = signalingClient;
        this.enabled = false;
        this.lastClipboardContent = '';
        this.isSyncing = false;
        this.monitorInterval = null;
        this.onClipboardReceived = null;
        this.onLog = null;
        this.consecutiveErrors = 0;
        this.MAX_CONSECUTIVE_ERRORS = 10;
    }

    log(message, type = 'info') {
        if (this.onLog && typeof this.onLog instanceof Function) {
            this.onLog(message, type);
        }
    }

    enable() {
        if (this.enabled) return;
        
        this.enabled = true;
        this.consecutiveErrors = 0;
        this.startMonitoring();
        this.log('剪贴板同步已启用', 'success');
    }

    disable() {
        if (!this.enabled) return;
        
        this.enabled = false;
        this.stopMonitoring();
        this.log('剪贴板同步已禁用', 'warning');
    }

    startMonitoring() {
        this.monitorInterval = setInterval(async () => {
            if (this.enabled && !this.isSyncing) {
                await this.checkClipboard();
            }
        }, 1000);
    }

    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }

    async checkClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            this.consecutiveErrors = 0;
            if (text && text !== this.lastClipboardContent) {
                this.lastClipboardContent = text;
                this.broadcastClipboard(text);
                this.log('检测到剪贴板变化，正在同步...', 'info');
            }
        } catch (error) {
            if (error.name !== 'NotAllowedError') {
                this.consecutiveErrors++;
                this.log(`读取剪贴板失败 (${this.consecutiveErrors}/${this.MAX_CONSECUTIVE_ERRORS}): ${error.message}`, 'error');
                
                if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
                    this.log('连续错误过多，剪贴板同步已自动禁用', 'warning');
                    this.disable();
                }
            }
        }
    }

    broadcastClipboard(content) {
        const message = {
            type: 'clipboard',
            content,
            timestamp: Date.now()
        };
        const count = this.signaling.broadcast(JSON.stringify(message));
        if (count > 0) {
            this.log(`剪贴板内容已发送到 ${count} 个设备`, 'success');
        }
    }

    sendClipboardToPeer(peerId, content) {
        const message = {
            type: 'clipboard',
            content,
            timestamp: Date.now()
        };
        return this.signaling.sendToPeer(peerId, JSON.stringify(message));
    }

    async sendLocalClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                this.lastClipboardContent = text;
                this.broadcastClipboard(text);
            } else {
                this.log('本地剪贴板为空', 'warning');
            }
        } catch (error) {
            this.log(`读取剪贴板失败: ${error.message}`, 'error');
        }
    }

    handleMessage(peerId, data) {
        if (typeof data === 'string') {
            try {
                const message = JSON.parse(data);
                if (message.type === 'clipboard') {
                    this.handleClipboardMessage(peerId, message);
                }
            } catch (e) {
            }
        }
    }

    handleClipboardMessage(peerId, message) {
        const { content, timestamp } = message;
        
        if (content === this.lastClipboardContent) {
            return;
        }

        this.isSyncing = true;
        this.lastClipboardContent = content;

        if (this.onClipboardReceived) {
            this.onClipboardReceived(content, peerId, timestamp);
        }

        if (this.enabled) {
            this.writeToClipboard(content);
        }

        this.log(`收到来自 ${peerId} 的剪贴板内容`, 'info');

        setTimeout(() => {
            this.isSyncing = false;
        }, 500);
    }

    async writeToClipboard(content) {
        try {
            await navigator.clipboard.writeText(content);
            this.log('剪贴板内容已更新', 'success');
        } catch (error) {
            this.log(`写入剪贴板失败: ${error.message}`, 'error');
        }
    }

    async copyToLocal(content) {
        try {
            await navigator.clipboard.writeText(content);
            this.lastClipboardContent = content;
            this.log('已复制到本地剪贴板', 'success');
            return true;
        } catch (error) {
            this.log(`复制失败: ${error.message}`, 'error');
            return false;
        }
    }

    destroy() {
        this.disable();
        this.lastClipboardContent = '';
        this.isSyncing = false;
        this.consecutiveErrors = 0;
        this.onClipboardReceived = null;
        this.onLog = null;
    }
}
