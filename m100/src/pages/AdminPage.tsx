import { useState, useEffect } from 'react';
import { BarChart3, FileText, Layers, HardDrive, Shield, Loader, Trash2, AlertTriangle, CheckCircle, Clock, FileWarning } from 'lucide-react';
import { apiClient } from '../api/client.ts';
import type { StorageStats, FileMetadata, DestroyResult } from '../../shared/types.ts';

function AdminPage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [destroyLogs, setDestroyLogs] = useState<Array<{
    id: string;
    fileId: string;
    fileName: string;
    chunksDestroyed: number;
    destroyedAt: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [destroyConfirm, setDestroyConfirm] = useState<string | null>(null);
  const [isDestroying, setIsDestroying] = useState(false);
  const [destroyResult, setDestroyResult] = useState<DestroyResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'logs'>('overview');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [statsData, filesData, logsData] = await Promise.all([
        apiClient.getAdminStats(),
        apiClient.getFiles(),
        apiClient.getDestroyHistory(),
      ]);
      setStats(statsData);
      setFiles(filesData);
      setDestroyLogs(logsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyDestroy = async (fileId: string) => {
    try {
      setIsDestroying(true);
      const result = await apiClient.emergencyDestroy(fileId);
      setDestroyResult(result);
      setDestroyConfirm(null);
      await loadData();

      setTimeout(() => {
        setDestroyResult(null);
      }, 5000);
    } catch (error) {
      console.error('Failed to destroy file:', error);
    } finally {
      setIsDestroying(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const encryptionOverhead = stats
    ? stats.totalSize > 0
      ? (((stats.totalEncryptedSize - stats.totalSize) / stats.totalSize) * 100).toFixed(2)
      : '0'
    : '0';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-10 h-10 text-teal-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-teal-400" />
          存储监控
        </h2>
        <p className="text-slate-400">系统存储状态与加密数据统计</p>
      </div>

      {destroyResult && (
        <div className="mb-6 p-4 bg-teal-900/30 border border-teal-700/50 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-teal-400" />
          <div>
            <span className="text-teal-300 font-medium">紧急销毁完成！</span>
            <span className="text-teal-400 text-sm ml-2">
              已销毁 {destroyResult.chunksDestroyed} 个分片，元数据已删除
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'overview'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
          }`}
        >
          数据概览
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'files'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
          }`}
        >
          文件管理
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'logs'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
          }`}
        >
          销毁日志
        </button>
      </div>

      {activeTab === 'overview' && stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-teal-900/30 to-cyan-900/30 rounded-2xl p-6 border border-teal-700/30">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-teal-400" />
                </div>
                <span className="text-teal-400 text-sm">文件数</span>
              </div>
              <p className="text-4xl font-bold text-white">{stats.totalFiles}</p>
              <p className="text-slate-400 text-sm mt-1">加密文件总数</p>
            </div>

            <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 rounded-2xl p-6 border border-cyan-700/30">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                  <Layers className="w-6 h-6 text-cyan-400" />
                </div>
                <span className="text-cyan-400 text-sm">分片数</span>
              </div>
              <p className="text-4xl font-bold text-white">{stats.totalChunks}</p>
              <p className="text-slate-400 text-sm mt-1">数据分片总数</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-900/30 to-teal-900/30 rounded-2xl p-6 border border-emerald-700/30">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <HardDrive className="w-6 h-6 text-emerald-400" />
                </div>
                <span className="text-emerald-400 text-sm">原始大小</span>
              </div>
              <p className="text-4xl font-bold text-white">{formatFileSize(stats.totalSize)}</p>
              <p className="text-slate-400 text-sm mt-1">文件原始总大小</p>
            </div>

            <div className="bg-gradient-to-br from-amber-900/30 to-orange-900/30 rounded-2xl p-6 border border-amber-700/30">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-amber-400" />
                </div>
                <span className="text-amber-400 text-sm">加密大小</span>
              </div>
              <p className="text-4xl font-bold text-white">{formatFileSize(stats.totalEncryptedSize)}</p>
              <p className="text-slate-400 text-sm mt-1">+{encryptionOverhead}% 加密开销</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-white font-medium mb-6">存储信息</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">存储后端</span>
                  <span className="text-white">本地磁盘 (Local Storage)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">加密算法</span>
                  <span className="text-white font-mono">AES-GCM 256-bit</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">密钥派生</span>
                  <span className="text-white font-mono">PBKDF2 (600k 迭代)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">数据库</span>
                  <span className="text-white font-mono">SQLite</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-white font-medium mb-6">安全特性</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-teal-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm">端到端加密</p>
                    <p className="text-slate-400 text-xs">服务端无法解密任何文件内容</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm">零知识架构</p>
                    <p className="text-slate-400 text-xs">用户密码永不上传服务器</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm">完整性验证</p>
                    <p className="text-slate-400 text-xs">GCM 模式自动检测数据篡改</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm">紧急销毁</p>
                    <p className="text-slate-400 text-xs">三轮数据覆写确保无法恢复</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'files' && (
        <div className="space-y-4">
          <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-300 font-medium mb-1">紧急销毁说明</p>
                <p className="text-amber-200/70 text-sm">
                  紧急销毁将使用 0x00 → 0xFF → 随机数据 三轮覆写所有磁盘上的分片文件，然后删除元数据。
                  此操作不可逆，请谨慎使用！
                </p>
              </div>
            </div>
          </div>

          {files.length === 0 ? (
            <div className="text-center py-20 bg-slate-800/30 rounded-2xl">
              <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">暂无文件</p>
            </div>
          ) : (
            files.map((file) => (
              <div
                key={file.id}
                className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-teal-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">{file.fileName}</h4>
                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span>{formatFileSize(file.fileSize)}</span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {file.totalChunks} 分片
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(file.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {destroyConfirm === file.id ? (
                    <div className="flex items-center gap-2">
                      <div className="text-red-400 text-sm mr-2">确认销毁？</div>
                      <button
                        onClick={() => handleEmergencyDestroy(file.id)}
                        disabled={isDestroying}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isDestroying ? (
                          <>
                            <Loader className="w-4 h-4 animate-spin" />
                            销毁中...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            确认销毁
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setDestroyConfirm(null)}
                        className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-500 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDestroyConfirm(file.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors border border-red-700/30"
                    >
                      <FileWarning className="w-4 h-4" />
                      紧急销毁
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div>
          {destroyLogs.length === 0 ? (
            <div className="text-center py-20 bg-slate-800/30 rounded-2xl">
              <CheckCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">暂无销毁记录</p>
            </div>
          ) : (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-slate-300 font-medium">文件名</th>
                    <th className="px-6 py-4 text-left text-slate-300 font-medium">File ID</th>
                    <th className="px-6 py-4 text-left text-slate-300 font-medium">销毁分片数</th>
                    <th className="px-6 py-4 text-left text-slate-300 font-medium">销毁时间</th>
                  </tr>
                </thead>
                <tbody>
                  {destroyLogs.map((log) => (
                    <tr key={log.id} className="border-t border-slate-700/50">
                      <td className="px-6 py-4 text-white">{log.fileName}</td>
                      <td className="px-6 py-4">
                        <code className="text-slate-400 text-sm font-mono">{log.fileId}</code>
                      </td>
                      <td className="px-6 py-4 text-amber-400">{log.chunksDestroyed}</td>
                      <td className="px-6 py-4 text-slate-400">{formatDate(log.destroyedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminPage;
