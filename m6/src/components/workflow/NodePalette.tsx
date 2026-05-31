import React from 'react';
import { Play, Square, Terminal, GitBranch, Clock, Repeat, MessageSquare, Variable } from 'lucide-react';
import type { NodeType } from '@/types/workflow';

interface PaletteItem {
  nodeType: NodeType;
  label: string;
  icon: React.ElementType;
  color: string;
}

const paletteItems: PaletteItem[] = [
  { nodeType: 'start', label: '开始', icon: Play, color: 'text-emerald-400' },
  { nodeType: 'end', label: '结束', icon: Square, color: 'text-red-400' },
  { nodeType: 'script', label: '脚本', icon: Terminal, color: 'text-cyan-400' },
  { nodeType: 'condition', label: '条件', icon: GitBranch, color: 'text-amber-400' },
  { nodeType: 'delay', label: '延迟', icon: Clock, color: 'text-purple-400' },
  { nodeType: 'loop', label: '循环', icon: Repeat, color: 'text-blue-400' },
  { nodeType: 'output', label: '输出', icon: MessageSquare, color: 'text-teal-400' },
  { nodeType: 'variable', label: '变量', icon: Variable, color: 'text-indigo-400' },
];

const NodePalette: React.FC = () => {
  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: NodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-48 bg-slate-800 border-r border-slate-700 p-3 flex flex-col gap-2 overflow-y-auto">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">节点面板</h3>
      {paletteItems.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.nodeType}
            draggable
            onDragStart={(e) => onDragStart(e, item.nodeType)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg cursor-grab hover:bg-slate-700 transition-colors border border-slate-600"
          >
            <Icon className={`w-4 h-4 ${item.color}`} />
            <span className="text-sm text-slate-200">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default NodePalette;
