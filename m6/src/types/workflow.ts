import { Node, Edge } from '@xyflow/react';

export type NodeType = 'start' | 'end' | 'script' | 'condition' | 'delay' | 'loop' | 'output' | 'variable';

export type ExportFormat = 'shell' | 'python' | 'cli';

export interface NodePosition {
  x: number;
  y: number;
}

export interface ScriptNodeConfig {
  script_type: 'shell' | 'python';
  script_content: string;
  working_dir: string;
  env?: Record<string, string>;
}

export interface ConditionNodeConfig {
  condition: string;
  true_branch?: string;
  false_branch?: string;
}

export interface DelayNodeConfig {
  milliseconds: number;
}

export interface LoopNodeConfig {
  iterations: number;
  loop_var?: string;
}

export interface OutputNodeConfig {
  format_string: string;
}

export interface VariableNodeConfig {
  var_name: string;
  var_value: string;
}

export type NodeConfig = ScriptNodeConfig | ConditionNodeConfig | DelayNodeConfig | LoopNodeConfig | OutputNodeConfig | VariableNodeConfig | Record<string, never>;

export interface WorkflowNodeData {
  label: string;
  nodeType: NodeType;
  config: NodeConfig;
  [key: string]: unknown;
}

export type WorkflowNode = Node<WorkflowNodeData, NodeType>;
export type WorkflowEdge = Edge;

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecutionState {
  workflow_id: string;
  current_node_id?: string;
  status: 'idle' | 'running' | 'success' | 'failed' | 'cancelled';
  output: string;
  variables: Record<string, string>;
}
