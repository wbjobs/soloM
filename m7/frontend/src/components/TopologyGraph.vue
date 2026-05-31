<template>
  <div class="topology-container" ref="containerRef">
    <div class="topology-toolbar">
      <el-button size="small" @click="resetZoom">重置视图</el-button>
      <el-button size="small" @click="toggleSimulation">
        {{ simulationRunning ? '暂停' : '继续' }}
      </el-button>
      <el-button size="small" @click="toggleCluster">
        {{ clusterEnabled ? '展开' : '聚合' }}
      </el-button>
    </div>
    <canvas ref="canvasRef" class="topology-canvas"></canvas>
    <div v-if="tooltip.show" class="topology-tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      <div class="tooltip-title">{{ tooltip.title }}</div>
      <div v-for="item in tooltip.items" :key="item.label" class="tooltip-row">
        <span class="tooltip-label">{{ item.label }}</span>
        <span class="tooltip-value">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive } from 'vue'
import * as d3 from 'd3'
import { useWebSocket } from '@/composables/useWebSocket'
import type { TopologyData, ServiceNode, ServiceEdge } from '@/types'

const containerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const simulationRunning = ref(true)
const clusterEnabled = ref(false)

const tooltip = reactive({
  show: false,
  x: 0,
  y: 0,
  title: '',
  items: [] as { label: string; value: string }[]
})

interface ClusterNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  members: ServiceNode[]
  traffic: number
  status: 'healthy' | 'warning' | 'critical'
  namespace: string
  isCluster: boolean
}

interface RenderEdge extends d3.SimulationLinkDatum<ClusterNode> {
  latency: number
  latencyP50: number
  latencyP99: number
  retransmitCount: number
  retransmitRate: number
  connectionCount: number
}

let simulation: d3.Simulation<ClusterNode, RenderEdge> | null = null
let resizeObserver: ResizeObserver | null = null
let animFrameId = 0
let canvasCtx: CanvasRenderingContext2D | null = null
let canvasWidth = 0
let canvasHeight = 0
let currentNodes: ClusterNode[] = []
let currentEdges: RenderEdge[] = []
let transform = d3.zoomIdentity
let d3Zoom: d3.ZoomBehavior<HTMLCanvasElement, unknown> | null = null

let hoveredNode: ClusterNode | null = null
let hoveredEdge: RenderEdge | null = null
let dragNode: ClusterNode | null = null

const NODE_BASE_RADIUS = 16
const NODE_MAX_RADIUS = 36
const EDGE_BASE_WIDTH = 1.5
const EDGE_MAX_WIDTH = 6
const MAX_VISIBLE_NODES = 100

const { on: wsOn, off: wsOff } = useWebSocket()

function getLatencyColor(latency: number): string {
  if (latency < 50) return '#53d769'
  if (latency < 150) return '#ffc107'
  return '#e94560'
}

function getNodeRadius(node: ClusterNode): number {
  if (node.isCluster) return NODE_MAX_RADIUS
  return Math.min(NODE_BASE_RADIUS + (node.traffic / 1024) * 0.5, NODE_MAX_RADIUS)
}

function getEdgeWidth(edge: RenderEdge): number {
  return Math.min(EDGE_BASE_WIDTH + edge.retransmitCount * 0.3, EDGE_MAX_WIDTH)
}

