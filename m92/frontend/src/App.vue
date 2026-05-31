<template>
  <div class="app-container">
    <AlertPopup />

    <header class="app-header">
      <div class="header-left">
        <div class="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="#3b82f6" stroke-width="2" />
            <circle cx="16" cy="16" r="6" fill="#3b82f6" />
            <path d="M16 2V8M16 24V30M2 16H8M24 16H30" stroke="#3b82f6" stroke-width="2" />
          </svg>
        </div>
        <div class="title-group">
          <h1 class="app-title">eBPF 系统调用监控仪表盘</h1>
          <p class="app-subtitle">实时追踪 openat / execve 系统调用</p>
        </div>
      </div>
      <div class="header-right">
        <div class="status-badge" :class="{ connected: isConnected }">
          <span class="status-dot"></span>
          <span class="status-text">{{ isPlayback ? '回放模式' : (isConnected ? '已连接' : '未连接') }}</span>
        </div>
        <div class="last-update" v-if="lastUpdate">
          <span class="update-label">最后更新:</span>
          <span class="update-time">{{ formatTime(lastUpdate) }}</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <PlaybackControl
        @playback-start="onPlaybackStart"
        @playback-stop="onPlaybackStop"
        @playback-data="onPlaybackData"
      />

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(59, 130, 246, 0.2);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-card-label">总调用次数</span>
            <span class="stat-card-value">{{ totalCalls.toLocaleString() }}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(16, 185, 129, 0.2);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-card-label">活跃进程</span>
            <span class="stat-card-value">{{ activeProcesses }}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background: rgba(245, 158, 11, 0.2);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-card-label">调用速率</span>
            <span class="stat-card-value">{{ callRate }}/s</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" :style="{ background: alertBgColor }">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-card-label">触发告警</span>
            <span class="stat-card-value" :style="{ color: alertColor }">{{ alertCount }}</span>
          </div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-wrapper">
          <FlameGraph :data="displayFlameData" :metrics="metrics" />
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-wrapper">
          <HeatMap :data="displayHeatmapData" />
        </div>
      </div>
    </main>

    <footer class="app-footer">
      <p>基于 eBPF 的系统调用可视化监控 · {{ isPlayback ? '历史数据回放' : '数据每秒更新' }}</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWebSocket } from './utils/websocket.js'
import FlameGraph from './components/FlameGraph.vue'
import HeatMap from './components/HeatMap.vue'
import AlertPopup from './components/AlertPopup.vue'
import PlaybackControl from './components/PlaybackControl.vue'

const { isConnected, flameData, heatmapData, metrics, lastUpdate, connect, disconnect, on } = useWebSocket()

const isPlayback = ref(false)
const playbackFlameData = ref(null)
const playbackHeatmapData = ref([])
const alertCount = ref(0)

const callRate = ref(0)
let lastCallCount = 0
let rateInterval = null

const displayFlameData = computed(() => {
  return isPlayback.value ? playbackFlameData.value : flameData.value
})

const displayHeatmapData = computed(() => {
  return isPlayback.value ? playbackHeatmapData.value : heatmapData.value
})

const totalCalls = computed(() => {
  return displayFlameData.value?.value || 0
})

const activeProcesses = computed(() => {
  return displayFlameData.value?.children?.length || 0
})

const alertColor = computed(() => {
  if (alertCount.value === 0) return '#10b981'
  if (alertCount.value < 5) return '#f59e0b'
  if (alertCount.value < 20) return '#ef4444'
  return '#dc2626'
})

const alertBgColor = computed(() => {
  if (alertCount.value === 0) return 'rgba(16, 185, 129, 0.2)'
  if (alertCount.value < 5) return 'rgba(245, 158, 11, 0.2)'
  if (alertCount.value < 20) return 'rgba(239, 68, 68, 0.2)'
  return 'rgba(220, 38, 38, 0.2)'
})

function formatTime(date) {
  if (!date) return ''
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function updateCallRate() {
  const current = totalCalls.value
  callRate.value = Math.max(0, current - lastCallCount)
  lastCallCount = current
}

function onPlaybackStart() {
  isPlayback.value = true
  playbackFlameData.value = null
  playbackHeatmapData.value = []
}

function onPlaybackStop() {
  isPlayback.value = false
  playbackFlameData.value = null
  playbackHeatmapData.value = []
}

function onPlaybackData(data) {
  playbackFlameData.value = data.flame
  playbackHeatmapData.value = data.heatmap
}

function handleAlert(alert) {
  alertCount.value++
}

onMounted(() => {
  connect()
  on('alert', handleAlert)
  rateInterval = setInterval(updateCallRate, 1000)
})

onUnmounted(() => {
  disconnect()
  if (rateInterval) {
    clearInterval(rateInterval)
  }
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 20px;
  gap: 16px;
  overflow: hidden;
  position: relative;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%);
  border-radius: 12px;
  border: 1px solid #334155;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
}

.title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-title {
  font-size: 18px;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
  letter-spacing: 0.5px;
}

.app-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 20px;
  transition: all 0.3s ease;
}

.status-badge.connected {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
  animation: pulse 2s infinite;
}

.status-badge.connected .status-dot {
  background: #10b981;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-text {
  font-size: 12px;
  font-weight: 500;
  color: #ef4444;
}

.status-badge.connected .status-text {
  color: #10b981;
}

.last-update {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.update-label {
  font-size: 10px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.update-time {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  font-family: 'SF Mono', Monaco, monospace;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 10px;
  border: 1px solid #334155;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-1px);
  border-color: #475569;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.stat-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-card-label {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-card-value {
  font-size: 20px;
  font-weight: 700;
  color: #f1f5f9;
  font-family: 'SF Mono', Monaco, monospace;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  flex: 1;
  min-height: 380px;
}

.chart-wrapper {
  min-height: 380px;
}

.app-footer {
  text-align: center;
  padding: 8px;
  color: #64748b;
  font-size: 11px;
}

.app-footer p {
  margin: 0;
}

@media (max-width: 1200px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .app-header {
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }

  .header-right {
    width: 100%;
    justify-content: space-between;
  }

  .stats-row {
    grid-template-columns: 1fr;
  }
}
</style>
