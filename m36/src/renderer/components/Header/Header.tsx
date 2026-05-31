import React from 'react'
import { Settings, Play, Square, Activity, Database, Wifi, WifiOff, AlertTriangle, Shield, FileText } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useIpc } from '@/hooks/useIpc'
import { useDemoData } from '@/hooks/useDemoData'
import { formatNumber, formatUptime } from '@/utils/format'

export const Header: React.FC = () => {
  const {
    setShowConfig,
    collectorStatus,
    demoMode,
    clearData,
    dropStats,
    setShowRulesPanel,
    setShowAuditPanel,
    securityAlerts,
  } = useStore()
  const { startCollector, stopCollector, hasElectron } = useIpc()
  const { startDemo, stopDemo } = useDemoData()

  const hasDrops = dropStats && (dropStats.kernel + dropStats.backpressure + dropStats.rateLimited > 0)
  const unreadAlerts = securityAlerts.length

  const handleStartStop = async () => {
    if (demoMode) {
      if (collectorStatus.running) {
        stopDemo()
      } else {
        clearData()
        startDemo()
      }
      return
    }

    if (collectorStatus.running) {
      await stopCollector()
    } else {
      clearData()
      const config = useStore.getState().config
      await startCollector(config)
    }
  }

  const uptime = collectorStatus.startTime
    ? formatUptime(Date.now() - collectorStatus.startTime)
    : '未运行'

  return (
    <header className="glass-panel border-b border-cyber-border px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-purple flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            {collectorStatus.running && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neon-green border-2 border-cyber-bg animate-pulse pulse-ring" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-purple glow-text">
              eBPF 系统调用审计平台
            </h1>
            <p className="text-xs text-gray-500 font-mono">
              {demoMode ? '演示模式' : '真实采集模式'}
              {hasElectron && !demoMode && (
                <span className="ml-2 text-neon-cyan">· eBPF 内核监控已就绪</span>
              )}
            </p>
          </div>
        </div>

        {collectorStatus.running && (
          <div className="flex items-center gap-6 ml-8 pl-8 border-l border-cyber-border">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-neon-cyan" />
              <span className="text-sm font-mono text-gray-400">
                事件: <span className="text-white font-semibold">{formatNumber(collectorStatus.eventCount)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {collectorStatus.connected ? (
                <Wifi className="w-4 h-4 text-neon-green" />
              ) : (
                <WifiOff className="w-4 h-4 text-neon-red" />
              )}
              <span className="text-sm font-mono text-gray-400">
                连接: <span className={collectorStatus.connected ? 'text-neon-green' : 'text-neon-red'}>
                  {collectorStatus.connected ? '正常' : '断开'}
                </span>
              </span>
            </div>
            <div className="text-sm font-mono text-gray-400">
              运行: <span className="text-white">{uptime}</span>
            </div>
            {hasDrops && (
              <div className="flex items-center gap-2 px-2 py-1 rounded bg-neon-red/10 border border-neon-red/30">
                <AlertTriangle className="w-4 h-4 text-neon-red animate-pulse" />
                <span className="text-sm font-mono text-neon-red">
                  丢失: 内核{formatNumber(dropStats!.kernel)} / 背压{formatNumber(dropStats!.backpressure)} / 限流{formatNumber(dropStats!.rateLimited)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowRulesPanel(true)}
          className="relative p-2.5 rounded-lg border border-cyber-border text-gray-400 hover:text-white hover:border-neon-cyan hover:bg-neon-cyan/10 transition-all"
          title="安全规则"
        >
          <Shield className="w-5 h-5" />
          {unreadAlerts > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neon-red text-white text-xs flex items-center justify-center animate-pulse">
              {unreadAlerts > 9 ? '9+' : unreadAlerts}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowAuditPanel(true)}
          className="p-2.5 rounded-lg border border-cyber-border text-gray-400 hover:text-white hover:border-neon-cyan hover:bg-neon-cyan/10 transition-all"
          title="审计日志"
        >
          <FileText className="w-5 h-5" />
        </button>
        <button
          onClick={handleStartStop}
          disabled={!demoMode && !hasElectron}
          className={`btn-neon flex items-center gap-2 ${
            collectorStatus.running
              ? 'border-neon-red/50 text-neon-red bg-neon-red/10 hover:bg-neon-red/20'
              : ''
          }`}
        >
          {collectorStatus.running ? (
            <>
              <Square className="w-4 h-4" /> 停止采集
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> 开始采集
            </>
          )}
        </button>
        <button
          onClick={() => setShowConfig(true)}
          className="p-2.5 rounded-lg border border-cyber-border text-gray-400 hover:text-white hover:border-neon-cyan hover:bg-neon-cyan/10 transition-all"
          title="配置"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
