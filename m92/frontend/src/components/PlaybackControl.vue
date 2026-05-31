<template>
  <div class="playback-container" :class="{ 'playback-active': isPlaying || isPaused }">
    <div class="playback-header">
      <div class="playback-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>历史回放</span>
      </div>
      <button class="close-btn" @click="closePlayback" v-if="isActive">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div v-if="!isActive" class="playback-inactive" @click="openPlayback">
      <button class="open-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <span>回放过去 5 分钟</span>
      </button>
    </div>

    <div v-else class="playback-controls">
      <div class="controls-row">
        <button class="control-btn" :disabled="loading" @click="togglePlay">
          <svg v-if="isPlaying" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>

        <div class="speed-select">
          <label>速度</label>
          <select v-model="playbackSpeed" :disabled="loading">
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>
        </div>

        <div class="time-display">
          <span class="current-time">{{ formatTime(currentPlaybackTime) }}</span>
          <span class="time-separator">/</span>
          <span class="total-time">{{ formatTime(totalDuration) }}</span>
        </div>
      </div>

      <div class="timeline-container">
        <input
          type="range"
          class="timeline"
          :min="0"
          :max="totalDuration"
          :value="currentPlaybackTime"
          @input="seekTo"
          :disabled="loading"
        />
        <div class="timeline-marks">
          <span>{{ formatTime(0) }}</span>
          <span>-5 30s</span>
          <span>-1m</span>
          <span>-1m 30s</span>
          <span>-2m</span>
          <span>-2m 30s</span>
          <span>-3m</span>
          <span>-3m 30s</span>
          <span>-4m</span>
          <span>-4m 30s</span>
          <span>-5m</span>
        </div>
      </div>

      <div class="event-stats">
        <span class="stat">
          <span class="stat-label">事件数</span>
          <span class="stat-value">{{ loadedEvents.length }}</span>
        </span>
        <span class="stat">
          <span class="stat-label">当前位置</span>
          <span class="stat-value">{{ currentIndex }} / {{ loadedEvents.length }}</span>
        </span>
        <span class="stat" v-if="loading">
          <span class="loading-spinner"></span>
          <span class="stat-value">加载中...</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'

const emit = defineEmits(['playback-data', 'playback-start', 'playback-stop'])

const isActive = ref(false)
const isPlaying = ref(false)
const isPaused = ref(false)
const loading = ref(false)
const playbackSpeed = ref(1)
const currentPlaybackTime = ref(0)
const currentIndex = ref(0)
const loadedEvents = ref([])
const playbackInterval = ref(null)
const startTime = ref(0)

const totalDuration = 300

function formatTime(seconds) {
  const remaining = 300 - seconds
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  if (mins === 0) {
    return `-${secs}s`
  }
  return `-${mins}m ${secs}s`
}

async function loadHistoryData() {
  loading.value = true
  
  try {
    const end = Math.floor(Date.now() / 1000)
    const start = end - 300
    startTime.value = start * 1e9
    
    const response = await fetch(`/api/history?start=${start}&end=${end}`)
    const data = await response.json()
    
    loadedEvents.value = data.events || []
    
    currentPlaybackTime.value = 0
    currentIndex.value = 0
  } catch (e) {
    console.error('Failed to load history:', e)
  } finally {
    loading.value = false
  }
}

function openPlayback() {
  isActive.value = true
  emit('playback-start')
  loadHistoryData()
}

function closePlayback() {
  stopPlayback()
  isActive.value = false
  isPaused.value = false
  emit('playback-stop')
}

function togglePlay() {
  if (loading.value) return
  
  isPlaying.value = !isPlaying.value
  
  if (isPlaying.value) {
    startPlayback()
  } else {
    pausePlayback()
  }
}

function startPlayback() {
  isPaused.value = false
  
  if (currentIndex.value >= loadedEvents.value.length - 1) {
    currentIndex.value = 0
    currentPlaybackTime.value = 0
  }

  playbackInterval.value = setInterval(() => {
    advancePlayback()
  }, 100)
}

function pausePlayback() {
  isPaused.value = true
  if (playbackInterval.value) {
    clearInterval(playbackInterval.value)
    playbackInterval.value = null
  }
}

function stopPlayback() {
  isPlaying.value = false
  isPaused.value = false
  if (playbackInterval.value) {
    clearInterval(playbackInterval.value)
    playbackInterval.value = null
  }
}

