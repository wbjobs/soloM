import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Download, Trash2, Clock, Layers, Search, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { apiClient } from '../api/client.ts';
import type { FileMetadata } from '../../shared/types.ts';

function FilesPage() {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getFiles();
      setFiles(data);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setIsDeleting(true);
      await apiClient.deleteFile(id);
      setFiles(files.filter((f) => f.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete file:', error);
    } finally {
      setIsDeleting(false);
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
    });
  };

  const filteredFiles = files.filter((file) =>
    file.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-900/50 text-teal-400 rounded-lg text-xs">
            <CheckCircle className="w-3 h-3" />
            完整
          </span>
        );
      case 'uploading':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-900/50 text-amber-400 rounded-lg text-xs">
            <Loader className="w-3 h-3 animate-spin" />
            上传中
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-900/50 text-red-400 rounded-lg text-xs">
            <AlertCircle className="w-3 h-3" />
            错误
          </span>
        );
    }
  };

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <FileText className="w-8 h-8 text-teal-400" />
            我的文件
          </h2>
          <p className="text-slate-400">
            共 {files.length} 个加密文件，{formatFileSize(files.reduce((sum, f) => sum + f.fileSize, 0))}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文件..."
            className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors w-64"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader className="w-10 h-10 text-teal-400 animate-spin" />
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-slate-800/50 flex items-center justify-center">
            <FileText className="w-10 h-10 text-slate-600" />
          </div>
          <p className="text-slate-400 mb-2">暂无加密文件</p>
          <Link to="/" className="text-teal-400 hover:text-teal-300 transition-colors">
            上传第一个文件
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 hover:border-teal-600/30 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0 group-hover:from-teal-500/30 group-hover:to-cyan-500/30 transition-all">
                  <FileText className="w-7 h-7 text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-medium truncate">{file.fileName}</h3>
                    {getStatusBadge(file.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDate(file.createdAt)}
                    </span>
                    <span>{formatFileSize(file.fileSize)}</span>
                    <span className="flex items-center gap-1">
                      <Layers className="w-4 h-4" />
                      {file.totalChunks} 分片
                    </span>
                    <span className="font-mono text-xs">{file.algorithm}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/files/${file.id}`}
                    className="p-3 rounded-xl bg-slate-700/50 text-slate-300 hover:bg-teal-600/30 hover:text-teal-400 transition-all"
                    title="下载文件"
                  >
                    <Download className="w-5 h-5" />
                  </Link>
                  {deleteConfirm === file.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(file.id)}
                        disabled={isDeleting}
                        className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {isDeleting ? '删除中...' : '确认'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-2 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-500 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(file.id)}
                      className="p-3 rounded-xl bg-slate-700/50 text-slate-300 hover:bg-red-600/30 hover:text-red-400 transition-all"
                      title="删除文件"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FilesPage;
