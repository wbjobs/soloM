import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Play, Square, Terminal, GitBranch, Clock, Repeat, MessageSquare, Variable } from 'lucide-react';
import type { WorkflowNode, NodeType, NodeConfig, ScriptNodeConfig, ConditionNodeConfig, DelayNodeConfig, LoopNodeConfig, OutputNodeConfig, VariableNodeConfig } from '@/types/workflow';

const nodeStyles: Record<NodeType, { bg: string; icon: React.ElementType }> = {
  start: { bg: 'bg-emerald-600', icon: Play },
  end: { bg: 'bg-red-600', icon: Square },
  script: { bg: 'bg-cyan-600', icon: Terminal },
  condition: { bg: 'bg-amber-600', icon: GitBranch },
  delay: { bg: 'bg-purple-600', icon: Clock },
  loop: { bg: 'bg-blue-600', icon: Repeat },
  output: { bg: 'bg-teal-600', icon: MessageSquare },
  variable: { bg: 'bg-indigo-600', icon: Variable },
};

function getConfigSummary(nodeType: NodeType, config: NodeConfig): string {
  switch (nodeType) {
    case 'script': {
      const c = config as ScriptNodeConfig;
      return `${c.script_type}: ${c.script_content.slice(0, 30)}${c.script_content.length > 30 ? '...' : ''}`;
    }
    case 'condition': {
      const c = config as ConditionNodeConfig;
      return c.condition || '未设置条件';
    }
    case 'delay': {
      const c = config as DelayNodeConfig;
      return `${c.milliseconds}ms`;
    }
    case 'loop': {
      const c = config as LoopNodeConfig;
      return `${c.iterations} 次${c.loop_var ? ` (${c.loop_var})` : ''}`;
    }
    case 'output': {
      const c = config as OutputNodeConfig;
      return c.format_string ? `"${c.format_string.slice(0, 25)}${c.format_string.length > 25 ? '...' : ''}"` : '未设置输出';
    }
    case 'variable': {
      const c = config as VariableNodeConfig;
      return c.var_name ? `${c.var_name} = ${c.var_value}` : '未设置变量';
    }
    default:
      return '';
  }
}

const WorkflowNodeComponent: React.FC<NodeProps<WorkflowNode>> = ({ data, selected }) => {
  const { nodeType, label, config } = data;
  const style = nodeStyles[nodeType];
  const Icon = style.icon;
  const summary = getConfigSummary(nodeType, config);

  return (
    <div className={`min-w-[200px] rounded-lg shadow-lg bg-slate-800 border-2 ${selected ? 'border-cyan-500' : 'border-slate-600'} overflow-hidden`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-slate-600" />
      <div className={`${style.bg} px-3 py-2 flex items-center gap-2`}>
        <Icon className="w-4 h-4 text-white" />
        <span className="text-white text-sm font-semibold">{label}</span>
      </div>
      {summary && (
        <div className="px-3 py-2 text-slate-300 text-xs truncate">
          {summary}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-slate-600" />
    </div>
  );
};

export default WorkflowNodeComponent;
