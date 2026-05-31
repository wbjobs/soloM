import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, LayoutDashboard, MonitorPlay, User } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

export default function Header() {
  const location = useLocation();
  const useWasm = useAppStore((s) => s.useWasm);
  const wasmAvailable = useAppStore((s) => s.wasmAvailable);
  const setUseWasm = useAppStore((s) => s.setUseWasm);

  const isHomePage = location.pathname === '/';
  const isViewerPage = location.pathname.startsWith('/viewer');

  const toggleParserMode = () => {
    if (wasmAvailable) {
      setUseWasm(!useWasm);
    }
  };

  return (
    <header className="bg-slate-800/80 backdrop-blur border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-600">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">
                DICOM 医学影像解析系统
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-1 ml-8">
              <Link
                to="/"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200',
                  isHomePage
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="text-sm font-medium">影像管理</span>
              </Link>
              <Link
                to="/viewer/demo"
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200',
                  isViewerPage
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                )}
              >
                <MonitorPlay className="w-4 h-4" />
                <span className="text-sm font-medium">影像查看</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleParserMode}
              disabled={!wasmAvailable}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200',
                wasmAvailable
                  ? useWasm
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600'
                  : 'bg-slate-700/50 text-slate-500 border border-slate-600 cursor-not-allowed'
              )}
              title={wasmAvailable ? `Currently using ${useWasm ? 'WASM' : 'JS'} parser` : 'WASM not available'}
            >
              {useWasm ? 'WASM' : 'JS'}
            </button>

            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-700">
              <User className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </div>
      </div>
      </header>
  );
}
