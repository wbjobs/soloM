import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'

interface PipelineRun {
  id: string
  pipelineName: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  trigger: string
  branch?: string
  createdAt: string
}

const statusColors: Record<string, string> = {
  success: '#238636',
  failed: '#da3633',
  running: '#d29922',
  pending: '#8b949e',
  cancelled: '#8b949e',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const styles = {
  page: { display: 'flex', flexDirection: 'column' as const, gap: '20px' },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: '24px', fontWeight: 600, margin: 0 },
  triggerBtn: {
    background: '#238636',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    background: '#161b22',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 16px',
    borderBottom: '1px solid #30363d',
    color: '#8b949e',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #21262d',
    fontSize: '14px',
  },
  runIdLink: {
    color: '#58a6ff',
    textDecoration: 'none',
    fontFamily: 'monospace',
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
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '12px',
    padding: '24px',
    width: '500px',
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  modalTitle: { fontSize: '18px', fontWeight: 600, margin: 0 },
  textarea: {
    width: '100%',
    minHeight: '200px',
    background: '#0d1117',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '12px',
    fontFamily: 'monospace',
    fontSize: '13px',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  inputField: {
    width: '100%',
    background: '#0d1117',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  btnSecondary: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  btnPrimary: {
    background: '#238636',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  error: {
    color: '#da3633',
    fontSize: '13px',
  },
}

export default function PipelineList() {
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [yamlInput, setYamlInput] = useState('')
  const [pipelineName, setPipelineName] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState('')
  const styleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    styleRef.current = document.createElement('style')
    styleRef.current.textContent = `@keyframes spin{to{transform:rotate(360deg)}}`
    document.head.appendChild(styleRef.current)
    return () => {
      if (styleRef.current) document.head.removeChild(styleRef.current)
    }
  }, [])

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/pipelines')
      const data = await res.json()
      setRuns(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRuns()
    const interval = setInterval(fetchRuns, 5000)
    return () => clearInterval(interval)
  }, [fetchRuns])

  const handleTrigger = async () => {
    setTriggering(true)
    setError('')
    try {
      const body: Record<string, string> = {
        pipelineName: pipelineName || 'manual-pipeline',
      }
      if (yamlInput) body.yaml = yamlInput
      const res = await fetch('/api/pipelines/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Trigger failed')
        return
      }
      setModalOpen(false)
      setYamlInput('')
      setPipelineName('')
      fetchRuns()
    } catch {
      setError('Network error')
    } finally {
      setTriggering(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.spinner}>
        <div style={styles.spinnerCircle} />
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.titleRow}>
        <h1 style={styles.title}>Pipeline Runs</h1>
        <button style={styles.triggerBtn} onClick={() => setModalOpen(true)}>
          Trigger Pipeline
        </button>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Run ID</th>
            <th style={styles.th}>Pipeline</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Trigger</th>
            <th style={styles.th}>Branch</th>
            <th style={styles.th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td style={styles.td}>
                <Link to={`/run/${run.id}`} style={styles.runIdLink}>
                  {run.id.slice(0, 8)}
                </Link>
              </td>
              <td style={styles.td}>{run.pipelineName}</td>
              <td style={styles.td}>
                <span style={styles.badge(run.status)}>{run.status}</span>
              </td>
              <td style={styles.td}>{run.trigger}</td>
              <td style={styles.td}>{run.branch || '—'}</td>
              <td style={styles.td}>{relativeTime(run.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {modalOpen && (
        <div style={styles.overlay} onClick={() => setModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Trigger Pipeline</h2>
            <input
              style={styles.inputField}
              placeholder="Pipeline name"
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
            />
            <textarea
              style={styles.textarea}
              placeholder="Pipeline YAML configuration..."
              value={yamlInput}
              onChange={(e) => setYamlInput(e.target.value)}
            />
            {error && <div style={styles.error}>{error}</div>}
            <div style={styles.modalActions}>
              <button style={styles.btnSecondary} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button style={styles.btnPrimary} onClick={handleTrigger} disabled={triggering}>
                {triggering ? 'Triggering...' : 'Trigger'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