function clusterNodes(nodes: ServiceNode[], edges: ServiceEdge[]): { clusteredNodes: ClusterNode[], clusteredEdges: RenderEdge[] } {
  if (!clusterEnabled.value || nodes.length <= MAX_VISIBLE_NODES) {
    const cNodes: ClusterNode[] = nodes.map(n => ({
      id: n.id,
      label: n.name,
      members: [n],
      traffic: n.traffic,
      status: n.status,
      namespace: n.namespace,
      isCluster: false,
      x: undefined,
      y: undefined
    }))
    const cEdges: RenderEdge[] = edges.map(e => ({
      source: e.source,
      target: e.target,
      latency: e.latency,
      latencyP50: e.latencyP50,
      latencyP99: e.latencyP99,
      retransmitCount: e.retransmitCount,
      retransmitRate: e.retransmitRate,
      connectionCount: e.connectionCount
    }))
    return { clusteredNodes: cNodes, clusteredEdges: cEdges }
  }

  const nsGroups = new Map<string, ServiceNode[]>()
  for (const n of nodes) {
    const ns = n.namespace || 'default'
    if (!nsGroups.has(ns)) nsGroups.set(ns, [])
    nsGroups.get(ns)!.push(n)
  }

  const clusteredNodes: ClusterNode[] = []
  const nodeToCluster = new Map<string, string>()

  for (const [ns, group] of nsGroups) {
    const clusterId = `cluster:${ns}`
    const totalTraffic = group.reduce((s, n) => s + n.traffic, 0)
    const worstStatus = group.some(n => n.status === 'critical') ? 'critical' : group.some(n => n.status === 'warning') ? 'warning' : 'healthy'

    clusteredNodes.push({
      id: clusterId,
      label: ns,
      members: group,
      traffic: totalTraffic,
      status: worstStatus,
      namespace: ns,
      isCluster: true,
      x: undefined,
      y: undefined
    })

    for (const n of group) {
      nodeToCluster.set(n.id, clusterId)
    }
  }

  const edgeMap = new Map<string, RenderEdge>()
  for (const e of edges) {
    const srcCluster = nodeToCluster.get(e.source) || e.source
    const tgtCluster = nodeToCluster.get(e.target) || e.target
    if (srcCluster === tgtCluster) continue

    const key = `${srcCluster}->${tgtCluster}`
    const existing = edgeMap.get(key)
    if (existing) {
      existing.latency = (existing.latency + e.latency) / 2
      existing.retransmitCount += e.retransmitCount
      existing.connectionCount += e.connectionCount
    } else {
      edgeMap.set(key, {
        source: srcCluster,
        target: tgtCluster,
        latency: e.latency,
        latencyP50: e.latencyP50,
        latencyP99: e.latencyP99,
        retransmitCount: e.retransmitCount,
        retransmitRate: e.retransmitRate,
        connectionCount: e.connectionCount
      })
    }
  }

  return { clusteredNodes: clusteredNodes, clusteredEdges: Array.from(edgeMap.values()) }
}

function initCanvas() {
  if (!canvasRef.value || !containerRef.value) return

  const dpr = window.devicePixelRatio || 1
  canvasWidth = containerRef.value.clientWidth
  canvasHeight = containerRef.value.clientHeight - 40

  canvasRef.value.width = canvasWidth * dpr
  canvasRef.value.height = canvasHeight * dpr
  canvasRef.value.style.width = canvasWidth + 'px'
  canvasRef.value.style.height = canvasHeight + 'px'

  canvasCtx = canvasRef.value.getContext('2d')
  if (canvasCtx) {
    canvasCtx.scale(dpr, dpr)
  }

  d3Zoom = d3.zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([0.2, 5])
    .on('zoom', (event) => {
      transform = event.transform
    })

  d3.select(canvasRef.value).call(d3Zoom)

  const drag = d3.drag<HTMLCanvasElement, unknown>()
    .on('start', (event) => {
      const node = findNodeAt(event.x, event.y)
      if (node) {
        dragNode = node
        node.fx = node.x
        node.fy = node.y
        simulation?.alphaTarget(0.3).restart()
      }
    })
    .on('drag', (event) => {
      if (dragNode) {
        dragNode.fx = event.x
        dragNode.fy = event.y
      }
    })
    .on('end', () => {
      if (dragNode) {
        dragNode.fx = undefined
        dragNode.fy = undefined
        dragNode = null
        simulation?.alphaTarget(0)
      }
    })

  d3.select(canvasRef.value).call(drag)
  d3.select(canvasRef.value).on('mousemove', handleMouseMove)
  d3.select(canvasRef.value).on('mouseleave', () => {
    tooltip.show = false
    hoveredNode = null
    hoveredEdge = null
  })
}

