<template>
  <div class="dashboard">
    <div class="stats-row">
      <StatusCard
        title="总服务数"
        :value="stats.totalServices"
        :delta="stats.servicesDelta"
        unit="个"
        color="blue"
      />
      <StatusCard
        title="活跃连接数"
        :value="stats.activeConnections"
        :delta="stats.connectionsDelta"
        unit="个"
        color="green"
      />
      <StatusCard
        title="平均延迟"
        :value="stats.avgLatency"
        :delta="stats.latencyDelta"
        unit="ms"
        color="yellow"
        :precision="1"
      />
      <StatusCard
        title="重传率"
        :value="stats.retransmitRate * 100"
        :delta="stats.retransmitDelta * 100"
        unit="%"
        color="red"
        :precision="3"
      />
    </div>

    <div class="main-row">
      <div class="topology-section">
        <div class="section-card">
          <div class="section-header">
            <span class="section-title">网络拓扑</span>
          </div>
          <div class="section-body">
            <TopologyGraph />
          </div>
        </div>
      </div>
      <div class="heatmap-section">
        <div class="section-card">
          <div class="section-header">
            <span class="section-title">延迟热力图</span>
          </div>
          <div class="section-body">
            <LatencyHeatmap />
          </div>
        </div>
      </div>
    </div>

    <div class="metrics-row">
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">指标面板</span>
        </div>
        <div class="section-body metrics-body">
          <MetricsPanel />
        </div>
      </div>
    </div>

    <div class="alerts-row">
      <div class="section-card">
        <div class="section-header">
          <span class="section-title">网络异常告警</span>
          <el-badge v-if="unresolvedAlerts > 0" :value="unresolvedAlerts" :max="99" class="alert-badge" />
        </div>
        <div class="section-body alerts-body">
          <AlertPanel />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import StatusCard from './StatusCard.vue'
import TopologyGraph from './TopologyGraph.vue'
import LatencyHeatmap from './LatencyHeatmap.vue'
import MetricsPanel from './MetricsPanel.vue'
import AlertPanel from './AlertPanel.vue'
import { useWebSocket } from '@/composables/useWebSocket'
import type { DashboardStats, Alert } from '@/types'

const stats = ref<DashboardStats>({
  totalServices: 0,
  activeConnections: 0,
  avgLatency: 0,
  retransmitRate: 0,
  servicesDelta: 0,
  connectionsDelta: 0,
  latencyDelta: 0,
  retransmitDelta: 0
})

const alerts = ref<Alert[]>([])
const unresolvedAlerts = computed(() => alerts.value.filter(a => !a.resolved).length)

const { on: wsOn, off: wsOff } = useWebSocket()

function handleStatsData(data: unknown) {
  const prev = { ...stats.value }
  const incoming = data as DashboardStats
  stats.value = {
    ...incoming,
    servicesDelta: incoming.totalServices - prev.totalServices,
    connectionsDelta: incoming.activeConnections - prev.activeConnections,
    latencyDelta: incoming.avgLatency - prev.avgLatency,
    retransmitDelta: incoming.retransmitRate - prev.retransmitRate
  }
}

function handleAlertData(data: unknown) {
  const alert = data as Alert
  const idx = alerts.value.findIndex(a => a.id === alert.id)
  if (idx === -1) {
    alerts.value.unshift(alert)
  } else {
    alerts.value[idx] = alert
  }
  if (alerts.value.length > 100) {
    alerts.value = alerts.value.slice(0, 100)
  }
}

onMounted(() => {
  wsOn('metrics', handleStatsData)
  wsOn('alert', handleAlertData)
})

onUnmounted(() => {
  wsOff('metrics', handleStatsData)
  wsOff('alert', handleAlertData)
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  flex-shrink: 0;
}

.main-row {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.topology-section {
  flex: 6;
  min-width: 0;
}

.heatmap-section {
  flex: 4;
  min-width: 0;
}

.section-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.alert-badge {
  margin-left: 8px;
}

.section-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.metrics-row {
  flex-shrink: 0;
  height: 400px;
}

.metrics-body {
  padding: 16px;
  overflow: auto;
}

.alerts-row {
  flex-shrink: 0;
  height: 450px;
}

.alerts-body {
  padding: 16px;
  overflow: auto;
}

@media (max-width: 1200px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .main-row {
    flex-direction: column;
  }
  .topology-section,
  .heatmap-section {
    flex: none;
    height: 400px;
  }
}
</style>
