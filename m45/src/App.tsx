import React, { useState, useEffect, useCallback, useRef } from 'react'
import ContainerList from './components/ContainerList'
import LogViewer from './components/LogViewer'
import Terminal from './components/Terminal'
import { ContainerInfo, LogEntry } from './types'
import './App.css'

const MAX_RENDER_LOGS = 3000

const App: React.FC = () => {
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [selectedContainer, setSelectedContainer] = useState<ContainerInfo | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [regexPattern, setRegexPattern] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regexError, setRegexError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'logs' | 'terminal'>('logs')
  const [error, setError] = useState<string | null>(null)
  const [droppedInfo, setDroppedInfo] = useState<{ totalDropped: number; maxLines: number } | null>(null)
  const logIdCounter = useRef(0)

  const fetchContainers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.dockerAPI.listContainers()
      setContainers(result)
    } catch (err: any) {
      setError(err.message || '无法连接到 Docker，请确保 Docker 正在运行')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContainers()
  }, [fetchContainers])

  useEffect(() => {
    if (!selectedContainer) return

    window.dockerAPI.removeLogListeners()

    window.dockerAPI.onLogBatch((data) => {
      const newEntries: LogEntry[] = data.entries.map((entry) => ({
        id: `log-${++logIdCounter.current}`,
        message: entry.log,
        isStderr: entry.isStderr,
        timestamp: Date.now(),
        matches: entry.matches,
      }))

      setLogs((prev) => {
        const combined = [...prev, ...newEntries]
        if (combined.length > MAX_RENDER_LOGS) {
          return combined.slice(combined.length - MAX_RENDER_LOGS)
        }
        return combined
      })
    })

    window.dockerAPI.onLogDropped((data) => {
      setDroppedInfo({ totalDropped: data.totalDropped, maxLines: data.maxLines })
    })

    window.dockerAPI.onLogError((err) => {
      setError(err)
      setIsStreaming(false)
    })

    window.dockerAPI.onLogEnd(() => {
      setIsStreaming(false)
    })

    window.dockerAPI.onStreamStarted(() => {
      setIsStreaming(true)
      setDroppedInfo(null)
    })

    setLogs([])
    setDroppedInfo(null)
    logIdCounter.current = 0
    window.dockerAPI.streamLogs(selectedContainer.Id, regexPattern || undefined, caseSensitive)

    return () => {
      window.dockerAPI.stopLogs(selectedContainer.Id)
      window.dockerAPI.removeLogListeners()
    }
  }, [selectedContainer, regexPattern, caseSensitive])

  const handleSelectContainer = (container: ContainerInfo) => {
    setSelectedContainer(container)
    setActiveTab('logs')
  }

  const handleClearLogs = () => {
    setLogs([])
    setDroppedInfo(null)
    if (selectedContainer) {
      window.dockerAPI.resetLogCount(selectedContainer.Id)
    }
  }

  const handleToggleStream = () => {
    if (isStreaming) {
      if (selectedContainer) {
        window.dockerAPI.stopLogs(selectedContainer.Id)
      }
      setIsStreaming(false)
    } else if (selectedContainer) {
      window.dockerAPI.streamLogs(selectedContainer.Id, regexPattern || undefined, caseSensitive)
    }
  }

  const handleExecCommand = async (command: string): Promise<{ stdout: string; stderr: string }> => {
    return await window.dockerAPI.execCommand(command)
  }

  const handleStartContainer = async (id: string) => {
    try {
      await window.dockerAPI.startContainer(id)
      fetchContainers()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleStopContainer = async (id: string) => {
    try {
      await window.dockerAPI.stopContainer(id)
      fetchContainers()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleRestartContainer = async (id: string) => {
    try {
      await window.dockerAPI.restartContainer(id)
      fetchContainers()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleRemoveContainer = async (id: string) => {
    if (window.confirm('确定要删除此容器吗？')) {
      try {
        await window.dockerAPI.removeContainer(id)
        if (selectedContainer?.Id === id) {
          setSelectedContainer(null)
        }
        fetchContainers()
      } catch (err: any) {
        setError(err.message)
      }
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🐳 Docker 容器日志监控器</h1>
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <ContainerList
            containers={containers}
            selectedContainerId={selectedContainer?.Id || null}
            onSelectContainer={handleSelectContainer}
            onRefresh={fetchContainers}
            isLoading={isLoading}
            onStart={handleStartContainer}
            onStop={handleStopContainer}
            onRestart={handleRestartContainer}
            onRemove={handleRemoveContainer}
          />
        </aside>

        <main className="main-content">
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              日志查看
            </button>
            <button
              className={`tab ${activeTab === 'terminal' ? 'active' : ''}`}
              onClick={() => setActiveTab('terminal')}
            >
              终端
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'logs' && (
              <LogViewer
                logs={logs}
                containerName={selectedContainer?.Names[0]?.replace('/', '') || null}
                isStreaming={isStreaming}
                onClear={handleClearLogs}
                onToggleStream={handleToggleStream}
                filterText={filterText}
                onFilterChange={setFilterText}
                regexPattern={regexPattern}
                onRegexChange={setRegexPattern}
                caseSensitive={caseSensitive}
                onCaseSensitiveChange={setCaseSensitive}
                regexError={regexError}
                onRegexError={setRegexError}
                droppedInfo={droppedInfo}
              />
            )}
            {activeTab === 'terminal' && <Terminal onCommand={handleExecCommand} />}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
