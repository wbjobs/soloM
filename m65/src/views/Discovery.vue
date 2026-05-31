<template>
  <div class="discovery-page">
    <div class="discovery-header">
      <h2 class="page-title">
        <span>🔍</span> 发现设备
      </h2>
      <button class="btn btn-primary refresh-btn" @click="refreshPeers">
        <span :class="{ spinning: isRefreshing }">↻</span>
        刷新发现
      </button>
    </div>

    <div class="discovery-stats">
      <div class="stat-card">
        <span class="stat-icon">📡</span>
        <div class="stat-info">
          <span class="stat-value">{{ store.peers.length }}</span>
          <span class="stat-label">在线设备</span>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">💻</span>
        <div class="stat-info">
          <span class="stat-value">{{ store.deviceInfo.name || '---' }}</span>
          <span class="stat-label">本机名称</span>
        </div>
      </div>
    </div>

    <div class="peers-grid" v-if="store.peers.length > 0">
      <div
        v-for="peer in store.peers"
        :key="peer.id"
        class="peer-card"
        @click="selectPeer(peer)"
        :class="{ selected: selectedPeer && selectedPeer.id === peer.id }"
      >
        <div class="peer-avatar">
          {{ peer.name.charAt(0).toUpperCase() }}
        </div>
        <div class="peer-info">
          <h3 class="peer-name">{{ peer.name }}</h3>
          <p class="peer-ip">{{ peer.ip }}:{{ peer.port }}</p>
          <span class="peer-status">
            <span class="status-dot"></span>
            在线
          </span>
        </div>
        <div class="peer-action">
          <span class="send-icon">📤</span>
        </div>
      </div>
    </div>

    <div class="empty-state" v-else>
      <div class="empty-icon">🔍</div>
      <h3>正在搜索局域网设备...</h3>
      <p>请确保其他设备也运行了本应用</p>
      <button class="btn btn-primary" @click="refreshPeers">
        手动刷新
      </button>
    </div>

    <div class="send-panel" v-if="selectedPeer">
      <div class="send-header">
        <h3>发送文件到 {{ selectedPeer.name }}</h3>
        <button class="close-btn" @click="selectedPeer = null">✕</button>
      </div>
      <div class="send-content">
        <div class="selected-peer-badge">
          <span class="badge-avatar">{{ selectedPeer.name.charAt(0).toUpperCase() }}</span>
          <div>
            <p class="badge-name">{{ selectedPeer.name }}</p>
            <p class="badge-ip">{{ selectedPeer.ip }}:{{ selectedPeer.port }}</p>
          </div>
        </div>

        <div class="file-drop-zone" @click="selectFiles">
          <div class="drop-icon">📁</div>
          <p>点击选择文件，或拖拽文件到此处</p>
          <small>支持任意类型和大小的文件</small>
        </div>

        <div class="selected-files" v-if="selectedFiles.length > 0">
          <h4>已选择 {{ selectedFiles.length }} 个文件</h4>
          <div class="file-list">
            <div
              v-for="(file, index) in selectedFiles"
              :key="index"
              class="file-item"
            >
              <span class="file-icon">📄</span>
              <span class="file-name">{{ file.name }}</span>
              <span class="file-size">{{ formatFileSize(file.size) }}</span>
              <button class="remove-file" @click="removeFile(index)">✕</button>
            </div>
          </div>
          <div class="send-actions">
            <button class="btn btn-secondary" @click="clearFiles">
              清空
            </button>
            <button class="btn btn-primary" @click="sendFiles" :disabled="sending">
              {{ sending ? '发送中...' : '发送文件' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { store } from '../store'
import { formatFileSize } from '../utils/format'

const selectedPeer = ref(null)
const selectedFiles = ref([])
const isRefreshing = ref(false)
const sending = ref(false)

const refreshPeers = async () => {
  if (isRefreshing.value) return
  isRefreshing.value = true
  if (window.electronAPI) {
    await window.electronAPI.refreshDiscovery()
  }
  setTimeout(() => {
    isRefreshing.value = false
  }, 1000)
}

const selectPeer = (peer) => {
  selectedPeer.value = peer
  selectedFiles.value = []
}

const selectFiles = async () => {
  if (window.electronAPI) {
    const files = await window.electronAPI.selectFiles()
    if (files && files.length > 0) {
      selectedFiles.value = [...selectedFiles.value, ...files]
    }
  }
}

const removeFile = (index) => {
  selectedFiles.value.splice(index, 1)
}

const clearFiles = () => {
  selectedFiles.value = []
}

const sendFiles = async () => {
  if (!selectedPeer.value || selectedFiles.value.length === 0 || sending.value) return

  sending.value = true
  for (const file of selectedFiles.value) {
    const transferId = Date.now().toString() + Math.random().toString(36).substr(2, 9)

    store.addTransfer({
      transferId,
      fileName: file.name,
      fileSize: file.size,
      filePath: file.path,
      direction: 'send',
      peerName: selectedPeer.value.name,
      peerIp: selectedPeer.value.ip,
      peerPort: selectedPeer.value.port,
      progress: 0,
      transferred: 0,
      speed: 0,
      status: 'waiting'
    })

    if (window.electronAPI) {
      await window.electronAPI.sendFile(
        selectedPeer.value.ip,
        selectedPeer.value.port,
        file.path
      )
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  sending.value = false
  selectedFiles.value = []
  selectedPeer.value = null
}
</script>

<style scoped>
.discovery-page {
  max-width: 1200px;
  margin: 0 auto;
}

.discovery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: white;
  display: flex;
  align-items: center;
  gap: 10px;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 8px;
}

.spinning {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.discovery-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  font-size: 36px;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #333;
}

.stat-label {
  font-size: 13px;
  color: #999;
}

.peers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.peer-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border: 2px solid transparent;
}

.peer-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
}

.peer-card.selected {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
}

.peer-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
}