function findNodeAt(mx: number, my: number): ClusterNode | null {
  const [x, y] = transform.invert([mx, my])
  for (let i = currentNodes.length - 1; i >= 0; i--) {
    const n = currentNodes[i]
    if (n.x === undefined || n.y === undefined) continue
    const r = getNodeRadius(n)
    const dx = x - n.x
    const dy = y - n.y
    if (dx * dx + dy * dy <= r * r) return n
  }
  return null
}

function findEdgeAt(mx: number, my: number): RenderEdge | null {
  const [x, y] = transform.invert([mx, my])
  const threshold = 8
  for (const edge of currentEdges) {
    const src = edge.source as ClusterNode
    const tgt = edge.target as ClusterNode
    if (src.x === undefined || src.y === undefined || tgt.x === undefined || tgt.y === undefined) continue
    const dist = pointToSegmentDist(x, y, src.x, src.y, tgt.x, tgt.y)
    if (dist < threshold) return edge
  }
  return null
}

function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function handleMouseMove(event: MouseEvent) {
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  const mx = event.clientX - rect.left
  const my = event.clientY - rect.top

  const node = findNodeAt(mx, my)
  if (node) {
    hoveredNode = node
    hoveredEdge = null
    tooltip.show = true
    tooltip.x = event.offsetX + 15
    tooltip.y = event.offsetY - 10
    tooltip.title = node.isCluster ? `${node.label} (${node.members.length}个服务)` : node.label
    tooltip.items = [
      { label: '命名空间', value: node.namespace },
      { label: '流量', value: `${(node.traffic / 1024).toFixed(1)} KB/s` },
      { label: '状态', value: node.status === 'healthy' ? '健康' : node.status === 'warning' ? '警告' : '严重' },
      ...(node.isCluster ? [{ label: '包含服务', value: node.members.length + '个' }] : [])
    ]
    return
  }

  const edge = findEdgeAt(mx, my)
  if (edge) {
    hoveredEdge = edge
    hoveredNode = null
    const src = edge.source as ClusterNode
    const tgt = edge.target as ClusterNode
    tooltip.show = true
    tooltip.x = event.offsetX + 15
    tooltip.y = event.offsetY - 10
    tooltip.title = `${src.label} → ${tgt.label}`
    tooltip.items = [
      { label: '平均延迟', value: `${edge.latency.toFixed(1)} ms` },
      { label: 'P50', value: `${edge.latencyP50.toFixed(1)} ms` },
      { label: 'P99', value: `${edge.latencyP99.toFixed(1)} ms` },
      { label: '重传次数', value: `${edge.retransmitCount}` },
      { label: '连接数', value: `${edge.connectionCount}` }
    ]
    return
  }

  tooltip.show = false
  hoveredNode = null
  hoveredEdge = null
}

function drawFrame() {
  if (!canvasCtx) return
  const ctx = canvasCtx

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.k, transform.k)

  for (const edge of currentEdges) {
    const src = edge.source as ClusterNode
    const tgt = edge.target as ClusterNode
    if (src.x === undefined || src.y === undefined || tgt.x === undefined || tgt.y === undefined) continue

    const isHovered = edge === hoveredEdge
    const color = getLatencyColor(edge.latency)
    const width = getEdgeWidth(edge)

    ctx.beginPath()
    ctx.moveTo(src.x, src.y)
    ctx.lineTo(tgt.x, tgt.y)
    ctx.strokeStyle = color
    ctx.lineWidth = isHovered ? width + 2 : width
    ctx.globalAlpha = isHovered ? 1 : 0.6
    ctx.stroke()

    const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x)
    const tgtR = getNodeRadius(tgt)
    const arrowX = tgt.x - Math.cos(angle) * (tgtR + 4)
    const arrowY = tgt.y - Math.sin(angle) * (tgtR + 4)
    const arrowSize = 6
    ctx.beginPath()
    ctx.moveTo(arrowX, arrowY)
    ctx.lineTo(arrowX - arrowSize * Math.cos(angle - Math.PI / 6), arrowY - arrowSize * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(arrowX - arrowSize * Math.cos(angle + Math.PI / 6), arrowY - arrowSize * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fillStyle = color
    ctx.globalAlpha = isHovered ? 1 : 0.6
    ctx.fill()
  }

  ctx.globalAlpha = 1

  for (const node of currentNodes) {
    if (node.x === undefined || node.y === undefined) continue
    const r = getNodeRadius(node)
    const isHovered = node === hoveredNode
    const statusColor = node.status === 'healthy' ? '#53d769' : node.status === 'warning' ? '#ffc107' : '#e94560'

    ctx.beginPath()
    ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2)
    ctx.strokeStyle = statusColor
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.15 + 0.1 * Math.sin(Date.now() / 800)
    ctx.stroke()
    ctx.globalAlpha = 1

    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
    const bgColor = node.status === 'healthy' ? '#16213e' : node.status === 'warning' ? '#2a2000' : '#2a0010'
    ctx.fillStyle = bgColor
    ctx.fill()
    ctx.strokeStyle = isHovered ? '#fff' : statusColor
    ctx.lineWidth = isHovered ? 3 : 2
    ctx.stroke()

    if (node.isCluster) {
      ctx.beginPath()
      ctx.arc(node.x - r * 0.3, node.y - r * 0.3, 3, 0, Math.PI * 2)
      ctx.arc(node.x + r * 0.3, node.y - r * 0.3, 3, 0, Math.PI * 2)
      ctx.arc(node.x, node.y + r * 0.2, 3, 0, Math.PI * 2)
      ctx.fillStyle = statusColor
      ctx.fill()
    }

    ctx.font = '11px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ccc'
    ctx.fillText(node.label, node.x, node.y + r + 14)
  }

  ctx.restore()

  animFrameId = requestAnimationFrame(drawFrame)
}

