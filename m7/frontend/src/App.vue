<template>
  <div class="app-layout">
    <Sidebar :active-route="currentRoute" @navigate="navigate" :connected="wsConnected" />
    <div class="app-main">
      <header class="app-header">
        <div class="header-left">
          <h1 class="header-title">CloudMon</h1>
          <span class="header-subtitle">云原生网络监控</span>
        </div>
        <div class="header-right">
          <span class="connection-badge" :class="wsConnected ? 'connected' : 'disconnected'">
            {{ wsConnected ? '已连接' : '断开连接' }}
          </span>
          <span class="header-time">{{ currentTime }}</span>
        </div>
      </header>
      <main class="app-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import { useWebSocket } from './composables/useWebSocket'

const router = useRouter()
const route = useRoute()

const currentRoute = computed(() => route.name as string)
const currentTime = ref('')

const { connected: wsConnected, connect, disconnect } = useWebSocket()

let timeTimer: ReturnType<typeof setInterval>

function navigate(name: string) {
  router.push({ name })
}

function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

onMounted(() => {
  connect()
  updateTime()
  timeTimer = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  disconnect()
  clearInterval(timeTimer)
})
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 52px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.header-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-red);
  margin: 0;
}

.header-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.connection-badge {
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.connection-badge.connected {
  background: rgba(83, 215, 105, 0.15);
  color: var(--accent-green);
}

.connection-badge.disconnected {
  background: rgba(233, 69, 96, 0.15);
  color: var(--accent-red);
}

.header-time {
  font-size: 13px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.app-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
}
</style>
