'use client';

import React, { useState, useEffect } from 'react';
import {
  Play,
  Square,
  Trash2,
  Settings,
  Database,
  Cpu,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getDatasets,
  getFinetuneTasks,
  getFinetuneDefaults,
  startFinetune,
  cancelFinetune,
  deleteDataset,
  streamFinetuneStatus,
} from '@/lib/api';
import {
  DatasetInfo,
  FinetuneTask,
  FinetuneConfig,
  FinetuneDefaults,
  FinetuneStatusResponse,
} from '@/types';
import LossChart from './LossChart';
import DatasetUpload from './DatasetUpload';

type TabType = 'datasets' | 'tasks' | 'config';

export default function FinetuneManager() {
  const [activeTab, setActiveTab] = useState<TabType>('datasets');
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [tasks, setTasks] = useState<FinetuneTask[]>([]);
  const [defaults, setDefaults] = useState<FinetuneDefaults | null>(null);
  const [config, setConfig] = useState<Partial<FinetuneConfig>>({});
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [loading, setLoading] = useState({ datasets: false, tasks: false, starting: false });
  const [streamingTaskId, setStreamingTaskId] = useState<string | null>(null);
  const [streamingStatus, setStreamingStatus] = useState<FinetuneStatusResponse | null>(null);

  useEffect(() => {
    loadDatasets();
    loadTasks();
    loadDefaults();
  }, []);

  useEffect(() => {
    if (!streamingTaskId) return;

    const cleanup = streamFinetuneStatus(
      streamingTaskId,
      (status) => {
        setStreamingStatus(status);
        setTasks((prev) =>
          prev.map((t) =>
            t.task_id === streamingTaskId
              ? {
                  ...t,
                  status: status.status as any,
                  current_epoch: status.current_epoch,
                  total_epochs: status.total_epochs,
                  current_step: status.current_step,
                  total_steps: status.total_steps,
                  loss_history: status.loss_history,
                  error_message: status.error_message,
                }
              : t
          )
        );
      },
      () => {
        setStreamingTaskId(null);
      },
      (error) => {
        console.error('Stream error:', error);
        setStreamingTaskId(null);
      }
    );

    return cleanup;
  }, [streamingTaskId]);

  const loadDatasets = async () => {
    setLoading((prev) => ({ ...prev, datasets: true }));
    try {
      const response = await getDatasets();
      setDatasets = response.datasets);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    } finally {
      setLoading((prev) => ({ ...prev, datasets: false }));
    }
  };

  const loadTasks = async () => {
    setLoading((prev) => ({ ...prev, tasks: true }));
    try {
      const response = await getFinetuneTasks();
      setTasks(response.tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading((prev) => ({ ...prev, tasks: false }));
    }
  };

  const loadDefaults = async () => {
    try {
      const response = await getFinetuneDefaults();
      setDefaults(response);
      setConfig(response);
    } catch (error) {
      console.error('Failed to load defaults:', error);
    }
  };

  const handleStartFinetune = async () => {
    if (!selectedDataset) return;

    setLoading((prev) => ({ ...prev, starting: true }));
    try {
      const response = await startFinetune({
        ...config,
        dataset_id: selectedDataset,
      } as FinetuneConfig);
      
      setStreamingTaskId(response.task_id);
      setStreamingStatus(null);
      await loadTasks();
    } catch (error) {
      console.error('Failed to start finetune:', error);
    } finally {
      setLoading((prev) => ({ ...prev, starting: false }));
    }
  };

  const handleCancelFinetune = async (taskId: string) => {
    try {
      await cancelFinetune(taskId);
      if (streamingTaskId === taskId) {
        setStreamingTaskId(null);
      }
      await loadTasks();
    } catch (error) {
      console.error('Failed to cancel finetune:', error);
    }
  };

  const handleDeleteDataset = async (datasetId: string) => {
    try {
      await deleteDataset(datasetId);
      await loadDatasets();
      if (selectedDataset === datasetId) {
        setSelectedDataset(null);
      }
    } catch (error) {
      console.error('Failed to delete dataset:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; bg: string; icon: any }> = {
      pending: { color: 'text-yellow-700', bg: 'bg-yellow-100', icon: Clock },
      running: { color: 'text-blue-700', bg: 'bg-blue-100', icon: Cpu },
      completed: { color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
      failed: { color: 'text-red-700', bg: 'bg-red-100', icon: XCircle },
      cancelled: { color: 'text-gray-700', bg: 'bg-gray-100', icon: AlertCircle },
    };

    const cfg = statusConfig[status] || statusConfig.pending;
    const Icon = cfg.icon;

    return (
      <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
        <Icon className="h-3 w-3 mr-1" />
        {status === 'pending' ? '等待中' : status === 'running' ? '运行中' : status === 'completed' ? '已完成' : status === 'failed' ? '失败' : '已取消'}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const tabs = [
    { id: 'datasets' as const, label: '数据集管理', icon: Database },
    { id: 'tasks' as const, label: '训练任务', icon: Cpu },
    { id: 'config' as const, label: '训练配置', icon: Settings },
  ];

  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center space-x-2 py-3 px-4 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            )}
          >
            <tab.icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === 'datasets' && (
          <div className="space-y-6">
            <DatasetUpload onUploadSuccess={() => loadDatasets()} />
            
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">已上传的数据集</h3>
                <button
                  onClick={loadDatasets}
                  disabled={loading.datasets}
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center space-x-1"
                >
                  <RefreshCw className={cn('h-4 w-4', loading.datasets && 'animate-spin')} />
                  <span>刷新</span>
                </button>
              </div>
              
              {datasets.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无数据集</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {datasets.map((dataset) => (
                    <div
                      key={dataset.id}
                      className={cn(
                        'flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors',
                        selectedDataset === dataset.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                      onClick={() => setSelectedDataset(dataset.id)}
                    >
                      <div className="flex items-center space-x-3">
                        <Database className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">{dataset.name}</p>
                          <p className="text-xs text-gray-500">
                            {dataset.total_samples} 条样本 · {dataset.format.toUpperCase()} · {formatFileSize(dataset.size_bytes)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-400">
                          {formatDate(dataset.created_at)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDataset(dataset.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">训练任务列表</h3>
              <button
                onClick={loadTasks}
                disabled={loading.tasks}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center space-x-1"
              >
                <RefreshCw className={cn('h-4 w-4', loading.tasks && 'animate-spin')} />
                <span>刷新</span>
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Cpu className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无训练任务</p>
                <p className="text-xs mt-1">在「训练配置」中选择数据集并启动微调</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.task_id}
                    className={cn(
                      'p-4 border rounded-lg',
                      streamingTaskId === task.task_id
                        ? 'border-primary-500 bg-primary-50/50'
                        : 'border-gray-200'
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {task.dataset_name}
                          </span>
                          {getStatusBadge(task.status)}
                        </div>
                        <p className="text-xs text-gray-500">
                          {task.base_model} · 任务 ID: {task.task_id}
                        </p>
                      </div>
                      {task.status === 'running' && (
                        <button
                          onClick={() => handleCancelFinetune(task.task_id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          title="取消训练"
                        >
                          <Square className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {task.total_steps > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Epoch {task.current_epoch}/{task.total_epochs}</span>
                          <span>Step {task.current_step}/{task.total_steps}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 transition-all duration-300"
                            style={{ width: `${(task.current_step / Math.max(task.total_steps, 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {streamingTaskId === task.task_id && streamingStatus && (
                      <div className="mt-4">
                        <LossChart lossHistory={streamingStatus.loss_history} height={150} />
                      </div>
                    )}

                    {task.loss_history && task.loss_history.length > 0 && streamingTaskId !== task.task_id && (
                      <LossChart lossHistory={task.loss_history} height={120} />
                    )}

                    {task.error_message && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                        <p className="text-xs text-red-600">{task.error_message}</p>
                      </div>
                    )}

                    {task.status === 'running' && streamingTaskId !== task.task_id && (
                      <button
                        onClick={() => {
                          setStreamingTaskId(task.task_id);
                          setStreamingStatus(null);
                        }}
                        className="mt-2 w-full py-1.5 text-sm text-primary-600 hover:text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
                      >
                        查看实时训练进度
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'config' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">选择数据集</h3>
              <select
                value={selectedDataset || ''}
                onChange={(e) => setSelectedDataset(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">请选择数据集...</option>
                {datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.total_samples} 条样本)
                  </option>
                ))}
              </select>
            </div>

            {defaults && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">基础模型</label>
                  <input
                    type="text"
                    value={config.base_model || defaults.base_model}
                    onChange={(e) => setConfig({ ...config, base_model: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">训练轮数</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={config.num_epochs || defaults.num_epochs}
                    onChange={(e) => setConfig({ ...config, num_epochs: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">批次大小</label>
                  <input
                    type="number"
                    min="1"
                    max="32"
                    value={config.batch_size || defaults.batch_size}
                    onChange={(e) => setConfig({ ...config, batch_size: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">学习率</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={config.learning_rate || defaults.learning_rate}
                    onChange={(e) => setConfig({ ...config, learning_rate: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">LoRA Rank</label>
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={config.lora_r || defaults.lora_r}
                    onChange={(e) => setConfig({ ...config, lora_r: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">LoRA Alpha</label>
                  <input
                    type="number"
                    value={config.lora_alpha || defaults.lora_alpha}
                    onChange={(e) => setConfig({ ...config, lora_alpha: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">LoRA Dropout</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="0.9"
                    value={config.lora_dropout || defaults.lora_dropout}
                    onChange={(e) => setConfig({ ...config, lora_dropout: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最大序列长度</label>
                  <input
                    type="number"
                    min="64"
                    max="4096"
                    value={config.max_seq_length || defaults.max_seq_length}
                    onChange={(e) => setConfig({ ...config, max_seq_length: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleStartFinetune}
              disabled={!selectedDataset || loading.starting}
              className={cn(
                'w-full py-3 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors',
                selectedDataset && !loading.starting
                  ? 'bg-primary-500 hover:bg-primary-600 text-white'
                  : 'bg-gray-300 cursor-not-allowed text-gray-500'
              )}
            >
              {loading.starting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>启动中...</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  <span>开始 LoRA 微调</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
