import { Play } from 'lucide-react'
import { useSimulationStore } from '@/store/simulationStore'

const FORCE_FIELDS = ['AMBER14', 'CHARMM36', 'OPLS-AA']

export default function ParameterPanel() {
  const forceField = useSimulationStore((s) => s.forceField)
  const steps = useSimulationStore((s) => s.steps)
  const temperature = useSimulationStore((s) => s.temperature)
  const status = useSimulationStore((s) => s.status)
  const taskId = useSimulationStore((s) => s.taskId)
  const isSimulating = useSimulationStore((s) => s.isSimulating)

  const handleStart = async () => {
    if (!taskId || isSimulating) return

    useSimulationStore.getState().startSimulation()

    try {
      await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, forceField, steps, temperature }),
      })
    } catch {
      useSimulationStore.getState().reset()
    }
  }

  const canStart = taskId !== null && !isSimulating && status === 'uploaded'

  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#111827] p-4 space-y-4">
      <h3 className="text-[#e2e8f0] text-sm font-semibold">模拟参数</h3>

      <div>
        <label className="block text-[#94a3b8] text-xs mb-1.5">力场</label>
        <select
          value={forceField}
          onChange={(e) => useSimulationStore.getState().setParams({ forceField: e.target.value })}
          disabled={isSimulating}
          className="w-full bg-[#0a0e17] border border-[#1e293b] rounded-md px-3 py-2 text-[#e2e8f0] text-sm focus:outline-none focus:border-cyan-400/50 disabled:opacity-50"
        >
          {FORCE_FIELDS.map((ff) => (
            <option key={ff} value={ff}>{ff}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[#94a3b8] text-xs mb-1.5">模拟步数</label>
        <input
          type="number"
          value={steps}
          onChange={(e) => useSimulationStore.getState().setParams({ steps: Math.max(1, parseInt(e.target.value) || 1) })}
          disabled={isSimulating}
          min={1}
          className="w-full bg-[#0a0e17] border border-[#1e293b] rounded-md px-3 py-2 text-[#e2e8f0] text-sm focus:outline-none focus:border-cyan-400/50 disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-[#94a3b8] text-xs mb-1.5">温度 (K)</label>
        <input
          type="number"
          value={temperature}
          onChange={(e) => useSimulationStore.getState().setParams({ temperature: Math.max(1, parseInt(e.target.value) || 1) })}
          disabled={isSimulating}
          min={1}
          className="w-full bg-[#0a0e17] border border-[#1e293b] rounded-md px-3 py-2 text-[#e2e8f0] text-sm focus:outline-none focus:border-cyan-400/50 disabled:opacity-50"
        />
      </div>

      <button
        onClick={handleStart}
        disabled={!canStart}
        className={`
          w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium
          transition-all duration-200
          ${canStart
            ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]'
            : 'bg-[#1e293b]/50 text-[#94a3b8] border border-[#1e293b] cursor-not-allowed'
          }
        `}
      >
        <Play className="w-4 h-4" />
        {isSimulating ? '模拟中...' : '开始模拟'}
      </button>
    </div>
  )
}
