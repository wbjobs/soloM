<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { dockerApi } from './api/docker'
import type { Container, ContainerStats, LogEntry } from './types'
import TopologyChart from './components/TopologyChart.vue'
import MemoryChart from './components/MemoryChart.vue'
import LayerTree from './components/LayerTree.vue'
import ContextMenu from './components/ContextMenu.vue'

const containers = ref<Container[]>([])
const containerStats = ref<ContainerStats[]>([])
const selectedContainer = ref<Container | null>(null)
const selectedLogs = ref<LogEntry[]>([])
const activeTab = ref<'overview' | 'topology' | 'memory'>('overview')
const isLoading = ref(false)
const refreshInterval = ref<number | null>(null)
const transportInfo = ref<string>('')
const showLayerTree = ref(false)

const contextMenu = ref<{
  visible: boolean
  container: Container | null
  x: number
  y: number
}>({
  visible: false,
  container: null,
  x: 0,
  y: 0,
})

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const loadContainers = async () => {
  try {
    containers.value = await dockerApi.listContainers()
  } catch (error) {
    console.error('Failed to load containers:', error)
  }
}

const loadStats = async () => {
  try {
    containerStats.value = await dockerApi.getAllContainerStats()
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

const selectContainer = async (container: Container) => {
  selectedContainer.value = container
  if (container.State === 'running') {
    try {
      selectedLogs.value = await dockerApi.getContainerLogs(container.Id, 50)
    } catch (error) {
      console.error('Failed to load logs:', error)
    }
  }
  showLayerTree.value = false
}

const handleContextMenu = (event: MouseEvent, container: Container) => {
  event.preventDefault()
  const maxX = window.innerWidth - 300
  const maxY = window.innerHeight - 300
  contextMenu.value = {
    visible: true,
    container,
    x: Math.min(event.clientX, maxX),
    y: Math.min(event.clientY, maxY),
  }
}

const closeContextMenu = () => {
  contextMenu.value.visible = false
}

const onCommandExecuted = async () => {
  setTimeout(async () => {
    await loadContainers()
    await loadStats()
  }, 300)
}

const refresh = async () => {
  isLoading.value = true
  await Promise.all([loadContainers(), loadStats()])
  isLoading.value = false
}

const getStatsForContainer = (containerId: string): ContainerStats | undefined => {
  return containerStats.value.find(s => s.container_id === containerId)
}

onMounted(async () => {
  await refresh()
  try {
    transportInfo.value = await dockerApi.getTransportInfo()
  } catch (_) {}
  refreshInterval.value = window.setInterval(loadStats, 3000)
})

onUnmounted(() => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
})
</script>

<template>
  <div class="container">
    <div class="header">
      <h1>🐳 Docker 容器资源分析器</h1>
      <div class="header-actions">
        <span v-if="transportInfo" style="font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 6px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; display: inline-block;"
                :style="{ background: transportInfo === 'named_pipe' ? '#10b981' : '#3b82f6' }"></span>
          {{ transportInfo === 'named_pipe' ? '命名管道' : 'TCP' }}
        </span>
        <button class="btn btn-secondary" @click="refresh" :disabled="isLoading">
          {{ isLoading ? '刷新中...' : '刷新' }}
        </button>
      </div>
    </div>

    <div class="tabs">
      <button 
        class="tab" 
        :class="{ active: activeTab === 'overview' }"
        @click="activeTab = 'overview'"
      >
        总览
      </button>
      <button 
        class="tab" 
        :class="{ active: activeTab === 'topology' }"
        @click="activeTab = 'topology'"
      >
        容器拓扑图
      </button>
      <button 
        class="tab" 
        :class="{ active: activeTab === 'memory' }"
        @click="activeTab = 'memory'"
      >
        内存趋势图
      </button>
    </div>

    <div v-if="activeTab === 'overview'" class="grid grid-2">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">容器列表 ({{ containers.length }})</h2>
        </div>
        <div class="container-list">
          <div
            v-for="container in containers"
            :key="container.Id"
            class="container-item"
            :class="{ selected: selectedContainer?.Id === container.Id }"
            @click="selectContainer(container)"
            @contextmenu="handleContextMenu($event, container)"
          >
            <div class="container-name">
              {{ container.Names[0]?.replace('/', '') || container.Id.slice(0, 12) }}
            </div>
            <div class="container-info">
              <span>{{ container.Image }}</span>
              <span class="status-badge" :class="container.State === 'running' ? 'status-running' : 'status-exited'">
                {{ container.State }}
              </span>
            </div>
            <div v-if="getStatsForContainer(container.Id)" class="stats-grid">
              <div class="stat-item">
                <div class="stat-label">CPU</div>
                <div class="stat-value">{{ getStatsForContainer(container.Id)?.cpu_percent.toFixed(1) }}%</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">内存</div>
                <div class="stat-value">{{ getStatsForContainer(container.Id)?.memory_percent.toFixed(1) }}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            {{ selectedContainer ? selectedContainer.Names[0]?.replace('/', '') : '选择一个容器' }}
          </h2>
          <button
            v-if="selectedContainer && !showLayerTree"
            class="btn btn-secondary"
            style="font-size: 12px; padding: 4px 12px;"
            @click="showLayerTree = true"
          >
            查看镜像层
          </button>
          <button
            v-if="showLayerTree"
            class="btn btn-secondary"
            style="font-size: 12px; padding: 4px 12px;"
            @click="showLayerTree = false"
          >
            返回详情
          </button>
        </div>
        <div v-if="selectedContainer">
          <div v-if="showLayerTree">
            <LayerTree :image-name="selectedContainer.Image" />
          </div>
          <div v-else>
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-label">CPU 使用率</div>
                <div class="stat-value">{{ getStatsForContainer(selectedContainer.Id)?.cpu_percent.toFixed(2) || 0 }}%</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">内存使用</div>
                <div class="stat-value">{{ formatBytes(getStatsForContainer(selectedContainer.Id)?.memory_usage || 0) }}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">内存限制</div>
                <div class="stat-value">{{ formatBytes(getStatsForContainer(selectedContainer.Id)?.memory_limit || 0) }}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">网络 RX</div>
                <div class="stat-value">{{ formatBytes(getStatsForContainer(selectedContainer.Id)?.network_rx || 0) }}</div>
              </div>
            </div>

            <div v-if="selectedContainer.State === 'running'" style="margin-top: 20px;">
              <h3 style="margin-bottom: 12px; font-size: 14px;">日志</h3>
              <div class="log-container">
                <div
                  v-for="(log, index) in selectedLogs"
                  :key="index"
                  class="log-entry"
                  :class="log.stream_type === 'stdout' ? 'log-stdout' : 'log-stderr'"
                >
                  <span class="log-timestamp">{{ log.timestamp.slice(0, 19) }}</span>
                  {{ log.message }}
                </div>
                <div v-if="selectedLogs.length === 0" style="color: #64748b;">
                  暂无日志
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else style="color: #64748b; text-align: center; padding: 40px;">
          点击左侧容器查看详情，右键可执行 Docker 命令
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'topology'" class="card">
      <div class="card-header">
        <h2 class="card-title">容器资源依赖拓扑图</h2>
      </div>
      <TopologyChart />
    </div>

    <div v-if="activeTab === 'memory'" class="card">
      <div class="card-header">
        <h2 class="card-title">内存泄漏趋势图</h2>
        <button class="btn btn-secondary" @click="dockerApi.clearMemoryHistory()">
          清除历史
        </button>
      </div>
      <MemoryChart />
    </div>

    <ContextMenu
      v-if="contextMenu.visible && contextMenu.container"
      :container="contextMenu.container!"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @close="closeContextMenu"
      @command-executed="onCommandExecuted"
    />
  </div>
</template>
