import { ParticleCanvas } from "./ParticleCanvas";
import { VelocityHistogram } from "./VelocityHistogram";
import { EnergyChart } from "./EnergyChart";
import { RDFChart } from "./RDFChart";
import { ControlPanel } from "./ControlPanel";
import { useSimulationStore } from "../store/simulationStore";
import { Atom, Wifi, WifiOff } from "lucide-react";

export function SimulatorPage() {
  const { wsConnected, fps } = useSimulationStore();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-surface/30">
        <div className="flex items-center gap-3">
          <Atom size={24} className="text-accent" />
          <h1 className="text-lg font-semibold text-white">MD Lab</h1>
          <span className="text-xs text-gray-500">分子动力学模拟平台</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <Wifi size={16} className="text-green-400" />
            ) : (
              <WifiOff size={16} className="text-red-400" />
            )}
            <span className="text-xs text-gray-400">
              {wsConnected ? "已连接" : "未连接"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${fps > 0 ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
            <span className="text-xs font-mono text-gray-400">FPS: {fps}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-64 flex-shrink-0 border-r border-border p-4">
          <ControlPanel />
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
            <div className="relative">
              <ParticleCanvas width={560} height={560} />
              <div className="absolute top-4 left-4 text-xs font-mono text-gray-500">
                2D Lennard-Jones
              </div>
            </div>
          </div>

          <footer className="h-10 border-t border-border flex items-center justify-center gap-8 px-6 bg-surface/20">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-kinetic" />
              <span className="text-xs text-gray-400">动能 (KE)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-potential" />
              <span className="text-xs text-gray-400">势能 (PE)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-total" />
              <span className="text-xs text-gray-400">总能量 (E)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-16 h-3 rounded bg-gradient-to-r from-blue-500 via-green-400 via-yellow-400 to-red-500" />
              <span className="text-xs text-gray-400">速度色标</span>
            </div>
          </footer>
        </div>

        <aside className="w-80 flex-shrink-0 border-l border-border p-4 flex flex-col gap-4 overflow-y-auto scrollbar-thin">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">径向分布函数 g(r)</h3>
            <RDFChart width={300} height={220} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">速度分布</h3>
            <VelocityHistogram width={300} height={200} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">能量曲线</h3>
            <EnergyChart width={300} height={200} />
          </div>
          <div className="mt-auto p-4 rounded-lg bg-surface/50 border border-border">
            <h4 className="text-xs font-semibold text-white mb-3">Lennard-Jones 势能模型</h4>
            <div className="text-xs font-mono text-gray-400 space-y-1">
              <div>V(r) = 4ε [(σ/r)¹² − (σ/r)⁶]</div>
              <div className="text-gray-500 mt-2">
                Velocity Verlet 积分器
              </div>
              <div className="text-gray-500">
                周期性边界条件
              </div>
              <div className="text-gray-500">
                最小镜像约定
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