.peer-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.peer-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.peer-ip {
  font-size: 13px;
  color: #999;
}

.peer-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4caf50;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4caf50;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.peer-action {
  font-size: 24px;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.peer-card:hover .peer-action {
  opacity: 1;
}

.empty-state {
  background: white;
  border-radius: 16px;
  padding: 60px 40px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 20px;
  color: #333;
  margin-bottom: 10px;
}

.empty-state p {
  color: #999;
  margin-bottom: 25px;
}

.send-panel {
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.send-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.send-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.close-btn:hover {
  opacity: 1;
}

.send-content {
  padding: 25px;
}

.selected-peer-badge {
  display: flex;
  align-items: center;
  gap: 15px;
  background: #f5f5f5;
  padding: 15px;
  border-radius: 10px;
  margin-bottom: 20px;
}

.badge-avatar {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
}

.badge-name {
  font-weight: 600;
  color: #333;
  font-size: 15px;
}

.badge-ip {
  color: #999;
  font-size: 13px;
}

.file-drop-zone {
  border: 2px dashed #ddd;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 20px;
}

.file-drop-zone:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}

.drop-icon {
  font-size: 48px;
  margin-bottom: 15px;
}

.file-drop-zone p {
  color: #333;
  font-weight: 500;
  margin-bottom: 5px;
}

.file-drop-zone small {
  color: #999;
}

.selected-files h4 {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 15px;
}

.file-list {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 20px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
  margin-bottom: 8px;
}

.file-icon {
  font-size: 20px;
}

.file-name {
  flex: 1;
  font-size: 14px;
  color: #333;
  word-break: break-all;
}

.file-size {
  font-size: 13px;
  color: #999;
  margin-right: 10px;
}

.remove-file {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.remove-file:hover {
  background: #f44336;
  color: white;
}

.send-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.send-actions .btn {
  min-width: 120px;
}

.send-actions .btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
