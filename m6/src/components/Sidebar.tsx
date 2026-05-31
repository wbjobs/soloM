import React from 'react';
import { Keyboard, FileCode, ScrollText, Settings, Zap, GitBranch } from 'lucide-react';
import { TabType } from '@/types';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'tasks' as TabType, label: '快捷键任务', icon: <Keyboard className="w-5 h-5" /> },
    { id: 'workflow' as TabType, label: '工作流编排', icon: <GitBranch className="w-5 h-5" /> },
    { id: 'editor' as TabType, label: '脚本编辑器', icon: <FileCode className="w-5 h-5" /> },
    { id: 'logs' as TabType, label: '执行日志', icon: <ScrollText className="w-5 h-5" /> },
    { id: 'settings' as TabType, label: '设置', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="w-56 bg-slate-800 border-r border-slate-700 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">HotkeyRunner</h1>
            <p className="text-slate-400 text-xs">快捷键自动化</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/25'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-700">
        <div className="text-xs text-slate-500 text-center">
          v0.1.0
        </div>
      </div>
    </div>
  );
};
