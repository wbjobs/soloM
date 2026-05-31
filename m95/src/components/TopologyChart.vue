<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as d3 from 'd3'
import { dockerApi } from '../api/docker'
import type { TopologyData, TopologyNode, ContainerLink } from '../types'

const chartRef = ref<HTMLDivElement | null>(null)
const topologyData = ref<TopologyData>({ nodes: [], links: [] })
const refreshInterval = ref<number | null>(null)

const NODE_BASE_RADIUS = 18
const MAX_ADDITIONAL_RADIUS = 12

const nodeColor = (d: TopologyNode): string => {
  if (d.status !== 'running') return '#7f1d1d'
  if (d.cpu_percent > 80) return '#ef4444'
  if (d.cpu_percent > 50) return '#f59e0b'
  return '#065f46'
}

const nodeRadius = (d: TopologyNode): number => {
  return NODE_BASE_RADIUS + (Math.min(d.memory_percent, 80) / 80) * MAX_ADDITIONAL_RADIUS
}

const loadData = async () => {
  try {
    topologyData.value = await dockerApi.getTopology()
    renderChart()
  } catch (error) {
    console.error('Failed to load topology:', error)
  }
}

const renderChart = () => {
  if (!chartRef.value) return

  const container = chartRef.value
  d3.select(container).selectAll('*').remove()

  const nodeCount = topologyData.value.nodes.length
  const viewWidth = container.clientWidth
  const viewHeight = 500

  const virtualWidth = Math.max(viewWidth, Math.ceil(Math.sqrt(nodeCount)) * 100)
  const virtualHeight = Math.max(viewHeight, Math.ceil(Math.sqrt(nodeCount)) * 80)

  const canvas = d3.select(container)
    .append('canvas')
    .attr('width', virtualWidth * 2)
    .attr('height', virtualHeight * 2)
    .style('width', viewWidth + 'px')
    .style('height', viewHeight + 'px')
    .style('cursor', 'grab')
    .node() as HTMLCanvasElement

  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)

  interface SimNode extends TopologyNode {
    x: number
    y: number
    vx: number
    vy: number
    fx: number | null
    fy: number | null
    index?: number
  }

  const nodes: SimNode[] = topologyData.value.nodes.map(d => ({
    ...d,
    x: virtualWidth / 2 + (Math.random() - 0.5) * virtualWidth * 0.6,
    y: virtualHeight / 2 + (Math.random() - 0.5) * virtualHeight * 0.6,
    vx: 0,
    vy: 0,
    fx: null,
    fy: null,
  }))

  interface SimLink {
    source: SimNode | string
    target: SimNode | string
    link_type: string
    index?: number
  }

  const links: SimLink[] = topologyData.value.links.map(d => ({
    source: d.source,
    target: d.target,
    link_type: d.link_type,
  }))

  const adaptiveChargeStrength = nodeCount > 30 ? -400 - nodeCount * 2 : -300
  const adaptiveLinkDistance = nodeCount > 30 ? 80 + Math.sqrt(nodeCount) * 8 : 120
  const alphaDecay = nodeCount > 30 ? 0.04 : 0.02
  const velocityDecay = nodeCount > 30 ? 0.4 : 0.3

  const simulation = d3.forceSimulation<SimNode>(nodes)
    .force('link', d3.forceLink<SimNode, SimLink>(links)
      .id(d => d.id)
      .distance(adaptiveLinkDistance))
    .force('charge', d3.forceManyBody().strength(adaptiveChargeStrength))
    .force('center', d3.forceCenter(virtualWidth / 2, virtualHeight / 2))
    .force('collision', d3.forceCollide<SimNode>().radius(d => nodeRadius(d) + 8))
    .force('x', d3.forceX(virtualWidth / 2).strength(0.03))
    .force('y', d3.forceY(virtualHeight / 2).strength(0.03))
    .alphaDecay(alphaDecay)
    .velocityDecay(velocityDecay)
    .alpha(1)
    .stop()

  let currentTransform = d3.zoomIdentity

  const draw = () => {
    ctx.save()
    ctx.clearRect(0, 0, virtualWidth, virtualHeight)
    ctx.translate(currentTransform.x, currentTransform.y)
    ctx.scale(currentTransform.k, currentTransform.k)

    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.4
    for (const link of links) {
      const src = link.source as SimNode
      const tgt = link.target as SimNode
      if (src.x == null || tgt.x == null) continue
      ctx.beginPath()
      ctx.moveTo(src.x, src.y)
      ctx.lineTo(tgt.x, tgt.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    for (const node of nodes) {
      if (node.x == null) continue

      const r = nodeRadius(node)

      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = nodeColor(node)
      ctx.fill()
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 1.5
      ctx.stroke()

      const label = node.name.slice(0, 10)
      const fontSize = Math.max(9, Math.min(12, r * 0.7))
      ctx.font = `500 ${fontSize}px -apple-system, sans-serif`
      ctx.fillStyle = '#f8fafc'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      if (r >= 16) {
        ctx.fillText(label, node.x, node.y)
      } else {
        ctx.fillText(label, node.x, node.y + r + 10)
      }
    }

    ctx.restore()
  }

  const throttledDraw = (() => {
    let lastTime = 0
    const minInterval = nodeCount > 50 ? 32 : 16
    return () => {
      const now = Date.now()
      if (now - lastTime >= minInterval) {
        draw()
        lastTime = now
      }
    }
  })()

  simulation.on('tick', throttledDraw)
  simulation.restart()

  const findNode = (x: number, y: number): SimNode | null => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      if (n.x == null) continue
      const dx = x - n.x
      const dy = y - n.y
      const r = nodeRadius(n) + 4
      if (dx * dx + dy * dy < r * r) return n
    }
    return null
  }

  const screenToWorld = (clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    return [
      (sx - currentTransform.x) / currentTransform.k,
      (sy - currentTransform.y) / currentTransform.k
    ]
  }

  const tooltip = d3.select(container)
    .append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('pointer-events', 'none')

  let dragNode: SimNode | null = null
  let isPanning = false
  let panStartX = 0
  let panStartY = 0
  let panStartTx = 0
  let panStartTy = 0

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top

    const scaleFactor = event.deltaY > 0 ? 0.92 : 1.08
    const newK = Math.max(0.2, Math.min(5, currentTransform.k * scaleFactor))
    const ratio = newK / currentTransform.k

    currentTransform = d3.zoomIdentity
      .translate(
        mx - ratio * (mx - currentTransform.x),
        my - ratio * (my - currentTransform.y)
      )
      .scale(newK)

    draw()
  }, { passive: false })

  canvas.addEventListener('mousedown', (event) => {
    const [wx, wy] = screenToWorld(event.clientX, event.clientY)
    const node = findNode(wx, wy)

    if (node) {
      dragNode = node
      dragNode.fx = dragNode.x
      dragNode.fy = dragNode.y
      simulation.alphaTarget(0.15).restart()
      canvas.style.cursor = 'grabbing'
    } else {
      isPanning = true
      panStartX = event.clientX
      panStartY = event.clientY
      panStartTx = currentTransform.x
      panStartTy = currentTransform.y
      canvas.style.cursor = 'grabbing'
    }
  })

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect()

    if (dragNode) {
      const [wx, wy] = screenToWorld(event.clientX, event.clientY)
      dragNode.fx = wx
      dragNode.fy = wy
      return
    }

    if (isPanning) {
      const dx = event.clientX - panStartX
      const dy = event.clientY - panStartY
      currentTransform = d3.zoomIdentity
        .translate(panStartTx + dx, panStartTy + dy)
        .scale(currentTransform.k)
      draw()
      return
    }

    const [wx, wy] = screenToWorld(event.clientX, event.clientY)
    const node = findNode(wx, wy)
    if (node) {
      canvas.style.cursor = 'pointer'
      tooltip.transition().duration(150).style('opacity', 1)
      tooltip.html(`
        <div style="font-weight: 600; margin-bottom: 6px;">${node.name}</div>
        <div>状态: <span style="color: ${node.status === 'running' ? '#6ee7b7' : '#fca5a5'}">${node.status}</span></div>
        <div>CPU: ${node.cpu_percent.toFixed(1)}%</div>
        <div>内存: ${node.memory_percent.toFixed(1)}%</div>
      `)
        .style('left', (event.clientX - rect.left + 12) + 'px')
        .style('top', (event.clientY - rect.top - 8) + 'px')
    } else {
      canvas.style.cursor = 'grab'
      tooltip.transition().duration(300).style('opacity', 0)
    }
  })

  const endInteraction = () => {
    if (dragNode) {
      dragNode.fx = null
      dragNode.fy = null
      simulation.alphaTarget(0)
      dragNode = null
    }
    isPanning = false
    canvas.style.cursor = 'grab'
  }

  canvas.addEventListener('mouseup', endInteraction)
  canvas.addEventListener('mouseleave', () => {
    endInteraction()
    tooltip.transition().duration(200).style('opacity', 0)
  })
}

