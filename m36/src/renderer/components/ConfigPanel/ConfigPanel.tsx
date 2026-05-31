import React, { useState } from 'react'
import { X, Save, Play, Square, Settings, Eye, EyeOff } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useIpc } from '@/hooks/useIpc'
import { useDemoData } from '@/hooks/useDemoData'
import { DEFAULT_CONFIG } from '@shared/types'
import type { AppConfig } from '@shared/types'

const AVAILABLE_SYSCALLS = [
  'open', 'openat', 'execve', 'execveat', 'read', 'write', 'close',
  'fork', 'vfork', 'clone', 'connect', 'accept', 'bind', 'listen',
  'socket', 'mmap', 'munmap', 'brk', 'exit', 'exit_group',
]

export const ConfigPanel: React.FC = () => {
  const { showConfig, setShowConfig, config, setConfig, collectorStatus, demoMode, setDemoMode, clearData } = useStore()
  const { startCollector, stopCollector, hasElectron } = useIpc()
  const { startDemo, stopDemo } = useDemoData()
  const [localConfig, setLocalConfig] = useState<AppConfig>(config)
  const [isSaving, setIsSaving] = useState(false)

  if (!showConfig) return null

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await setConfig(localConfig)
      setShowConfig(false)
    } finally {
      setIsSaving(false)
    }
  }

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
      await startCollector(localConfig)
    }
  }

  const toggleSyscall = (syscall: string) => {
    const current = localConfig.monitoredSyscalls
    const next = current.includes(syscall)
      ? current.filter((s) => s !== syscall)
      : [...current, syscall]
    setLocalConfig({ ...localConfig, monitoredSyscalls: next })
  }

  const selectAll = () => {
    setLocalConfig({ ...localConfig, monitoredSyscalls: [...AVAILABLE_SYSCALLS] })
  }

  const clearAll = () => {
    setLocalConfig({ ...localConfig, monitoredSyscalls: [] })
  }

  const resetDefault = () => {
    setLocalConfig(DEFAULT_CONFIG)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col m-4">
        <div className="flex items-center justify-between p-4 border-b border-cyber-border flex-shrink-0">
          <h2 className="text-xl font-bold text-neon-cyan glow-text flex items-center gap-2">
            <Settings className="w-5 h-5" />
            配置管理
          </h2>
          <button
            onClick={() => setShowConfig(false)}
            className="p-2 rounded hover:bg-cyber-border text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="flex items-center justify-between p-3 bg-cyber-bg rounded-lg border border-cyber-border">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDemoMode(!demoMode)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  demoMode
                    ? 'bg-neon-yellow/20 text-neon-yellow border border-neon-yellow/50'
                    : 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                }`}
              >
                {demoMode ? (
                  <span className="flex items-center gap-1">
                    <Eye className="w-4 h-4" /> 演示模式
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <EyeOff className="w-4 h-4" /> 真实采集
                  </span>
                )}
              </button>
              <span className="text-sm text-gray-500">
                {demoMode
                  ? '使用模拟数据进行演示'
                  : hasElectron
                    ? '使用 eBPF 采集真实系统调用'
                    : '需要在 Electron 环境中运行'}
              </span>
            </div>
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
          </div>

          {collectorStatus.running && (
            <div className="p-3 rounded-lg bg-neon-green/10 border border-neon-green/30">
              <div className="flex items-center gap-2 text-neon-green">
                <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse pulse-ring" />
                <span className="font-medium">采集器正在运行</span>
                <span className="ml-auto text-sm font-mono">
                  已采集 {collectorStatus.eventCount} 个事件
                </span>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300">监控的系统调用</h3>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs px-2 py-1 rounded bg-cyber-border hover:bg-cyber-border/80 transition-colors"
                >
                  全选
                </button>
                <button
                  onClick={clearAll}
                  className="text-xs px-2 py-1 rounded bg-cyber-border hover:bg-cyber-border/80 transition-colors"
                >
                  清空
                </button>
                <button
                  onClick={resetDefault}
                  className="text-xs px-2 py-1 rounded bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30 transition-colors"
                >
                  重置
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {AVAILABLE_SYSCALLS.map((syscall) => (
                <button
                  key={syscall}
                  onClick={() => toggleSyscall(syscall)}
                  className={`px-3 py-2 rounded text-sm font-mono transition-all ${
                    localConfig.monitoredSyscalls.includes(syscall)
                      ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                      : 'bg-cyber-bg text-gray-500 border border-cyber-border hover:border-gray-600'
                  }`}
                >
                  {syscall}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">更新间隔 (ms)</label>
              <input
                type="number"
                value={localConfig.updateInterval}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, updateInterval: parseInt(e.target.value) })
                }
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 font-mono focus:outline-none focus:border-neon-cyan"
                min="100"
                step="100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">热力图时间窗口 (秒)</label>
              <input
                type="number"
                value={localConfig.heatmapTimeWindow}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, heatmapTimeWindow: parseInt(e.target.value) })
                }
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 font-mono focus:outline-none focus:border-neon-cyan"
                min="60"
                step="60"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">最大日志条目</label>
              <input
                type="number"
                value={localConfig.maxLogEntries}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, maxLogEntries: parseInt(e.target.value) })
                }
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 font-mono focus:outline-none focus:border-neon-cyan"
                min="100"
                step="100"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">采样率 (1=全部, 10=1/10)</label>
              <input
                type="number"
                value={localConfig.sampleRate}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, sampleRate: parseInt(e.target.value) || 1 })
                }
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 font-mono focus:outline-none focus:border-neon-cyan"
                min="1"
                max="1000"
                step="1"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">每秒最大事件数</label>
              <input
                type="number"
                value={localConfig.maxEventsPerSecond}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, maxEventsPerSecond: parseInt(e.target.value) || 1000 })
                }
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 font-mono focus:outline-none focus:border-neon-cyan"
                min="100"
                step="1000"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">最大缓冲事件数</label>
              <input
                type="number"
                value={localConfig.maxPendingEvents}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, maxPendingEvents: parseInt(e.target.value) || 1000 })
                }
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 font-mono focus:outline-none focus:border-neon-cyan"
                min="500"
                step="1000"
              />
            </div>
          </div>

          <div className="p-3 bg-neon-yellow/5 border border-neon-yellow/20 rounded-lg">
            <h4 className="text-sm font-semibold text-neon-yellow mb-2">⚡ 性能优化说明</h4>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• <span className="text-neon-cyan">采样率</span>：在高负载下增大采样间隔可减少内核态和用户态的压力</li>
              <li>• <span className="text-neon-cyan">每秒最大事件数</span>：令牌桶限流，超过此速率的事件将被丢弃</li>
              <li>• <span className="text-neon-cyan">最大缓冲事件数</span>：Python 采集层的缓冲队列上限，超出触发背压丢弃</li>
              <li>• 数据丢失时 UI 顶部会显示红色告警提示</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">进程白名单 (逗号分隔)</label>
            <input
              type="text"
              value={localConfig.processWhitelist.join(', ')}
              onChange={(e) =>
                setLocalConfig({
                  ...localConfig,
                  processWhitelist: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="bash, python3, node"
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 font-mono focus:outline-none focus:border-neon-cyan"
            />
            <p className="text-xs text-gray-600 mt-1">留空表示不过滤</p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">进程黑名单 (逗号分隔)</label>
            <input
              type="text"
              value={localConfig.processBlacklist.join(', ')}
              onChange={(e) =>
                setLocalConfig({
                  ...localConfig,
                  processBlacklist: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="chrome, firefox"
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 font-mono focus:outline-none focus:border-neon-cyan"
            />
            <p className="text-xs text-gray-600 mt-1">留空表示不过滤</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-cyber-border flex-shrink-0">
          <button
            onClick={() => setShowConfig(false)}
            className="px-4 py-2 rounded border border-cyber-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-neon flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  )
}
