import React, { useState, useEffect } from 'react';
import { Trash2, Filter, Search, Clock, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { LogEntry, LogLevel } from '@/types';
import { useAppStore } from '@/store/useAppStore';

export const LogPanel: React.FC = () => {
  const { logs, loadLogs, clearLogs, tasks } = useAppStore();
  const [filterTask, setFilterTask] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<LogLevel | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const getLevelIcon = (level: LogLevel) => {
    const icons = {
      info: <Info className="w-4 h-4 text-blue-400" />,
      warn: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
      error: <AlertCircle className="w-4 h-4 text-red-400" />,
      success: <CheckCircle className="w-4 h-4 text-green-400" />,
    };
    return icons[level];
  };

  const getLevelBg = (level: LogLevel) => {
    const bgs = {
      info: 'border-blue-500/30',
      warn: 'border-yellow-500/30',
      error: 'border-red-500/30',
      success: 'border-green-500/30',
    };
    return bgs[level];
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filterTask && log.task_name !== filterTask) return false;
    if (filterLevel && log.level !== filterLevel) return false;
    if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const taskNames = [...new Set(logs.map(log => log.task_name))];

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">执行日志</h2>
            <span className="text-sm text-slate-400">
              ({filteredLogs.length} 条记录)
            </span>
          </div>
          <button
            onClick={clearLogs}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors font-medium"
          >
            <Trash2 className="w-4 h-4" />
            清空日志
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索日志内容..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterTask || ''}
              onChange={(e) => setFilterTask(e.target.value || null)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">全部任务</option>
              {taskNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <select
              value={filterLevel || ''}
              onChange={(e) => setFilterLevel(e.target.value as LogLevel || null)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">全部级别</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="success">Success</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Clock className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">暂无日志记录</p>
            <p className="text-sm">执行任务后，日志将显示在这里</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`bg-slate-800/50 border-l-2 ${getLevelBg(log.level)} rounded-lg p-3 transition-all hover:bg-slate-800`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getLevelIcon(log.level)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-cyan-400 font-medium text-sm">{log.task_name}</span>
                      <span className="text-slate-500 text-xs">{formatTimestamp(log.timestamp)}</span>
                      {log.exit_code !== undefined && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          log.exit_code === 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          exit: {log.exit_code}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 text-sm font-mono break-all">{log.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
