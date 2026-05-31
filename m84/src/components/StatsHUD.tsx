import { Activity, Cpu, Zap, Clock, Globe, Cpu as Gpu } from 'lucide-react';
import { useSimulationStore } from '../store/simulationStore';

export function StatsHUD() {
  const { stats, bodyCount, frame, isConnected, isRunning, isPaused, deviceInfo } =
    useSimulationStore();

  return (
    <div className="fixed top-4 left-4 z-50">
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-lg p-4 w-64 shadow-2xl">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700/50">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-bold text-slate-100 tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            SIMULATION STATS
          </h2>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-400 text-xs">
              <Globe className="w-3 h-3" />
              连接状态
            </span>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded ${
                isConnected
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-400 text-xs">
              <Zap className="w-3 h-3" />
              运行状态
            </span>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded ${
                isRunning && !isPaused
                  ? 'bg-green-500/20 text-green-400'
                  : isPaused
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-slate-500/20 text-slate-400'
              }`}
            >
              {isRunning && !isPaused ? 'RUNNING' : isPaused ? 'PAUSED' : 'STOPPED'}
            </span>
          </div>

          <div className="h-px bg-slate-700/50 my-2" />

          {deviceInfo && (
            <>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-400 text-xs">
                  {deviceInfo.is_gpu ? (
                    <Gpu className="w-3 h-3" />
                  ) : (
                    <Cpu className="w-3 h-3" />
                  )}
                  {deviceInfo.is_gpu ? 'GPU 加速' : 'CPU 计算'}
                </span>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded ${
                    deviceInfo.is_gpu
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-slate-500/20 text-slate-400'
                  }`}
                >
                  {deviceInfo.device.toUpperCase()}
                </span>
              </div>
              <div className="h-px bg-slate-700/50 my-2" />
            </>
          )}

          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs">帧数</span>
            <span className="text-cyan-400 font-mono text-sm">{frame}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs">星体数量</span>
            <span className="text-purple-400 font-mono text-sm">{bodyCount}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs">FPS</span>
            <span className="text-emerald-400 font-mono text-sm">{stats.fps.toFixed(1)}</span>
          </div>

          <div className="h-px bg-slate-700/50 my-2" />

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-400 text-xs">
              <Cpu className="w-3 h-3" />
              计算耗时
            </span>
            <span className="text-orange-400 font-mono text-sm">
              {stats.computeTime.toFixed(1)} ms
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-400 text-xs">
              <Clock className="w-3 h-3" />
              平均耗时
            </span>
            <span className="text-orange-400/80 font-mono text-sm">
              {stats.avgComputeTime.toFixed(1)} ms
            </span>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-700/50">
            <div className="text-xs text-slate-500 mb-1">计算负载</div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
                style={{
                  width: `${Math.min(stats.computeTime / 50, 1) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
