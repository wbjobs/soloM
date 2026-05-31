<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as d3 from 'd3'
import { dockerApi } from '../api/docker'
import type { MemoryHistoryPoint } from '../types'

const chartRef = ref<HTMLDivElement | null>(null)
const memoryData = ref<MemoryHistoryPoint[]>([])
const refreshInterval = ref<number | null>(null)

const colors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16'
]

const loadData = async () => {
  try {
    memoryData.value = await dockerApi.getMemoryHistory()
    renderChart()
  } catch (error) {
    console.error('Failed to load memory history:', error)
  }
}

const renderChart = () => {
  if (!chartRef.value) return

  const container = chartRef.value
  container.innerHTML = ''

  const margin = { top: 20, right: 120, bottom: 30, left: 60 }
  const width = container.clientWidth - margin.left - margin.right
  const height = 400 - margin.top - margin.bottom

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  const containerGroups = d3.group(memoryData.value, d => d.container_id)
  const containerNames = new Map(
    memoryData.value.map(d => [d.container_id, d.container_name])
  )

  if (containerGroups.size === 0) {
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .text('正在收集数据，请稍候...')
    return
  }

  const x = d3.scaleLinear()
    .domain(d3.extent(memoryData.value, d => d.timestamp) as [number, number])
    .range([0, width])

  const y = d3.scaleLinear()
    .domain([0, d3.max(memoryData.value, d => d.memory_usage) || 100])
    .nice()
    .range([height, 0])

  const xAxis = d3.axisBottom(x)
    .ticks(5)
    .tickFormat(d => {
      const date = new Date(d * 1000)
      return date.toLocaleTimeString()
    })

  const yAxis = d3.axisLeft(y)
    .ticks(5)
    .tickFormat(d => {
      const bytes = d as number
      if (bytes === 0) return '0'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
    })

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .attr('color', '#64748b')
    .call(xAxis)

  svg.append('g')
    .attr('color', '#64748b')
    .call(yAxis)

  const line = d3.line<MemoryHistoryPoint>()
    .x(d => x(d.timestamp))
    .y(d => y(d.memory_usage))
    .curve(d3.curveMonotoneX)

  let colorIndex = 0
  containerGroups.forEach((points, containerId) => {
    const color = colors[colorIndex % colors.length]
    colorIndex++

    const sortedPoints = points.sort((a, b) => a.timestamp - b.timestamp)

    svg.append('path')
      .datum(sortedPoints)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('d', line)

    const lastPoint = sortedPoints[sortedPoints.length - 1]
    if (lastPoint) {
      svg.append('circle')
        .attr('cx', x(lastPoint.timestamp))
        .attr('cy', y(lastPoint.memory_usage))
        .attr('r', 4)
        .attr('fill', color)

      svg.append('text')
        .attr('x', x(lastPoint.timestamp) + 8)
        .attr('y', y(lastPoint.memory_usage) + 4)
        .attr('fill', color)
        .attr('font-size', '11px')
        .text(containerNames.get(containerId) || containerId.slice(0, 8))
    }
  })

  const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0)

  svg.on('mousemove', (event) => {
    const [mouseX] = d3.pointer(event)
    const timestamp = x.invert(mouseX)

    let closestPoint: MemoryHistoryPoint | null = null
    let closestDist = Infinity

    memoryData.value.forEach(point => {
      const dist = Math.abs(point.timestamp - timestamp)
      if (dist < closestDist) {
        closestDist = dist
        closestPoint = point
      }
    })

    if (closestPoint && closestDist < 5) {
      tooltip.transition()
        .duration(100)
        .style('opacity', 1)
      tooltip.html(`
        <div style="font-weight: 600; margin-bottom: 8px;">${closestPoint.container_name}</div>
        <div>时间: ${new Date(closestPoint.timestamp * 1000).toLocaleTimeString()}</div>
        <div>内存: ${formatBytes(closestPoint.memory_usage)}</div>
      `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
    } else {
      tooltip.transition()
        .duration(200)
        .style('opacity', 0)
    }
  })
  .on('mouseout', () => {
    tooltip.transition()
      .duration(200)
      .style('opacity', 0)
  })
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(async () => {
  await loadData()
  refreshInterval.value = window.setInterval(loadData, 3000)
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
  <div ref="chartRef" class="chart-container"></div>
  <div style="margin-top: 12px; padding: 12px; background: #0f172a; border-radius: 8px; font-size: 13px; color: #94a3b8;">
    <strong>💡 内存泄漏检测提示:</strong> 观察内存曲线是否持续上升而不回落。持续增长的趋势可能表明存在内存泄漏问题。
  </div>
</template>
