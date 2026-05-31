import { Copy, Check, LogOut, Zap } from 'lucide-react'
import { useState } from 'react'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useStore } from '@/store/useStore'
import ParticleBackground from '@/components/ParticleBackground'
import ConnectionStatus from '@/components/ConnectionStatus'
import RoomPanel from '@/components/RoomPanel'
import DropZone from '@/components/DropZone'
import FileTransferList from '@/components/FileTransferList'
import TextSync from '@/components/TextSync'

export default function Home() {
  const { leaveRoom } = useWebRTC()
  const roomId = useStore((s) => s.roomId)
  const connectionState = useStore((s) => s.connectionState)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (roomId) {
      await navigator.clipboard.writeText(roomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const isConnected = connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'reconnecting'

  return (
    <div className="min-h-screen bg-space-900 text-white font-body relative overflow-hidden">
      <ParticleBackground />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-space-800/50 backdrop-blur-sm bg-space-900/30">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-cyan-400" />
            <span className="font-display font-700 text-lg bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              闪传
            </span>
          </div>

          <div className="flex items-center gap-3">
            {roomId && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-space-800/60 border border-space-700/30">
                <span className="text-xs text-slate-500">房间</span>
                <span className="font-display font-700 text-sm text-cyan-400 tracking-wider">
                  {roomId}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1 rounded hover:bg-space-700/50 transition-colors"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-400" />
                  )}
                </button>
              </div>
            )}
            <ConnectionStatus />
            {isConnected && (
              <button
                onClick={leaveRoom}
                className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                title="离开房间"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          {!isConnected ? (
            <RoomPanel />
          ) : (
            <div className="w-full max-w-lg mx-auto space-y-6">
              {(connectionState === 'connecting' || connectionState === 'reconnecting') && (
                <div className="text-center py-16">
                  <div className="w-12 h-12 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto mb-4" />
                  <p className="text-slate-400 font-body">
                    {connectionState === 'reconnecting' ? '连接超时，正在重试...' : '正在建立 P2P 连接...'}
                  </p>
                  <p className="text-xs text-slate-600 font-body mt-1">
                    请确保两台设备在同一局域网内
                  </p>
                </div>
              )}

              {connectionState === 'connected' && (
                <>
                  <TextSync />
                  <DropZone />
                  <FileTransferList />
                </>
              )}
            </div>
          )}
        </main>

        <footer className="text-center py-4 text-xs text-slate-700 font-body">
          文件通过 WebRTC 端到端直传，不经过服务器
        </footer>
      </div>
    </div>
  )
}
