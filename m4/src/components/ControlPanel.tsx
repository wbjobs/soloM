import { Play, Pause, RotateCcw, StepForward, Sparkles, Droplets, Diamond, Thermometer } from "lucide-react";
import { useSimulationStore } from "../store/simulationStore";
import { useSimulationWebSocket } from "../hooks/useSimulationWebSocket";
import { PRESET_GAS, PRESET_LIQUID, PRESET_SOLID } from "../types/simulation";

export function ControlPanel() {
  const { params, updateParam, status, currentFrame, toggleTrails, showTrails, setVelocityTab, velocityTab, fps } = useSimulationStore();
  const { start, pause, resume, reset, step, connect } = useSimulationWebSocket();

  const handleStart = () => {
    if (status === "idle") {
      connect();
      setTimeout(() => start(), 100);
    } else if (status === "paused") {
      resume();
    } else if (status === "running") {
      pause();
    }
  };

  const handleReset = () => {
    reset();
  };

  const handleStep = () => {
    step();
  };

  const applyPreset = (preset: typeof PRESET_GAS) => {
    Object.entries(preset).forEach(([key, value]) => {
      updateParam(key as keyof typeof params, value as never);
    });
  };

  const sliderFields = [
    { key: "num_particles", label: "粒子数", min: 16, max: 10000, step: 64 },
    { key: "temperature", label: "温度", min: 0.01, max: 3.0, step: 0.05 },
    { key: "density", label: "密度", min: 0.1, max: 1.2, step: 0.05 },
    { key: "dt", label: "时间步长", min: 0.001, max: 0.01, step: 0.001 },
    { key: "steps_per_frame", label: "每帧步数", min: 1, max: 20, step: 1 },
  ] as const;

  return (
    <div className="h-full flex flex-col gap-4 p-4 bg-surface/30 rounded-lg border border-border overflow-y-auto scrollbar-thin">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">预设方案</h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => applyPreset(PRESET_GAS)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-surface hover:bg-border transition-colors border border-border"
            disabled={status === "running"}
          >
            <Sparkles size={18} className="text-accent" />
            <span className="text-xs text-white">气体</span>
          </button>
          <button
            onClick={() => applyPreset(PRESET_LIQUID)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-surface hover:bg-border transition-colors border border-border"
            disabled={status === "running"}
          >
            <Droplets size={18} className="text-blue-400" />
            <span className="text-xs text-white">液体</span>
          </button>
          <button
            onClick={() => applyPreset(PRESET_SOLID)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg bg-surface hover:bg-border transition-colors border border-border"
            disabled={status === "running"}
          >
            <Diamond size={18} className="text-purple-400" />
            <span className="text-xs text-white">固体</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">模拟参数</h3>
        {sliderFields.map(({ key, label, min, max, step }) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs text-gray-400">{label}</label>
              <span className="text-xs font-mono text-accent">
                {key === "dt" ? params[key].toFixed(3) :
                 key === "temperature" || key === "density" ? params[key].toFixed(2) :
                 params[key]}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={params[key]}
              onChange={(e) => updateParam(key, parseFloat(e.target.value) as never)}
              disabled={status === "running"}
              className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">视图选项</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showTrails}
            onChange={toggleTrails}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-xs text-gray-400">显示轨迹尾迹</span>
        </label>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">速度分布</label>
          <div className="flex gap-1">
            {(["vx", "vy", "speed"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setVelocityTab(tab)}
                className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                  velocityTab === tab
                    ? "bg-accent text-background"
                    : "bg-surface text-gray-400 hover:bg-border"
                }`}
              >
                {tab === "speed" ? "|v|" : tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Thermometer size={14} className="text-accent" />
            <h3 className="text-sm font-semibold text-white">实时温度</h3>
          </div>
          {currentFrame && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">当前 T</span>
              <span className="font-mono text-accent">{currentFrame.temperature.toFixed(3)}</span>
            </div>
          )}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs text-gray-400">目标温度</label>
              <span className="text-xs font-mono text-accent">
                {params.temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.01}
              max={3.0}
              step={0.05}
              value={params.temperature}
              onChange={(e) => updateParam("temperature", parseFloat(e.target.value) as never)}
              className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">状态</span>
            <span className={`font-mono ${
              status === "running" ? "text-green-400" :
              status === "paused" ? "text-yellow-400" :
              status === "error" ? "text-red-400" :
              "text-gray-400"
            }`}>
              {status === "running" ? "运行中" :
               status === "paused" ? "已暂停" :
               status === "error" ? "错误" : "就绪"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">FPS</span>
            <span className="font-mono text-accent">{fps}</span>
          </div>
          {currentFrame && (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">步数</span>
                <span className="font-mono text-white">{currentFrame.step}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">温度</span>
                <span className="font-mono text-white">{currentFrame.temperature.toFixed(3)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">总能量</span>
                <span className="font-mono text-total">{currentFrame.total_energy.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleStart}
            className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-accent text-background font-medium text-sm hover:bg-accent-hover transition-colors"
          >
            {status === "running" ? <Pause size={16} /> : <Play size={16} />}
            {status === "running" ? "暂停" : status === "paused" ? "继续" : "开始"}
          </button>
          <button
            onClick={handleStep}
            className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-surface text-white border border-border hover:bg-border transition-colors text-sm"
            disabled={status === "running"}
          >
            <StepForward size={16} />
            单步
          </button>
          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-surface text-white border border-border hover:bg-border transition-colors text-sm"
          >
            <RotateCcw size={16} />
            重置
          </button>
        </div>
      </div>
    </div>
  );
}
