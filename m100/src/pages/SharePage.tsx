import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Lock, Eye, EyeOff, Download, AlertCircle, Loader, FileText } from 'lucide-react';
import { apiClient } from '../api/client.ts';
import { cryptoWorker } from '../utils/crypto/workerManager.ts';
import { base64ToArrayBuffer } from '../utils/crypto/keyDerivation.ts';
import type { DownloadProgress } from '../../shared/types.ts';

function SharePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shareInfo, setShareInfo] = useState<{
    fileName: string;
    fileSize: number;
    fileId: string;
    salt: string;
    algorithm: string;
  } | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLinkInvalid, setIsLinkInvalid] = useState(false);

  useEffect(() => {
    if (id) {
      loadShareInfo();
    }
  }, [id]);

  const loadShareInfo = async () => {
    try {
      setIsLoading(true);
      const info = await apiClient.getShareInfo(id!);
      setShareInfo(info);
    } catch (err: any) {
      setIsLinkInvalid(true);
      if (err.message.includes('410')) {
        setError('分享链接已过期或达到最大下载次数');
      } else {
        setError('分享链接不存在或已失效');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const handleDecryptAndDownload = async () => {
    if (!shareInfo || !password || !id) return;

    setIsDownloading(true);
    setError(null);

    try {
      const result = await apiClient.verifySharePassword(id, password);

      if (!result.valid) {
        setError('密码错误，请重试');
        setIsDownloading(false);
        return;
      }

      const salt = base64ToArrayBuffer(shareInfo.salt);
      await cryptoWorker.deriveKey(password, shareInfo.salt);

      const fileDetail = await apiClient.getFileDetail(shareInfo.fileId);
      const totalChunks = fileDetail.totalChunks;
      const progress: DownloadProgress[] = Array.from({ length: totalChunks }, (_, i) => ({
        chunkIndex: i,
        status: 'pending' as const,
        progress: 0,
      }));
      setDownloadProgress(progress);

      const chunks: ArrayBuffer[] = new Array(totalChunks);

      for (let i = 0; i < totalChunks; i++) {
        const prog = progress[i];
        prog.status = 'uploading';
        prog.progress = 0;
        setDownloadProgress([...progress]);

        try {
          const { data: encryptedData, iv: ivBase64 } = await apiClient.downloadChunk(shareInfo.fileId, i);
          prog.progress = 50;
          setDownloadProgress([...progress]);

          const decryptedData = await cryptoWorker.decryptChunk(encryptedData, ivBase64);
          prog.progress = 80;
          setDownloadProgress([...progress]);

          chunks[i] = decryptedData;

          prog.status = 'done';
          prog.progress = 100;
          setDownloadProgress([...progress]);
        } catch (err) {
          prog.status = 'error';
          prog.progress = 0;
          setDownloadProgress([...progress]);
          throw err;
        }
      }

      const blob = new Blob(chunks, { type: fileDetail.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = shareInfo.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await cryptoWorker.clearKey();
      setIsDownloading(false);
    } catch (err: any) {
      setIsDownloading(false);
      await cryptoWorker.clearKey();
      if (err.message.includes('authentication') || err.message.includes('integrity')) {
        setError('密码错误或文件已被篡改，无法解密');
      } else {
        setError(err.message || '下载失败');
      }
    }
  };

  const overallProgress = downloadProgress.length > 0
    ? Math.round(downloadProgress.reduce((sum, p) => sum + p.progress, 0) / downloadProgress.length)
    : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader className="w-10 h-10 text-teal-400 animate-spin" />
      </div>
    );
  }

  if (isLinkInvalid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-900/30 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">链接无效</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8">
      <div className="max-w-lg w-full animate-slide-up">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-teal-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">SecureVault 加密分享</h1>
          <p className="text-slate-400">文件已端到端加密，输入密码即可解密下载</p>
        </div>

        {shareInfo && (
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <FileText className="w-7 h-7 text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-medium truncate">{shareInfo.fileName}</h3>
                <p className="text-slate-400 text-sm">
                  {formatFileSize(shareInfo.fileSize)} · {shareInfo.algorithm}
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700/50 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-red-300">{error}</span>
          </div>
        )}

        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-teal-400" />
            <h3 className="text-white font-medium">输入解密密码</h3>
          </div>

          <div className="relative mb-6">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && !isDownloading && handleDecryptAndDownload()}
              placeholder="请输入分享密码"
              className="w-full px-4 py-4 pr-12 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
              disabled={isDownloading}
              autoComplete="off"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              disabled={isDownloading}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {isDownloading && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4 text-teal-400" />
                  正在下载并解密...
                </span>
                <span className="text-teal-400 font-mono">{overallProgress}%</span>
              </div>
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-8 gap-1.5">
                {downloadProgress.slice(0, 16).map((chunk) => (
                  <div
                    key={chunk.chunkIndex}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      chunk.status === 'done' ? 'bg-teal-500' :
                      chunk.status === 'uploading' ? 'bg-cyan-400 animate-pulse' :
                      chunk.status === 'error' ? 'bg-red-500' : 'bg-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleDecryptAndDownload}
            disabled={isDownloading || !password}
            className={`w-full py-4 rounded-xl font-medium text-white transition-all duration-300 flex items-center justify-center gap-3 ${
              isDownloading || !password
                ? 'bg-slate-700 cursor-not-allowed'
                : 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:shadow-lg hover:shadow-teal-500/25'
            }`}
          >
            <Download className="w-5 h-5" />
            {isDownloading ? '解密中...' : '解密并下载'}
          </button>
        </div>

        <div className="mt-6 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
          <p className="text-slate-400 text-xs leading-relaxed">
            • 解密过程完全在您的浏览器中进行，密码不会上传至服务器<br />
            • 每个分片都使用 AES-GCM 进行完整性验证，任何篡改都会被检测<br />
            • 请使用分享者提供的正确密码，否则无法解密文件
          </p>
        </div>
      </div>
    </div>
  );
}

export default SharePage;
