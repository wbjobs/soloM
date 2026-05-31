import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WorkflowNode, WorkflowNodeData, NodeConfig, ScriptNodeConfig, ConditionNodeConfig, DelayNodeConfig, LoopNodeConfig, OutputNodeConfig, VariableNodeConfig } from '@/types/workflow';

interface NodeConfigPanelProps {
  node: WorkflowNode | null;
  nodes: WorkflowNode[];
  onChange: (nodeId: string, data: WorkflowNodeData) => void;
}

const inputClass = 'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500';
const labelClass = 'block text-sm font-medium text-slate-300 mb-1';

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({ node, nodes, onChange }) => {
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  if (!node) {
    return (
      <div className="w-72 bg-slate-800 border-l border-slate-700 p-4 flex items-center justify-center">
        <p className="text-slate-400 text-sm">点击节点以编辑配置</p>
      </div>
    );
  }

  const { nodeType, label, config } = node.data;

  const updateConfig = (partial: Partial<NodeConfig>) => {
    onChange(node.id, {
      ...node.data,
      config: { ...config, ...partial } as NodeConfig,
    });
  };

  const updateLabel = (newLabel: string) => {
    onChange(node.id, { ...node.data, label: newLabel });
  };

  const renderScriptConfig = () => {
    const cfg = config as ScriptNodeConfig;
    const env = cfg.env ?? {};
    return (
      <>
        <div>
          <label className={labelClass}>脚本类型</label>
          <select
            value={cfg.script_type}
            onChange={(e) => updateConfig({ script_type: e.target.value as 'shell' | 'python' })}
            className={inputClass}
          >
            <option value="shell">Shell</option>
            <option value="python">Python</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>脚本内容</label>
          <textarea
            value={cfg.script_content}
            onChange={(e) => updateConfig({ script_content: e.target.value })}
            className={`${inputClass} font-mono h-32 resize-none`}
            placeholder={cfg.script_type === 'shell' ? 'echo "Hello"' : 'print("Hello")'}
          />
        </div>
        <div>
          <label className={labelClass}>工作目录</label>
          <input
            type="text"
            value={cfg.working_dir}
            onChange={(e) => updateConfig({ working_dir: e.target.value })}
            className={inputClass}
            placeholder="."
          />
        </div>
        <div>
          <label className={labelClass}>环境变量</label>
          <div className="space-y-2">
            {Object.entries(env).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <input type="text" value={key} readOnly className={`${inputClass} flex-1`} />
                <input type="text" value={value} readOnly className={`${inputClass} flex-1`} />
                <button
                  onClick={() => {
                    const newEnv = { ...env };
                    delete newEnv[key];
                    updateConfig({ env: newEnv });
                  }}
                  className="p-1 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                className={`${inputClass} flex-1`}
                placeholder="KEY"
              />
              <input
                type="text"
                value={newEnvValue}
                onChange={(e) => setNewEnvValue(e.target.value)}
                className={`${inputClass} flex-1`}
                placeholder="VALUE"
              />
              <button
                onClick={() => {
                  if (newEnvKey) {
                    updateConfig({ env: { ...env, [newEnvKey]: newEnvValue } });
                    setNewEnvKey('');
                    setNewEnvValue('');
                  }
                }}
                className="p-1 text-cyan-400 hover:text-cyan-300"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderConditionConfig = () => {
    const cfg = config as ConditionNodeConfig;
    const otherNodes = nodes.filter((n) => n.id !== node.id);
    return (
      <>
        <div>
          <label className={labelClass}>条件表达式</label>
          <input
            type="text"
            value={cfg.condition}
            onChange={(e) => updateConfig({ condition: e.target.value })}
            className={inputClass}
            placeholder="$var == 'true'"
          />
        </div>
        <div>
          <label className={labelClass}>真分支目标</label>
          <select
            value={cfg.true_branch ?? ''}
            onChange={(e) => updateConfig({ true_branch: e.target.value || undefined })}
            className={inputClass}
          >
            <option value="">无</option>
            {otherNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.data.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>假分支目标</label>
          <select
            value={cfg.false_branch ?? ''}
            onChange={(e) => updateConfig({ false_branch: e.target.value || undefined })}
            className={inputClass}
          >
            <option value="">无</option>
            {otherNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.data.label}</option>
            ))}
          </select>
        </div>
      </>
    );
  };

  const renderDelayConfig = () => {
    const cfg = config as DelayNodeConfig;
    return (
      <div>
        <label className={labelClass}>延迟时间 (毫秒)</label>
        <input
          type="number"
          value={cfg.milliseconds}
          onChange={(e) => updateConfig({ milliseconds: Number(e.target.value) })}
          className={inputClass}
          min={0}
        />
      </div>
    );
  };

  const renderLoopConfig = () => {
    const cfg = config as LoopNodeConfig;
    return (
      <>
        <div>
          <label className={labelClass}>迭代次数</label>
          <input
            type="number"
            value={cfg.iterations}
            onChange={(e) => updateConfig({ iterations: Number(e.target.value) })}
            className={inputClass}
            min={1}
          />
        </div>
        <div>
          <label className={labelClass}>循环变量名</label>
          <input
            type="text"
            value={cfg.loop_var ?? ''}
            onChange={(e) => updateConfig({ loop_var: e.target.value || undefined })}
            className={inputClass}
            placeholder="i"
          />
        </div>
      </>
    );
  };

  const renderOutputConfig = () => {
    const cfg = config as OutputNodeConfig;
    return (
      <div>
        <label className={labelClass}>输出格式</label>
        <textarea
          value={cfg.format_string}
          onChange={(e) => updateConfig({ format_string: e.target.value })}
          className={`${inputClass} font-mono h-24 resize-none`}
          placeholder="Result: {result}"
        />
      </div>
    );
  };

  const renderVariableConfig = () => {
    const cfg = config as VariableNodeConfig;
    return (
      <>
        <div>
          <label className={labelClass}>变量名</label>
          <input
            type="text"
            value={cfg.var_name}
            onChange={(e) => updateConfig({ var_name: e.target.value })}
            className={inputClass}
            placeholder="my_var"
          />
        </div>
        <div>
          <label className={labelClass}>变量值</label>
          <input
            type="text"
            value={cfg.var_value}
            onChange={(e) => updateConfig({ var_value: e.target.value })}
            className={inputClass}
            placeholder="hello"
          />
        </div>
      </>
    );
  };

  const renderNoConfig = (text: string) => (
    <p className="text-slate-400 text-sm">{text}</p>
  );

  const renderConfig = () => {
    switch (nodeType) {
      case 'script': return renderScriptConfig();
      case 'condition': return renderConditionConfig();
      case 'delay': return renderDelayConfig();
      case 'loop': return renderLoopConfig();
      case 'output': return renderOutputConfig();
      case 'variable': return renderVariableConfig();
      case 'start': return renderNoConfig('开始节点无需配置，流程从此节点开始执行。');
      case 'end': return renderNoConfig('结束节点无需配置，流程到此节点结束执行。');
      default: return null;
    }
  };

  return (
    <div className="w-72 bg-slate-800 border-l border-slate-700 p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-white mb-4">节点配置</h3>
      <div className="space-y-3">
        <div>
          <label className={labelClass}>节点名称</label>
          <input
            type="text"
            value={label}
            onChange={(e) => updateLabel(e.target.value)}
            className={inputClass}
          />
        </div>
        {renderConfig()}
      </div>
    </div>
  );
};

export default NodeConfigPanel;
