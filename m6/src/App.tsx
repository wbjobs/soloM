import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { HotkeyList } from '@/components/HotkeyList';
import { ScriptEditor } from '@/components/ScriptEditor';
import { LogPanel } from '@/components/LogPanel';
import { Settings } from '@/components/Settings';
import { Notification } from '@/components/Notification';
import WorkflowEditor from '@/components/workflow/WorkflowEditor';
import { useAppStore } from '@/store/useAppStore';
import { TabType, TaskConfig, LogEntry, ExecutionState, HotkeyPressedEvent } from '@/types';
import { TauriEvents } from '@/utils/tauriApi';
import { listen } from '@tauri-apps/api/event';

function App() {
  const { activeTab, setActiveTab, loadConfig, addLog, updateExecutionState, setNotification } = useAppStore();
  const [editingTask, setEditingTask] = useState<TaskConfig | null>(null);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const setupEventListeners = async () => {
      const unlistenLog = await listen<LogEntry>(TauriEvents.LOG_ENTRY, (event) => {
        addLog(event.payload);
      });

      const unlistenState = await listen<ExecutionState>(TauriEvents.EXECUTION_STATE_CHANGED, (event) => {
        updateExecutionState(event.payload);
      });

      const unlistenHotkey = await listen<HotkeyPressedEvent>(TauriEvents.HOTKEY_PRESSED, (event) => {
        setNotification({
          message: `检测到快捷键 ${event.payload.hotkey}，正在执行任务: ${event.payload.task_name}`,
          type: 'info'
        });
      });

      return () => {
        unlistenLog();
        unlistenState();
        unlistenHotkey();
      };
    };

    setupEventListeners();
  }, [addLog, updateExecutionState, setNotification]);

  const handleEditTask = useCallback((task: TaskConfig) => {
    setEditingTask(task);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'tasks':
        return <HotkeyList onEditTask={handleEditTask} />;
      case 'workflow':
        return <WorkflowEditor />;
      case 'editor':
        return <ScriptEditor initialTask={editingTask} />;
      case 'logs':
        return <LogPanel />;
      case 'settings':
        return <Settings />;
      default:
        return <HotkeyList onEditTask={handleEditTask} />;
    }
  };

  return (
    <div className="h-screen w-screen flex bg-slate-900 overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 flex flex-col min-w-0">
        {renderContent()}
      </main>
      <Notification />
    </div>
  );
}

export default App;
