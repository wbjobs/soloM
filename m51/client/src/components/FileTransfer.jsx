import { useState, useRef, useEffect } from 'react';
import { processFile, formatFileSize, formatSpeed } from '../lib/fileChunker.js';
import meshTransferManager from '../lib/meshTransferManager.js';
import webrtcManager from '../lib/webrtcManager.js';

function FileTransfer() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingPhase, setProcessingPhase] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [incomingOffers, setIncomingOffers] = useState([]);
  const [peerRates, setPeerRates] = useState({});
  const [totalUploadSpeed, setTotalUploadSpeed] = useState(0);
  const [totalDownloadSpeed, setTotalDownloadSpeed] = useState(0);
  const [resumeNotifications, setResumeNotifications] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleIncomingOffer = (data) => {
      setIncomingOffers(prev => {
        const exists = prev.find(o => o.transferId === data.transferId);
        if (exists) return prev;
        return [...prev, data];
      });

      if (data.isResume && data.resumedChunks > 0) {
        setResumeNotifications(prev => [...prev, {
          id: Date.now(),
          fileName: data.fileInfo.name,
          resumedChunks: data.resumedChunks,
          totalChunks: data.fileInfo.totalChunks
        }]);
        setTimeout(() => {
          setResumeNotifications(prev => prev.filter(n => n.fileName !== data.fileInfo.name));
        }, 5000);
      }
    };

    const updateTransfers = () => {
      setTransfers(meshTransferManager.getAllTransfers());
    };

    const handleSpeedUpdate = () => {
      const rates = meshTransferManager.getPeerTransferRates();
      setPeerRates(rates);

      let upload = 0;
      let download = 0;
      Object.values(rates).forEach(rate => {
        upload += rate.uploadSpeed;
        download += rate.downloadSpeed;
      });
      setTotalUploadSpeed(upload);
      setTotalDownloadSpeed(download);
    };

    const handleTransferResuming = (data) => {
      setResumeNotifications(prev => [...prev, {
        id: Date.now(),
        fileName: data.fileInfo.name,
        resumedChunks: data.resumedChunks,
        totalChunks: data.fileInfo.totalChunks
      }]);
    };

    const handlePeerReconnected = (data) => {
      setResumeNotifications(prev => [...prev, {
        id: Date.now(),
        peerId: data.peerId,
        type: 'peer_reconnected'
      }]);
      setTimeout(() => {
        setResumeNotifications(prev => prev.filter(n => n.peerId !== data.peerId || n.type !== 'peer_reconnected'));
      }, 3000);
    };

    meshTransferManager.on('incomingFileOffer', handleIncomingOffer);
    meshTransferManager.on('transferStarted', updateTransfers);
    meshTransferManager.on('transferProgress', updateTransfers);
    meshTransferManager.on('chunkReceived', updateTransfers);
    meshTransferManager.on('chunkSent', updateTransfers);
    meshTransferManager.on('transferComplete', updateTransfers);
    meshTransferManager.on('outgoingTransferComplete', updateTransfers);
    meshTransferManager.on('chunkRetry', updateTransfers);
    meshTransferManager.on('chunkFailed', updateTransfers);
    meshTransferManager.on('transferResuming', handleTransferResuming);
    meshTransferManager.on('peerReconnected', handlePeerReconnected);

    webrtcManager.on('speedUpdate', handleSpeedUpdate);
    handleSpeedUpdate();

    return () => {};
  }, []);

  const handleFileSelect = async (file) => {
    if (!file) return;

    setSelectedFile(file);
    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      const info = await processFile(file, (progress) => {
        if (progress.type === 'hash') {
          setProcessingPhase('计算文件 MD5 哈希');
          setProcessingProgress(progress.progress);
        } else if (progress.type === 'chunkHash') {
          setProcessingPhase('计算分片 CRC32 校验');
          setProcessingProgress(progress.progress);
        }
      });
      setFileInfo(info);
    } catch (error) {
      console.error('Error processing file:', error);
    } finally {
      setIsProcessing(false);
      setProcessingPhase('');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const startTransfer = () => {
    if (!fileInfo) return;

    const connectedPeers = webrtcManager.getConnectedPeers();
    if (connectedPeers.length === 0) {
      alert('请先连接到其他节点');
      return;
    }

    meshTransferManager.startOutgoingTransfer(fileInfo);
    setSelectedFile(null);
    setFileInfo(null);
  };

  const acceptIncomingTransfer = (transferId) => {
    meshTransferManager.acceptTransfer(transferId);
    setIncomingOffers(prev => prev.filter(o => o.transferId !== transferId));
  };

  const rejectIncomingTransfer = (transferId) => {
    setIncomingOffers(prev => prev.filter(o => o.transferId !== transferId));
  };

  const downloadFile = (transferId) => {
    meshTransferManager.downloadCompletedFile(transferId);
  };

  return (
    <div className="card">
      <h2>文件传输</h2>

      {resumeNotifications.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          {resumeNotifications.map(notification => (
            notification.type === 'peer_reconnected' ? (
              <div key={notification.id} style={{
                padding: '10px 15px',
                background: 'rgba(6, 182, 212, 0.2)',
                border: '1px solid #06b6d4',
                borderRadius: '8px',
                marginBottom: '8px',
                fontSize: '0.9rem'
              }}>
                🔄 Peer {notification.peerId.substring(0, 8)}... 已重新连接，正在恢复传输...
              </div>
            ) : (
              <div key={notification.id} style={{
                padding: '10px 15px',
                background: 'rgba(79, 70, 229, 0.2)',
                border: '1px solid #4f46e5',
                borderRadius: '8px',
                marginBottom: '8px',
                fontSize: '0.9rem'
              }}>
                ⚡ 检测到断点续传：{notification.fileName}
                <span style={{ marginLeft: '10px', color: '#a5b4fc' }}>
                  已恢复 {notification.resumedChunks} / {notification.totalChunks} 分片
                </span>
              </div>
            )
          ))}
        </div>
      )}

      <SpeedDashboard 
        peerRates={peerRates}
        totalUploadSpeed={totalUploadSpeed}
        totalDownloadSpeed={totalDownloadSpeed}
      />

      <div
        className={`file-drop-zone ${isDragging ? 'dragover' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        />
        <div className="file-icon">📁</div>
        <p>拖拽文件到此处或点击选择</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>支持大文件分片传输 · CRC32 校验 · 断点续传 · 自动重传</p>
      </div>

      {isProcessing && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '0.9rem' }}>{processingPhase}...</span>
            <span style={{ fontSize: '0.9rem' }}>{processingProgress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${processingProgress}%` }}></div>
          </div>
        </div>
      )}

      {fileInfo && (
        <div className="file-item">
          <div className="file-info">
            <div className="file-name">{fileInfo.name}</div>
            <div className="file-size">
              {formatFileSize(fileInfo.size)} · {fileInfo.totalChunks} 个分片
            </div>
            <div className="file-hash">MD5: {fileInfo.hash}</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '3px' }}>
              CRC32 校验: {fileInfo.chunkHashes?.length || 0} 个分片已校验
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={startTransfer}
            disabled={webrtcManager.getConnectedPeers().length === 0}
          >
            发送
          </button>
        </div>
      )}

      {incomingOffers.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ marginBottom: '10px', fontSize: '1rem' }}>传入文件请求</h3>
          {incomingOffers.map(offer => (
            <div key={offer.transferId} className="file-item">
              <div className="file-info">
                <div className="file-name">
                  {offer.fileInfo.name}
                  {offer.isResume && offer.resumedChunks > 0 && (
                    <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#f59e0b' }}>
                      [断点续传 · 已恢复 {offer.resumedChunks}/{offer.fileInfo.totalChunks}]
                    </span>
                  )}
                </div>
                <div className="file-size">
                  {formatFileSize(offer.fileInfo.size)} · 来自 {offer.fromPeer.substring(0, 8)}...
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-success"
                  onClick={() => acceptIncomingTransfer(offer.transferId)}
                >
                  {offer.isResume && offer.resumedChunks > 0 ? '继续接收' : '接收'}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => rejectIncomingTransfer(offer.transferId)}
                >
                  拒绝
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {transfers.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ marginBottom: '10px', fontSize: '1rem' }}>传输中</h3>
          {transfers.map(({ id, status }) => (
            status && <TransferItem 
              key={id} 
              transferId={id} 
              status={status} 
              onDownload={downloadFile}
              peerRates={peerRates}
            />
          ))}
        </div>
      )}

      <div className="transfer-stats">
        <div className="stat-box">
          <div className="stat-value">{webrtcManager.getConnectedPeers().length}</div>
          <div className="stat-label">可用节点</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#10b981' }}>
            {transfers.filter(t => t.status?.progress >= 100).length}
          </div>
          <div className="stat-label">已完成</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#f59e0b' }}>
            {transfers.filter(t => t.status?.progress < 100).length}
          </div>
          <div className="stat-label">传输中</div>
        </div>
      </div>
    </div>
  );
}

