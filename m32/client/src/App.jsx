import { useState, useEffect, useRef } from 'react';
import { loadFFmpeg, isFFmpegLoaded, extractKeyframes, getVideoDuration, cancelExtraction, getMemoryInfo } from './services/ffmpegService';
import { saveKeyframes, listKeyframes, checkFFmpegStatus, uploadVideoToServer, processVideoOnServer } from './services/apiService';
import './App.css';

const LARGE_FILE_WARNING = 200 * 1024 * 1024;
const SERVER_MODE_THRESHOLD = 500 * 1024 * 1024;

export default function App() {
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [videoFile, setVideoFile] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [processingMode, setProcessingMode] = useState('browser');
  const [serverFFmpegAvailable, setServerFFmpegAvailable] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractStage, setExtractStage] = useState('');
  const [keyframes, setKeyframes] = useState([]);
  const [thumbnailWidth, setThumbnailWidth] = useState(320);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveStatus, setSaveStatus] = useState('');
  const [shareResult, setShareResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [memoryWarning, setMemoryWarning] = useState(null);
  const [currentView, setCurrentView] = useState('main');
  const [showLargeFileWarning, setShowLargeFileWarning] = useState(false);
  const [serverUploading, setServerUploading] = useState(false);
  const [serverUploadProgress, setServerUploadProgress] = useState(0);
  const [serverProcessing, setServerProcessing] = useState(false);
  const [serverUploadId, setServerUploadId] = useState(null);
  const [serverResult, setServerResult] = useState(null);
  const [transcodeResult, setTranscodeResult] = useState(null);
  const [validationReport, setValidationReport] = useState(null);
  const [showValidationDetail, setShowValidationDetail] = useState(false);
  const [enableTranscode, setEnableTranscode] = useState(true);
  const [enableValidation, setEnableValidation] = useState(true);

  const fileInputRef = useRef(null);

  useEffect(() => {
    initFFmpeg();
    loadHistory();
    checkServerFFmpeg();
  }, []);

  async function checkServerFFmpeg() {
    const status = await checkFFmpegStatus();
    setServerFFmpegAvailable(status.available);
  }

  async function initFFmpeg() {
    if (isFFmpegLoaded()) {
      setFfmpegReady(true);
      return;
    }

    setFfmpegLoading(true);
    setError(null);
    try {
      await loadFFmpeg(setLoadProgress);
      setFfmpegReady(true);
    } catch (err) {
      console.error('FFmpeg load failed:', err);
      setError('FFmpeg 加载失败，请刷新页面重试。错误: ' + err.message);
    } finally {
      setFfmpegLoading(false);
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await listKeyframes();
      setHistory(data);
    } catch (err) {
      console.error('Load history failed:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('video/mp4')) {
      setError('请上传 MP4 格式的视频文件');
      return;
    }

    setVideoFile(file);
    setKeyframes([]);
    setShareResult(null);
    setError(null);
    setWarning(null);
    setMemoryWarning(null);

    if (file.size > LARGE_FILE_WARNING) {
      setShowLargeFileWarning(true);
    }

    getVideoDuration(file).then(duration => {
      setVideoDuration(duration);
      if (duration > 300) {
        setWarning(`视频时长较长 (${formatDuration(duration)})，将采用分片处理模式，可能需要较长时间`);
      }
    });
  }

  function handleCancelExtract() {
    cancelExtraction();
    setExtracting(false);
    setWarning('提取已取消');
  }

  async function handleExtract() {
    if (!videoFile || !ffmpegReady) return;

    setExtracting(true);
    setExtractProgress(0);
    setKeyframes([]);
    setError(null);
    setWarning(null);
    setShareResult(null);
    setMemoryWarning(null);

    try {
      const frames = await extractKeyframes(videoFile, {
        thumbnailWidth,
        onProgress: setExtractProgress,
        onFrameExtracted: (frame, index, total) => {
          setKeyframes(prev => [...prev, frame]);
        },
        onMemoryWarning: (memInfo) => {
          const used = formatFileSize(memInfo.usedJSHeapSize);
          const limit = formatFileSize(memInfo.jsHeapSizeLimit);
          setMemoryWarning(`内存使用较高: ${used} / ${limit}，正在自动优化...`);
          setTimeout(() => setMemoryWarning(null), 5000);
        }
      });
      setKeyframes(frames);
      setWarning(null);
    } catch (err) {
      console.error('Extract failed:', err);
      if (err.message.includes('cancelled')) {
        setWarning('提取已取消');
      } else if (err.message.includes('memory') || err.message.includes('allocation')) {
        setError('内存不足，请尝试使用更小的缩略图尺寸或关闭其他浏览器标签页后重试。错误: ' + err.message);
      } else {
        setError('关键帧提取失败: ' + err.message);
      }
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (keyframes.length === 0) return;

    setSaving(true);
    setSaveProgress(0);
    setSaveStatus('准备上传...');
    setError(null);
    setWarning(null);

    try {
      const result = await saveKeyframes({
        videoName: videoFile.name,
        videoSize: videoFile.size,
        duration: videoDuration,
        keyframes: keyframes.map(kf => ({
          timestamp: kf.timestamp,
          dataUrl: kf.dataUrl,
          width: kf.width,
          height: kf.height,
          size: kf.size
        }))
      }, {
        onProgress: setSaveProgress,
        onStatus: setSaveStatus
      });
      setShareResult(result);
      setSaveStatus('');
      loadHistory();
    } catch (err) {
      console.error('Save failed:', err);
      if (err.message.includes('413') || err.message.includes('Payload')) {
        setError('上传数据过大，请尝试使用更小的缩略图尺寸后重试。错误: ' + err.message);
      } else {
        setError('保存失败: ' + err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  function copyShareLink() {
    if (!shareResult) return;
    const fullUrl = `${window.location.origin}/#${shareResult.id}`;
    navigator.clipboard.writeText(fullUrl);
    alert('分享链接已复制到剪贴板');
  }

  function handleModeChange(mode) {
    setProcessingMode(mode);
    setKeyframes([]);
    setServerResult(null);
    setTranscodeResult(null);
    setValidationReport(null);
    setError(null);
    setWarning(null);
  }

  async function handleServerProcess() {
    if (!videoFile) return;

    setError(null);
    setWarning(null);
    setServerResult(null);
    setTranscodeResult(null);
    setValidationReport(null);

    try {
      setServerUploading(true);
      setServerUploadProgress(0);
      
      const uploadResult = await uploadVideoToServer(videoFile, setServerUploadProgress);
      setServerUploadId(uploadResult.uploadId);
      
      setServerUploading(false);
      setServerProcessing(true);
      setExtractProgress(0);
      setExtractStage('准备处理...');

      const clientKeyframes = processingMode === 'both' && keyframes.length > 0 ? keyframes : null;

      processVideoOnServer(
        uploadResult.uploadId,
        {
          thumbnailWidth,
          enableTranscode,
          enableValidation: enableValidation && (processingMode === 'both' || keyframes.length > 0)
        },
        clientKeyframes,
        {
          onProgress: (data) => {
            setExtractProgress(data.progress);
            const stageNames = {
              probe: '分析视频信息',
              extract: '提取关键帧',
              transcode: 'H.265 转码'
            };
            setExtractStage(stageNames[data.stage] || data.stage);
          },
          onTranscode: (data) => {
            setTranscodeResult(data);
          },
          onValidation: (data) => {
            setValidationReport(data);
          },
          onComplete: (data) => {
            setServerResult(data);
            if (data.serverKeyframes) {
              setKeyframes(data.serverKeyframes.map((kf, idx) => ({
                ...kf,
                index: idx
              })));
            }
            setServerProcessing(false);
            setExtractStage('');
            loadHistory();
          },
          onError: (err) => {
            setError('服务器处理失败: ' + err.message);
            setServerProcessing(false);
            setServerUploading(false);
          }
        }
      );

    } catch (err) {
      console.error('Server process failed:', err);
      setError('服务器处理失败: ' + err.message);
      setServerUploading(false);
      setServerProcessing(false);
    }
  }

  function handleCancelServerProcess() {
    setServerProcessing(false);
    setServerUploading(false);
    setWarning('服务器处理已取消');
  }

  function getStageName(stage) {
    const names = {
      probe: '分析视频信息',
      extract: '提取关键帧',
      transcode: 'H.265 转码'
    };
    return names[stage] || stage;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🎬 视频关键帧提取器</h1>
        <p className="subtitle">基于 WebAssembly 的浏览器端 I 帧提取工具</p>
        <div className="view-tabs">
          <button 
            className={`tab-btn ${currentView === 'main' ? 'active' : ''}`}
            onClick={() => setCurrentView('main')}
          >
            提取关键帧
          </button>
          <button 
            className={`tab-btn ${currentView === 'history' ? 'active' : ''}`}
            onClick={() => { setCurrentView('history'); loadHistory(); }}
          >
            历史记录
          </button>
        </div>
      </header>

      <main className="main-content">
        {currentView === 'main' ? (
          <>
            <div className="status-bar">
              <div className={`status-item ${ffmpegReady ? 'ready' : ffmpegLoading ? 'loading' : 'error'}`}>
                <span className="status-dot"></span>
                浏览器 FFmpeg: {ffmpegReady ? '已就绪' : ffmpegLoading ? '加载中...' : '未加载'}
                {ffmpegLoading && <span className="progress-text">({loadProgress.toFixed(0)}%)</span>}
              </div>
              {serverFFmpegAvailable && (
                <div className="status-item ready">
                  <span className="status-dot"></span>
                  服务器 FFmpeg: 可用
                </div>
              )}
            </div>

            {serverFFmpegAvailable && videoFile && (
              <div className="mode-selector">
                <span className="mode-label">处理模式：</span>
                <div className="mode-buttons">
                  <button 
                    className={`mode-btn ${processingMode === 'browser' ? 'active' : ''}`}
                    onClick={() => handleModeChange('browser')}
                  >
                    🌐 浏览器端处理
                  </button>
                  <button 
                    className={`mode-btn ${processingMode === 'server' ? 'active' : ''}`}
                    onClick={() => handleModeChange('server')}
                  >
                    🖥️ 服务器端专业处理
                  </button>
                  {keyframes.length > 0 && (
                    <button 
                      className={`mode-btn ${processingMode === 'both' ? 'active' : ''}`}
                      onClick={() => handleModeChange('both')}
                    >
                      ⚖️ 对比校验模式
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="error-box">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

            {warning && !error && (
              <div className="warning-box">
                <span className="warning-icon">⚡</span>
                {warning}
              </div>
            )}

            {memoryWarning && (
              <div className="memory-warning-box">
                <span className="warning-icon">💾</span>
                {memoryWarning}
              </div>
            )}

            {showLargeFileWarning && (
              <div className="modal-overlay" onClick={() => setShowLargeFileWarning(false)}>
                <div className="modal-content warning-modal" onClick={(e) => e.stopPropagation()}>
                  <h3>⚠️ 大文件提示</h3>
                  <p>您上传的视频文件较大 ({formatFileSize(videoFile?.size || 0)})，处理过程可能需要较长时间。</p>
                  <p className="warning-tips">
                    <strong>建议：</strong><br />
                    • 请保持浏览器标签页处于活动状态<br />
                    • 关闭其他不必要的标签页以释放内存<br />
                    • 处理过程中请勿刷新页面
                  </p>
                  <p>系统将自动采用分片处理模式以避免内存溢出。</p>
                  <button 
                    className="confirm-btn"
                    onClick={() => setShowLargeFileWarning(false)}
                  >
                    我知道了，继续处理
                  </button>
                </div>
              </div>
            )}

            {ffmpegLoading && (
              <div className="loading-box">
                <div className="spinner"></div>
                <p>正在加载 FFmpeg.wasm ({loadProgress.toFixed(0)}%)</p>
                <p className="hint">首次加载需要下载约 25MB 的 WASM 文件，请耐心等待...</p>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${loadProgress}%` }}></div>
                </div>
              </div>
            )}

            {ffmpegReady && (
              <div className="upload-section">
                <div 
                  className="upload-area"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      const event = { target: { files: [file] } };
                      handleFileChange(event);
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp4,video/mp4"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <div className="upload-icon">📁</div>
                  {videoFile ? (
                    <div className="file-info">
                      <p className="file-name">{videoFile.name}</p>
                      <p className="file-meta">
                        {formatFileSize(videoFile.size)} · {formatDuration(videoDuration)}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="upload-text">点击或拖拽上传 MP4 视频</p>
                      <p className="upload-hint">视频将在本地浏览器处理，不会上传到服务器</p>
                    </div>
                  )}
                </div>

                <div className="options-bar">
                  <label className="option-item">
                    <span>缩略图宽度:</span>
                    <select 
                      value={thumbnailWidth}
                      onChange={(e) => setThumbnailWidth(Number(e.target.value))}
                      disabled={extracting || serverProcessing || serverUploading}
                    >
                      <option value={160}>160px</option>
                      <option value={240}>240px</option>
                      <option value={320}>320px</option>
                      <option value={480}>480px</option>
                      <option value={640}>640px</option>
                    </select>
                  </label>
                  
                  {(processingMode === 'server' || processingMode === 'both') && serverFFmpegAvailable && (
                    <>
                      <label className="option-item checkbox-item">
                        <input 
                          type="checkbox" 
                          checked={enableTranscode}
                          onChange={(e) => setEnableTranscode(e.target.checked)}
                          disabled={serverProcessing}
                        />
                        <span>H.265 转码</span>
                      </label>
                      {processingMode === 'both' && (
                        <label className="option-item checkbox-item">
                          <input 
                            type="checkbox" 
                            checked={enableValidation}
                            onChange={(e) => setEnableValidation(e.target.checked)}
                            disabled={serverProcessing}
                          />
                          <span>时间戳校验</span>
                        </label>
                      )}
                    </>
                  )}
                </div>

                {(processingMode === 'browser' || processingMode === 'both') && ffmpegReady && !serverProcessing && (
                  <div className="action-buttons">
                    <button
                      className="extract-btn"
                      onClick={handleExtract}
                      disabled={!videoFile || extracting}
                    >
                      {extracting ? (
                        <>
                          <span className="spinner small"></span>
                          浏览器端提取中... {extractProgress.toFixed(0)}%
                        </>
                      ) : (
                        '🌐 浏览器端提取'
                      )}
                    </button>
                    {extracting && (
                      <button
                        className="cancel-btn"
                        onClick={handleCancelExtract}
                      >
                        ✕ 取消
                      </button>
                    )}
                  </div>
                )}

                {extracting && processingMode !== 'server' && (
                  <div className="progress-section">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${extractProgress}%` }}></div>
                    </div>
                    <p className="progress-hint">
                      {keyframes.length > 0 && `已提取 ${keyframes.length} 个关键帧...`}
                    </p>
                  </div>
                )}

                {(processingMode === 'server' || processingMode === 'both') && serverFFmpegAvailable && (
                  <div className="action-buttons">
                    <button
                      className="extract-btn server-btn"
                      onClick={handleServerProcess}
                      disabled={!videoFile || serverProcessing || serverUploading || (processingMode === 'both' && keyframes.length === 0)}
                    >
                      {serverUploading ? (
                        <>
                          <span className="spinner small"></span>
                          上传中... {serverUploadProgress.toFixed(0)}%
                        </>
                      ) : serverProcessing ? (
                        <>
                          <span className="spinner small"></span>
                          {extractStage || '处理中'}... {extractProgress.toFixed(0)}%
                        </>
                      ) : (
                        '🖥️ 服务器端处理'
                      )}
                    </button>
                    {(serverProcessing || serverUploading) && (
                      <button
                        className="cancel-btn"
                        onClick={handleCancelServerProcess}
                      >
                        ✕ 取消
                      </button>
                    )}
                  </div>
                )}

                {(serverUploading || serverProcessing) && (
                  <div className="progress-section">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${serverUploading ? serverUploadProgress : extractProgress}%` }}></div>
                    </div>
                    <p className="progress-hint">
                      {serverUploading ? '正在上传视频到服务器...' : 
                       serverProcessing ? `${extractStage}...` : ''}
                    </p>
                  </div>
                )}
              </div>
            )}

            {keyframes.length > 0 && (
              <div className="results-section">
                <div className="results-header">
                  <h2>提取结果</h2>
                  <div className="results-stats">
                    <span>共 {keyframes.length} 个关键帧</span>
                    <button
                      className="save-btn"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <span className="spinner small"></span>
                          {saveStatus || '保存中...'}
                        </>
                      ) : (
                        '💾 生成分享链接'
                      )}
                    </button>
                  </div>
                </div>

                {saving && (
                  <div className="save-progress-section">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${saveProgress}%` }}></div>
                    </div>
                    <p className="save-status-text">{saveStatus || '正在保存...'} ({saveProgress.toFixed(0)}%)</p>
                  </div>
                )}

                {transcodeResult && (
                  <div className="transcode-result">
                    <h3>🎞️ H.265 转码结果</h3>
                    <div className="transcode-stats">
                      <div className="stat-item">
                        <span className="stat-label">原始大小</span>
                        <span className="stat-value">{formatFileSize(transcodeResult.originalSize)}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">转码后</span>
                        <span className="stat-value">{formatFileSize(transcodeResult.transcodedSize)}</span>
                      </div>
                      <div className="stat-item highlight">
                        <span className="stat-label">压缩率</span>
                        <span className="stat-value">{transcodeResult.compressionRatio}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {validationReport && (
                  <div className="validation-report">
                    <div className="validation-header">
                      <h3>⚖️ 关键帧时间戳校验报告</h3>
                      <div className="grade-badge" style={{ backgroundColor: validationReport.grade.color }}>
                        <span className="grade-letter">{validationReport.grade.letter}</span>
                        <span className="grade-text">{validationReport.grade.text}</span>
                      </div>
                    </div>
                    
                    <div className="validation-summary">
                      <p>{validationReport.summary}</p>
                    </div>

                    <div className="validation-stats">
                      <div className="stat-item">
                        <span className="stat-label">前端关键帧数</span>
                        <span className="stat-value">{validationReport.clientFrameCount}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">服务器关键帧数</span>
                        <span className="stat-value">{validationReport.serverFrameCount}</span>
                      </div>
                      <div className="stat-item success">
                        <span className="stat-label">匹配数</span>
                        <span className="stat-value">{validationReport.matchedCount}</span>
                      </div>
                      <div className="stat-item warning">
                        <span className="stat-label">缺失</span>
                        <span className="stat-value">{validationReport.missingCount}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">准确率</span>
                        <span className="stat-value">{validationReport.accuracy}%</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">平均时差</span>
                        <span className="stat-value">{validationReport.averageTimeDifference}ms</span>
                      </div>
                    </div>

                    <button 
                      className="toggle-detail-btn"
                      onClick={() => setShowValidationDetail(!showValidationDetail)}
                    >
                      {showValidationDetail ? '收起详情 ▲' : '查看详情 ▼'}
                    </button>

                    {showValidationDetail && (
                      <div className="validation-detail">
                        {validationReport.matches.length > 0 && (
                          <div className="detail-section">
                            <h4>✅ 匹配的关键帧 (前20个)</h4>
                            <div className="detail-list">
                              {validationReport.matches.slice(0, 20).map((m, i) => (
                                <div key={i} className="detail-item">
                                  <span>#{m.clientIndex + 1}: {formatTime(m.clientTimestamp)}</span>
                                  <span className="diff-text">误差: {(m.difference * 1000).toFixed(1)}ms</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {validationReport.missing.length > 0 && (
                          <div className="detail-section">
                            <h4>❌ 未匹配的前端关键帧 (前10个)</h4>
                            <div className="detail-list">
                              {validationReport.missing.slice(0, 10).map((m, i) => (
                                <div key={i} className="detail-item missing">
                                  <span>#{m.clientIndex + 1}: {formatTime(m.timestamp)}</span>
                                  <span className="reason-text">{m.reason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {validationReport.extra.length > 0 && (
                          <div className="detail-section">
                            <h4>⚠️ 服务器额外检测到的帧 (前10个)</h4>
                            <div className="detail-list">
                              {validationReport.extra.slice(0, 10).map((e, i) => (
                                <div key={i} className="detail-item extra">
                                  <span>#{e.serverIndex + 1}: {formatTime(e.timestamp)}</span>
                                  <span className="reason-text">{e.reason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {shareResult && (
                  <div className="share-box">
                    <div className="share-success">
                      <span className="success-icon">✅</span>
                      分享链接已生成！
                    </div>
                    <div className="share-link">
                      <code>{`${window.location.origin}/#${shareResult.id}`}</code>
                      <button className="copy-btn" onClick={copyShareLink}>
                        📋 复制
                      </button>
                    </div>
                    <p className="share-meta">
                      ID: {shareResult.id} · 关键帧数: {shareResult.keyframeCount}
                    </p>
                  </div>
                )}

                <div className="keyframes-grid">
                  {keyframes.map((frame) => (
                    <div
                      key={frame.index}
                      className="keyframe-card"
                      onClick={() => setSelectedFrame(frame)}
                    >
                      <img src={frame.dataUrl} alt={`Frame ${frame.index}`} />
                      <div className="frame-info">
                        <span className="frame-index">#{frame.index + 1}</span>
                        <span className="frame-time">{frame.timestampFormatted}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedFrame && (
              <div className="modal-overlay" onClick={() => setSelectedFrame(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <button className="modal-close" onClick={() => setSelectedFrame(null)}>
                    ✕
                  </button>
                  <img src={selectedFrame.dataUrl} alt="Selected frame" />
                  <div className="modal-info">
                    <p><strong>帧索引:</strong> #{selectedFrame.index + 1}</p>
                    <p><strong>时间戳:</strong> {selectedFrame.timestampFormatted}</p>
                    <p><strong>尺寸:</strong> {selectedFrame.width} × {selectedFrame.height}</p>
                    <p><strong>大小:</strong> {formatFileSize(selectedFrame.size)}</p>
                    <a 
                      href={selectedFrame.dataUrl} 
                      download={`frame_${selectedFrame.index + 1}.jpg`}
                      className="download-btn"
                    >
                      📥 下载此帧
                    </a>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="history-section">
            <h2>历史记录</h2>
            {loadingHistory ? (
              <div className="loading-box">
                <div className="spinner"></div>
                <p>加载中...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="empty-state">
                <p>暂无历史记录</p>
                <p className="hint">提取关键帧并生成分享链接后，记录将显示在这里</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <div key={item.id} className="history-item">
                    <div className="history-info">
                      <h3>{item.videoName}</h3>
                      <p>
                        {item.keyframeCount} 个关键帧 · 
                        时长 {formatDuration(item.duration)} · 
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <a 
                      href={`${window.location.origin}/#${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-btn"
                    >
                      查看 →
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <p>⚡ 基于 FFmpeg.wasm · 所有处理在浏览器本地完成 · 保护您的隐私</p>
      </footer>
    </div>
  );
}
