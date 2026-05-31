import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'

interface CacheHitDetail {
  key: string
  path: string
  hit: boolean
  hash: string
  volumeName: string
}

interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  details: CacheHitDetail[]
}

interface StepRun {
  name: string
  image: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  startedAt?: string
  finishedAt?: string
  exitCode?: number
}

interface PipelineRun {
  id: string
  pipelineName: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  trigger: string
  branch?: string
  commit?: string
  steps: StepRun[]
  cacheStats?: CacheStats
  startedAt?: string
  finishedAt?: string
  createdAt: string
}

interface LogEntry {
  runId: string
  stepName: string
  timestamp: string
  stream: 'stdout' | 'stderr'
  data: string
}

const statusColors: Record<string, string> = {
  success: '#238636',
  failed: '#da3633',
  running: '#d29922',
  pending: '#8b949e',
  cancelled: '#8b949e',
  skipped: '#8b949e',
}

function formatDuration(start?: string, end?: string): string {
  if (!start) return '—'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const diff = Math.floor((e - s) / 1000)
  if (diff < 60) return `${diff}s`
  const m = Math.floor(diff / 60)
  const sec = diff % 60
  return `${m}m ${sec}s`
}

function StepIcon({ status }: { status: string }) {
  const base: React.CSSProperties = {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 700,
    flexShrink: 0,
  }

  switch (status) {
    case 'success':
      return <div style={{ ...base, background: '#238636', color: '#fff' }}>&#10003;</div>
    case 'failed':
      return <div style={{ ...base, background: '#da3633', color: '#fff' }}>&#10007;</div>
    case 'running':
      return <div style={{ ...base, background: '#d29922', color: '#fff', animation: 'pulse 1.5s ease-in-out infinite' }}>&#9679;</div>
    case 'skipped':
      return <div style={{ ...base, background: '#30363d', color: '#8b949e' }}>&#8212;</div>
    default:
      return <div style={{ ...base, background: '#30363d', color: '#8b949e' }}>&#9675;</div>
  }
}

function CachePanel({ cacheStats }: { cacheStats?: CacheStats }) {
  if (!cacheStats || cacheStats.details.length === 0) {
    return null
  }

  const total = cacheStats.hits + cacheStats.misses
  const hitPercent = total > 0 ? Math.round(cacheStats.hitRate * 100) : 0

  return (
    <div style={s.card}>
      <h2 style={s.cardTitle}>Cache Hits</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div style={{ fontSize: '48px', fontWeight: 700, color: hitPercent >= 50 ? '#3fb950' : '#d29922' }}>
            {hitPercent}%
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '8px', fontSize: '14px' }}>
              <span style={{ color: '#3fb950' }}>{cacheStats.hits} hits</span>
              <span style={{ color: '#8b949e' }}>/</span>
              <span style={{ color: '#d29922' }}>{cacheStats.misses} misses</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#30363d', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${hitPercent}%`,
                  height: '100%',
                  background: hitPercent >= 50 ? '#3fb950' : '#d29922',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {cacheStats.details.map((d) => (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#fff',
                  background: d.hit ? '#238636' : '#d29922',
                }}
              >
                {d.hit ? 'HIT' : 'MISS'}
              </span>
              <span style={{ color: '#c9d1d9', fontWeight: 500 }}>{d.key}</span>
              <span style={{ color: '#8b949e' }}>&rarr;</span>
              <span style={{ color: '#8b949e', fontFamily: 'monospace' }}>{d.path}</span>
              <span style={{ color: '#6e7681', fontFamily: 'monospace', fontSize: '12px', marginLeft: 'auto' }}>
                {d.hash.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const s = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '24px' },
  backLink: {
    color: '#58a6ff',
    textDecoration: 'none',
    fontSize: '14px',
  },
  header: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '8px',
    padding: '20px 24px',
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '24px',
    alignItems: 'center',
  },
  headerMain: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flex: 1,
    minWidth: '200px',
  },
  headerTitle: { fontSize: '22px', fontWeight: 600, margin: 0 },
  headerMeta: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap' as const,
    color: '#8b949e',
    fontSize: '13px',
  },
  badge: (status: string) => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#fff',
    background: statusColors[status] || '#8b949e',
  }),
  card: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '8px',
    padding: '20px 24px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 16px 0',
    color: '#c9d1d9',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  stepRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    position: 'relative' as const,
  },
  stepLine: (isLast: boolean) => ({
    position: 'absolute' as const,
    left: '13px',
    top: '28px',
    width: '2px',
    height: isLast ? '0px' : 'calc(100% - 12px)',
    background: '#30363d',
  }),
  stepContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    paddingBottom: '20px',
    flex: 1,
  },
  stepName: { fontSize: '14px', fontWeight: 500, color: '#c9d1d9' },
  stepMeta: { fontSize: '12px', color: '#8b949e' },
  logPanel: {
    background: '#0d1117',
    borderRadius: '8px',
    border: '1px solid #30363d',
    padding: '16px',
    maxHeight: '500px',
    overflowY: 'auto' as const,
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    fontSize: '13px',
    lineHeight: '1.6',
  },
  logLineStep: { color: '#56d4dd' },
  logLineText: { color: '#3fb950' },
  spinner: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '60px',
  },
  spinnerCircle: {
    width: '32px',
    height: '32px',
    border: '3px solid #30363d',
    borderTopColor: '#58a6ff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
}

