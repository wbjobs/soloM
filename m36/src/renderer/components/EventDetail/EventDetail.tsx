import React from 'react'
import { X, Clock, User, Hash, FileCode, Activity, AlertCircle } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { formatTimestamp, formatDuration, getSyscallColor, getRetvalColor } from '@/utils/format'

export const EventDetail: React.FC = () => {
  const { selectedEvent, setSelectedEvent } = useStore()

  if (!selectedEvent) return null

  const isError = selectedEvent.retval < 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col m-4">
        <div
          className="flex items-center justify-between p-4 border-b flex-shrink-0"
          style={{ borderColor: getSyscallColor(selectedEvent.syscall) + '40' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: getSyscallColor(selectedEvent.syscall) + '20' }}
            >
              <Activity
                className="w-5 h-5"
                style={{ color: getSyscallColor(selectedEvent.syscall) }}
              />
            </div>
            <div>
              <h2
                className="text-xl font-bold font-mono glow-text"
                style={{ color: getSyscallColor(selectedEvent.syscall) }}
              >
                {selectedEvent.syscall}
              </h2>
              <p className="text-xs text-gray-500">系统调用详情</p>
            </div>
          </div>
          <button
            onClick={() => setSelectedEvent(null)}
            className="p-2 rounded hover:bg-cyber-border text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-cyber-bg rounded-lg border border-cyber-border">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Clock className="w-3 h-3" />
                时间戳
              </div>
              <div className="font-mono text-sm">
                {formatTimestamp(selectedEvent.timestamp)}
              </div>
            </div>

            <div className="p-3 bg-cyber-bg rounded-lg border border-cyber-border">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Hash className="w-3 h-3" />
                执行耗时
              </div>
              <div className="font-mono text-sm">{formatDuration(selectedEvent.duration)}</div>
            </div>

            <div className="p-3 bg-cyber-bg rounded-lg border border-cyber-border">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <FileCode className="w-3 h-3" />
                进程信息
              </div>
              <div className="font-mono text-sm">
                <span className="text-neon-cyan">{selectedEvent.comm}</span>
                <span className="text-gray-500 ml-2">PID: {selectedEvent.pid}</span>
              </div>
              <div className="font-mono text-xs text-gray-500">
                PPID: {selectedEvent.ppid}
              </div>
            </div>

            <div className="p-3 bg-cyber-bg rounded-lg border border-cyber-border">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <User className="w-3 h-3" />
                用户信息
              </div>
              <div className="font-mono text-sm">
                UID: <span className="text-neon-purple">{selectedEvent.uid}</span>
                <span className="text-gray-600 mx-2">|</span>
                GID: <span className="text-neon-purple">{selectedEvent.gid}</span>
              </div>
            </div>
          </div>

          <div
            className={`p-4 rounded-lg border ${
              isError
                ? 'bg-neon-red/10 border-neon-red/30'
                : 'bg-neon-green/10 border-neon-green/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {isError ? (
                <AlertCircle className="w-4 h-4 text-neon-red" />
              ) : (
                <Activity className="w-4 h-4 text-neon-green" />
              )}
              <span className="text-sm font-medium" style={{ color: getRetvalColor(selectedEvent.retval) }}>
                返回值: {selectedEvent.retval}
              </span>
              {isError && <span className="text-xs text-neon-red">调用失败</span>}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">系统调用参数</h3>
            <div className="bg-cyber-bg rounded-lg border border-cyber-border p-4 font-mono text-sm overflow-x-auto">
              <pre className="text-gray-300">
                {JSON.stringify(selectedEvent.args, null, 2)}
              </pre>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">原始数据</h3>
            <div className="bg-cyber-bg rounded-lg border border-cyber-border p-4 font-mono text-xs overflow-x-auto max-h-60">
              <pre className="text-gray-400">
                {JSON.stringify(selectedEvent, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-cyber-border flex-shrink-0">
          <button
            onClick={() => setSelectedEvent(null)}
            className="btn-neon"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
