import React, { useState } from 'react';
import { Plus, Play, Edit2, Trash2, Search, ToggleLeft, ToggleRight, Terminal, Code } from 'lucide-react';
import { TaskConfig } from '@/types';
import { useAppStore } from '@/store/useAppStore';

interface HotkeyListProps {
  onEditTask: (task: TaskConfig) => void;
}

export const HotkeyList: React.FC<HotkeyListProps> = ({ onEditTask }) => {
  const { tasks, executionStates, runTask, deleteTask, updateTask, setActiveTab, setSelectedTask } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newTask, setNewTask] = useState<Partial<TaskConfig>>({
    name: '',
    description: '',
    hotkey: '',
    script_type: 'shell',
    script_content: '',
    script_path: '',
    working_dir: '.',
    enabled: true,
  });

  const filteredTasks = tasks.filter(task =>
    task.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    task.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddTask = async () => {
    if (!newTask.name || !newTask.hotkey) {
      useAppStore.getState().setNotification({
        message: '请填写任务名称和快捷键',
        type: 'error'
      });
      return;
    }

    await useAppStore.getState().addTask(newTask as TaskConfig);
    setShowModal(false);
    setNewTask({
      name: '',
      description: '',
      hotkey: '',
      script_type: 'shell',
      script_content: '',
      script_path: '',
      working_dir: '.',
      enabled: true,
    });
  };

  const handleToggleTask = async (task: TaskConfig) => {
    await updateTask({ ...task, enabled: !task.enabled });
  };

  const handleRunTask = async (task: TaskConfig) => {
    await runTask(task.name);
  };

  const handleEditTask = (task: TaskConfig) => {
    setSelectedTask(task);
    onEditTask(task);
    setActiveTab('editor');
  };

  const getStatusBadge = (taskName: string) => {
    const state = executionStates[taskName];
    if (!state) return null;

    const statusConfig = {
      running: { color: 'bg-yellow-500/20 text-yellow-400', text: '运行中' },
      success: { color: 'bg-green-500/20 text-green-400', text: '成功' },
      failed: { color: 'bg-red-500/20 text-red-400', text: '失败' },
      idle: { color: 'bg-slate-500/20 text-slate-400', text: '空闲' },
    };

    const config = statusConfig[state.status];
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">快捷键任务</h2>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            添加任务
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索任务..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {filteredTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Terminal className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">暂无配置的任务</p>
            <p className="text-sm">点击上方按钮添加你的第一个快捷键任务</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div
                key={task.name}
                className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-white font-semibold text-lg">{task.name}</h3>
                      {getStatusBadge(task.name)}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        task.script_type === 'shell' 
                          ? 'bg-blue-500/20 text-blue-400' 
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {task.script_type === 'shell' ? <Terminal className="w-3 h-3 inline mr-1" /> : <Code className="w-3 h-3 inline mr-1" />}
                        {task.script_type}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mb-3">{task.description}</p>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2 bg-slate-700/50 px-3 py-1.5 rounded-lg">
                        <kbd className="px-1.5 py-0.5 bg-slate-600 rounded text-cyan-400 font-mono text-xs">
                          {task.hotkey}
                        </kbd>
                      </div>
                      <span className="text-slate-500">
                        工作目录: {task.working_dir}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRunTask(task)}
                      disabled={executionStates[task.name]?.status === 'running'}
                      className="p-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                      title="运行任务"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEditTask(task)}
                      className="p-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
                      title="编辑任务"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteTask(task.name)}
                      className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                      title="删除任务"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleTask(task)}
                      className="text-slate-400 hover:text-white transition-colors"
                      title={task.enabled ? '禁用任务' : '启用任务'}
                    >
                      {task.enabled ? (
                        <ToggleRight className="w-6 h-6 text-cyan-500" />
                      ) : (
                        <ToggleLeft className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-xl font-bold text-white mb-4">添加新任务</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">任务名称</label>
                <input
                  type="text"
                  value={newTask.name}
                  onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="my-awesome-task"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">描述</label>
                <input
                  type="text"
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="任务描述"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">快捷键组合</label>
                <input
                  type="text"
                  value={newTask.hotkey}
                  onChange={(e) => setNewTask({ ...newTask, hotkey: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                  placeholder="Ctrl+Shift+H"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">脚本类型</label>
                  <select
                    value={newTask.script_type}
                    onChange={(e) => setNewTask({ ...newTask, script_type: e.target.value as 'shell' | 'python' })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="shell">Shell</option>
                    <option value="python">Python</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">工作目录</label>
                  <input
                    type="text"
                    value={newTask.working_dir}
                    onChange={(e) => setNewTask({ ...newTask, working_dir: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">脚本内容</label>
                <textarea
                  value={newTask.script_content}
                  onChange={(e) => setNewTask({ ...newTask, script_content: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm h-32 resize-none"
                  placeholder={newTask.script_type === 'shell' ? 'echo "Hello World"' : 'print("Hello World")'}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddTask}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
              >
                添加任务
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
