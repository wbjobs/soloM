import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Lock, Eye, EyeOff, FileText, Clock, Layers, Shield, Loader, CheckCircle, AlertCircle, Share2, Copy, Check } from 'lucide-react';
import { apiClient } from '../api/client.ts';
import { fileDownloader } from '../utils/fileDownloader.ts';
import type { FileDetailResponse, DownloadProgress } from '../../shared/types.ts';

function FileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [file, setFile] = useState<FileDetailResponse | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decryptError, setDecryptError] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePassword, setSharePassword] = useState('');
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareMaxDownloads, setShareMaxDownloads] = useState<number | null>(null);
  const [shareExpiresDays, setShareExpiresDays] = useState<number | null>(7);

  useEffect(() => {
    if (id) {
      loadFileDetail();
    }
  }, [id]);

  const loadFileDetail = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getFileDetail(id!);
      setFile(data);
    } catch (err) {
      setError('文件不存在或加载失败');
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

  const handleDownload = async () => {
    if (!id || !password || !file) return;

    setIsDownloading(true);
    setDecryptError(false);
    setError(null);

    try {
      await fileDownloader.download(id, password, {
        onProgress: (progress) => {
          setDownloadProgress(progress);
        },
        onComplete: (blob, fileName) => {
          setIsDownloading(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        },
        onError: (err) => {
          setIsDownloading(false);
          if (err.message.includes('authentication') || err.message.includes('integrity')) {
            setDecryptError(true);
            setError('密码错误或文件已被篡改，无法解密');
          } else {
            setError(err.message || '下载失败');
          }
        },
      });
    } catch (err) {
      setIsDownloading(false);
      setDecryptError(true);
      setError('密码错误或文件已被篡改，无法解密');
    }
  };

  const handleCreateShare = async () => {
    if (!id || !sharePassword || !file) return;

    setIsCreatingShare(true);
    setError(null);

    try {
      let expiresAt: string | undefined;
      if (shareExpiresDays) {
        const date = new Date();
        date.setDate(date.getDate() + shareExpiresDays);
        expiresAt = date.toISOString();
      }

      const response = await apiClient.createShareLink({
        fileId: id,
        password: sharePassword,
        expiresAt,
        maxDownloads: shareMaxDownloads,
      });

      setShareLink(response.shareUrl);
    } catch (err) {
      setError('创建分享链接失败');
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCopyLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseShareModal = () => {
    setShowShareModal(false);
    setShareLink(null);
    setSharePassword('');
    setError(null);
  };

  const overallProgress = downloadProgress.length > 0
    ? Math.round(downloadProgress.reduce((sum, p) => sum + p.progress, 0) / downloadProgress.length)
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-10 h-10 text-teal-400 animate-spin" />
      </div>
    );
  }

  if (error && !file) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <p className="text-red-300 text-lg mb-4">{error}</p>
        <button
          onClick={() => navigate('/files')}
          className="text-teal-400 hover:text-teal-300 transition-colors"
        >
          返回文件列表
        </button>
      </div>
    );
  }

  if (!file) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto animate-slide-up">
      <button
        onClick={() => navigate('/files')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        返回文件列表
      </button>

      <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50">
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-10 h-10 text-teal-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-2">{file.fileName}</h2>
              <div className="flex flex-wrap items-center gap-4 text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatDate(file.createdAt)}
                </span>
                <span>{formatFileSize(file.fileSize)}</span>
                <span className="flex items-center gap-1">
                  <Layers className="w-4 h-4" />
                  {file.totalChunks} 分片
                </span>
              </div>
            </div>
          </div>

          {file.status === 'complete' && (
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 rounded-xl transition-colors"
            >
              <Share2 className="w-4 h-4" />
              生成分享链接
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 bg-slate-900/50 rounded-xl">
            <p className="text-slate-400 text-sm mb-1">加密算法</p>
            <p className="text-white font-mono">{file.algorithm}</p>
          </div>
          <div className="p-4 bg-slate-900/50 rounded-xl">
            <p className="text-slate-400 text-sm mb-1">分片大小</p>
            <p className="text-white font-mono">{formatFileSize(file.chunkSize)}</p>
          </div>
          <div className="p-4 bg-slate-900/50 rounded-xl col-span-2">
            <p className="text-slate-400 text-sm mb-1">密码盐值 (Salt)</p>
            <p className="text-white font-mono text-xs break-all">{file.salt}</p>
          </div>
        </div>

        {error && !showShareModal && (
          <div className={`mb-6 p-4 border rounded-xl flex items-center gap-3 ${
            decryptError
              ? 'bg-red-900/30 border-red-700/50'
              : 'bg-amber-900/30 border-amber-700/50'
          }`}>
            <AlertCircle className={`w-5 h-5 flex-shrink-0 ${
              decryptError ? 'text-red-400' : 'text-amber-400'
            }`} />
            <span className={decryptError ? 'text-red-300' : 'text-amber-300'}>{error}</span>
          </div>
        )}

        <div className="border-t border-slate-700/50 pt-8">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-teal-400" />
            <h3 className="text-white font-medium">解密下载</h3>
          </div>

          <div className="relative mb-6">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setDecryptError(false);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
              placeholder="请输入加密密码"
              className={`w-full px-4 py-4 pr-12 bg-slate-900/50 border rounded-xl text-white placeholder-slate-500 focus:outline-none transition-colors ${
                decryptError
                  ? 'border-red-500 focus:border-red-400'
                  : 'border-slate-600 focus:border-teal-500'
              }`}
              disabled={isDownloading}
              autoComplete="off"
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
              <div className="mt-4 grid grid-cols-4 gap-2">
                {downloadProgress.slice(0, 8).map((chunk) => (
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

          {!isDownloading && (
            <button
              onClick={handleDownload}
              disabled={!password}
              className={`w-full py-4 rounded-xl font-medium text-white transition-all duration-300 flex items-center justify-center gap-3 ${
                !password
                  ? 'bg-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:shadow-lg hover:shadow-teal-500/25'
              }`}
            >
              <Download className="w-5 h-5" />
              解密并下载
            </button>
          )}
        </div>

        <div className="mt-8 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
          <h4 className="text-white font-medium mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-teal-400" />
            安全提示
          </h4>
          <ul className="text-slate-400 text-sm space-y-1">
            <li>• 解密过程完全在您的浏览器中进行，不会上传密码</li>
            <li>• 每个分片都使用 AES-GCM 进行完整性验证，任何篡改都会被检测</li>
            <li>• 如果密码错误，文件将无法解密，请确保使用正确的密码</li>
            <li>• 分享链接包含密钥哈希，接收者需要输入正确密码才能解密</li>
          </ul>
        </div>
      </div>

      {showShareModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Share2 className="w-5 h-5 text-teal-400" />
                生成分享链接
              </h3>
              <button
                onClick={handleCloseShareModal}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{error}</span>
              </div>
            )}

            {!shareLink ? (
              <>
                <div className="mb-4">
                  <label className="block text-slate-300 text-sm mb-2">分享密码</label>
                  <input
                    type="text"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    placeholder="设置分享密码（接收者需要输入此密码）"
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-slate-300 text-sm mb-2">有效期（天）</label>
                    <select
                      value={shareExpiresDays ?? ''}
                      onChange={(e) => setShareExpiresDays(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:border-teal-500 transition-colors"
                    >
                      <option value="">永久有效</option>
                      <option value="1">1 天</option>
                      <option value="7">7 天</option>
                      <option value="30">30 天</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm mb-2">最大下载次数</label>
                    <select
                      value={shareMaxDownloads ?? ''}
                      onChange={(e) => setShareMaxDownloads(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:border-teal-500 transition-colors"
                    >
                      <option value="">无限制</option>
                      <option value="1">1 次</option>
                      <option value="3">3 次</option>
                      <option value="10">10 次</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleCreateShare}
                  disabled={!sharePassword || isCreatingShare}
                  className={`w-full py-3 rounded-xl font-medium text-white transition-all flex items-center justify-center gap-2 ${
                    !sharePassword || isCreatingShare
                      ? 'bg-slate-700 cursor-not-allowed'
                      : 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:shadow-lg hover:shadow-teal-500/25'
                  }`}
                >
                  {isCreatingShare ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <Share2 className="w-5 h-5" />
                  )}
                  {isCreatingShare ? '生成中...' : '生成分享链接'}
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 p-4 bg-teal-900/20 border border-teal-700/30 rounded-xl">
                  <p className="text-teal-300 text-sm mb-2">分享链接已生成！</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={shareLink}
                      readOnly
                      className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm font-mono"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="p-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                    >
                      {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  {copied && <p className="text-teal-400 text-xs mt-2">已复制到剪贴板！</p>}
                </div>

                <div className="bg-slate-900/30 rounded-xl p-4 mb-6">
                  <h4 className="text-white text-sm font-medium mb-2">分享信息</h4>
                  <ul className="text-slate-400 text-sm space-y-1">
                    <li>• 接收者需要输入正确的分享密码才能解密</li>
                    <li>• 解密过程完全在接收者浏览器本地进行</li>
                    <li>• 密码仅用于派生密钥，不会上传到服务器</li>
                    <li>• 请通过安全渠道单独告知接收者密码</li>
                  </ul>
                </div>

                <button
                  onClick={handleCloseShareModal}
                  className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                >
                  完成
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FileDetailPage;
