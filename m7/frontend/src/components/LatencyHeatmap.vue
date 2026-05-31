<template>
  <div class="heatmap-container">
    <div class="heatmap-toolbar">
      <el-radio-group v-model="latencyMode" size="small">
        <el-radio-button value="avg">平均延迟</el-radio-button>
        <el-radio-button value="p50">P50</el-radio-button>
        <el-radio-button value="p99">P99</el-radio-button>
      </el-radio-group>
    </div>
    <div ref="chartRef" class="heatmap-chart"></div>
    <el-dialog v-model="detailVisible" :title="detailTitle" width="400px" append-to-body>
      <div class="detail-content">
        <div class="detail-row">
          <span>平均延迟</span><span>{{ detailData.avg?.toFixed(1) }} ms</span>
        </div>
        <div class="detail-row">
          <span>P50</span><span>{{ detailData.p50?.toFixed(1) }} ms</span>
        </div>
        <div class="detail-row">
          <span>P99</span><span>{{ detailData.p99?.toFixed(1) }} ms</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useWebSocket } from '@/composables/useWebSocket'
import type { LatencyMatrix, LatencyCell, LatencyMode } from '@/types'

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

const latencyMode = ref<LatencyMode>('avg')
const detailVisible = ref(false)
const detailTitle = ref('')
const detailData = ref<Partial<LatencyCell>>({})

const currentMatrix = ref<LatencyMatrix | null>(null)

const { on: wsOn, off: wsOff } = useWebSocket()

function getCellValue(cell: LatencyCell, mode: LatencyMode): number {
  switch (mode) {
    case 'avg': return cell.avg
    case 'p50': return cell.p50
    case 'p99': return cell.p99
  }
}

function buildOption(matrix: LatencyMatrix, mode: LatencyMode): echarts.EChartsOption {
  const { services, values } = matrix
  const data: [number, number, number][] = []

  let minVal = Infinity
  let maxVal = -Infinity

  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values[i].length; j++) {
      const cell = values[i][j]
      const val = getCellValue(cell, mode)
      data.push([j, i, val])
      if (val < minVal) minVal = val
      if (val > maxVal) maxVal = val
    }
  }

  return {
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        const d = params.data
        const src = services[d[1]]
        const tgt = services[d[0]]
        const cell = values[d[1]][d[0]]
        return `<strong>${src} → ${tgt}</strong><br/>`
          + `平均: ${cell.avg.toFixed(1)} ms<br/>`
          + `P50: ${cell.p50.toFixed(1)} ms<br/>`
          + `P99: ${cell.p99.toFixed(1)} ms`
      },
      backgroundColor: '#16213e',
      borderColor: '#0f3460',
      textStyle: { color: '#eee' }
    },
    grid: {
      top: 10,
      bottom: 80,
      left: 100,
      right: 30
    },
    xAxis: {
      type: 'category',
      data: services,
      axisLabel: { color: '#999', rotate: 45, fontSize: 10 },
      axisLine: { lineStyle: { color: '#0f3460' } },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'category',
      data: services,
      axisLabel: { color: '#999', fontSize: 10 },
      axisLine: { lineStyle: { color: '#0f3460' } },
      splitLine: { show: false }
    },
    visualMap: {
      min: minVal,
      max: maxVal,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: {
        color: ['#0d1b3e', '#1a3a7a', '#2979ff', '#ffc107', '#ff6f00', '#d32f2f']
      },
      textStyle: { color: '#999' },
      formatter: ((val: unknown) => `${Number(val).toFixed(0)} ms`) as any
    },
    series: [{
      type: 'heatmap',
      data: data,
      emphasis: {
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2
        }
      },
      progressive: 500,
      animation: true,
      animationDuration: 800,
      animationEasing: 'cubicOut'
    }]
  }
}

function updateChart(matrix: LatencyMatrix) {
  currentMatrix.value = matrix
  if (!chart) return
  const option = buildOption(matrix, latencyMode.value)
  chart.setOption(option, { notMerge: false })
}

function handleHeatmapData(data: unknown) {
  updateChart(data as LatencyMatrix)
}

function showDetail(i: number, j: number) {
  if (!currentMatrix.value) return
  const cell = currentMatrix.value.values[i][j]
  detailTitle.value = `${currentMatrix.value.services[i]} → ${currentMatrix.value.services[j]}`
  detailData.value = cell
  detailVisible.value = true
}

watch(latencyMode, () => {
  if (currentMatrix.value && chart) {
    const option = buildOption(currentMatrix.value, latencyMode.value)
    chart.setOption(option, { notMerge: false })
  }
})

onMounted(() => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value, 'dark')
  chart.on('click', (params: any) => {
    if (params.data) {
      showDetail(params.data[1], params.data[0])
    }
  })

  const resizeHandler = () => chart?.resize()
  window.addEventListener('resize', resizeHandler)

  wsOn('heatmap', handleHeatmapData)
})

onUnmounted(() => {
  chart?.dispose()
  chart = null
  wsOff('heatmap', handleHeatmapData)
})
</script>

<style scoped>
.heatmap-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.heatmap-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 0;
  flex-shrink: 0;
}

.heatmap-chart {
  flex: 1;
  min-height: 0;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
}
</style>