function advancePlayback() {
  const step = playbackSpeed.value * 10
  
  currentPlaybackTime.value += step
  
  while (
    currentIndex.value < loadedEvents.value.length &&
    loadedEvents.value[currentIndex.value].timestamp <= startTime.value + currentPlaybackTime.value * 1e9
  ) {
    currentIndex.value++
  }
  
  const eventsUpToNow = loadedEvents.value.slice(0, currentIndex.value)
  const flameData = buildFlameData(eventsUpToNow)
  const heatData = buildHeatData(eventsUpToNow)
  
  emit('playback-data', { flame: flameData, heatmap: heatData })
  
  if (currentPlaybackTime.value >= totalDuration || currentIndex.value >= loadedEvents.value.length) {
    stopPlayback()
  }
}

function seekTo(event) {
  currentPlaybackTime.value = parseInt(event.target.value)
  
  const targetTs = startTime.value + currentPlaybackTime.value * 1e9
  
  while (
    currentIndex.value < loadedEvents.value.length &&
    loadedEvents.value[currentIndex.value].timestamp <= targetTs
  ) {
    currentIndex.value++
  }
  
  const eventsUpToNow = loadedEvents.value.slice(0, currentIndex.value)
  const flameData = buildFlameData(eventsUpToNow)
  const heatData = buildHeatData(eventsUpToNow)
  
  emit('playback-data', { flame: flameData, heatmap: heatData })
}

function buildFlameData(events) {
  const stats = {}
  events.forEach(event => {
    const key = `${event.comm}-${event.pid}`
    if (!stats[key]) {
      stats[key] = {
        process: event.comm,
        pid: event.pid,
        syscalls: {},
        total: 0
      }
    }
    stats[key].syscalls[event.syscallName] = (stats[key].syscalls[event.syscallName] || 0)
    stats[key].syscalls[event.syscallName]++
    stats[key].total++
  })
  
  const root = {
    name: 'root',
    value: 0,
    children: []
  }
  
  const processMap = {}
  
  Object.values(stats).forEach(stat => {
    if (!processMap[stat.process]) {
      processMap[stat.process] = {
        name: stat.process,
        value: 0,
        children: []
      }
    }
    
    const pidNode = {
      name: String(stat.pid),
      value: stat.total,
      children: []
    }
    
    Object.entries(stat.syscalls).forEach(([syscall, count]) => {
      pidNode.children.push({
        name: syscall,
        value: count
      })
    })
    
    processMap[stat.process].children.push(pidNode)
    processMap[stat.process].value += stat.total
    root.value += stat.total
  })
  
  root.children = Object.values(processMap)
  
  return root
}

function buildHeatData(events) {
  const data = []
  const aggregated = {}
  
  events.forEach(event => {
    const key = `${event.comm}-${event.pid}-${event.syscallName}`
    if (!aggregated[key]) {
      aggregated[key] = {
        pid: event.pid,
        process: event.comm,
        syscall: event.syscallName,
        count: 0
      }
    }
    aggregated[key].count++
  })
  
  return Object.values(aggregated)
}

watch(playbackSpeed, () => {
  if (isPlaying.value) {
    pausePlayback()
    setTimeout(() => startPlayback(), 100)
  }
})

onUnmounted(() => {
  stopPlayback()
})
</script>

<style scoped>
.playback-container {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 12px 16px;
  transition: all 0.3s ease;
}

.playback-container.playback-active {
  background: rgba(30, 41, 59, 0.95);
  border-color: #3b82f6;
}

.playback-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.playback-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-weight: 600;
  font-size: 14px;
}

.close-btn {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.1);
}

.playback-inactive {
  text-align: center;
  padding: 8px 0;
}

.open-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #60a5fa;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.open-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
}

.playback-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #3b82f6;
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.control-btn:hover:not(:disabled) {
  background: #2563eb;
  transform: scale(1.05);
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.speed-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.speed-select select {
  background: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.time-display {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 13px;
  color: #94a3b8;
  margin-left: auto;
}

.current-time {
  color: #60a5fa;
  font-weight: 600;
}

.time-separator {
  color: #475569;
}

.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.timeline {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #334155;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.timeline::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  transition: transform 0.2s;
}

.timeline::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.timeline::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  border: none;
}

.timeline-marks {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #64748b;
  font-family: 'SF Mono', Monaco, monospace;
}

.event-stats {
  display: flex;
  gap: 24px;
  font-size: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-label {
  color: #64748b;
  font-size: 11px;
}

.stat-value {
  color: #e2e8f0;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, monospace;
}

.loading-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #334155;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
