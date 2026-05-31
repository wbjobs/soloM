import { useParams, Link } from 'react-router-dom'
import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, Download, Atom, Table2 } from 'lucide-react'
import { useSimulationStore, downsampleEnergies } from '@/store/simulationStore'
import MoleculeViewer from '@/components/MoleculeViewer'
import EnergyChart from '@/components/EnergyChart'
import TrajectoryPlayer from '@/components/TrajectoryPlayer'

export default function Results() {
  const { taskId } = useParams<{ taskId: string }>()
  const energies = useSimulationStore((s) => s.energies)
  const minimizedPdbUrl = useSimulationStore((s) => s.minimizedPdbUrl)
  const fileName = useSimulationStore((s) => s.fileName)
  const atomCount = useSimulationStore((s) => s.atomCount)
  const residueCount = useSimulationStore((s) => s.residueCount)
  const forceField = useSimulationStore((s) => s.forceField)
  const temperature = useSimulationStore((s) => s.temperature)
  const steps = useSimulationStore((s) => s.steps)
  const status = useSimulationStore((s) => s.status)
  const [resultData, setResultData] = useState<{
    energies: { step: number; energy: number }[]
    minimizedPdbUrl: string
    fileName: string
  } | null>(null)

  useEffect(() => {
    if (status === 'completed' && minimizedPdbUrl) {
      setResultData({
        energies: downsampleEnergies(energies),
        minimizedPdbUrl,
        fileName: fileName ?? 'structure.pdb',
      })
      return
    }

    if (!taskId) return

    const fetchResults = async () => {
      try {
        const res = await fetch(`/api/results/${taskId}`)
        if (!res.ok) return
        const data = await res.json()
        setResultData({
          energies: data.energies ?? [],
          minimizedPdbUrl: data.minimizedPdbUrl ?? `/uploads/${taskId}/minimized.pdb`,
          fileName: data.fileName ?? 'structure.pdb',
        })
      } catch {
        // ignore
      }
    }
    fetchResults()
  }, [taskId, status, minimizedPdbUrl, fileName])

  const handleExportCSV = () => {
    const data = resultData?.energies ?? energies
    if (data.length === 0) return
    const header = 'Step,Energy (kJ/mol)'
    const rows = data.map((e) => `${e.step},${e.energy}`)
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `energy_${taskId ?? 'data'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const displayEnergies = resultData?.energies ?? energies

  return (
    <div className="h-screen flex flex-col bg-[#0a0e17]">
      <header className="flex items-center gap-4 px-5 py-3 border-b border-[#1e293b] bg-[#0a0e17]/80 backdrop-blur-sm">
        <Link
          to="/"
          className="flex items-center gap-2 text-[#94a3b8] hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回工作区</span>
        </Link>
        <div className="flex items-center gap-2">
          <Atom className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-semibold text-[#e2e8f0]">结果分析</h1>
        </div>
        {fileName && (
          <span className="text-xs text-[#94a3b8] ml-2">{fileName}</span>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative border-r border-[#1e293b]">
          <MoleculeViewer />
        </div>

        <div className="w-[420px] flex-shrink-0 overflow-y-auto p-4 space-y-4">
          <div className="rounded-lg border border-[#1e293b] bg-[#111827] p-4">
            <h3 className="text-[#e2e8f0] text-sm font-semibold mb-3">模拟信息</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#94a3b8]">力场</span>
                <p className="text-[#e2e8f0] font-mono mt-0.5">{forceField}</p>
              </div>
              <div>
                <span className="text-[#94a3b8]">温度</span>
                <p className="text-[#e2e8f0] font-mono mt-0.5">{temperature} K</p>
              </div>
              <div>
                <span className="text-[#94a3b8]">步数</span>
                <p className="text-[#e2e8f0] font-mono mt-0.5">{steps}</p>
              </div>
              <div>
                <span className="text-[#94a3b8]">原子数</span>
                <p className="text-[#e2e8f0] font-mono mt-0.5">{atomCount.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[#94a3b8]">残基数</span>
                <p className="text-[#e2e8f0] font-mono mt-0.5">{residueCount.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <EnergyChart />

          <TrajectoryPlayer />

          <div className="rounded-lg border border-[#1e293b] bg-[#111827] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-[#e2e8f0] text-sm font-semibold">能量数据</h3>
              </div>
              <button
                onClick={handleExportCSV}
                disabled={displayEnergies.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium
                  bg-cyan-400/20 text-cyan-400 border border-cyan-400/30
                  hover:bg-cyan-400/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]
                  transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                导出 CSV
              </button>
            </div>
            <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#94a3b8] border-b border-[#1e293b]">
                    <th className="text-left py-1.5 pr-3">步数</th>
                    <th className="text-right py-1.5">能量 (kJ/mol)</th>
                  </tr>
                </thead>
                <tbody>
                  {displayEnergies.slice(-50).map((e) => (
                    <tr key={e.step} className="text-[#e2e8f0] border-b border-[#1e293b]/50">
                      <td className="py-1.5 pr-3 font-mono">{e.step}</td>
                      <td className="py-1.5 text-right font-mono">{e.energy.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {displayEnergies.length > 50 && (
                <p className="text-[#94a3b8] text-xs mt-2 text-center">
                  显示最近 50 条 / 共 {displayEnergies.length} 条
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
