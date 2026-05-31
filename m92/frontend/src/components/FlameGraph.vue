<template>
  <div class="flame-graph-container">
    <div class="chart-header">
      <h3>进程调用火焰图</h3>
      <div class="chart-stats">
        <span class="stat-item">
          <span class="stat-label">总调用次数:</span>
          <span class="stat-value">{{ totalCalls.toLocaleString() }}</span>
        </span>
        <span class="stat-item">
          <span class="stat-label">活跃进程:</span>
          <span class="stat-value">{{ processCount }}</span>
        </span>
        <span class="stat-item" v-if="metrics.dropped > 0 || metrics.ringbufLost > 0">
          <span class="stat-label" style="color: #f59e0b;">丢包:</span>
          <span class="stat-value" style="color: #f59e0b;">{{ totalDropped.toLocaleString() }}</span>
        </span>
      </div>
    </div>
    <div ref="chartRef" class="chart"></div>
    <div class="chart-footer">
      <span class="hint">💡 提示：滚轮缩放，拖拽平移，点击节点展开/折叠</span>
      <span class="node-count">显示节点: {{ displayNodeCount }} / {{ totalNodeCount }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  data: {
    type: Object,
    default: null
  },
  metrics: {
    type: Object,
    default: () => ({ received: 0, processed: 0, dropped: 0, ringbufLost: 0 })
  }
})

const chartRef = ref(null)
let chart = null
let throttleTimer = null
let lastUpdate = 0
const UPDATE_THROTTLE = 500

const displayNodeCount = ref(0)
const totalNodeCount = ref(0)

const totalCalls = computed(() => {
  return props.data?.value || 0
})

const processCount = computed(() => {
  return props.data?.children?.length || 0
})

const totalDropped = computed(() => {
  return (props.metrics?.dropped || 0) + (props.metrics?.ringbufLost || 0)
})

const colorPalette = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308', '#22c55e', '#0ea5e9', '#a855f7'
]

function getColor(index, depth) {
  const baseColor = colorPalette[index % colorPalette.length]
  const lightness = Math.max(30, 70 - depth * 15)
  return adjustLightness(baseColor, lightness)
}

function adjustLightness(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = (num >> 16) + amt
  const G = (num >> 8 & 0x00FF) + amt
  const B = (num & 0x0000FF) + amt
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1)
}

function countNodes(node) {
  if (!node) return 0
  let count = 1
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child)
    }
  }
  return count
}

function pruneTree(node, maxDepth = 3, maxChildren = 30, depth = 0) {
  if (!node) return null

  if (depth >= maxDepth) {
    return {
      name: node.name,
      value: node.value,
      itemStyle: node.itemStyle,
      children: []
    }
  }

  const result = {
    name: node.name,
    value: node.value || 0,
    itemStyle: node.itemStyle,
    children: []
  }

  if (node.children && node.children.length > 0) {
    const sortedChildren = [...node.children].sort((a, b) => (b.value || 0) - (a.value || 0))
    const topChildren = sortedChildren.slice(0, maxChildren)

    for (const child of topChildren) {
      const prunedChild = pruneTree(child, maxDepth, maxChildren, depth + 1)
      if (prunedChild) {
        result.children.push(prunedChild)
      }
    }

    if (sortedChildren.length > maxChildren) {
      const othersValue = sortedChildren.slice(maxChildren).reduce((sum, c) => sum + (c.value || 0), 0)
      if (othersValue > 0) {
        result.children.push({
          name: `...(${sortedChildren.length - maxChildren} more)`,
          value: othersValue,
          itemStyle: { color: '#64748b' }
        })
      }
    }
  }

  return result
}

function transformData(node, depth = 0, parentIndex = 0) {
  if (!node) return null

  const children = node.children?.map((child, index) =>
    transformData(child, depth + 1, index)
  ).filter(Boolean) || []

  return {
    name: node.name,
    value: node.value || 0,
    children,
    itemStyle: node.itemStyle || {
      color: getColor(parentIndex, depth)
    }
  }
}

function initChart() {
  if (!chartRef.value) return

  chart = echarts.init(chartRef.value, 'dark', {
    renderer: 'canvas',
    useDirtyRect: true,
    width: 'auto',
    height: 'auto'
  })

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      hideDelay: 100,
      enterable: false,
      formatter: (params) => {
        const path = params.treePathInfo.map(p => p.name).join(' → ')
        const value = params.value || 0
        const percent = totalCalls.value > 0 ? ((value / totalCalls.value) * 100).toFixed(1) : 0
        return `
          <div style="font-weight: bold; margin-bottom: 4px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${path}</div>
          <div>调用次数: <span style="color: #10b981; font-weight: bold;">${value.toLocaleString()}</span></div>
          <div>占比: <span style="color: #3b82f6; font-weight: bold;">${percent}%</span></div>
        `
      },
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' }
    },
    series: [{
      type: 'tree',
      layout: 'radial',
      roam: true,
      symbol: 'circle',
      symbolSize: 8,
      initialTreeDepth: 2,
      animationDuration: 300,
      animationEasingUpdate: 'quinticInOut',
      animationThreshold: 100,
      progressiveThreshold: 500,
      progressive: 100,
      lineStyle: {
        color: '#475569',
        width: 1,
        curveness: 0.5
      },
      label: {
        position: 'radial',
        rotate: 'tangential',
        fontSize: 10,
        color: '#e2e8f0',
        formatter: (params) => {
          const name = params.name
          if (name.length > 12) {
            return name.substring(0, 10) + '...'
          }
          return name
        }
      },
      leaves: {
        label: {
          position: 'radial',
          rotate: 'tangential',
          fontSize: 9
        }
      },
      emphasis: {
        focus: 'ancestor',
        lineStyle: {
          width: 2
        }
      },
      expandAndCollapse: true,
      animationDuration: 400,
      animationDurationUpdate: 500,
      data: []
    }]
  }

  chart.setOption(option)
  window.addEventListener('resize', handleResize)
}

function handleResize() {
  chart?.resize()
}

function updateChart() {
  if (!chart || !props.data) return

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

  totalNodeCount.value = countNodes(props.data)

  const pruned = pruneTree(props.data, 3, 25)
  displayNodeCount.value = countNodes(pruned)

  const transformed = transformData(pruned)
  if (!transformed) return

  chart.setOption({
    series: [{
      data: [transformed]
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
.flame-graph-container {
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
  color: #10b981;
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
  padding: 8px 16px;
  border-top: 1px solid #334155;
  font-size: 11px;
  color: #64748b;
}

.hint {
  opacity: 0.8;
}

.node-count {
  font-family: 'SF Mono', Monaco, monospace;
  background: rgba(59, 130, 246, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
