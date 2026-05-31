import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Palette, Clock, Power, Save, FileText, Info } from 'lucide-react';
import { GeneralConfig } from '@/types';
import { useAppStore } from '@/store/useAppStore';

export const Settings: React.FC = () => {
  const { generalConfig, saveGeneralConfig } = useAppStore();
  const [config, setConfig] = useState<GeneralConfig>({
    auto_start: false,
    log_retention_days: 7,
    theme: 'dark',
  });

  useEffect(() => {
    if (generalConfig) {
      setConfig(generalConfig);
    }
  }, [generalConfig]);

  const handleSave = async () => {
    await saveGeneralConfig(config);
  };

  const handleReset = () => {
    if (generalConfig) {
      setConfig(generalConfig);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">设置</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              重置
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
            >
              <Save className="w-4 h-4" />
              保存设置
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Palette className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">外观</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">主题</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfig({ ...config, theme: 'light' })}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                      config.theme === 'light'
                        ? 'border-cyan-500 bg-slate-700'
                        : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                    }`}
                  >
                    <div className="w-full h-8 bg-slate-200 rounded-lg mb-2" />
                    <span className="text-sm text-white">浅色</span>
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, theme: 'dark' })}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                      config.theme === 'dark'
                        ? 'border-cyan-500 bg-slate-700'
                        : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                    }`}
                  >
                    <div className="w-full h-8 bg-slate-900 rounded-lg mb-2" />
                    <span className="text-sm text-white">深色</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Power className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">启动</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">开机自启动</p>
                  <p className="text-sm text-slate-400">系统启动时自动运行 HotkeyRunner</p>
                </div>
                <button
                  onClick={() => setConfig({ ...config, auto_start: !config.auto_start })}
                  className={`relative w-14 h-7 rounded-full transition-colors ${
                    config.auto_start ? 'bg-cyan-600' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                      config.auto_start ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">日志</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  日志保留天数
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="90"
                    value={config.log_retention_days}
                    onChange={(e) => setConfig({ ...config, log_retention_days: parseInt(e.target.value) })}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <span className="w-16 text-center px-3 py-1 bg-slate-700 rounded-lg text-white font-mono">
                    {config.log_retention_days} 天
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-2">
                  超过保留天数的日志将被自动清理
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">配置文件</h3>
            </div>
            <div className="space-y-3">
              <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm text-slate-300 break-all">
                %APPDATA%\HotkeyRunner\config.toml
              </div>
              <p className="text-sm text-slate-400">
                您也可以直接编辑配置文件来修改设置
              </p>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Info className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">关于</h3>
            </div>
            <div className="space-y-2 text-sm text-slate-400">
              <p><span className="text-white font-medium">HotkeyRunner</span> v0.1.0</p>
              <p>基于 Rust + Tauri 开发的快捷键自动化工具</p>
              <p>支持全局快捷键监听、脚本执行、系统托盘日志显示</p>
              <p>同时提供 CLI 命令行工具用于无 GUI 服务器环境</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
