import { create } from 'zustand';
import { TaskConfig, LogEntry, ExecutionState, AppConfig, TabType, GeneralConfig } from '@/types';
import { TauriCommands } from '@/utils/tauriApi';

interface AppState {
  activeTab: TabType;
  tasks: TaskConfig[];
  logs: LogEntry[];
  executionStates: Record<string, ExecutionState>;
  selectedTask: TaskConfig | null;
  generalConfig: GeneralConfig | null;
  isLoading: boolean;
  notification: { message: string; type: 'success' | 'error' | 'info' } | null;

  setActiveTab: (tab: TabType) => void;
  setSelectedTask: (task: TaskConfig | null) => void;
  setNotification: (notification: { message: string; type: 'success' | 'error' | 'info' } | null) => void;

  loadConfig: () => Promise<void>;
  loadTasks: () => Promise<void>;
  loadLogs: (taskName?: string, limit?: number) => Promise<void>;
  
  addTask: (task: TaskConfig) => Promise<void>;
  updateTask: (task: TaskConfig) => Promise<void>;
  deleteTask: (name: string) => Promise<void>;
  runTask: (name: string) => Promise<void>;
  stopTask: (name: string) => Promise<void>;
  
  addLog: (log: LogEntry) => void;
  updateExecutionState: (state: ExecutionState) => void;
  
  saveGeneralConfig: (config: GeneralConfig) => Promise<void>;
  clearLogs: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'tasks',
  tasks: [],
  logs: [],
  executionStates: {},
  selectedTask: null,
  generalConfig: null,
  isLoading: false,
  notification: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedTask: (task) => set({ selectedTask: task }),
  setNotification: (notification) => set({ notification }),

  loadConfig: async () => {
    set({ isLoading: true });
    try {
      const config = await TauriCommands.getConfig();
      set({ 
        tasks: config.tasks,
        generalConfig: config.general,
        isLoading: false 
      });
    } catch (error) {
      set({ isLoading: false });
      get().setNotification({ 
        message: `加载配置失败: ${error}`,
        type: 'error'
      });
    }
  },

  loadTasks: async () => {
    try {
      const tasks = await TauriCommands.getTasks();
      set({ tasks });
    } catch (error) {
      get().setNotification({ 
        message: `加载任务失败: ${error}`,
        type: 'error'
      });
    }
  },

  loadLogs: async (taskName, limit = 100) => {
    try {
      const logs = await TauriCommands.getLogs(taskName, limit);
      set({ logs });
    } catch (error) {
      get().setNotification({ 
        message: `加载日志失败: ${error}`,
        type: 'error'
      });
    }
  },

  addTask: async (task) => {
    try {
      await TauriCommands.addTask(task);
      await get().loadTasks();
      get().setNotification({ 
        message: `任务 "${task.name}" 添加成功`,
        type: 'success'
      });
    } catch (error) {
      get().setNotification({ 
        message: `添加任务失败: ${error}`,
        type: 'error'
      });
    }
  },

  updateTask: async (task) => {
    try {
      await TauriCommands.updateTask(task);
      await get().loadTasks();
      get().setNotification({ 
        message: `任务 "${task.name}" 更新成功`,
        type: 'success'
      });
    } catch (error) {
      get().setNotification({ 
        message: `更新任务失败: ${error}`,
        type: 'error'
      });
    }
  },

  deleteTask: async (name) => {
    try {
      await TauriCommands.deleteTask(name);
      await get().loadTasks();
      if (get().selectedTask?.name === name) {
        set({ selectedTask: null });
      }
      get().setNotification({ 
        message: `任务 "${name}" 删除成功`,
        type: 'success'
      });
    } catch (error) {
      get().setNotification({ 
        message: `删除任务失败: ${error}`,
        type: 'error'
      });
    }
  },

  runTask: async (name) => {
    try {
      const state = await TauriCommands.runTask(name);
      get().updateExecutionState(state);
      await get().loadLogs(name);
    } catch (error) {
      get().setNotification({ 
        message: `执行任务失败: ${error}`,
        type: 'error'
      });
    }
  },

  stopTask: async (name) => {
    try {
      await TauriCommands.stopTask(name);
      get().setNotification({ 
        message: `任务 "${name}" 已停止`,
        type: 'info'
      });
    } catch (error) {
      get().setNotification({ 
        message: `停止任务失败: ${error}`,
        type: 'error'
      });
    }
  },

  addLog: (log) => {
    set((state) => ({
      logs: [log, ...state.logs].slice(0, 500)
    }));
  },

  updateExecutionState: (executionState) => {
    set((state) => ({
      executionStates: {
        ...state.executionStates,
        [executionState.task_name]: executionState
      }
    }));
  },

  saveGeneralConfig: async (config) => {
    try {
      const currentConfig = await TauriCommands.getConfig();
      await TauriCommands.saveConfig({
        ...currentConfig,
        general: config
      });
      set({ generalConfig: config });
      get().setNotification({ 
        message: '配置保存成功',
        type: 'success'
      });
    } catch (error) {
      get().setNotification({ 
        message: `保存配置失败: ${error}`,
        type: 'error'
      });
    }
  },

  clearLogs: async () => {
    try {
      await TauriCommands.clearLogs();
      set({ logs: [] });
      get().setNotification({ 
        message: '日志已清空',
        type: 'success'
      });
    } catch (error) {
      get().setNotification({ 
        message: `清空日志失败: ${error}`,
        type: 'error'
      });
    }
  },
}));
