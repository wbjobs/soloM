import React, { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { useIpc } from '@/hooks/useIpc'
import { useDemoData } from '@/hooks/useDemoData'
import { Header } from '@/components/Header'
import { StatsCard } from '@/components/StatsCard'
import { Heatmap } from '@/components/Heatmap'
import { ProcessTree } from '@/components/ProcessTree'
import { LogStream } from '@/components/LogStream'
import { ConfigPanel } from '@/components/ConfigPanel'
import { RulesPanel } from '@/components/RulesPanel'
import { AuditPanel } from '@/components/AuditPanel'
import { EventDetail } from '@/components/EventDetail'

const Dashboard: React.FC = () => {
  const { collectorStatus, demoMode } = useStore()
  const { hasElectron } = useIpc()
  const { startDemo } = useDemoData()

  useEffect(() => {
    if (demoMode && !collectorStatus.running) {
      startDemo()
    }
  }, [demoMode, collectorStatus.running, startDemo])

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-hidden">
      <StatsCard />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <div className="flex-shrink-0">
            <Heatmap />
          </div>
          <div className="flex-1 min-h-0">
            <LogStream />
          </div>
        </div>
        <div className="lg:col-span-1 min-h-0">
          <ProcessTree />
        </div>
      </div>

      {!hasElectron && !demoMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 glass-panel px-4 py-3 text-sm text-neon-yellow border-neon-yellow/30">
          ⚠️ 当前不在 Electron 环境中，已自动切换到演示模式
        </div>
      )}
    </div>
  )
}

const App: React.FC = () => {
  const { error, setError } = useStore()

  useIpc()
  useDemoData()

  return (
    <div className="h-screen w-screen bg-cyber-bg flex flex-col overflow-hidden matrix-bg">
      <Header />

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/config" element={<Dashboard />} />
        </Routes>
      </main>

      <ConfigPanel />
      <RulesPanel />
      <AuditPanel />
      <EventDetail />

      {error && (
        <div className="fixed top-20 right-4 glass-panel border-neon-red/50 bg-neon-red/10 p-4 max-w-md animate-fade-in z-50">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-neon-red/20 flex items-center justify-center flex-shrink-0">
              <span className="text-neon-red text-lg">⚠️</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-neon-red mb-1">错误</h4>
              <p className="text-sm text-gray-300">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
