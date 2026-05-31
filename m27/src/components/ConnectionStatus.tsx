import { useStore, ConnectionState } from '@/store/useStore'
import { Wifi, WifiOff, Loader, RefreshCw } from 'lucide-react'

const stateConfig: Record<ConnectionState, { color: string; label: string; icon: typeof Wifi }> = {
  disconnected: { color: 'bg-yellow-500', label: '未连接', icon: WifiOff },
  connecting: { color: 'bg-blue-500 animate-pulse', label: '连接中...', icon: Loader },
  connected: { color: 'bg-emerald-500', label: '已连接', icon: Wifi },
  reconnecting: { color: 'bg-amber-500 animate-pulse', label: '重连中...', icon: RefreshCw },
}

export default function ConnectionStatus() {
  const connectionState = useStore((s) => s.connectionState)
  const retryCount = useStore((s) => s.retryCount)
  const config = stateConfig[connectionState]
  const Icon = config.icon

  const label = connectionState === 'reconnecting'
    ? `重连中(${retryCount}/${3})...`
    : config.label

  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-space-800/80 backdrop-blur-sm border border-space-700/50">
      <span className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
      <Icon className="w-4 h-4 text-slate-400" />
      <span className="text-sm text-slate-300 font-body">{label}</span>
    </div>
  )
}
