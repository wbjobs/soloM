import { invoke } from '@tauri-apps/api/core';
import { AppConfig, TaskConfig, LogEntry, ExecutionState } from '@/types';
import { Workflow, WorkflowExecutionState } from '@/types/workflow';

export const TauriCommands = {
  getConfig: () => invoke<AppConfig>('get_config'),
  saveConfig: (config: AppConfig) => invoke<void>('save_config', { config }),
  
  getTasks: () => invoke<TaskConfig[]>('get_tasks'),
  addTask: (task: TaskConfig) => invoke<void>('add_task', { task }),
  updateTask: (task: TaskConfig) => invoke<void>('update_task', { task }),
  deleteTask: (name: string) => invoke<void>('delete_task', { name }),
  runTask: (name: string) => invoke<ExecutionState>('run_task', { name }),
  stopTask: (name: string) => invoke<void>('stop_task', { name }),
  
  registerHotkey: (hotkey: string, taskName: string) => 
    invoke<void>('register_hotkey', { hotkey, taskName }),
  unregisterHotkey: (hotkey: string) => 
    invoke<void>('unregister_hotkey', { hotkey }),
  
  getLogs: (taskName?: string, limit?: number) => 
    invoke<LogEntry[]>('get_logs', { taskName, limit }),
  clearLogs: () => invoke<void>('clear_logs'),
  
  showMainWindow: () => invoke<void>('show_main_window'),
  hideMainWindow: () => invoke<void>('hide_main_window'),

  getWorkflows: () => invoke<Workflow[]>('get_workflows'),
  addWorkflow: (workflow: Workflow) => invoke<void>('add_workflow', { workflow }),
  updateWorkflow: (workflow: Workflow) => invoke<void>('update_workflow', { workflow }),
  deleteWorkflow: (id: string) => invoke<void>('delete_workflow', { id }),
  runWorkflow: (id: string) => invoke<WorkflowExecutionState>('run_workflow', { id }),
  exportWorkflow: (id: string, format: string) => invoke<string>('export_workflow', { id, format }),
  exportWorkflowContent: (workflow: Workflow, format: string) => invoke<string>('export_workflow_content', { workflow, format }),
};

export const TauriEvents = {
  LOG_ENTRY: 'log-entry',
  EXECUTION_STATE_CHANGED: 'execution-state-changed',
  HOTKEY_PRESSED: 'hotkey-pressed',
} as const;
