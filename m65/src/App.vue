<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">
          <span class="logo-icon">📡</span>
          局域网 P2P 文件传输
        </h1>
        <div class="device-info" v-if="store.deviceInfo.name">
          <span class="device-name">{{ store.deviceInfo.name }}</span>
          <span class="device-ip">{{ store.deviceInfo.ip }}:{{ store.deviceInfo.port }}</span>
        </div>
      </div>
      <nav class="app-nav">
        <router-link
          to="/discovery"
          class="nav-link"
          :class="{ active: $route.path === '/discovery' }"
        >
          <span>🔍</span> 发现设备
        </router-link>
        <router-link
          to="/transfers"
          class="nav-link"
          :class="{ active: $route.path === '/transfers' }"
        >
          <span>📦</span> 传输记录
          <span class="badge" v-if="store.pendingTransfers.length > 0">
            {{ store.pendingTransfers.length }}
          </span>
        </router-link>
      </nav>
    </header>

    <main class="app-main">
      <router-view />
    </main>

    <div class="pending-modal" v-if="store.pendingTransfers.length > 0">
      <div
        v-for="request in store.pendingTransfers"
        :key="request.transferId"
        class="pending-card"
      >
        <div class="pending-info">
          <div class="pending-header">
            <span class="pending-icon">📥</span>
            <span class="pending-title">接收文件请求</span>
          </div>
          <div class="pending-details">
            <p><strong>来自：</strong>{{ request.senderName }} ({{ request.senderIp }})</p>
            <p><strong>文件：</strong>{{ request.fileName }}</p>
            <p><strong>大小：</strong>{{ formatFileSize(request.fileSize) }}</p>
          </div>
          <div class="pending-actions">
            <button class="btn btn-success" @click="acceptTransfer(request)">
              ✓ 接受
            </button>
            <button class="btn btn-danger" @click="rejectTransfer(request)">
              ✕ 拒绝
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { store } from './store'
import { formatFileSize } from './utils/format'

const initDeviceInfo = async () => {
  if (window.electronAPI) {
    const info = await window.electronAPI.getDeviceInfo()
    store.setDeviceInfo(info)

    const peers = await window.electronAPI.getPeers()
    store.setPeers(peers)
  }
}

const acceptTransfer = async (request) => {
  if (window.electronAPI) {
    const savePath = await window.electronAPI.selectFolder()
    if (savePath) {
      store.addTransfer({
        transferId: request.transferId,
        fileName: request.fileName,
        fileSize: request.fileSize,
        direction: 'receive',
        peerName: request.senderName,
        peerIp: request.senderIp,
        progress: 0,
        transferred: 0,
        speed: 0,
        status: 'transferring'
      })
      await window.electronAPI.acceptTransfer(request.transferId, savePath)
      store.removePendingTransfer(request.transferId)
    }
  }
}

const rejectTransfer = async (request) => {
  if (window.electronAPI) {
    await window.electronAPI.rejectTransfer(request.transferId)
    store.removePendingTransfer(request.transferId)
  }
}

const setupEventListeners = () => {
  if (!window.electronAPI) return

  window.electronAPI.onPeerDiscovered((peer) => {
    store.addPeer(peer)
  })

  window.electronAPI.onPeerLost((peerId) => {
    store.removePeer(peerId)
  })

  window.electronAPI.onTransferProgress((progress) => {
    store.updateTransferProgress(progress)
  })

  window.electronAPI.onTransferComplete((result) => {
    store.completeTransfer(result.transferId, result)
  })

  window.electronAPI.onTransferError((error) => {
    store.failTransfer(error.transferId, error.error, error.resumable || false)
  })

  window.electronAPI.onIncomingTransfer((request) => {
    store.addPendingTransfer(request)
  })
}

onMounted(() => {
  initDeviceInfo()
  setupEventListeners()
})

onUnmounted(() => {
  if (window.electronAPI) {
    window.electronAPI.removeAllListeners()
  }
})
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: white;
  padding: 15px 30px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.app-title {
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 24px;
}

.device-info {
  display: flex;
  gap: 15px;
  font-size: 13px;
  color: #666;
}

.device-name {
  font-weight: 500;
  color: #333;
}

.app-nav {
  display: flex;
  gap: 10px;
}

.nav-link {
  padding: 10px 18px;
  border-radius: 8px;
  text-decoration: none;
  color: #666;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  position: relative;
}

.nav-link:hover {
  background: #f0f0f0;
}

.nav-link.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.badge {
  background: #f44336;
  color: white;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 11px;
  min-width: 20px;
  text-align: center;
}

.app-main {
  flex: 1;
  padding: 30px;
}

.pending-modal {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1000;
}

.pending-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 20px;
  width: 320px;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.pending-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.pending-icon {
  font-size: 20px;
}

.pending-title {
  font-weight: 600;
  font-size: 15px;
  color: #333;
}

.pending-details {
  font-size: 13px;
  color: #666;
  line-height: 1.8;
  margin-bottom: 15px;
}

.pending-actions {
  display: flex;
  gap: 10px;
}

.pending-actions .btn {
  flex: 1;
}
</style>