export default function RunDetail() {
  const { id: runId } = useParams<{ id: string }>()
  const [run, setRun] = useState<PipelineRun | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    styleRef.current = document.createElement('style')
    styleRef.current.textContent = `
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
    `
    document.head.appendChild(styleRef.current)
    return () => {
      if (styleRef.current) document.head.removeChild(styleRef.current)
    }
  }, [])

  const fetchRun = useCallback(async () => {
    if (!runId) return
    try {
      const res = await fetch(`/api/pipelines/${runId}`)
      if (res.ok) {
        const data = await res.json()
        setRun(data)
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    fetchRun()
    const interval = setInterval(fetchRun, 5000)
    return () => clearInterval(interval)
  }, [fetchRun])

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    fetch(`/api/pipelines/${runId}/logs`)
      .then((res) => res.json())
      .then((data: LogEntry[]) => {
        if (!cancelled) setLogs(data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [runId])

  useEffect(() => {
    if (!runId) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', runId }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'log' && msg.data) {
          setLogs((prev) => [...prev, msg.data])
        }
        if (msg.type === 'step-status' && msg.data) {
          setRun((prev) => {
            if (!prev) return prev
            const steps = prev.steps.map((step) =>
              step.name === msg.data.stepName ? { ...step, status: msg.data.status } : step
            )
            return { ...prev, steps }
          })
        }
        if (msg.type === 'run-status' && msg.data) {
          setRun((prev) =>
            prev ? { ...prev, status: msg.data.status, cacheStats: msg.data.cacheStats || prev.cacheStats } : prev
          )
          if (msg.data.status === 'success' || msg.data.status === 'failed') {
            ws.close()
            fetchRun()
          }
        }
      } catch {
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [runId, fetchRun])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  if (loading || !run) {
    return (
      <div style={s.spinner}>
        <div style={s.spinnerCircle} />
      </div>
    )
  }

  return (
    <div style={s.page}>
      <Link to="/" style={s.backLink}>&larr; Back to Pipelines</Link>

      <div style={s.header}>
        <div style={s.headerMain}>
          <h1 style={s.headerTitle}>{run.pipelineName}</h1>
          <div style={s.headerMeta}>
            <span>Trigger: {run.trigger}</span>
            {run.branch && <span>Branch: {run.branch}</span>}
            {run.commit && <span>Commit: {run.commit.slice(0, 8)}</span>}
            <span>Duration: {formatDuration(run.startedAt, run.finishedAt)}</span>
          </div>
        </div>
        <span style={s.badge(run.status)}>{run.status}</span>
      </div>

      <CachePanel cacheStats={run.cacheStats} />

      <div style={s.card}>
        <h2 style={s.cardTitle}>Steps</h2>
        <div style={s.timeline}>
          {run.steps.map((step, i) => (
            <div key={step.name} style={s.stepRow}>
              <StepIcon status={step.status} />
              {i < run.steps.length - 1 && <div style={s.stepLine(i === run.steps.length - 1)} />}
              <div style={s.stepContent}>
                <div style={s.stepName}>{step.name}</div>
                <div style={s.stepMeta}>
                  {step.image} &middot; {formatDuration(step.startedAt, step.finishedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.card}>
        <h2 style={s.cardTitle}>Logs</h2>
        <div style={s.logPanel} ref={logRef}>
          {logs.length === 0 && <span style={{ color: '#8b949e' }}>No logs yet...</span>}
          {logs.map((log, i) => (
            <div key={i}>
              <span style={s.logLineStep}>[{log.stepName}] </span>
              <span style={s.logLineText}>{log.data}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
