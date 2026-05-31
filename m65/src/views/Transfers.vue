<template>
  <div class="transfers-page">
    <div class="transfers-header">
      <h2 class="page-title">
        <span>📦</span> 传输记录
      </h2>
      <div class="transfer-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'all' }"
          @click="activeTab = 'all'"
        >
          全部 ({{ store.transfers.length }})
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'transferring' }"
          @click="activeTab = 'transferring'"
        >
          传输中 ({{ transferringCount }})
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'completed' }"
          @click="activeTab = 'completed'"
        >
          已完成 ({{ completedCount }})
        </button>
      </div>
    </div>

    <div class="transfers-list" v-if="filteredTransfers.length > 0">
      <div
        v-for="transfer in filteredTransfers"
        :key="transfer.transferId"
        class="transfer-card"
        :class="transfer.status"
      >
        <div class="transfer-icon">
          <span v-if="transfer.direction === 'send'">📤</span>
          <span v-else>📥</span>
        </div>

        <div class="transfer-info">
          <div class="transfer-header">
            <h4 class="transfer-name">{{ transfer.fileName }}</h4>
            <span class="transfer-status-badge" :class="transfer.status">
              {{ getStatusText(transfer.status) }}
            </span>
          </div>

          <div class="transfer-meta">
            <span class="transfer-direction">
              {{ transfer.direction === 'send' ? '发送到' : '来自' }}
              {{ transfer.peerName }} ({{ transfer.peerIp }})
            </span>
            <span class="transfer-size">{{ formatFileSize(transfer.fileSize) }}</span>
          </div>

          <div class="transfer-progress" v-if="transfer.status === 'transferring' || transfer.status === 'waiting'">
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: transfer.progress + '%' }"
              ></div>
            </div>
            <div class="progress-info">
              <span class="progress-percent">{{ transfer.progress }}%</span>
              <span class="progress-speed" v-if="transfer.status === 'transferring'">
                {{ formatTransferSpeed(transfer.speed) }}
              </span>
              <span class="progress-amount">
                {{ formatFileSize(transfer.transferred) }} / {{ formatFileSize(transfer.fileSize) }}
              </span>
            </div>
          </div>

          <div class="transfer-result" v-if="transfer.status === 'completed'">
            <div class="result-info">
              <span class="result-duration">
                ⏱️ 耗时: {{ formatDuration(transfer.duration) }}
              </span>
              <span class="result-speed" v-if="transfer.duration > 0">
                🚀 平均速度: {{ formatTransferSpeed(transfer.fileSize / transfer.duration) }}
              </span>
            </div>
            <button
              class="open-folder-btn"
              v-if="transfer.direction === 'receive' && transfer.savePath"
              @click="openFolder(transfer.savePath)"
            >
              📂 打开文件夹
            </button>
          </div>

          <div class="transfer-error" v-if="transfer.status === 'error'">
            <div class="error-info">
              <span class="error-icon">⚠️</span>
              <span class="error-message">{{ transfer.error || '传输失败' }}</span>
            </div>
            <button
              v-if="transfer.resumable && transfer.direction === 'send'"
              class="resume-btn"
              @click="resumeTransfer(transfer)"
              :disabled="resumingMap[transfer.transferId]"
            >
              {{ resumingMap[transfer.transferId] ? '连接中...' : '🔄 续传' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="empty-state" v-else>
      <div class="empty-icon">📦</div>
      <h3>暂无传输记录</h3>
      <p>选择一个设备开始传输文件吧</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { store } from '../store'
import { formatFileSize, formatTransferSpeed, formatDuration } from '../utils/format'

const activeTab = ref('all')
const resumingMap = reactive({})

const transferringCount = computed(() =>
  store.transfers.filter(t => t.status === 'transferring' || t.status === 'waiting').length
)

const completedCount = computed(() =>
  store.transfers.filter(t => t.status === 'completed').length
)

const filteredTransfers = computed(() => {
  if (activeTab.value === 'all') return store.transfers
  if (activeTab.value === 'transferring') {
    return store.transfers.filter(t => t.status === 'transferring' || t.status === 'waiting')
  }
  if (activeTab.value === 'completed') {
    return store.transfers.filter(t => t.status === 'completed')
  }
  return store.transfers
})

const getStatusText = (status) => {
  const statusMap = {
    waiting: '等待接受',
    transferring: '传输中',
    completed: '已完成',
    error: '失败'
  }
  return statusMap[status] || status
}

const openFolder = async (savePath) => {
  if (window.electronAPI && savePath) {
    const dirPath = await window.electronAPI.getDirname(savePath)
    window.electronAPI.openFolder(dirPath)
  }
}

const resumeTransfer = async (transfer) => {
  if (resumingMap[transfer.transferId]) return
  resumingMap[transfer.transferId] = true

  try {
    const peer = store.peers.find(p => p.name === transfer.peerName)
    const targetIp = peer ? peer.ip : transfer.peerIp
    const targetPort = peer ? peer.port : 0

    if (!targetIp || !targetPort) {
      alert('无法找到目标设备，请确保对方在线')
      resumingMap[transfer.transferId] = false
      return
    }

    await window.electronAPI.resumeFile(
      transfer.transferId,
      targetIp,
      targetPort,
      transfer.filePath || '',
      transfer.fileName,
      transfer.fileSize
    )

    store.markTransferResuming(transfer.transferId)
  } catch (err) {
    console.error('续传失败:', err)
  } finally {
    resumingMap[transfer.transferId] = false
  }
}
</script>

<style scoped>
.transfers-page {
  max-width: 900px;
  margin: 0 auto;
}

.transfers-header {
  margin-bottom: 25px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: white;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.transfer-tabs {
  display: flex;
  gap: 10px;
  background: rgba(255, 255, 255, 0.2);
  padding: 6px;
  border-radius: 10px;
  backdrop-filter: blur(10px);
}

.tab-btn {
  padding: 10px 20px;
  background: none;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.tab-btn.active {
  background: white;
  color: #667eea;
}

.transfers-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.transfer-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  gap: 15px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}

.transfer-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
}

.transfer-card.completed {
  border-left: 4px solid #4caf50;
}

.transfer-card.error {
  border-left: 4px solid #f44336;
}

.transfer-card.transferring {
  border-left: 4px solid #667eea;
}

.transfer-icon {
  font-size: 36px;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 12px;
  flex-shrink: 0;
}

.transfer-info {
  flex: 1;
  min-width: 0;
}

.transfer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.transfer-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  word-break: break-all;
  padding-right: 15px;
}

.transfer-status-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.transfer-status-badge.waiting {
  background: #fff3cd;
  color: #856404;
}

.transfer-status-badge.transferring {
  background: #cce5ff;
  color: #004085;
}

.transfer-status-badge.completed {
  background: #d4edda;
  color: #155724;
}

.transfer-status-badge.error {
  background: #f8d7da;
  color: #721c24;
}

.transfer-meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #999;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 10px;
}

.transfer-direction {
  flex: 1;
}

.transfer-size {
  font-weight: 500;
  color: #666;
}

.transfer-progress {
  margin-bottom: 10px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 13px;
  color: #666;
  flex-wrap: wrap;
  gap: 10px;
}

.progress-percent {
  font-weight: 600;
  color: #667eea;
}

.progress-speed {
  font-weight: 500;
}

.transfer-result {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #eee;
  flex-wrap: wrap;
  gap: 10px;
}

.result-info {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #666;
  flex-wrap: wrap;
}

.open-folder-btn {
  background: none;
  border: 1px solid #667eea;
  color: #667eea;
  padding: 6px 15px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.open-folder-btn:hover {
  background: #667eea;
  color: white;
}

.transfer-error {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #fef0f0;
  border-radius: 8px;
  font-size: 13px;
  color: #f44336;
}

.error-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.error-message {
  word-break: break-all;
}

.error-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.resume-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.resume-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
}

.resume-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
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
}
</style>
