<template>
  <div class="metrics-panel">
    <div class="metrics-toolbar">
      <el-radio-group v-model="timeRange" size="small">
        <el-radio-button value="1m">1分钟</el-radio-button>
        <el-radio-button value="5m">5分钟</el-radio-button>
        <el-radio-button value="15m">15分钟</el-radio-button>
        <el-radio-button value="1h">1小时</el-radio-button>
      </el-radio-group>
    </div>

    <div class="metrics-charts">
      <div class="chart-card">
        <div class="chart-title">TCP 重传率趋势</div>
        <div ref="retransChartRef" class="chart-area"></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">连接延迟分布</div>
        <div ref="latencyDistRef" class="chart-area"></div>
      </div>
    </div>

    <div class="health-grid">
      <div
        v-for="svc in serviceHealth"
        :key="svc.id"
        class="health-card"
        :class="'status-' + svc.status"
      >
        <div class="health-header">
          <span class="health-name">{{ svc.name }}</span>
          <span class="health-dot" :class="'dot-' + svc.status"></span>
        </div>
        <div class="health-metrics">
          <div class="health-metric">
            <span class="metric-label">延迟</span>
            <span class="metric-value">{{ svc.avgLatency.toFixed(1) }} ms</span>
          </div>
          <div class="health-metric">
            <span class="metric-label">错误率</span>
            <span class="metric-value">{{ (svc.errorRate * 100).toFixed(2) }}%</span>
          </div>
          <div class="health-metric">
            <span class="metric-label">请求率</span>
            <span class="metric-value">{{ svc.requestRate.toFixed(0) }}/s</span>
          </div>
          <div class="health-metric">
            <span class="metric-label">可用率</span>
            <span class="metric-value">{{ (svc.uptime * 100).toFixed(2) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useWebSocket } from '@/composables/useWebSocket'
import type { TcpMetrics, LatencyDistribution, ServiceHealth, TimeRange } from '@/types'

const retransChartRef = ref<HTMLDivElement>()
const latencyDistRef = ref<HTMLDivElement>()
let retransChart: echarts.ECharts | null = null
let latencyDistChart: echarts.ECharts | null = null

const timeRange = ref<TimeRange>('5m')
const serviceHealth = ref<ServiceHealth[]>([])

const metricsHistory = ref<TcpMetrics[]>([])
const maxHistory = 120
const SPIKE_THRESHOLD = 3

const { on: wsOn, off: wsOff } = useWebSocket()

function clipSpike(values: number[], threshold: number): number[] {
  if (values.length < 3) return values
  const result = [...values]
  for (let i = 1; i < result.length - 1; i++) {
    const prev = result[i - 1]
    const next = result[i + 1]
    const localMean = (prev + next) / 2
    const deviation = Math.abs(result[i] - localMean)
    const allowedRange = Math.max(localMean * threshold, 0.01)
    if (deviation > allowedRange && localMean > 0) {
      result[i] = localMean
    }
  }
  return result
}

function movingAverage(values: number[], window: number): number[] {
  if (values.length < window) return values
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2))
    const end = Math.min(values.length, i + Math.ceil(window / 2))
    let sum = 0
    for (let j = start; j < end; j++) sum += values[j]
    result.push(sum / (end - start))
  }
  return result
}

function buildRetransOption(data: TcpMetrics[]): echarts.EChartsOption {
  const times = data.map(d => new Date(d.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  const rawRates = data.map(d => d.retransmitRate * 100)
  const rawConnections = data.map(d => d.connectionCount)
  const rates = movingAverage(clipSpike(rawRates, SPIKE_THRESHOLD), 3)
  const connections = movingAverage(clipSpike(rawConnections, SPIKE_THRESHOLD), 3)

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#16213e',
      borderColor: '#0f3460',
      textStyle: { color: '#eee' }
    },
    legend: {
      data: ['重传率', '连接数'],
      textStyle: { color: '#999' },
      top: 0
    },
    grid: { top: 40, bottom: 30, left: 50, right: 50 },
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: { color: '#666', fontSize: 10 },
      axisLine: { lineStyle: { color: '#0f3460' } }
    },
    yAxis: [
      {
        type: 'value',
        name: '重传率(%)',
        nameTextStyle: { color: '#999' },
        axisLabel: { color: '#666' },
        splitLine: { lineStyle: { color: '#0f346033' } }
      },
      {
        type: 'value',
        name: '连接数',
        nameTextStyle: { color: '#999' },
        axisLabel: { color: '#666' },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '重传率',
        type: 'line',
        data: rates.map(r => r.toFixed(3)),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#e94560', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(233,69,96,0.3)' },
            { offset: 1, color: 'rgba(233,69,96,0)' }
          ])
        }
      },
      {
        name: '连接数',
        type: 'line',
        yAxisIndex: 1,
        data: connections,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#2979ff', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(41,121,255,0.2)' },
            { offset: 1, color: 'rgba(41,121,255,0)' }
          ])
        }
      }
    ]
  }
}

