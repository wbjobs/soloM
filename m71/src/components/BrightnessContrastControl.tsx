import React, { useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { Sun, Contrast, Monitor, RotateCcw } from 'lucide-react';

interface BrightnessContrastControlProps {
  onReset?: () => void;
}

export default function BrightnessContrastControl({ onReset }: BrightnessContrastControlProps) {
  const brightness = useAppStore((s) => s.brightness);
  const contrast = useAppStore((s) => s.contrast);
  const gpuAcceleration = useAppStore((s) => s.gpuAcceleration);
  const setBrightness = useAppStore((s) => s.setBrightness);
  const setContrast = useAppStore((s) => s.setContrast);
  const setGpuAcceleration = useAppStore((s) => s.setGpuAcceleration);

  const handleBrightnessChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBrightness(parseFloat(e.target.value));
    },
    [setBrightness]
  );

  const handleContrastChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setContrast(parseFloat(e.target.value));
    },
    [setContrast]
  );

  const handleReset = useCallback(() => {
    setBrightness(0);
    setContrast(1);
    onReset?.();
  }, [setBrightness, setContrast, onReset]);

  const brightnessPercent = Math.round((brightness + 0.5) * 100);
  const contrastPercent = Math.round(contrast * 100);

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
          <Monitor className="w-4 h-4 text-blue-400" />
          图像调整
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">GPU加速</span>
          <button
            onClick={() => setGpuAcceleration(!gpuAcceleration)}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              gpuAcceleration ? 'bg-blue-500' : 'bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                gpuAcceleration ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-300">
              <Sun className="w-4 h-4 text-yellow-400" />
              亮度
            </label>
            <span className="text-slate-400 font-mono">{brightnessPercent}%</span>
          </div>
          <input
            type="range"
            min="-0.5"
            max="0.5"
            step="0.01"
            value={brightness}
            onChange={handleBrightnessChange}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-yellow-400
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:shadow-lg
                       [&::-webkit-slider-thumb]:shadow-yellow-400/30"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-300">
              <Contrast className="w-4 h-4 text-cyan-400" />
              对比度
            </label>
            <span className="text-slate-400 font-mono">{contrastPercent}%</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="3"
            step="0.01"
            value={contrast}
            onChange={handleContrastChange}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-cyan-400
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:shadow-lg
                       [&::-webkit-slider-thumb]:shadow-cyan-400/30"
          />
        </div>
      </div>

      <button
        onClick={handleReset}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-700 hover:bg-slate-600 
                   rounded-md text-sm text-slate-200 transition-colors"
      >
        <RotateCcw className="w-3 h-3" />
        重置调整
      </button>

      <div className="pt-2 border-t border-slate-700 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div className="flex justify-between">
          <span>亮度范围:</span>
          <span>-50% ~ +50%</span>
        </div>
        <div className="flex justify-between">
          <span>对比度范围:</span>
          <span>20% ~ 300%</span>
        </div>
      </div>
    </div>
  );
}
