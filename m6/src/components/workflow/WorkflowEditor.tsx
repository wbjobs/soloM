import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, Download, Save, Trash2 } from 'lucide-react';
import type { WorkflowNode, NodeType, WorkflowNodeData, NodeConfig, ScriptNodeConfig, ConditionNodeConfig, DelayNodeConfig, LoopNodeConfig, OutputNodeConfig, VariableNodeConfig } from '@/types/workflow';
import WorkflowNodeComponent from './WorkflowNode';
import NodePalette from './NodePalette';
import NodeConfigPanel from './NodeConfigPanel';
import ExportDialog from './ExportDialog';

const defaultNodeConfigs: Record<NodeType, NodeConfig> = {
  start: {},
  end: {},
  script: { script_type: 'shell', script_content: '', working_dir: '.' } as ScriptNodeConfig,
  condition: { condition: '' } as ConditionNodeConfig,
  delay: { milliseconds: 1000 } as DelayNodeConfig,
  loop: { iterations: 1 } as LoopNodeConfig,
  output: { format_string: '' } as OutputNodeConfig,
  variable: { var_name: '', var_value: '' } as VariableNodeConfig,
};

const nodeTypeLabels: Record<NodeType, string> = {
  start: '开始',
  end: '结束',
  script: '脚本',
  condition: '条件',
  delay: '延迟',
  loop: '循环',
  output: '输出',
  variable: '变量',
};

const initialNodes: WorkflowNode[] = [
  {
    id: 'start-1',
    type: 'workflowNode',
    position: { x: 250, y: 50 },
    data: { label: '开始', nodeType: 'start' as NodeType, config: {} },
  },
  {
    id: 'end-1',
    type: 'workflowNode',
    position: { x: 250, y: 400 },
    data: { label: '结束', nodeType: 'end' as NodeType, config: {} },
  },
];

const WorkflowEditor: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [workflowName, setWorkflowName] = useState('新工作流');
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<WorkflowNode> | null>(null);

  const nodeTypes = React.useMemo(() => ({ workflowNode: WorkflowNodeComponent }), []);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [setEdges],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: WorkflowNode) => {
      setSelectedNode(node);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (!nodeType || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: WorkflowNode = {
        id: `${nodeType}-${Date.now()}`,
        type: 'workflowNode',
        position,
        data: {
          label: nodeTypeLabels[nodeType],
          nodeType,
          config: defaultNodeConfigs[nodeType],
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes],
  );

  const handleNodeConfigChange = useCallback(
    (nodeId: string, data: WorkflowNodeData) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            const updated = { ...n, data };
            if (selectedNode?.id === nodeId) {
              setSelectedNode(updated);
            }
            return updated;
          }
          return n;
        }),
      );
    },
    [setNodes, selectedNode],
  );

  const handleClear = () => {
    setNodes(initialNodes);
    setEdges([]);
    setSelectedNode(null);
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-800 border-b border-slate-700">
        <input
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 w-48"
        />
        <div className="flex-1" />
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors text-sm font-medium">
          <Play className="w-4 h-4" />
          运行
        </button>
        <button
          onClick={() => setShowExport(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          导出
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors text-sm font-medium">
          <Save className="w-4 h-4" />
          保存
        </button>
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Trash2 className="w-4 h-4" />
          清空
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <NodePalette />

        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={(instance) => setReactFlowInstance(instance)}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-900"
          >
            <Background color="#334155" gap={20} />
            <Controls className="!bg-slate-800 !border-slate-600 [&>button]:!bg-slate-700 [&>button]:!border-slate-600 [&>button]:!text-white [&>button:hover]:!bg-slate-600" />
            <MiniMap
              nodeColor={() => '#0e7490'}
              maskColor="rgba(15, 23, 42, 0.8)"
              className="!bg-slate-800 !border-slate-600"
            />
          </ReactFlow>
        </div>

        <NodeConfigPanel node={selectedNode} nodes={nodes} onChange={handleNodeConfigChange} />
      </div>

      {showExport && (
        <ExportDialog
          nodes={nodes}
          edges={edges}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
};

export default WorkflowEditor;