function buildLatencyDistOption(dist: LatencyDistribution): echarts.EChartsOption {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#16213e',
      borderColor: '#0f3460',
      textStyle: { color: '#eee' }
    },
    grid: { top: 20, bottom: 30, left: 50, right: 20 },
    xAxis: {
      type: 'category',
      data: dist.buckets.map(b => `${b}${dist.unit}`),
      axisLabel: { color: '#666', fontSize: 10, rotate: 30 },
      axisLine: { lineStyle: { color: '#0f3460' } }
    },
    yAxis: {
      type: 'value',
      name: '次数',
      nameTextStyle: { color: '#999' },
      axisLabel: { color: '#666' },
      splitLine: { lineStyle: { color: '#0f346033' } }
    },
    series: [{
      type: 'bar',
      data: dist.counts,
      barWidth: '60%',
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#ffc107' },
          { offset: 1, color: '#ff6f00' }
        ]),
        borderRadius: [3, 3, 0, 0]
      },
      emphasis: {
        itemStyle: { color: '#ffc107' }
      }
    }]
  }
}

function handleMetricsData(data: unknown) {
  const metric = data as TcpMetrics
  metricsHistory.value.push(metric)
  if (metricsHistory.value.length > maxHistory) {
    metricsHistory.value.shift()
  }
  if (retransChart) {
    retransChart.setOption(buildRetransOption(metricsHistory.value), { notMerge: false })
  }
}

function handleLatencyData(data: unknown) {
  const dist = data as LatencyDistribution
  if (latencyDistChart) {
    latencyDistChart.setOption(buildLatencyDistOption(dist), { notMerge: false })
  }
}

function handleHealthData(data: unknown) {
  serviceHealth.value = data as ServiceHealth[]
}

watch(timeRange, () => {
  metricsHistory.value = []
})

onMounted(() => {
  if (retransChartRef.value) {
    retransChart = echarts.init(retransChartRef.value, 'dark')
  }
  if (latencyDistRef.value) {
    latencyDistChart = echarts.init(latencyDistRef.value, 'dark')
  }

  const resizeHandler = () => {
    retransChart?.resize()
    latencyDistChart?.resize()
  }
  window.addEventListener('resize', resizeHandler)

  wsOn('metrics', handleMetricsData)
  wsOn('latency', handleLatencyData)
  wsOn('health', handleHealthData)
})

onUnmounted(() => {
  retransChart?.dispose()
  latencyDistChart?.dispose()
  retransChart = null
  latencyDistChart = null
  wsOff('metrics', handleMetricsData)
  wsOff('latency', handleLatencyData)
  wsOff('health', handleHealthData)
})
</script>

<style scoped>
.metrics-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.metrics-toolbar {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.metrics-charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex-shrink: 0;
}

.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.chart-area {
  height: 240px;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.health-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px;
  transition: border-color 0.3s;
}

.health-card.status-healthy {
  border-left: 3px solid var(--accent-green);
}

.health-card.status-warning {
  border-left: 3px solid var(--accent-yellow);
}

.health-card.status-critical {
  border-left: 3px solid var(--accent-red);
}

.health-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.health-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-healthy { background: var(--accent-green); }
.dot-warning { background: var(--accent-yellow); }
.dot-critical { background: var(--accent-red); }

.health-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.health-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.metric-value {
  font-size: 13px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
</style>
