<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'
import type { Cluster, ClusterNode } from '@/types'
import NodeDetailPanel from '@/components/topology/NodeDetailPanel.vue'
import { Search, ZoomIn, ZoomOut, Maximize2, RefreshCw, Activity } from 'lucide-vue-next'
import * as echarts from 'echarts'

const { getClusters, getClusterNodes } = useApi()

const clusters = ref<Cluster[]>([])
const selectedClusterId = ref('')
const nodes = ref<ClusterNode[]>([])
const selectedNode = ref<ClusterNode | null>(null)
const searchQuery = ref('')
const chartRef = ref<any>(null)
const isLoading = ref(false)
const zoom = ref(1)

onMounted(async () => {
  try {
    clusters.value = await getClusters()
    if (clusters.value.length > 0) {
      selectedClusterId.value = clusters.value[0].id
      await loadNodes()
    }
  } catch { }
})

async function loadNodes() {
  if (!selectedClusterId.value) return
  isLoading.value = true
  try {
    nodes.value = await getClusterNodes(selectedClusterId.value)
  } finally {
    isLoading.value = false
  }
}

const nodeColor = (status: string) => {
  switch (status) {
    case 'online': return '#10b981'
    case 'fail': return '#ef4444'
    case 'offline': return '#f59e0b'
    default: return '#6b7280'
  }
}

const nodeSymbol = (role: string) => role === 'master' ? 'diamond' : 'circle'

const chartOption = computed(() => {
  const nodeIdMap = new Map<string, string>()
  nodes.value.forEach(n => {
    if (n.nodeId) nodeIdMap.set(n.nodeId, n.id)
  })

  const nodeCount = nodes.value.length
  const baseRepulsion = Math.max(400, nodeCount * 25)
  const baseEdgeLength = Math.max(140, nodeCount * 6)
  const baseGravity = Math.max(0.05, 0.15 - (nodeCount * 0.002))
  const masterSize = Math.max(32, 45 - nodeCount * 0.3)
  const slaveSize = Math.max(22, 32 - nodeCount * 0.2)

  const filteredNodes = nodes.value.filter(n =>
    !searchQuery.value ||
    n.addr.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    n.nodeId?.toLowerCase().includes(searchQuery.value.toLowerCase())
  )

  const highlightedIds = new Set(filteredNodes.map(n => n.id))

  const graphNodes = nodes.value.map(n => {
    const isHighlighted = highlightedIds.has(n.id)
    const isDimmed = searchQuery.value && !isHighlighted
    return {
      id: n.id,
      name: n.addr,
      symbolSize: n.role === 'master' ? masterSize : slaveSize,
      symbol: nodeSymbol(n.role),
      itemStyle: {
        color: nodeColor(n.status),
        borderColor: isHighlighted ? 'rgba(0,212,170,0.6)' : 'rgba(0,212,170,0.2)',
        borderWidth: isHighlighted ? 3 : 2,
        opacity: isDimmed ? 0.25 : 1,
        shadowBlur: isHighlighted ? 15 : 0,
        shadowColor: isHighlighted ? nodeColor(n.status) : 'transparent',
      },
      label: {
        show: nodeCount <= 25 || isHighlighted,
        color: '#c9d1d9',
        fontSize: 10,
        fontFamily: 'JetBrains Mono',
        opacity: isDimmed ? 0.2 : 1,
        position: 'bottom',
        distance: 8,
      },
      _raw: n,
    }
  })

  const edges = nodes.value
    .filter(n => n.role === 'slave' && n.masterId)
    .map((n, idx) => {
      const masterGraphId = nodeIdMap.get(n.masterId!) || n.masterId!
      const isEdgeHighlighted = highlightedIds.has(n.id) || highlightedIds.has(masterGraphId)
      const isEdgeDimmed = searchQuery.value && !isEdgeHighlighted
      return {
        source: masterGraphId,
        target: n.id,
        lineStyle: {
          color: isEdgeHighlighted ? 'rgba(0,212,170,0.45)' : 'rgba(0,212,170,0.2)',
          width: isEdgeHighlighted ? 2 : 1.2,
          curveness: (idx % 3) * 0.15 + 0.1,
          opacity: isEdgeDimmed ? 0.15 : 1,
        },
      }
    })

  return {
    tooltip: {
      backgroundColor: 'rgba(22,27,34,0.98)',
      borderColor: 'rgba(0,212,170,0.3)',
      borderWidth: 1,
      textStyle: { color: '#e6edf3', fontFamily: 'JetBrains Mono', fontSize: 11 },
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          const raw = params.data._raw as ClusterNode
          return `<div style="font-weight:600;color:#00D4AA;margin-bottom:4px">${raw.addr}</div>
            <div>Role: <span style="color:#c9d1d9">${raw.role}</span></div>
            <div>Status: <span style="color:${nodeColor(raw.status)}">${raw.status}</span></div>
            <div>Node ID: <span style="color:#8b949e;font-size:10px">${raw.nodeId?.slice(0, 12)}...</span></div>`
        }
        return ''
      },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      focusNodeAdjacency: true,
      autoCurveness: false,
      data: graphNodes,
      edges,
      force: {
        repulsion: baseRepulsion,
        gravity: baseGravity,
        edgeLength: baseEdgeLength,
        friction: 0.2,
        layoutAnimation: true,
        initLayout: null as any,
      },
      emphasis: {
        focus: 'adjacency',
        itemStyle: {
          borderColor: '#00D4AA',
          borderWidth: 4,
          shadowBlur: 20,
          shadowColor: '#00D4AA',
        },
        lineStyle: {
          width: 3,
          color: 'rgba(0,212,170,0.8)',
        },
      },
      select: {
        itemStyle: {
          borderColor: '#00D4AA',
          borderWidth: 4,
          shadowBlur: 25,
          shadowColor: '#00D4AA',
        },
      },
      zlevel: 10,
    }],
  }
})