onMounted(async () => {
  await loadData()
  refreshInterval.value = window.setInterval(loadData, 8000)
  window.addEventListener('resize', renderChart)
})

onUnmounted(() => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
  window.removeEventListener('resize', renderChart)
})
</script>

<template>
  <div ref="chartRef" class="chart-container" style="position: relative; overflow: hidden;"></div>
  <div class="legend">
    <div class="legend-item">
      <span class="legend-color" style="background: #065f46;"></span>
      <span>CPU 正常</span>
    </div>
    <div class="legend-item">
      <span class="legend-color" style="background: #f59e0b;"></span>
      <span>CPU 中等</span>
    </div>
    <div class="legend-item">
      <span class="legend-color" style="background: #ef4444;"></span>
      <span>CPU 高负载</span>
    </div>
    <div class="legend-item">
      <span class="legend-color" style="background: #7f1d1d;"></span>
      <span>已停止</span>
    </div>
    <div class="legend-item" style="margin-left: 20px;">
      <span style="color: #94a3b8;">节点大小: 内存使用率</span>
    </div>
    <div class="legend-item" style="margin-left: 10px;">
      <span style="color: #94a3b8;">🖱️ 滚轮缩放 / 拖拽平移 / 点击节点拖动</span>
    </div>
  </div>
</template>
