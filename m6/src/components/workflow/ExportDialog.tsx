import React, { useState, useMemo } from 'react';
import { X, Copy, Download } from 'lucide-react';
import type { ExportFormat, WorkflowNode, WorkflowEdge, ScriptNodeConfig, ConditionNodeConfig, DelayNodeConfig, LoopNodeConfig, OutputNodeConfig, VariableNodeConfig } from '@/types/workflow';

interface ExportDialogProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onClose: () => void;
}

function generateShell(nodes: WorkflowNode[], edges: WorkflowEdge[]): string {
  const lines: string[] = ['#!/bin/bash', ''];
  const ordered = getOrderedList(nodes, edges);
  for (const node of ordered) {
    const { nodeType, config } = node.data;
    switch (nodeType) {
      case 'script': {
        const c = config as ScriptNodeConfig;
        if (c.script_type === 'shell') {
          lines.push(c.script_content);
        } else {
          lines.push(`python3 -c "${c.script_content.replace(/"/g, '\\"')}"`);
        }
        break;
      }
      case 'delay': {
        const c = config as DelayNodeConfig;
        lines.push(`sleep ${Math.max(c.milliseconds, 0) / 1000}`);
        break;
      }
      case 'loop': {
        const c = config as LoopNodeConfig;
        lines.push(`for ${c.loop_var ?? 'i'} in $(seq 1 ${c.iterations}); do`);
        lines.push('  # loop body');
        lines.push('done');
        break;
      }
      case 'variable': {
        const c = config as VariableNodeConfig;
        lines.push(`${c.var_name}="${c.var_value}"`);
        break;
      }
      case 'output': {
        const c = config as OutputNodeConfig;
        lines.push(`echo "${c.format_string.replace(/"/g, '\\"')}"`);
        break;
      }
      case 'condition': {
        const c = config as ConditionNodeConfig;
        lines.push(`if [ ${c.condition} ]; then`);
        lines.push('  # true branch');
        lines.push('else');
        lines.push('  # false branch');
        lines.push('fi');
        break;
      }
      default:
        break;
    }
  }
  return lines.join('\n');
}

function generatePython(nodes: WorkflowNode[], edges: WorkflowEdge[]): string {
  const lines: string[] = ['import time', ''];
  const ordered = getOrderedList(nodes, edges);
  for (const node of ordered) {
    const { nodeType, config } = node.data;
    switch (nodeType) {
      case 'script': {
        const c = config as ScriptNodeConfig;
        if (c.script_type === 'python') {
          lines.push(c.script_content);
        } else {
          lines.push(`import subprocess`, `subprocess.run(${JSON.stringify(c.script_content)}, shell=True)`);
        }
        break;
      }
      case 'delay': {
        const c = config as DelayNodeConfig;
        lines.push(`time.sleep(${Math.max(c.milliseconds, 0) / 1000})`);
        break;
      }
      case 'loop': {
        const c = config as LoopNodeConfig;
        lines.push(`for ${c.loop_var ?? 'i'} in range(${c.iterations}):`);
        lines.push('    pass');
        break;
      }
      case 'variable': {
        const c = config as VariableNodeConfig;
        lines.push(`${c.var_name} = ${JSON.stringify(c.var_value)}`);
        break;
      }
      case 'output': {
        const c = config as OutputNodeConfig;
        lines.push(`print(f"${c.format_string.replace(/"/g, '\\"')}")`);
        break;
      }
      case 'condition': {
        const c = config as ConditionNodeConfig;
        lines.push(`if ${c.condition}:`);
        lines.push('    pass');
        lines.push('else:');
        lines.push('    pass');
        break;
      }
      default:
        break;
    }
  }
  return lines.join('\n');
}

