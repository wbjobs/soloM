export type ScriptType = 'shell' | 'python';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'failed';

export interface TaskConfig {
  name: string;
  description: string;
  hotkey: string;
  script_type: ScriptType;
  script_path: string;
  script_content?: string;
  working_dir: string;
  enabled: boolean;
  env?: Record<string, string>;
}

export interface LogEntry {
  id: string;
  task_name: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  exit_code?: number;
}

export interface ExecutionState {
  task_name: string;
  status: ExecutionStatus;
  started_at?: string;
  finished_at?: string;
  output: string;
  exit_code?: number;
}

export interface GeneralConfig {
  auto_start: boolean;
  log_retention_days: number;
  theme: 'light' | 'dark';
}

export interface AppConfig {
  general: GeneralConfig;
  tasks: TaskConfig[];
}

export type TabType = 'tasks' | 'workflow' | 'editor' | 'logs' | 'settings';

export interface HotkeyPressedEvent {
  hotkey: string;
  task_name: string;
}
