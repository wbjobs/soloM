import React, { useEffect, useState, useRef, useMemo } from 'react'
import { X, Search, Download, FileText, AlertTriangle, CheckCircle, Shield } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useIpc } from '@/hooks/useIpc'
import { formatTimestamp } from '@/utils/format'
import type { AuditLogEntry } from '@shared/types'

const SEVERITY_COLORS: Record<string, string> = {
  low: 'text-neon-cyan',
  medium: 'text-neon-yellow',
  high: 'text-neon-red',
  critical: 'text-red-500',
}

const SEVERITY_BG: Record<string, string> = {
  low: 'bg-neon-cyan/20 border-neon-cyan/30',
  medium: 'bg-neon-yellow/20 border-neon-yellow/30',
  high: 'bg-neon-red/20 border-neon-red/30',
  critical: 'bg-red-500/20 border-red-500/30',
}

const ITEM_HEIGHT = 32
const VISIBLE_BUFFER = 10

export const AuditPanel: React.FC = () => {
  const { showAuditPanel, setShowAuditPanel, auditLogs, setAuditLogs, auditStats, setAuditStats } = useStore()
  const { getAuditLogs, getAuditStats, acknowledgeAllAlerts } = useIpc()
  const containerRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [showAlertOnly, setShowAlertOnly] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  const loadLogs = async () => {
    setIsLoading(true)
    try {
      const logs = await getAuditLogs({ limit: 500 })
      setAuditLogs(logs)
      const stats = await getAuditStats()
      setAuditStats(stats)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (showAuditPanel) {
      loadLogs()
    }
  }, [showAuditPanel])

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
  }, [showAuditPanel])

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (severityFilter !== 'all' && log.severity !== severityFilter) {
        return false
      }
      if (showAlertOnly && !log.alertTriggered) {
        return false
      }
      if (filter) {
        const searchLower = filter.toLowerCase()
        return (
          log.event.syscall.toLowerCase().includes(searchLower) ||
          log.event.comm.toLowerCase().includes(searchLower) ||
          log.ruleName?.toLowerCase().includes(searchLower) ||
          log.event.pid.toString().includes(searchLower)
        )
      }
      return true
    })
  }, [auditLogs, filter, severityFilter, showAlertOnly])

  const totalHeight = filteredLogs.length * ITEM_HEIGHT

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - VISIBLE_BUFFER)
    const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + VISIBLE_BUFFER * 2
    const endIndex = Math.min(filteredLogs.length, startIndex + visibleCount)
    return { startIndex, endIndex }
  }, [scrollTop, containerHeight, filteredLogs.length])

  const visibleItems = useMemo(() => {
    return filteredLogs.slice(visibleRange.startIndex, visibleRange.endIndex)
  }, [filteredLogs, visibleRange])

  const handleScroll = () => {
    if (!containerRef.current) return
    setScrollTop(containerRef.current.scrollTop)
  }

  const handleExport = () => {
    const data = JSON.stringify(filteredLogs, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAcknowledgeAll = async () => {
    await acknowledgeAllAlerts()
    loadLogs()
  }

  if (!showAuditPanel) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-panel w-full max-w-5xl max-h-[85vh] flex flex-col m-4 animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-cyber-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-neon-cyan" />
            <div>
              <h2 className="text-xl font-bold text-white">审计日志</h2>
              <p className="text-xs text-gray-500">
                {auditStats ? (
                  <span>
                    总计 {auditStats.totalLogs} 条记录 · {auditStats.unacknowledgedAlerts} 条未确认告警
                  </span>
                ) : (
                  '加载中...'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAuditPanel(false)}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-cyber-border/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {auditStats && auditStats.severityCounts.length > 0 && (
          <div className="px-4 py-2 border-b border-cyber-border flex items-center gap-4 flex-shrink-0">
            <span className="text-xs text-gray-500">告警统计:</span>
            {auditStats.severityCounts.map((sc) => (
              <span
                key={sc.severity}
                className={`text-xs px-2 py-0.5 rounded border ${SEVERITY_BG[sc.severity] || ''} ${SEVERITY_COLORS[sc.severity] || ''}`}
              >
                {sc.severity}: {sc.count}
              </span>
            ))}
            {auditStats.unacknowledgedAlerts > 0 && (
              <button
                onClick={handleAcknowledgeAll}
                className="ml-auto text-xs text-neon-cyan hover:text-neon-cyan/80 transition-colors"
              >
                全部确认
              </button>
            )}
          </div>
        )}

        <div className="p-4 border-b border-cyber-border flex items-center gap-3 flex-shrink-0">
          <div className="relative flex-1">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="搜索系统调用/进程名/规则名/PID..."
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 pl-9 text-sm focus:outline-none focus:border-neon-cyan transition-colors"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-sm focus:outline-none focus:border-neon-cyan"
          >
            <option value="all">全部级别</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAlertOnly}
              onChange={(e) => setShowAlertOnly(e.target.checked)}
              className="w-4 h-4 rounded border-cyber-border bg-cyber-bg text-neon-cyan"
            />
            <span className="text-sm text-gray-400">仅告警</span>
          </label>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded border border-cyber-border text-gray-400 hover:text-white hover:border-neon-cyan transition-colors"
          >
            <Download className="w-4 h-4" />
            导出
          </button>
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded border border-cyber-border text-gray-400 hover:text-white hover:border-neon-cyan transition-colors disabled:opacity-50"
          >
            {isLoading ? '刷新中...' : '刷新'}
          </button>
        </div>

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto font-mono text-xs bg-cyber-bg/30"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                {isLoading ? (
                  <div className="animate-pulse">加载中...</div>
                ) : (
                  <>
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>暂无审计日志</p>
                    <p className="text-xs mt-1">当安全规则匹配时会记录审计日志</p>
                  </>
                )}
              </div>
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
                {visibleItems.map((log, index) => {
                  const actualIndex = visibleRange.startIndex + index
                  return (
                    <LogRow key={log.id} log={log} index={actualIndex} />
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-cyber-border flex-shrink-0 text-xs text-gray-500 text-center">
          显示 {filteredLogs.length} 条记录 / 共 {auditLogs.length} 条
        </div>
      </div>
    </div>
  )
}

const LogRow: React.FC<{ log: AuditLogEntry; index: number }> = ({ log }) => {
  return (
    <div
      className={`flex items-center gap-2 px-3 border-b border-cyber-border/30 hover:bg-cyber-border/20 transition-colors ${
        log.alertTriggered ? 'bg-neon-red/5' : ''
      }`}
      style={{ height: ITEM_HEIGHT }}
    >
      <span className="text-gray-600 w-36 flex-shrink-0">
        {formatTimestamp(log.timestamp)}
      </span>

      {log.severity ? (
        <span
          className={`w-16 text-center text-xs px-1 py-0.5 rounded border flex-shrink-0 ${
            SEVERITY_BG[log.severity] || ''
          } ${SEVERITY_COLORS[log.severity] || 'text-gray-500'}`}
        >
          {log.severity}
        </span>
      ) : (
        <span className="w-16 flex-shrink-0" />
      )}

      {log.alertTriggered ? (
        <AlertTriangle className="w-4 h-4 text-neon-red flex-shrink-0" />
      ) : log.ruleId ? (
        <Shield className="w-4 h-4 text-neon-cyan flex-shrink-0" />
      ) : (
        <CheckCircle className="w-4 h-4 text-gray-600 flex-shrink-0" />
      )}

      <span className="text-neon-cyan font-semibold w-16 truncate flex-shrink-0">
        {log.event.syscall}
      </span>

      <span className="text-gray-400 w-20 truncate flex-shrink-0">
        {log.event.comm}
      </span>

      <span className="text-gray-600 w-16 flex-shrink-0">
        PID:{log.event.pid}
      </span>

      {log.ruleName && (
        <span className="text-neon-yellow flex-1 truncate">
          规则: {log.ruleName}
        </span>
      )}

      {!log.ruleName && (
        <span className="text-gray-600 flex-1 truncate">
          UID:{log.event.uid} GID:{log.event.gid} RET:{log.event.retval}
        </span>
      )}
    </div>
  )
}