function onChartClick(params: any) {
  if (params.dataType === 'node' && params.data._raw) {
    selectedNode.value = params.data._raw
  }
}

function closeDetail() {
  selectedNode.value = null
}

function handleZoomIn() {
  if (chartRef.value) {
    const chart = chartRef.value.getChart() as echarts.ECharts
    const option = chart.getOption()
    zoom.value = Math.min(zoom.value * 1.25, 5)
    chart.dispatchAction({ type: 'zoom', dataZoomIndex: 0, start: 0, end: 100, zoomLock: false } as any)
  }
}

function handleZoomOut() {
  if (chartRef.value) {
    const chart = chartRef.value.getChart() as echarts.ECharts
    zoom.value = Math.max(zoom.value * 0.8, 0.2)
    chart.dispatchAction({ type: 'zoom', dataZoomIndex: 0, start: 0, end: 100, zoomLock: false } as any)
  }
}

function handleReset() {
  if (chartRef.value) {
    const chart = chartRef.value.getChart() as echarts.ECharts
    chart.dispatchAction({ type: 'restore' })
    zoom.value = 1
  }
}

function handleFitView() {
  if (chartRef.value) {
    const chart = chartRef.value.getChart() as echarts.ECharts
    chart.resize()
    zoom.value = 1
  }
}

function handleRefresh() {
  loadNodes()
}

const legendItems = [
  { label: 'Master', color: '#10b981', symbol: 'diamond' },
  { label: 'Slave', color: '#10b981', symbol: 'circle' },
  { label: 'Warning', color: '#f59e0b', symbol: 'circle' },
  { label: 'Fail', color: '#ef4444', symbol: 'circle' },
]
</script>

<template>
  <div class="space-y-5">
    <div>
      <h2 class="text-xl font-mono font-bold text-primary glow-text mb-1">Cluster Topology</h2>
      <p class="text-sm text-gray-500">Real-time cluster node health visualization</p>
    </div>

    <div class="glass-card border-primary/20 p-4">
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div class="flex items-center gap-3">
          <label class="text-xs text-gray-400 font-mono">Cluster</label>
          <select v-model="selectedClusterId" @change="loadNodes"
            class="bg-bg-secondary border border-primary/30 rounded px-3 py-1.5 text-sm font-mono text-gray-200 focus:outline-none focus:border-primary">
            <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <div class="relative">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input v-model="searchQuery" type="text" placeholder="Search node..."
              class="bg-bg-secondary border border-primary/30 rounded pl-8 pr-3 py-1.5 text-sm font-mono text-gray-200 w-48 focus:outline-none focus:border-primary placeholder:text-gray-600">
          </div>

          <button @click="handleRefresh" class="p-1.5 rounded bg-bg-secondary border border-primary/20 hover:border-primary/50 transition-colors" title="Refresh">
            <RefreshCw class="w-4 h-4 text-gray-400" />
          </button>
          <button @click="handleZoomIn" class="p-1.5 rounded bg-bg-secondary border border-primary/20 hover:border-primary/50 transition-colors" title="Zoom In">
            <ZoomIn class="w-4 h-4 text-gray-400" />
          </button>
          <button @click="handleZoomOut" class="p-1.5 rounded bg-bg-secondary border border-primary/20 hover:border-primary/50 transition-colors" title="Zoom Out">
            <ZoomOut class="w-4 h-4 text-gray-400" />
          </button>
          <button @click="handleReset" class="p-1.5 rounded bg-bg-secondary border border-primary/20 hover:border-primary/50 transition-colors" title="Reset">
            <Maximize2 class="w-4 h-4 text-gray-400" />
          </button>
          <button @click="handleFitView" class="p-1.5 rounded bg-bg-secondary border border-primary/20 hover:border-primary/50 transition-colors" title="Fit View">
            <Activity class="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div class="flex items-center gap-4">
          <div v-for="item in legendItems" :key="item.label" class="flex items-center gap-1.5">
            <span class="text-xs text-gray-400">{{ item.label }}</span>
            <span
              :class="item.symbol === 'diamond' ? 'inline-block w-2.5 h-2.5 rotate-45' : 'inline-block w-2.5 h-2.5 rounded-full'"
              :style="{ backgroundColor: item.color }">
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card border-primary/20 relative" style="min-height: 580px;">
      <div v-if="isLoading" class="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary/80 backdrop-blur">
        <div class="text-gray-400 font-mono text-sm">Loading topology...</div>
      </div>
      <v-chart ref="chartRef" :option="chartOption" autoresize style="height: 580px" @click="onChartClick" />
    </div>

    <NodeDetailPanel v-if="selectedNode" :node="selectedNode" @close="closeDetail" />
  </div>
</template>
