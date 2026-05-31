import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Play, Pause, Download, Trash2, Search, X, AlertTriangle } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { formatTimestamp, getSyscallColor, getRetvalColor } from '@/utils/format'
import type { SyscallEvent } from '@shared/types'

const ITEM_HEIGHT = 28
const VISIBLE_BUFFER = 5

export const LogStream: React.FC = () => {
  const { events, clearData, setSelectedEvent, dropStats } = useStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  const filteredEvents = useMemo(() => {
    if (!filter) return events
    const lowerFilter = filter.toLowerCase()
    return events.filter((event) =>
      event.syscall.toLowerCase().includes(lowerFilter) ||
      event.comm.toLowerCase().includes(lowerFilter) ||
      event.pid.toString().includes(lowerFilter)
    )
  }, [events, filter])

  const displayEvents = useMemo(() => {
    return filteredEvents.slice(-2000)
  }, [filteredEvents])

  const totalHeight = displayEvents.length * ITEM_HEIGHT

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - VISIBLE_BUFFER)
    const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + VISIBLE_BUFFER * 2
    const endIndex = Math.min(displayEvents.length, startIndex + visibleCount)
    return { startIndex, endIndex }
  }, [scrollTop, containerHeight, displayEvents.length])

  const visibleItems = useMemo(() => {
    return displayEvents.slice(visibleRange.startIndex, visibleRange.endIndex)
  }, [displayEvents, visibleRange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    observer.observe(container)
    setContainerHeight(container.clientHeight)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = totalHeight
    }
  }, [totalHeight, autoScroll])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop: st } = containerRef.current
    setScrollTop(st)

    if (containerRef.current) {
      const { scrollHeight, clientHeight } = containerRef.current
      const isNearBottom = scrollHeight - st - clientHeight < ITEM_HEIGHT * 5
      if (!isNearBottom && autoScroll) {
        setAutoScroll(false)
      }
    }
  }, [autoScroll])

  const handleEventClick = (event: SyscallEvent) => {
    setSelectedEvent(event)
  }

  const handleExport = async () => {
    try {
      const data = JSON.stringify(displayEvents, null, 2)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `syscall-log-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  return (
    <div className="glass-panel p-4 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-lg font-semibold text-neon-yellow glow-text flex items-center gap-2">
          <span className="text-xl">📜</span>
          实时日志流
          <span className="text-xs font-normal text-gray-500 ml-2">
            ({displayEvents.length}/{events.length} 条)
          </span>
          {dropStats && (dropStats.kernel + dropStats.backpressure + dropStats.rateLimited > 0) && (
            <span className="text-xs font-normal text-neon-red ml-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              丢失: 内核{dropStats.kernel} / 背压{dropStats.backpressure} / 限流{dropStats.rateLimited}
            </span>
          )}
        </h3>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`p-2 rounded transition-colors ${
              showFilter ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="过滤"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-2 rounded transition-colors ${
              autoScroll ? 'bg-neon-green/20 text-neon-green' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={autoScroll ? '暂停滚动' : '自动滚动'}
          >
            {autoScroll ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={handleExport}
            className="p-2 rounded text-gray-500 hover:text-neon-cyan transition-colors"
            title="导出"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={clearData}
            className="p-2 rounded text-gray-500 hover:text-neon-red transition-colors"
            title="清空"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showFilter && (
        <div className="mb-3 flex items-center gap-2 flex-shrink-0">
          <div className="relative flex-1">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="过滤系统调用/进程名/PID..."
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 pl-8 text-sm font-mono focus:outline-none focus:border-neon-cyan transition-colors"
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-xs scanline relative bg-cyber-bg/50 rounded p-2"
        style={{ position: 'relative' }}
      >
        {displayEvents.length === 0 ? (
          <div className="text-gray-600 text-center py-8">
            {events.length === 0 ? '等待系统调用事件...' : '没有匹配的日志'}
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: visibleRange.startIndex * ITEM_HEIGHT,
                left: 0,
                right: 0,
              }}
            >
              {visibleItems.map((event, index) => {
                const actualIndex = visibleRange.startIndex + index
                return (
                  <div
                    key={`${event.timestamp}-${event.pid}-${actualIndex}`}
                    className="flex items-start gap-2 py-1 px-2 rounded hover:bg-cyber-border/30 cursor-pointer transition-colors group"
                    style={{ height: ITEM_HEIGHT }}
                    onClick={() => handleEventClick(event)}
                  >
                    <span className="text-gray-600 flex-shrink-0">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span
                      className="font-semibold flex-shrink-0 w-16"
                      style={{ color: getSyscallColor(event.syscall) }}
                    >
                      {event.syscall}
                    </span>
                    <span className="text-gray-400 flex-shrink-0 w-12">PID:{event.pid}</span>
                    <span className="text-gray-500 flex-shrink-0 w-20 truncate">{event.comm}</span>
                    <span className="text-gray-600 flex-shrink-0">
                      UID:{event.uid} GID:{event.gid}
                    </span>
                    <span
                      className="flex-shrink-0 ml-auto"
                      style={{ color: getRetvalColor(event.retval) }}
                    >
                      RET:{event.retval}
                    </span>
                    <span className="text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(event.duration / 1000).toFixed(1)}μs
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
