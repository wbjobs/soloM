import { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Settings,
  Sparkles,
  Eye,
  Palette,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSimulationStore } from '../store/simulationStore';
import type { ControlCommand } from '../types/simulation';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  unit?: string;
}

function Slider({ label, value, min, max, step, onChange, unit = '' }: SliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-mono text-cyan-400">
          {value.toFixed(step < 1 ? 2 : 0)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
      />
    </div>
  );
}

interface SceneCardProps {
  id: string;
  name: string;
  description: string;
  bodyCount: number;
  isSelected: boolean;
  onClick: () => void;
}

function SceneCard({
  id,
  name,
  description,
  bodyCount,
  isSelected,
  onClick,
}: SceneCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
        isSelected
          ? 'bg-cyan-500/20 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
          : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <span className={`text-sm font-medium ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>
          {name}
        </span>
        <span className="text-xs font-mono text-slate-500">{bodyCount} 星体</span>
      </div>
      <p className="text-xs text-slate-500 line-clamp-2">{description}</p>
    </button>
  );
}

export function ControlPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'scenes' | 'params' | 'display'>('scenes');

  const { loadScene, updateConfig, sendControl } = useWebSocket();

  const {
    scenes,
    currentSceneId,
    config,
    isRunning,
    isPaused,
    isConnected,
    showTrails,
    trailLength,
    particleSize,
    colorMode,
    setShowTrails,
    setTrailLength,
    setParticleSize,
    setColorMode,
  } = useSimulationStore();

  const handleControl = (command: ControlCommand) => {
    if (!isConnected) return;
    sendControl(command);
  };

  const handleSceneSelect = (sceneId: string) => {
    if (!isConnected) return;
    loadScene(sceneId);
  };

  const handleConfigChange = (key: keyof typeof config, value: number) => {
    if (!isConnected) return;
    updateConfig({ [key]: value });
  };

  const tabs = [
    { id: 'scenes' as const, label: '场景', icon: Sparkles },
    { id: 'params' as const, label: '参数', icon: Settings },
    { id: 'display' as const, label: '显示', icon: Eye },
  ];

  return (
    <>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-700/50 border-r-0 rounded-l-lg p-2 hover:bg-slate-800 transition-colors"
        style={{ right: isCollapsed ? 0 : 320 }}
      >
        {isCollapsed ? (
          <ChevronLeft className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-slate-400" />
        )}
      </button>

      <div
        className={`fixed right-0 top-0 h-full w-80 z-40 transform transition-transform duration-300 ${
          isCollapsed ? 'translate-x-full' : 'translate-x-0'
        }`}
      >
        <div className="h-full bg-slate-900/90 backdrop-blur-md border-l border-slate-700/50 flex flex-col">
          <div className="p-4 border-b border-slate-700/50">
            <h1
              className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 tracking-wider"
              style={{ fontFamily: "'Orbitron', sans-serif" }}
            >
              N-BODY SIMULATOR
            </h1>
            <p className="text-xs text-slate-500 mt-1">Barnes-Hut 引力模拟系统</p>
          </div>

          <div className="flex border-b border-slate-700/50">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-cyan-400 border-b-2 border-cyan-400'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'scenes' && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  预设场景
                </h3>
                <div className="space-y-2">
                  {scenes.map((scene) => (
                    <SceneCard
                      key={scene.id}
                      id={scene.id}
                      name={scene.name}
                      description={scene.description}
                      bodyCount={scene.bodyCount}
                      isSelected={currentSceneId === scene.id}
                      onClick={() => handleSceneSelect(scene.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'params' && (
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  物理参数
                </h3>
                <Slider
                  label="引力常数 G"
                  value={config.gravitationalConstant}
                  min={0.1}
                  max={5}
                  step={0.1}
                  onChange={(v) => handleConfigChange('gravitationalConstant', v)}
                />
                <Slider
                  label="时间步长"
                  value={config.timeStep}
                  min={0.001}
                  max={0.2}
                  step={0.001}
                  onChange={(v) => handleConfigChange('timeStep', v)}
                  unit="s"
                />
                <Slider
                  label="软化因子"
                  value={config.softening}
                  min={0.01}
                  max={2}
                  step={0.01}
                  onChange={(v) => handleConfigChange('softening', v)}
                />
                <Slider
                  label="Barnes-Hut θ"
                  value={config.theta}
                  min={0.1}
                  max={1.5}
                  step={0.05}
                  onChange={(v) => handleConfigChange('theta', v)}
                />
              </div>
            )}

            {activeTab === 'display' && (
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  渲染选项
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">显示运动轨迹</span>
                    <button
                      onClick={() => setShowTrails(!showTrails)}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        showTrails ? 'bg-cyan-500' : 'bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                          showTrails ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {showTrails && (
                    <Slider
                      label="轨迹长度"
                      value={trailLength}
                      min={20}
                      max={300}
                      step={10}
                      onChange={setTrailLength}
                      unit="帧"
                    />
                  )}

                  <Slider
                    label="粒子大小"
                    value={particleSize}
                    min={0.5}
                    max={5}
                    step={0.1}
                    onChange={setParticleSize}
                  />

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Palette className="w-3 h-3" />
                      颜色模式
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'velocity' as const, label: '速度' },
                        { id: 'mass' as const, label: '质量' },
                        { id: 'fixed' as const, label: '固定' },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => setColorMode(mode.id)}
                          className={`py-2 px-3 rounded text-xs font-medium transition-colors ${
                            colorMode === mode.id
                              ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-700/50 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => handleControl(isRunning && !isPaused ? 'pause' : 'start')}
                disabled={!isConnected}
                className={`col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all ${
                  isRunning && !isPaused
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
                    : 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/30 hover:from-cyan-500/30 hover:to-purple-500/30'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isRunning && !isPaused ? (
                  <>
                    <Pause className="w-4 h-4" />
                    暂停
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    开始
                  </>
                )}
              </button>

              <button
                onClick={() => handleControl('reset')}
                disabled={!isConnected}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                重置
              </button>

              <button
                onClick={() => handleControl('step')}
                disabled={!isConnected}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipForward className="w-4 h-4" />
                单步
              </button>
            </div>

            {!isConnected && (
              <div className="text-center text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg py-2">
                未连接到模拟服务器，请启动后端服务
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
