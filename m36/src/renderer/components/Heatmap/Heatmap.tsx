import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { formatTimestamp, getHeatmapColor, getSyscallColor } from '@/utils/format'
import type { HeatmapDataPoint } from '@shared/types'

export const Heatmap: React.FC = () => {
  const { heatmapData, setSelectedEvent } = useStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredCell, setHoveredCell] = useState<HeatmapDataPoint | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const rafIdRef = useRef<number>(0)
  const lastRenderTimeRef = useRef(0)
  const RENDER_THROTTLE_MS = 100

  const maxCount = useMemo(() => {
    if (!heatmapData) return 1
    return Math.max(...heatmapData.data.map((d) => d.count), 1)
  }, [heatmapData])

  const cellHeight = 28
  const yAxisWidth = 80
  const yAxisHeight = 30
  const xAxisHeight = 24

  const renderCanvas = useCallback(() => {
    if (!heatmapData || !canvasRef.current || !containerRef.current) return

    const now = performance.now()
    if (now - lastRenderTimeRef.current < RENDER_THROTTLE_MS) {
      rafIdRef.current = requestAnimationFrame(renderCanvas)
      return
    }
    lastRenderTimeRef.current = now

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = yAxisHeight + heatmapData.syscalls.length * cellHeight

    canvas.width = width * window.devicePixelRatio
    canvas.height = height * window.devicePixelRatio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    ctx.clearRect(0, 0, width, height)

    const drawableWidth = width - yAxisWidth
    const timeRange = heatmapData.timeRange[1] - heatmapData.timeRange[0]
    const cellWidth = drawableWidth / Math.ceil(timeRange / 1000)

    const dataMap = new Map<string, HeatmapDataPoint>()
    for (const point of heatmapData.data) {
      dataMap.set(`${point.timeBucket}:${point.syscall}`, point)
    }

    heatmapData.syscalls.forEach((syscall, rowIndex) => {
      const y = yAxisHeight + rowIndex * cellHeight

      ctx.fillStyle = getSyscallColor(syscall)
      ctx.font = '11px JetBrains Mono, monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(syscall, yAxisWidth - 8, y + cellHeight / 2)

      for (let colIndex = 0; colIndex < Math.ceil(timeRange / 1000); colIndex++) {
        const timeBucket = Math.floor(heatmapData.timeRange[0] / 1000) + colIndex
        const key = `${timeBucket}:${syscall}`
        const point = dataMap.get(key)
        const x = yAxisWidth + colIndex * cellWidth

        if (point) {
          ctx.fillStyle = getHeatmapColor(point.count, maxCount)
          ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2)

          if (point.count > maxCount * 0.6) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
            ctx.font = '10px JetBrains Mono, monospace'
            ctx.textAlign = 'center'
            ctx.fillText(point.count.toString(), x + cellWidth / 2, y + cellHeight / 2)
          }
        } else {
          ctx.fillStyle = 'rgba(26, 35, 53, 0.3)'
          ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2)
        }
      }
    })

    const labelCount = 6
    for (let i = 0; i <= labelCount; i++) {
      const ratio = i / labelCount
      const time = heatmapData.timeRange[0] + timeRange * ratio
      const x = yAxisWidth + drawableWidth * ratio

      ctx.fillStyle = '#6c757d'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(formatTimestamp(time), x, 8)

      ctx.beginPath()
      ctx.moveTo(x, xAxisHeight - 5)
      ctx.lineTo(x, yAxisHeight)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.moveTo(yAxisWidth, yAxisHeight)
    ctx.lineTo(width, yAxisHeight)
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
  }, [heatmapData, maxCount, cellHeight, yAxisWidth, yAxisHeight, xAxisHeight])

  useEffect(() => {
    if (!heatmapData) return

    rafIdRef.current = requestAnimationFrame(renderCanvas)

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [heatmapData, renderCanvas])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!heatmapData || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setMousePos({ x: e.clientX, y: e.clientY })

    if (x < yAxisWidth || y < yAxisHeight) {
      setHoveredCell(null)
      return
    }

    const timeRange = heatmapData.timeRange[1] - heatmapData.timeRange[0]
    const drawableWidth = rect.width - yAxisWidth
    const cellWidth = drawableWidth / Math.ceil(timeRange / 1000)

    const colIndex = Math.floor((x - yAxisWidth) / cellWidth)
    const rowIndex = Math.floor((y - yAxisHeight) / cellHeight)

    if (rowIndex >= 0 && rowIndex < heatmapData.syscalls.length) {
      const timeBucket = Math.floor(heatmapData.timeRange[0] / 1000) + colIndex
      const syscall = heatmapData.syscalls[rowIndex]

      const point = heatmapData.data.find(
        (d) => d.timeBucket === timeBucket && d.syscall === syscall
      )
      setHoveredCell(point || null)
    } else {
      setHoveredCell(null)
    }
  }

  const handleClick = () => {
    if (hoveredCell) {
      const event = useStore.getState().events.find(
        (e) =>
          Math.floor(e.timestamp / 1000) === hoveredCell.timeBucket &&
          e.syscall === hoveredCell.syscall
      )
      if (event) {
        setSelectedEvent(event)
      }
    }
  }

  if (!heatmapData) {
    return (
      <div className="glass-panel p-4 h-96 flex items-center justify-center">
        <div className="text-gray-500 text-center">
          <div className="text-4xl mb-2">📊</div>
          <div className="font-mono">等待热力图数据...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel p-4 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neon-cyan glow-text flex items-center gap-2">
          <span className="text-xl">🔥</span>
          系统调用热力图
        </h3>
        <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(180, 80%, 20%)' }} />
            <span>低频</span>
          </div>
          <div className="w-20 h-3 rounded-sm" style={{
            background: 'linear-gradient(to right, hsl(180, 80%, 20%), hsl(120, 80%, 35%), hsl(60, 80%, 40%), hsl(0, 80%, 50%))'
          }} />
          <div className="flex items-center gap-2">
            <span>高频</span>
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(0, 80%, 50%)' }} />
          </div>
        </div>
      </div>

      <div ref={containerRef} className="overflow-x-auto">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredCell(null)}
          onClick={handleClick}
          className="cursor-crosshair"
        />
      </div>

      {hoveredCell && (
        <div
          className="fixed z-50 glass-panel p-3 text-sm pointer-events-none animate-fade-in"
          style={{
            left: mousePos.x + 15,
            top: mousePos.y + 15,
            borderColor: getSyscallColor(hoveredCell.syscall),
          }}
        >
          <div className="font-mono space-y-1">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: getSyscallColor(hoveredCell.syscall) }}
              />
              <span className="font-semibold" style={{ color: getSyscallColor(hoveredCell.syscall) }}>
                {hoveredCell.syscall}
              </span>
            </div>
            <div className="text-gray-400">
              时间: {formatTimestamp(hoveredCell.timeBucket * 1000)}
            </div>
            <div className="text-gray-300">
              调用次数: <span className="text-white font-semibold">{hoveredCell.count}</span>
            </div>
            <div className="text-gray-300">
              平均耗时: <span className="text-white font-semibold">{(hoveredCell.avgDuration / 1000).toFixed(2)} μs</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