function updateGraph(data: TopologyData) {
  if (!canvasRef.value || !containerRef.value) return

  const { clusteredNodes, clusteredEdges } = clusterNodes(data.nodes, data.edges)
  currentNodes = clusteredNodes
  currentEdges = clusteredEdges

  if (simulation) simulation.stop()

  simulation = d3.forceSimulation<ClusterNode>(currentNodes)
    .force('link', d3.forceLink<ClusterNode, RenderEdge>(currentEdges)
      .id(d => d.id)
      .distance(currentNodes.length > 50 ? 80 : 120))
    .force('charge', d3.forceManyBody<ClusterNode>()
      .strength(currentNodes.length > 50 ? -200 : -300))
    .force('center', d3.forceCenter<ClusterNode>(canvasWidth / 2, canvasHeight / 2))
    .force('collision', d3.forceCollide<ClusterNode>().radius(d => getNodeRadius(d) + 8))
    .alphaDecay(currentNodes.length > 50 ? 0.04 : 0.02)
    .velocityDecay(0.4)

  simulation.on('tick', () => {})
}

function resetZoom() {
  if (canvasRef.value && d3Zoom) {
    d3.select(canvasRef.value).transition().duration(500).call(d3Zoom.transform, d3.zoomIdentity)
  }
}

function toggleSimulation() {
  if (!simulation) return
  if (simulationRunning.value) {
    simulation.stop()
  } else {
    simulation.alpha(0.3).restart()
  }
  simulationRunning.value = !simulationRunning.value
}

function toggleCluster() {
  clusterEnabled.value = !clusterEnabled.value
}

function handleTopologyData(data: unknown) {
  updateGraph(data as TopologyData)
}

onMounted(() => {
  initCanvas()
  wsOn('topology', handleTopologyData)
  animFrameId = requestAnimationFrame(drawFrame)

  resizeObserver = new ResizeObserver(() => {
    initCanvas()
  })
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  simulation?.stop()
  cancelAnimationFrame(animFrameId)
  resizeObserver?.disconnect()
  wsOff('topology', handleTopologyData)
})
</script>

<style scoped>
.topology-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.topology-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  display: flex;
  gap: 8px;
}

.topology-canvas {
  display: block;
  width: 100%;
  height: calc(100% - 40px);
  margin-top: 40px;
  cursor: grab;
}

.topology-canvas:active {
  cursor: grabbing;
}

.topology-tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 12px;
  z-index: 20;
  min-width: 160px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.tooltip-title {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 0;
}

.tooltip-label {
  color: var(--text-secondary);
}

.tooltip-value {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
</style>
