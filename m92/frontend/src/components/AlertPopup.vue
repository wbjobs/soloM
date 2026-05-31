<template>
  <div class="alert-container">
    <TransitionGroup name="alert-list">
      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="alert-card"
        :class="alert.level"
      >
        <div class="alert-icon">
          <svg v-if="alert.level === 'critical'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <svg v-else-if="alert.level === 'error'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <svg v-else-if="alert.level === 'warning'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div class="alert-content">
          <div class="alert-header">
            <span class="alert-title">{{ alert.title }}</span>
            <span class="alert-time">{{ formatTime(alert.timestamp) }}</span>
          </div>
          <p class="alert-message">{{ alert.message }}</p>
          <div v-if="alert.event" class="alert-details">
            <span class="detail-tag">进程: {{ alert.event.comm }} ({{ alert.event.pid }})</span>
            <span class="detail-tag">文件: {{ truncatePath(alert.event.filename) }}</span>
          </div>
        </div>
        <button class="alert-close" @click="dismissAlert(alert.id)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  maxAlerts: {
    type: Number,
    default: 5
  },
  autoDismissSeconds: {
    type: Number,
    default: 10
  }
})

const emit = defineEmits(['alert'])

const alerts = ref([])
let sseSource = null
let alertIdCounter = 0

function formatTime(timestamp) {
  return new Date(timestamp * 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function truncatePath(path) {
  if (!path) return ''
  if (path.length > 40) {
    return '...' + path.slice(-37)
  }
  return path
}

function addAlert(alert) {
  alert.id = alert.id || `alert-${++alertIdCounter}`
  
  alerts.value.unshift(alert)
  
  if (alerts.value.length > props.maxAlerts) {
    alerts.value.pop()
  }

  emit('alert', alert)

  if (props.autoDismissSeconds > 0) {
    setTimeout(() => {
      dismissAlert(alert.id)
    }, props.autoDismissSeconds * 1000)
  }
}

function dismissAlert(id) {
  const index = alerts.value.findIndex(a => a.id === id)
  if (index > -1) {
    alerts.value.splice(index, 1)
  }
}

function connectSSE() {
  if (typeof EventSource === 'undefined') {
    console.warn('SSE not supported in this environment')
    return
  }

  try {
    sseSource = new EventSource('/sse/alerts')
    
    sseSource.addEventListener('alert', (event) => {
      try {
        const alert = JSON.parse(event.data)
        addAlert(alert)
      } catch (e) {
        console.error('Error parsing SSE alert:', e)
      }
    })

    sseSource.onerror = (err) => {
      console.warn('SSE connection error, will retry:', err)
    }

    sseSource.onopen = () => {
      console.log('SSE alerts connected')
    }
  } catch (e) {
    console.error('Failed to connect SSE:', e)
  }
}

function disconnectSSE() {
  if (sseSource) {
    sseSource.close()
    sseSource = null
  }
}

onMounted(() => {
  connectSSE()
})

onUnmounted(() => {
  disconnectSSE()
})

defineExpose({
  addAlert,
  dismissAlert
})
</script>

<style scoped>
.alert-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
  pointer-events: none;
}

.alert-card {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid #334155;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.3s ease-out;
  position: relative;
  overflow: hidden;
}

.alert-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}

.alert-card.critical {
  border-color: rgba(220, 38, 38, 0.5);
}

.alert-card.critical::before {
  background: linear-gradient(180deg, #dc2626, #991b1b);
}

.alert-card.critical .alert-icon {
  color: #dc2626;
}

.alert-card.error {
  border-color: rgba(239, 68, 68, 0.5);
}

.alert-card.error::before {
  background: linear-gradient(180deg, #ef4444, #dc2626);
}

.alert-card.error .alert-icon {
  color: #ef4444;
}

.alert-card.warning {
  border-color: rgba(245, 158, 11, 0.5);
}

.alert-card.warning::before {
  background: linear-gradient(180deg, #f59e0b, #d97706);
}

.alert-card.warning .alert-icon {
  color: #f59e0b;
}

.alert-card.info {
  border-color: rgba(59, 130, 246, 0.5);
}

.alert-card.info::before {
  background: linear-gradient(180deg, #3b82f6, #2563eb);
}

.alert-card.info .alert-icon {
  color: #3b82f6;
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

.alert-list-leave-active {
  transition: all 0.3s ease-out;
}

.alert-list-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.alert-list-move {
  transition: transform 0.3s ease;
}

.alert-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 6px;
}

.alert-title {
  font-weight: 600;
  font-size: 14px;
  color: #f1f5f9;
}

.alert-time {
  font-size: 11px;
  color: #64748b;
  flex-shrink: 0;
  font-family: 'SF Mono', Monaco, monospace;
}

.alert-message {
  font-size: 13px;
  color: #94a3b8;
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.alert-details {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-tag {
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(51, 65, 85, 0.8);
  border-radius: 4px;
  color: #cbd5e1;
  font-family: 'SF Mono', Monaco, monospace;
}

.alert-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.alert-close:hover {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.1);
}
</style>
