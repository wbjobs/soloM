import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { WINDOW_PRESETS } from '@/lib/windowPresets';
import { cn } from '@/lib/utils';

export default function WindowControl() {
  const windowCenter = useAppStore((s) => s.windowCenter);
  const windowWidth = useAppStore((s) => s.windowWidth);
  const setWindow = useAppStore((s) => s.setWindow);
  const image = useAppStore((s) => s.image);

  const handleCenterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setWindow(value || 0, windowWidth);
  };

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setWindow(windowCenter, value || 0);
  };

  const handleCenterInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setWindow(value, windowWidth);
    }
  };

  const handleWidthInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setWindow(windowCenter, value);
    }
  };

  const handlePresetClick = (center: number, width: number) => {
    setWindow(center, width);
  };

  const minCenter = image ? image.minPixelValue : -1000;
  const maxCenter = image ? image.maxPixelValue : 1000;
  const minWidth = 1;
  const maxWidth = image ? (image.maxPixelValue - image.minPixelValue) * 2 : 2000;

  return (
    <div className="bg-slate-800/90 backdrop-blur border border-slate-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
        <h3 className="text-white font-medium">Window / Level Control</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-slate-300">Window Center</label>
            <input
              type="number"
              value={windowCenter}
              onChange={handleCenterInputChange}
              className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white font-mono text-right focus:outline-none focus:border-blue-500"
            />
          </div>
          <input
            type="range"
            min={minCenter}
            max={maxCenter}
            value={windowCenter}
            onChange={handleCenterChange}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>{minCenter}</span>
            <span>{maxCenter}</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-slate-300">Window Width</label>
            <input
              type="number"
              value={windowWidth}
              onChange={handleWidthInputChange}
              className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white font-mono text-right focus:outline-none focus:border-blue-500"
            />
          </div>
          <input
            type="range"
            min={minWidth}
            max={maxWidth}
            value={windowWidth}
            onChange={handleWidthChange}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>{minWidth}</span>
            <span>{maxWidth}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700">
        <p className="text-sm text-slate-400 mb-2">Presets</p>
        <div className="flex flex-wrap gap-2">
          {WINDOW_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handlePresetClick(preset.center, preset.width)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-all duration-200',
                windowCenter === preset.center && windowWidth === preset.width
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              )}
            >
              {preset.nameCn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
