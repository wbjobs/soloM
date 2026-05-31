import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { useSimulationStore } from '@/store/simulationStore'

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  idle: { text: '等待上传', color: 'text-[#94a3b8]' },
  uploaded: { text: '已上传', color: 'text-cyan-400' },
  running: { text: '模拟运行中', color: 'text-yellow-400' },
  completed: { text: '模拟完成', color: 'text-emerald-400' },
  failed: { text: '模拟失败', color: 'text-red-400' },
}

export default function SimulationStatus() {
  const status = useSimulationStore((s) => s.status)
  const currentStep = useSimulationStore((s) => s.currentStep)
  const steps = useSimulationStore((s) => s.steps)
  const currentEnergy = useSimulationStore((s) => s.currentEnergy)
  const startTime = useSimulationStore((s) => s.startTime)
  const isSimulating = useSimulationStore((s) => s.isSimulating)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isSimulating || !startTime) {
      setElapsed(0)
      return
    }

    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(timer)
  }, [isSimulating, startTime])

  const progress = steps > 0 ? Math.min((currentStep / steps) * 100, 100) : 0
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.idle

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = s % 60
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#111827] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-[#e2e8f0] text-sm font-semibold">模拟状态</h3>
        </div>
        <span className={`text-xs font-medium ${statusInfo.color}`}>
          {statusInfo.text}
        </span>
      </div>

      <div>
        <div className="flex justify-between text-xs text-[#94a3b8] mb-1.5">
          <span>进度</span>
          <span>{currentStep} / {steps}</span>
        </div>
        <div className="w-full h-2 bg-[#1e293b] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-cyan-300 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-[#94a3b8]">当前步数</span>
          <p className="text-[#e2e8f0] font-mono mt-0.5">{currentStep}</p>
        </div>
        <div>
          <span className="text-[#94a3b8]">势能</span>
          <p className="text-[#e2e8f0] font-mono mt-0.5">
            {currentEnergy !== null ? `${currentEnergy.toFixed(2)}` : '--'}
          </p>
        </div>
        <div>
          <span className="text-[#94a3b8]">已用时间</span>
          <p className="text-[#e2e8f0] font-mono mt-0.5">{formatTime(elapsed)}</p>
        </div>
        <div>
          <span className="text-[#94a3b8]">进度</span>
          <p className="text-[#e2e8f0] font-mono mt-0.5">{progress.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  )
}
