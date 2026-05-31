import React, { useState, useEffect, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { Play, Save, Square, FileCode, FolderOpen, Terminal, Code, ChevronDown, ChevronUp } from 'lucide-react';
import { TaskConfig, ScriptType } from '@/types';
import { useAppStore } from '@/store/useAppStore';

interface ScriptEditorProps {
  initialTask?: TaskConfig | null;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ initialTask }) => {
  const { selectedTask, updateTask, runTask, stopTask, executionStates } = useAppStore();
  const [task, setTask] = useState<TaskConfig>({
    name: '',
    description: '',
    hotkey: '',
    script_type: 'shell',
    script_path: '',
    script_content: '',
    working_dir: '.',
    enabled: true,
  });
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [showOutput, setShowOutput] = useState(true);

  useEffect(() => {
    if (initialTask) {
      setTask(initialTask);
    } else if (selectedTask) {
      setTask(selectedTask);
    }
  }, [initialTask, selectedTask]);

  useEffect(() => {
    if (task.name) {
      const state = executionStates[task.name];
      if (state) {
        setOutput(state.output);
        setIsRunning(state.status === 'running');
      }
    }
  }, [executionStates, task.name]);

  const handleScriptChange = useCallback((value: string) => {
    setTask(prev => ({ ...prev, script_content: value }));
  }, []);

  const handleSave = async () => {
    if (!task.name) {
      useAppStore.getState().setNotification({
        message: '请先填写任务名称',
        type: 'error'
      });
      return;
    }
    await updateTask(task);
  };

  const handleRun = async () => {
    if (!task.name) {
      useAppStore.getState().setNotification({
        message: '请先保存任务',
        type: 'error'
      });
      return;
    }
    setIsRunning(true);
    setOutput('');
    await runTask(task.name);
  };

  const handleStop = async () => {
    if (task.name) {
      await stopTask(task.name);
      setIsRunning(false);
    }
  };

  const handleScriptTypeChange = (type: ScriptType) => {
    setTask(prev => ({ ...prev, script_type: type }));
  };

  const extensions = [
    task.script_type === 'shell' 
      ? javascript() 
      : python()
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileCode className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">脚本编辑器</h2>
          </div>
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                onClick={handleRun}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-medium"
              >
                <Play className="w-4 h-4" />
                运行脚本
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium"
              >
                <Square className="w-4 h-4" />
                停止
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">任务名称</label>
            <input
              type="text"
              value={task.name}
              onChange={(e) => setTask(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="任务名称"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">快捷键组合</label>
            <input
              type="text"
              value={task.hotkey}
              onChange={(e) => setTask(prev => ({ ...prev, hotkey: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
              placeholder="Ctrl+Shift+H"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">脚本类型</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleScriptTypeChange('shell')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  task.script_type === 'shell'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Terminal className="w-4 h-4" />
                Shell
              </button>
              <button
                onClick={() => handleScriptTypeChange('python')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  task.script_type === 'python'
                    ? 'bg-yellow-600 border-yellow-500 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Code className="w-4 h-4" />
                Python
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">工作目录</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={task.working_dir}
                onChange={(e) => setTask(prev => ({ ...prev, working_dir: e.target.value }))}
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="."
              />
              <button className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-600">
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">描述</label>
          <input
            type="text"
            value={task.description}
            onChange={(e) => setTask(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="任务描述"
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 bg-slate-900">
          <CodeMirror
            value={task.script_content || ''}
            height="100%"
            theme={oneDark}
            extensions={extensions}
            onChange={handleScriptChange}
            placeholder={task.script_type === 'shell' 
              ? '# 输入 Shell 脚本\n\necho "Hello World"' 
              : '# 输入 Python 脚本\n\nprint("Hello World")'
            }
            className="h-full text-sm"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              foldGutter: true,
            }}
          />
        </div>

        <div className="border-t border-slate-700">
          <button
            onClick={() => setShowOutput(!showOutput)}
            className="w-full flex items-center justify-between px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <span className="font-medium text-sm">执行输出</span>
            {showOutput ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          {showOutput && (
            <div className="h-48 bg-slate-900 overflow-auto p-4 font-mono text-sm">
              {output ? (
                <pre className="text-green-400 whitespace-pre-wrap">{output}</pre>
              ) : (
                <span className="text-slate-500">运行脚本后，输出将显示在这里...</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
