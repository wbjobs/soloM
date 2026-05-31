import { useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Atom, ExternalLink, Wifi } from 'lucide-react'
import { useSimulationStore } from '@/store/simulationStore'
import { useSimulationSocket } from '@/hooks/useSimulationSocket'
import MoleculeViewer, { type MoleculeViewerHandle } from '@/components/MoleculeViewer'
import FileUpload from '@/components/FileUpload'
import ParameterPanel from '@/components/ParameterPanel'
import EnergyChart from '@/components/EnergyChart'
import SimulationStatus from '@/components/SimulationStatus'

export default function Workspace() {
  const taskId = useSimulationStore((s) => s.taskId)
  const isSimulating = useSimulationStore((s) => s.isSimulating)
  const status = useSimulationStore((s) => s.status)
  const viewerRef = useRef<MoleculeViewerHandle>(null)

  const handleCoordinateFrame = useCallback((frame: any) => {
    viewerRef.current?.onCoordinateFrame(frame)
  }, [])

  const { connect, disconnect } = useSimulationSocket(taskId, handleCoordinateFrame)

  useEffect(() => {
    if (taskId && isSimulating) {
      connect()
    } else {
      disconnect()
    }
  }, [taskId, isSimulating, connect, disconnect])

  return (
    <div className="h-screen flex flex-col bg-[#0a0e17]">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-[#1e293b] bg-[#0a0e17]/80 backdrop-blur-sm">
        <Atom className="w-6 h-6 text-cyan-400" />
        <h1 className="text-lg font-semibold text-[#e2e8f0] tracking-wide">
          MolDynViz
        </h1>
        <span className="text-xs text-[#94a3b8] ml-2">分子动力学可视化平台</span>
        {isSimulating && (
          <div className="flex items-center gap-1.5 ml-3 px-2 py-0.5 rounded bg-cyan-400/10 border border-cyan-400/20">
            <Wifi className="w-3 h-3 text-cyan-400 animate-pulse" />
            <span className="text-[10px] text-cyan-400 font-medium">WS 实时连接</span>
          </div>
        )}
        <div className="ml-auto">
          {status === 'completed' && taskId && (
            <Link
              to={`/results/${taskId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-emerald-400/20 text-emerald-400 border border-emerald-400/30
                hover:bg-emerald-400/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]
                transition-all duration-200"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              查看结果
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative border-r border-[#1e293b]">
          <MoleculeViewer ref={viewerRef} />
        </div>

        <div className="w-[380px] flex-shrink-0 overflow-y-auto p-4 space-y-4">
          <FileUpload />
          <ParameterPanel />
          <SimulationStatus />
          <EnergyChart />
        </div>
      </div>
    </div>
  )
}
