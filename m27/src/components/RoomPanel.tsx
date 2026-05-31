import { useState } from 'react'
import { Copy, Check, ArrowRight, Zap } from 'lucide-react'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useStore } from '@/store/useStore'

export default function RoomPanel() {
  const { createRoom, joinRoom } = useWebRTC()
  const roomId = useStore((s) => s.roomId)
  const connectionState = useStore((s) => s.connectionState)
  const [joinInput, setJoinInput] = useState('')
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (roomId) {
      await navigator.clipboard.writeText(roomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleJoin = () => {
    const id = joinInput.trim().toUpperCase()
    if (id) {
      joinRoom(id)
      setJoinInput('')
    }
  }

  if (connectionState !== 'disconnected') return null

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-md mx-auto">
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Zap className="w-8 h-8 text-cyan-400" />
          <h1 className="text-5xl font-display font-800 bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            闪传
          </h1>
        </div>
        <p className="text-slate-400 font-body text-sm">
          局域网 P2P 文件快传 · 无需登录 · 端到端直连
        </p>
      </div>

      <div className="w-full bg-space-800/80 backdrop-blur-sm rounded-2xl border border-space-700/50 p-6 shadow-xl shadow-cyan-500/5">
        <h2 className="text-sm font-body font-600 text-slate-300 mb-4">创建房间</h2>
        <button
          onClick={createRoom}
          className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-body font-600 text-sm hover:from-cyan-400 hover:to-blue-400 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/25 active:scale-[0.98]"
        >
          创建新房间
        </button>

        {roomId && (
          <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-space-900/60 border border-space-700/30">
            <span className="text-xs text-slate-500 font-body shrink-0">房间号</span>
            <span className="text-2xl font-display font-700 text-cyan-400 tracking-[0.2em] flex-1 text-center">
              {roomId}
            </span>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-space-700/50 transition-colors shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4 text-slate-400" />
              )}
            </button>
          </div>
        )}
      </div>

      <div className="w-full bg-space-800/80 backdrop-blur-sm rounded-2xl border border-space-700/50 p-6 shadow-xl shadow-cyan-500/5">
        <h2 className="text-sm font-body font-600 text-slate-300 mb-4">加入房间</h2>
        <div className="flex gap-2">
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="输入6位房间号"
            maxLength={6}
            className="flex-1 py-3 px-4 rounded-xl bg-space-900/60 border border-space-700/30 text-white font-display font-700 text-xl tracking-[0.15em] text-center placeholder:text-slate-600 placeholder:font-body placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
          <button
            onClick={handleJoin}
            disabled={joinInput.trim().length !== 6}
            className="px-4 rounded-xl bg-space-700/50 text-cyan-400 hover:bg-space-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
