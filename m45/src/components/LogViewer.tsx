import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { LogEntry, MatchPosition } from '../types'

interface LogViewerProps {
  logs: LogEntry[]
  containerName: string | null
  isStreaming: boolean
  onClear: () => void
  onToggleStream: () => void
  filterText: string
  onFilterChange: (text: string) => void
  regexPattern: string
  onRegexChange: (pattern: string) => void
  caseSensitive: boolean
  onCaseSensitiveChange: (value: boolean) => void
  regexError: string | null
  onRegexError: (error: string | null) => void
  droppedInfo: { totalDropped: number; maxLines: number } | null
}

const VISIBLE_LINE_HEIGHT = 20
const BUFFER_LINES = 20

const highlightMatches = (text: string, matches?: MatchPosition[]): React.ReactNode => {
  if (!matches || matches.length === 0) {
    return text
  }

  const parts: React.ReactNode[] = []
  let lastIndex = 0

  matches.forEach((match, idx) => {
    if (match.start > lastIndex) {
      parts.push(<span key={`text-${idx}`}>{text.slice(lastIndex, match.start)}</span>)
    }
    parts.push(
      <mark key={`match-${idx}`} className="log-highlight">
        {text.slice(match.start, match.end)}
      </mark>
    )
    lastIndex = match.end
  })

  if (lastIndex < text.length) {
    parts.push(<span key="text-end">{text.slice(lastIndex)}</span>)
  }

  return parts
}

const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  containerName,
  isStreaming,
  onClear,
  onToggleStream,
  filterText,
  onFilterChange,
  regexPattern,
  onRegexChange,
  caseSensitive,
  onCaseSensitiveChange,
  regexError,
  onRegexError,
  droppedInfo,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [isRegexMode, setIsRegexMode] = useState(false)

  const debouncedRegexChange = useCallback(
    (pattern: string) => {
      onRegexChange(pattern)
      if (pattern) {
        try {
          new RegExp(pattern)
          onRegexError(null)
        } catch (err: any) {
          onRegexError(err.message)
        }
      } else {
        onRegexError(null)
      }
    },
    [onRegexChange, onRegexError]
  )

  const filteredLogs = useMemo(() => {
    if (!filterText) return logs
    return logs.filter((log) =>
      log.message.toLowerCase().includes(filterText.toLowerCase())
    )
  }, [logs, filterText])

  const totalHeight = filteredLogs.length * VISIBLE_LINE_HEIGHT

  const [scrollTop, setScrollTop] = useState(0)

  const startIndex = Math.max(0, Math.floor(scrollTop / VISIBLE_LINE_HEIGHT) - BUFFER_LINES)
  const endIndex = Math.min(
    filteredLogs.length,
    Math.ceil((scrollTop + viewportHeight) / VISIBLE_LINE_HEIGHT) + BUFFER_LINES
  )

  const visibleLogs = useMemo(() => {
    return filteredLogs.slice(startIndex, endIndex)
  }, [filteredLogs, startIndex, endIndex])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (autoScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [logs.length])

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop: st, scrollHeight, clientHeight } = scrollContainerRef.current
      autoScrollRef.current = st + clientHeight >= scrollHeight - 50
      setScrollTop(st)
    }
  }, [])

  return (
    <div className="log-viewer">
      <div className="log-header">
        <div className="log-title">
          <h2>日志 - {containerName || '未选择容器'}</h2>
          <span className={`stream-status ${isStreaming ? 'active' : 'inactive'}`}>
            {isStreaming ? '● 实时流' : '○ 已暂停'}
          </span>
          <span className="log-count">{filteredLogs.length} 行</span>
        </div>
        <div className="log-controls">
          {droppedInfo && (
            <span className="drop-warning" title={`主进程已丢弃 ${droppedInfo.totalDropped} 条日志以防止内存溢出`}>
              ⚠ 已丢弃 {droppedInfo.totalDropped} 条
            </span>
          )}
          <div className="filter-group">
            <input
              type="text"
              placeholder={isRegexMode ? '正则表达式过滤...' : '过滤日志...'}
              value={isRegexMode ? regexPattern : filterText}
              onChange={(e) => isRegexMode ? debouncedRegexChange(e.target.value) : onFilterChange(e.target.value)}
              className={`filter-input ${regexError ? 'input-error' : ''} ${isRegexMode ? 'regex-mode' : ''}`}
              title={regexError || undefined}
            />
            <button
              className={`regex-toggle ${isRegexMode ? 'active' : ''}`}
              onClick={() => setIsRegexMode(!isRegexMode)}
              title={isRegexMode ? '关闭正则模式' : '开启正则模式（主进程预过滤）'}
            >
              .*
            </button>
            {isRegexMode && (
              <label className="case-sensitive-toggle" title="区分大小写">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => onCaseSensitiveChange(e.target.checked)}
                />
                Aa
              </label>
            )}
          </div>
          {regexError && <span className="regex-error" title={regexError}>✕ 正则错误</span>}
          <button onClick={onToggleStream} className={isStreaming ? 'pause-btn' : 'play-btn'}>
            {isStreaming ? '暂停' : '继续'}
          </button>
          <button onClick={onClear} className="clear-btn">
            清空
          </button>
        </div>
      </div>
      {isRegexMode && (
        <div className="regex-hint-bar">
          <span className="regex-hint">
            📝 正则模式：在 <strong>主进程</strong> 中预过滤，仅匹配的日志发送到渲染进程。匹配内容将高亮显示。
          </span>
        </div>
      )}
      <div
        className="log-content"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {filteredLogs.length === 0 ? (
          <div className="no-logs">
            {containerName ? (isRegexMode ? '没有匹配正则的日志' : '暂无日志输出') : '请选择一个容器查看日志'}
          </div>
        ) : (
          <div
            className="log-virtual-container"
            style={{
              height: totalHeight,
              position: 'relative',
            }}
          >
            <div
              className="log-virtual-content"
              style={{
                position: 'absolute',
                top: startIndex * VISIBLE_LINE_HEIGHT,
                left: 0,
                right: 0,
              }}
            >
              {visibleLogs.map((log) => (
                <div
                  key={log.id}
                  className={`log-line ${log.isStderr ? 'stderr' : 'stdout'}`}
                  style={{ height: VISIBLE_LINE_HEIGHT }}
                >
                  <pre>{highlightMatches(log.message, log.matches)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LogViewer
