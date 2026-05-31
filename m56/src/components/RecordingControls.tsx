import { useState, useEffect, useCallback } from 'react'
import type { RecordingState } from '../types'

export default function RecordingControls() {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    sampleCount: 0,
    bufferDurationMs: 0,
    maxDurationMs: 5 * 60 * 1000,
  })
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const refreshState = useCallback(async () => {
    if (window.electronAPI) {
      const state = await window.electronAPI.getRecordingState()
      setRecordingState(state)
    }
  }, [])

  useEffect(() => {
    refreshState()
    const poll = setInterval(refreshState, 1000)
    return () => clearInterval(poll)
  }, [refreshState])

  const handleToggleRecording = async () => {
    if (!window.electronAPI) return

    if (recordingState.isRecording) {
      await window.electronAPI.stopRecording()
    } else {
      await window.electronAPI.startRecording()
    }
    refreshState()
  }

  const handleExport = async () => {
    if (!window.electronAPI) return

    setExportStatus(null)
    const result = await window.electronAPI.exportTrace()
    if (result.success) {
      setExportStatus({ type: 'success', message: `已导出至: ${result.path}` })
    } else {
      setExportStatus({ type: 'error', message: result.error || '导出失败' })
    }
    setTimeout(() => setExportStatus(null), 5000)
  }

  const durationSeconds = Math.floor(recordingState.bufferDurationMs / 1000)
  const durationMinutes = Math.floor(durationSeconds / 60)
  const durationRemainingSeconds = durationSeconds % 60
  const progressPercent = recordingState.maxDurationMs > 0
    ? Math.min((recordingState.bufferDurationMs / recordingState.maxDurationMs) * 100, 100)
    : 0

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">录制与导出</h3>
          {recordingState.isRecording && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-red-400 text-sm font-medium">录制中</span>
            </span>
          )}
        </div>
        <span className="text-sm text-slate-400">
          最大录制时长: 5 分钟
        </span>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400">
            已录制: {durationMinutes}分{String(durationRemainingSeconds).padStart(2, '0')}秒
          </span>
          <span className="text-sm text-slate-400">
            {recordingState.sampleCount} 个采样点
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              recordingState.isRecording ? 'bg-red-500' : 'bg-slate-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleToggleRecording}
          className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
            recordingState.isRecording
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {recordingState.isRecording ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              停止录制
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" />
              </svg>
              开始录制
            </>
          )}
        </button>

        <button
          onClick={handleExport}
          disabled={recordingState.sampleCount === 0}
          className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
            recordingState.sampleCount === 0
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          导出 .trace 文件
        </button>
      </div>

      {exportStatus && (
        <div className={`mt-3 px-4 py-2.5 rounded-lg text-sm ${
          exportStatus.type === 'success'
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {exportStatus.message}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-slate-700">
        <p className="text-xs text-slate-500">
          导出的 .trace 文件可直接拖入 Chrome 浏览器
          <span className="text-slate-400 font-mono"> chrome://tracing </span>
          页面进行可视化分析。数据格式为 Chrome Trace Event Format，包含 CPU、内存、磁盘 I/O 和网络流量的 Counter 事件。
        </p>
      </div>
    </div>
  )
}
