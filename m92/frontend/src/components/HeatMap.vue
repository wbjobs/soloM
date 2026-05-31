<template>
  <div class="heatmap-container">
    <div class="chart-header">
      <h3>系统调用频率热力图</h3>
      <div class="chart-stats">
        <span class="stat-item">
          <span class="stat-label">唯一进程:</span>
          <span class="stat-value">{{ uniqueProcesses }}</span>
        </span>
        <span class="stat-item">
          <span class="stat-label">总调用数:</span>
          <span class="stat-value">{{ totalCalls.toLocaleString() }}</span>
        </span>
      </div>
    </div>
    <div ref="chartRef" class="chart"></div>
    <div class="chart-footer">
      <span class="hint">💡 只显示 Top {{ maxProcesses }} 活跃进程</span>
      <span class="data-points">数据点: {{ displayDataPoints }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
})

const chartRef = ref(null)
let chart = null
let throttleTimer = null
let lastUpdate = 0
const UPDATE_THROTTLE = 800
const maxProcesses = 50

const displayDataPoints = ref(0)

const uniqueProcesses = computed(() => {
  const processes = new Set(props.data.map(d => d.process))
  return Math.min(processes.size, maxProcesses)
})

const totalCalls = computed(() => {
  return props.data.reduce((sum, d) => sum + d.count, 0)
})

function initChart() {
  if (!chartRef.value) return

  chart = echarts.init(chartRef.value, 'dark', {
    renderer: 'canvas',
    useDirtyRect: true
  })

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      hideDelay: 100,
      enterable: false,
      formatter: (params) => {
        const data = params.data
        return `
          <div style="font-weight: bold; margin-bottom: 4px; max-width: 250px; overflow: hidden; text-overflow: ellipsis;">${data[1]} → ${data[0]}</div>
          <div>调用次数: <span style="color: #10b981; font-weight: bold;">${data[2].toLocaleString()}</span></div>
          <div>PID: <span style="color: #60a5fa;">${data[3]}</span></div>
        `
      },
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' }
    },
    grid: {
      top: '50px',
      left: '110px',
      right: '30px',
      bottom: '50px'
    },
    xAxis: {
      type: 'category',
      data: [],
      splitArea: {
        show: true,
        areaStyle: {
          color: ['rgba(30, 41, 59, 0.3)', 'rgba(30, 41, 59, 0.1)']
        }
      },
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: 500
      }
    },
    yAxis: {
      type: 'category',
      data: [],
      splitArea: {
        show: true
      },
      axisLine: { lineStyle: { color: '#475569' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 10,
        fontFamily: 'SF Mono, Monaco, monospace',
        formatter: (value) => {
          if (value.length > 15) {
            return value.substring(0, 13) + '...'
          }
          return value
        }
      }
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: '5px',
      itemWidth: 15,
      itemHeight: 80,
      inRange: {
        color: [
          '#0f172a',
          '#1e3a5f',
          '#2563eb',
          '#3b82f6',
          '#60a5fa',
          '#93c5fd',
          '#fcd34d',
          '#f59e0b',
          '#ef4444',
          '#dc2626'
        ]
      },
      textStyle: { color: '#94a3b8', fontSize: 10 },
      backgroundColor: 'rgba(30, 41, 59, 0.3)',
      borderColor: '#334155'
    },
    series: [{
      name: 'syscall_frequency',
      type: 'heatmap',
      data: [],
      label: {
        show: true,
        fontSize: 10,
        fontWeight: 600,
        color: '#f1f5f9',
        formatter: (params) => {
          const val = params.data[2]
          if (val >= 1000) {
            return (val / 1000).toFixed(1) + 'k'
          }
          return val
        }
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      },
      animation: false,
      animationThreshold: 100,
      progressiveThreshold: 500,
      progressive: 50
    }]
  }

  chart.setOption(option)
  window.addEventListener('resize', handleResize)
}

function handleResize() {
  chart?.resize()
}

function transformData() {
  if (props.data.length === 0) {
    return { xAxisData: [], yAxisData: [], heatmapData: [], maxValue: 0 }
  }

  const syscallTypes = new Set()
  const processTotals = new Map()
  const processData = new Map()

  for (let i = 0; i < props.data.length; i++) {
    const item = props.data[i]
    syscallTypes.add(item.syscall)

    const key = `${item.process}-${item.pid}`
    if (!processData.has(key)) {
      processData.set(key, {
        process: item.process,
        pid: item.pid,
        syscalls: new Map(),
        total: 0
      })
    }

    const proc = processData.get(key)
    const currentCount = proc.syscalls.get(item.syscall) || 0
    const newCount = currentCount + item.count
    proc.syscalls.set(item.syscall, newCount)
    proc.total += item.count
  }

  const topProcesses = Array.from(processData.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, maxProcesses)

  const xAxisData = Array.from(syscallTypes).sort()
  const yAxisData = topProcesses.map(p => `${p.process} (${p.pid})`)

  const heatmapData = []
  let maxValue = 0

  for (let i = 0; i < topProcesses.length; i++) {
    const proc = topProcesses[i]
    const yLabel = yAxisData[i]

    for (let j = 0; j < xAxisData.length; j++) {
      const syscall = xAxisData[j]
      const count = proc.syscalls.get(syscall) || 0
      if (count > 0) {
        if (count > maxValue) maxValue = count
        heatmapData.push([syscall, yLabel, count, proc.pid])
      }
    }
  }

  return { xAxisData, yAxisData, heatmapData, maxValue }
}

function updateChart() {
  if (!chart) return

  const now = Date.now()
  if (now - lastUpdate < UPDATE_THROTTLE) {
    if (throttleTimer) return
    throttleTimer = setTimeout(() => {
      throttleTimer = null
      updateChart()
    }, UPDATE_THROTTLE - (now - lastUpdate))
    return
  }
  lastUpdate = now

  const { xAxisData, yAxisData, heatmapData, maxValue } = transformData()

  displayDataPoints.value = heatmapData.length

  if (heatmapData.length === 0) return

  chart.setOption({
    xAxis: { data: xAxisData },
    yAxis: { data: yAxisData },
    visualMap: {
      max: Math.max(10, maxValue)
    },
    series: [{
      data: heatmapData
    }]
  }, {
    notMerge: false,
    lazyUpdate: true
  })
}

watch(() => props.data, () => {
  updateChart()
}, { deep: true })

onMounted(() => {
  initChart()
  updateChart()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (throttleTimer) {
    clearTimeout(throttleTimer)
  }
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.heatmap-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 12px;
  border: 1px solid #334155;
  overflow: hidden;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #334155;
}

.chart-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0;
}

.chart-stats {
  display: flex;
  gap: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.stat-label {
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 14px;
  font-weight: 700;
  color: #3b82f6;
  font-family: 'SF Mono', Monaco, monospace;
}

.chart {
  flex: 1;
  min-height: 350px;
}

.chart-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 16px;
  border-top: 1px solid #334155;
  font-size: 11px;
  color: #64748b;
}

.hint {
  opacity: 0.8;
}

.data-points {
  font-family: 'SF Mono', Monaco, monospace;
  background: rgba(59, 130, 246, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
