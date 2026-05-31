import { useState, useCallback, useRef } from 'react';
import { Upload, Shield, Eye, EyeOff, Lock, File, X, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { fileUploader } from '../utils/fileUploader.ts';
import type { UploadProgress } from '../../shared/types.ts';

function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFailedChunks, setHasFailedChunks] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setSelectedFile(files[0]);
      setError(null);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      setError(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const getPasswordStrength = (pwd: string): { level: number; label: string; color: string } => {
    if (!pwd) return { level: 0, label: '无', color: 'bg-slate-600' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 2) return { level: 1, label: '弱', color: 'bg-red-500' };
    if (score <= 4) return { level: 2, label: '中', color: 'bg-amber-500' };
    return { level: 3, label: '强', color: 'bg-teal-500' };
  };

  const passwordStrength = getPasswordStrength(password);

  const handleUpload = async () => {
    if (!selectedFile || !password) {
      setError('请选择文件并输入加密密码');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadComplete(false);
    setHasFailedChunks(false);

    try {
      const task = await fileUploader.upload(selectedFile, password, {
        onProgress: (progress) => {
          setUploadProgress(progress);
        },
        onComplete: () => {
          setIsUploading(false);
          setUploadComplete(true);
          setTimeout(() => {
            setSelectedFile(null);
            setPassword('');
            setUploadProgress([]);
            setUploadComplete(false);
          }, 2000);
        },
        onError: (err) => {
          setIsUploading(false);
          const msg = err.message || '上传失败';
          setError(msg);
          if (msg.includes('分片上传失败')) {
            setHasFailedChunks(true);
          }
        },
      });
      setCurrentTaskId(task.fileId);
    } catch (err) {
      setIsUploading(false);
      setError((err as Error).message || '上传失败');
    }
  };

  const handleRetry = () => {
    if (!currentTaskId) return;
    setIsUploading(true);
    setError(null);
    setHasFailedChunks(false);

    fileUploader.getTask(currentTaskId)?.retry();
  };

  const overallProgress = uploadProgress.length > 0
    ? Math.round(uploadProgress.reduce((sum, p) => sum + p.progress, 0) / uploadProgress.length)
    : 0;

  const doneCount = uploadProgress.filter((p) => p.status === 'done').length;
  const errorCount = uploadProgress.filter((p) => p.status === 'error').length;

  return (
    <div className="max-w-3xl mx-auto animate-slide-up">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Shield className="w-8 h-8 text-teal-400" />
          安全文件上传
        </h2>
        <p className="text-slate-400">
          文件将在浏览器端使用 AES-GCM 256位 加密后上传，服务端无法解密
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700/50 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-300 flex-1">{error}</span>
          {hasFailedChunks && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600/50 hover:bg-red-600 text-red-200 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重试失败分片
            </button>
          )}
        </div>
      )}

      {uploadComplete && (
        <div className="mb-6 p-4 bg-teal-900/30 border border-teal-700/50 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-teal-400 flex-shrink-0" />
          <span className="text-teal-300">文件加密上传完成！</span>
        </div>
      )}

      <div
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
          isDragging
            ? 'border-teal-500 bg-teal-900/20'
            : selectedFile
            ? 'border-teal-600/50 bg-slate-800/50'
            : 'border-slate-600 bg-slate-800/30 hover:border-slate-500'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isUploading}
        />

        {selectedFile ? (
          <div className="flex items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center">
              <File className="w-8 h-8 text-teal-400" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium text-lg">{selectedFile.name}</p>
              <p className="text-slate-400">{formatFileSize(selectedFile.size)}</p>
            </div>
            {!isUploading && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                }}
                className="ml-4 p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            )}
          </div>
        ) : (
          <div>
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center">
              <Upload className="w-10 h-10 text-teal-400" />
            </div>
            <p className="text-white font-medium mb-2">拖拽文件到此处</p>
            <p className="text-slate-400 text-sm">或点击选择文件</p>
          </div>
        )}
      </div>

      <div className="mt-8 bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-teal-400" />
          <h3 className="text-white font-medium">加密密码</h3>
        </div>

        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入加密密码"
            className="w-full px-4 py-3 pr-12 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
            disabled={isUploading}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">密码强度</span>
            <span className={`text-sm font-medium ${
              passwordStrength.level === 1 ? 'text-red-400' :
              passwordStrength.level === 2 ? 'text-amber-400' : 'text-teal-400'
            }`}>
              {passwordStrength.label}
            </span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex gap-1">
            {[1, 2, 3].map((level) => (
              <div
                key={level}
                className={`flex-1 rounded-full transition-all duration-300 ${
                  level <= passwordStrength.level ? passwordStrength.color : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {(isUploading || uploadProgress.length > 0) && (
        <div className="mt-6 bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white font-medium">
              {isUploading ? '加密上传中...' : '上传完成'}
            </span>
            <span className="text-teal-400 font-mono">{overallProgress}%</span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm">
            <span className="text-teal-400">{doneCount} / {uploadProgress.length} 分片完成</span>
            {errorCount > 0 && (
              <span className="text-red-400">{errorCount} 分片失败</span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-8 gap-1.5">
            {uploadProgress.map((chunk) => (
              <div
                key={chunk.chunkIndex}
                className={`h-2 rounded-full transition-all duration-300 ${
                  chunk.status === 'done' ? 'bg-teal-500' :
                  chunk.status === 'uploading' ? 'bg-cyan-400 animate-pulse' :
                  chunk.status === 'error' ? 'bg-red-500' : 'bg-slate-600'
                }`}
                title={`分片 ${chunk.chunkIndex}: ${chunk.status}`}
              />
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={isUploading || !selectedFile || !password}
        className={`w-full mt-8 py-4 rounded-xl font-medium text-white transition-all duration-300 flex items-center justify-center gap-3 ${
          isUploading || !selectedFile || !password
            ? 'bg-slate-700 cursor-not-allowed'
            : 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:shadow-lg hover:shadow-teal-500/25 animate-pulse-glow'
        }`}
      >
        <Upload className="w-5 h-5" />
        {isUploading ? '上传中...' : '开始加密上传'}
      </button>

      <div className="mt-8 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
        <h4 className="text-white font-medium mb-2">安全说明</h4>
        <ul className="text-slate-400 text-sm space-y-1">
          <li>• 密码仅在您的浏览器内存中使用，永不上传至服务器</li>
          <li>• 使用 PBKDF2 60万次迭代派生 256位 加密密钥</li>
          <li>• 每个文件分片使用独立随机 IV 进行 AES-GCM 加密</li>
          <li>• 请牢记您的密码，丢失密码将无法恢复文件</li>
          <li>• 上传失败的分片支持自动重试（最多3次，指数退避）</li>
          <li>• 大文件加密在 Worker 线程执行，不会阻塞浏览器</li>
        </ul>
      </div>
    </div>
  );
}

export default UploadPage;