function generateCli(nodes: WorkflowNode[], edges: WorkflowEdge[]): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const { nodeType, label, config } = node.data;
    switch (nodeType) {
      case 'script': {
        const c = config as ScriptNodeConfig;
        lines.push(`[node.${node.id}]`);
        lines.push(`type = "script"`);
        lines.push(`label = ${JSON.stringify(label)}`);
        lines.push(`script_type = ${JSON.stringify(c.script_type)}`);
        lines.push(`working_dir = ${JSON.stringify(c.working_dir)}`);
        lines.push(`content = ${JSON.stringify(c.script_content)}`);
        lines.push('');
        break;
      }
      case 'delay': {
        const c = config as DelayNodeConfig;
        lines.push(`[node.${node.id}]`);
        lines.push(`type = "delay"`);
        lines.push(`label = ${JSON.stringify(label)}`);
        lines.push(`milliseconds = ${c.milliseconds}`);
        lines.push('');
        break;
      }
      case 'loop': {
        const c = config as LoopNodeConfig;
        lines.push(`[node.${node.id}]`);
        lines.push(`type = "loop"`);
        lines.push(`label = ${JSON.stringify(label)}`);
        lines.push(`iterations = ${c.iterations}`);
        if (c.loop_var) lines.push(`loop_var = ${JSON.stringify(c.loop_var)}`);
        lines.push('');
        break;
      }
      case 'variable': {
        const c = config as VariableNodeConfig;
        lines.push(`[node.${node.id}]`);
        lines.push(`type = "variable"`);
        lines.push(`label = ${JSON.stringify(label)}`);
        lines.push(`var_name = ${JSON.stringify(c.var_name)}`);
        lines.push(`var_value = ${JSON.stringify(c.var_value)}`);
        lines.push('');
        break;
      }
      case 'output': {
        const c = config as OutputNodeConfig;
        lines.push(`[node.${node.id}]`);
        lines.push(`type = "output"`);
        lines.push(`label = ${JSON.stringify(label)}`);
        lines.push(`format = ${JSON.stringify(c.format_string)}`);
        lines.push('');
        break;
      }
      case 'condition': {
        const c = config as ConditionNodeConfig;
        lines.push(`[node.${node.id}]`);
        lines.push(`type = "condition"`);
        lines.push(`label = ${JSON.stringify(label)}`);
        lines.push(`condition = ${JSON.stringify(c.condition)}`);
        lines.push('');
        break;
      }
      default: {
        lines.push(`[node.${node.id}]`);
        lines.push(`type = ${JSON.stringify(nodeType)}`);
        lines.push(`label = ${JSON.stringify(label)}`);
        lines.push('');
        break;
      }
    }
  }
  for (const edge of edges) {
    lines.push(`[edge]`);
    lines.push(`from = ${JSON.stringify(edge.source)}`);
    lines.push(`to = ${JSON.stringify(edge.target)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function getOrderedList(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const result: WorkflowNode[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (node) result.push(node);
    const outEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of outEdges) {
      visit(edge.target);
    }
  }

  const startNode = nodes.find((n) => n.data.nodeType === 'start');
  if (startNode) visit(startNode.id);
  else for (const node of nodes) visit(node.id);

  return result;
}

const formatLabels: Record<ExportFormat, string> = {
  shell: 'Shell脚本',
  python: 'Python脚本',
  cli: 'CLI配置',
};

const formatExtensions: Record<ExportFormat, string> = {
  shell: '.sh',
  python: '.py',
  cli: '.toml',
};

const ExportDialog: React.FC<ExportDialogProps> = ({ nodes, edges, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('shell');

  const preview = useMemo(() => {
    switch (format) {
      case 'shell': return generateShell(nodes, edges);
      case 'python': return generatePython(nodes, edges);
      case 'cli': return generateCli(nodes, edges);
    }
  }, [format, nodes, edges]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(preview);
  };

  const handleDownload = () => {
    const blob = new Blob([preview], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow${formatExtensions[format]}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">导出工作流</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-4 mb-4">
          {(Object.keys(formatLabels) as ExportFormat[]).map((f) => (
            <label key={f} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="exportFormat"
                value={f}
                checked={format === f}
                onChange={() => setFormat(f)}
                className="accent-cyan-500"
              />
              <span className="text-sm text-slate-200">{formatLabels[f]}</span>
            </label>
          ))}
        </div>

        <textarea
          readOnly
          value={preview}
          className="w-full h-64 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-300 font-mono text-sm resize-none focus:outline-none"
        />

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
          >
            <Copy className="w-4 h-4" />
            复制到剪贴板
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            下载文件
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