function SpeedDashboard({ peerRates, totalUploadSpeed, totalDownloadSpeed }) {
  const peerIds = Object.keys(peerRates);

  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ marginBottom: '15px', fontSize: '1rem' }}>实时速率监控</h3>
      
      <div className="transfer-stats" style={{ marginBottom: '15px' }}>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#06b6d4' }}>
            {formatSpeed(totalUploadSpeed)}
          </div>
          <div className="stat-label">↑ 总上传</div>
        </div>
        <div className="stat-box">
          <div className="stat-value" style={{ color: '#10b981' }}>
            {formatSpeed(totalDownloadSpeed)}
          </div>
          <div className="stat-label">↓ 总下载</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{peerIds.length}</div>
          <div className="stat-label">活动节点</div>
        </div>
      </div>

      {peerIds.length > 0 && (
        <div className="peer-list">
          {peerIds.map(peerId => (
            <div key={peerId} className="peer-item connected" style={{ padding: '12px' }}>
              <div style={{ flex: 1 }}>
                <div className="peer-id">
                  {peerId.substring(0, 8)}...
                  <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#6b7280' }}>
                    总计: {formatFileSize(peerRates[peerId].totalUploadBytes + peerRates[peerId].totalDownloadBytes)}
                  </span>
                </div>
                <div style={{ marginTop: '5px', fontSize: '0.85rem' }}>
                  <span style={{ color: '#06b6d4', marginRight: '15px' }}>
                    ↑ {formatSpeed(peerRates[peerId].uploadSpeed)}
                  </span>
                  <span style={{ color: '#10b981' }}>
                    ↓ {formatSpeed(peerRates[peerId].downloadSpeed)}
                  </span>
                </div>
                <div style={{ marginTop: '5px' }}>
                  <SpeedBar 
                    speed={peerRates[peerId].uploadSpeed} 
                    color="#06b6d4" 
                    label="↑"
                  />
                  <SpeedBar 
                    speed={peerRates[peerId].downloadSpeed} 
                    color="#10b981" 
                    label="↓"
                  />
                </div>
              </div>
              <div style={{ 
                width: '50px', 
                height: '50px', 
                borderRadius: '50%',
                background: `conic-gradient(#06b6d4 ${peerRates[peerId].uploadSpeed > 0 ? Math.min(360, peerRates[peerId].uploadSpeed / 10000 * 360) : 0}deg, #10b981 0 ${peerRates[peerId].downloadSpeed > 0 ? Math.min(360, peerRates[peerId].downloadSpeed / 10000 * 360) : 0}deg, rgba(255,255,255,0.1) 0)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                color: '#fff'
              }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: 'rgba(26, 26, 46, 0.95)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6rem'
                }}>
                  {Math.round((peerRates[peerId].uploadSpeed + peerRates[peerId].downloadSpeed) / 1024)} KB/s
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {peerIds.length === 0 && (
        <div className="no-peers">暂无活动连接</div>
      )}
    </div>
  );
}

function SpeedBar({ speed, color, label }) {
  const maxSpeed = 10 * 1024 * 1024;
  const percentage = Math.min(100, (speed / maxSpeed) * 100);

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      marginBottom: '3px',
      fontSize: '0.7rem'
    }}>
      <span style={{ width: '15px', color }}>{label}</span>
      <div style={{ 
        flex: 1, 
        height: '4px', 
        background: 'rgba(255,255,255,0.1)', 
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{ 
          width: `${percentage}%`, 
          height: '100%', 
          background: color,
          transition: 'width 0.3s ease'
        }}></div>
      </div>
    </div>
  );
}

function TransferItem({ transferId, status, onDownload, peerRates }) {
  const isComplete = status.progress >= 100;

  return (
    <div className="file-item">
      <div className="file-info" style={{ flex: 1 }}>
        <div className="file-name">
          {status.fileInfo.name}
          <span style={{
            marginLeft: '8px',
            fontSize: '0.8rem',
            color: status.type === 'outgoing' ? '#06b6d4' : '#10b981'
          }}>
            [{status.type === 'outgoing' ? '发送' : '接收'}]
          </span>
          {status.isResume && (
            <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#f59e0b' }}>
              ⚡ 断点续传
            </span>
          )}
          {status.failed > 0 && (
            <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#ef4444' }}>
              ⚠ {status.failed} 重试
            </span>
          )}
        </div>
        <div className="file-size">
          {formatFileSize(status.fileInfo.size)}
          {status.type === 'incoming' && status.sources && (
            <span style={{ marginLeft: '10px', color: '#6b7280' }}>
              · {status.sources} 个源
            </span>
          )}
          {status.type === 'incoming' && status.inflight !== undefined && (
            <span style={{ marginLeft: '10px', color: '#6b7280' }}>
              · {status.inflight} 进行中
            </span>
          )}
          {status.resumedChunks > 0 && (
            <span style={{ marginLeft: '10px', color: '#f59e0b' }}>
              · 已恢复 {status.resumedChunks} 分片
            </span>
          )}
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ 
              width: `${Math.min(status.progress, 100)}%`,
              background: status.isResume 
                ? 'linear-gradient(90deg, #f59e0b, #eab308)' 
                : 'linear-gradient(90deg, #4f46e5, #06b6d4)'
            }}
          ></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '0.8rem', color: '#6b7280' }}>
          <span>{Math.round(status.progress)}%</span>
          {status.type === 'outgoing' ? (
            <span>{status.acknowledged} / {status.total} 分片已确认</span>
          ) : (
            <span>{status.received} / {status.total} 分片已接收</span>
          )}
        </div>
      </div>
      {isComplete && status.type === 'incoming' && (
        <button
          className="btn btn-success"
          onClick={() => onDownload(transferId)}
          style={{ marginLeft: '10px' }}
        >
          下载
        </button>
      )}
    </div>
  );
}

export default FileTransfer;
