import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SignalingClient } from './services/signaling';
import { WebRTCService } from './services/webrtc';
import { chunkFile, reassembleFile, verifyFileHash, formatFileSize } from './services/fileChunker';
import FileSelector from './components/FileSelector';
import RoomManager from './components/RoomManager';
import TransferProgress from './components/TransferProgress';
import ConnectionStatus from './components/ConnectionStatus';

export default function App() {
  const [signalingConnected, setSignalingConnected] = useState(false);
  const [webrtcConnected, setWebrtcConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [peerId, setPeerId] = useState('');
  const [role, setRole] = useState(null);

  const [isChunking, setIsChunking] = useState(false);
  const [chunkProgress, setChunkProgress] = useState({ current: 0, total: 0 });
  const [chunkReader, setChunkReader] = useState(null);
  const [fileMetadata, setFileMetadata] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState('');

  const [transferProgress, setTransferProgress] = useState(null);
  const [transferComplete, setTransferComplete] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [receivedFileUrl, setReceivedFileUrl] = useState(null);
  const [transferError, setTransferError] = useState(null);
  const [peers, setPeers] = useState([]);

  const signalingRef = useRef(null);
  const webrtcRef = useRef(null);

  const initServices = useCallback(() => {
    const signaling = new SignalingClient();
    signalingRef.current = signaling;

    signaling.on('connected', () => setSignalingConnected(true));
    signaling.on('disconnected', () => setSignalingConnected(false));
    signaling.on('error', (err) => {
      console.error('Signaling error:', err);
    });

    signaling.on('created', (msg) => {
      setRoomId(msg.roomId);
      setPeerId(msg.peerId);
      setRole('sender');
    });

    signaling.on('joined', (msg) => {
      setRoomId(msg.roomId);
      setPeerId(msg.peerId);
      setRole('receiver');
      if (msg.metadata) {
        setFileMetadata(msg.metadata);
      }
    });

    signaling.on('peer-left', () => {
      const peersList = webrtcRef.current?.getConnectedPeers() || [];
      setWebrtcConnected(peersList.some((p) => p.connected));
    });

    const webrtc = new WebRTCService(signaling);
    webrtcRef.current = webrtc;

    webrtc.onConnected = () => setWebrtcConnected(true);
    webrtc.onDisconnected = () => {
      const peersList = webrtcRef.current?.getConnectedPeers() || [];
      setWebrtcConnected(peersList.some((p) => p.connected));
    };

    webrtc.onProgress = (progress) => {
      setTransferProgress(progress);
    };

    webrtc.onMetadataReceived = (metadata) => {
      setFileMetadata(metadata);
    };

    webrtc.onPeersUpdated = (peerList) => {
      setPeers(peerList);
      const anyConnected = peerList.some((p) => p.connected);
      if (anyConnected !== webrtcConnected) {
        setWebrtcConnected(anyConnected);
      }
    };

    webrtc.onTransferComplete = async (chunks, metadata) => {
      setVerifying(true);
      try {
        const result = await verifyFileHash(chunks, metadata);
        setVerifyResult(result);

        if (result.valid) {
          setTransferComplete(true);
          const blob = reassembleFile(chunks, metadata);
          const url = URL.createObjectURL(blob);
          setReceivedFileUrl(url);
        } else {
          if (result.missingChunk !== undefined) {
            setTransferError(`文件校验失败：缺少分片 #${result.missingChunk}`);
          } else if (result.corruptChunk !== undefined) {
            setTransferError(`文件校验失败：分片 #${result.corruptChunk} 数据损坏`);
          } else {
            setTransferError('文件校验失败：哈希不匹配');
          }
        }
      } catch (e) {
        setTransferError(`文件校验异常: ${e.message}`);
      } finally {
        setVerifying(false);
      }
    };

    webrtc.onTransferError = (msg) => {
      setTransferError(msg);
    };

    signaling.connect().catch((err) => {
      console.error('Failed to connect signaling server:', err);
    });
  }, [webrtcConnected]);

  useEffect(() => {
    initServices();
    return () => {
      if (webrtcRef.current) webrtcRef.current.close();
      if (signalingRef.current) signalingRef.current.disconnect();
    };
  }, [initServices]);

  const handleCreateRoom = () => {
    if (!signalingRef.current) return;
    if (fileMetadata) {
      signalingRef.current.createRoom(fileMetadata);
    } else {
      signalingRef.current.createRoom(null);
    }
  };

  const handleJoinRoom = (id) => {
    if (!signalingRef.current || !id.trim()) return;
    signalingRef.current.joinRoom(id.trim());
  };

  const handleFileSelected = async (file) => {
    setIsChunking(true);
    setChunkProgress({ current: 0, total: 0 });
    setSelectedFileName(file.name);

    try {
      const result = await chunkFile(file, (current, total) => {
        setChunkProgress({ current, total });
      });

      setChunkReader(result.chunkReader);
      setFileMetadata(result.metadata);
      setIsChunking(false);

      if (signalingRef.current && roomId) {
        signalingRef.current.sendMetadata(result.metadata);
      }
    } catch (err) {
      console.error('Chunking error:', err);
      setIsChunking(false);
    }
  };

  useEffect(() => {
    if (webrtcConnected && role === 'sender' && chunkReader && fileMetadata && webrtcRef.current) {
      webrtcRef.current.startFileTransfer(chunkReader, fileMetadata);
    }
  }, [webrtcConnected, role, chunkReader, fileMetadata]);

  const handleSaveFile = () => {
    if (!receivedFileUrl || !fileMetadata) return;
    const a = document.createElement('a');
    a.href = receivedFileUrl;
    a.download = fileMetadata.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    if (webrtcRef.current) webrtcRef.current.close();
    if (signalingRef.current) signalingRef.current.disconnect();

    setSignalingConnected(false);
    setWebrtcConnected(false);
    setRoomId('');
    setPeerId('');
    setRole(null);
    setIsChunking(false);
    setChunkProgress({ current: 0, total: 0 });
    setChunkReader(null);
    setFileMetadata(null);
    setSelectedFileName('');
    setTransferProgress(null);
    setTransferComplete(false);
    setVerifying(false);
    setVerifyResult(null);
    if (receivedFileUrl) URL.revokeObjectURL(receivedFileUrl);
    setReceivedFileUrl(null);
    setTransferError(null);
    setPeers([]);

    setTimeout(() => initServices(), 500);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🔗 P2P 文件分片传输</h1>
        <p className="subtitle">去中心化 · WebRTC 直连 · BitTorrent 式多源下载</p>
      </header>

      <ConnectionStatus
        signalingState={signalingConnected}
        webrtcState={webrtcConnected}
        roomId={roomId}
        peerId={peerId}
      />

      <main className="app-main">
        {!roomId && (
          <>
            <FileSelector
              onFileSelected={handleFileSelected}
              isChunking={isChunking}
              chunkProgress={chunkProgress}
              disabled={!signalingConnected}
            />
            {fileMetadata && (
              <div className="file-info-card">
                <h4>文件准备就绪</h4>
                <p>文件名: {selectedFileName}</p>
                <p>大小: {formatFileSize(fileMetadata.fileSize)}</p>
                <p>分片数: {fileMetadata.totalChunks}</p>
                <p>哈希: <code>{fileMetadata.fileHash.slice(0, 24)}...</code></p>
              </div>
            )}
            <RoomManager
              onCreateRoom={handleCreateRoom}
              onJoinRoom={handleJoinRoom}
              roomId={roomId}
              connected={signalingConnected}
              disabled={!signalingConnected || (!fileMetadata && role !== 'receiver')}
            />
          </>
        )}

        {roomId && !webrtcConnected && (
          <div className="waiting-panel">
            <div className="waiting-animation">
              <div className="pulse-ring" />
              <div className="pulse-ring delay" />
              <span className="waiting-icon">⏳</span>
            </div>
            <p>等待对方加入房间 <strong>{roomId}</strong></p>
            <p className="hint">将房间号发送给对方，对方加入后将自动建立连接</p>
            {peers.length > 0 && (
              <p className="hint">已连接 {peers.filter((p) => p.connected).length} 个节点</p>
            )}
          </div>
        )}

        {roomId && webrtcConnected && (
          <>
            <div className="connected-banner">
              ✅ WebRTC 直连已建立 — 正在从 {peers.filter((p) => p.connected).length} 个节点 P2P 下载
            </div>
            <TransferProgress
              progress={transferProgress}
              isSending={role === 'sender'}
              metadata={fileMetadata}
              peers={peers}
              myPeerId={peerId}
            />
          </>
        )}

        {verifying && (
          <div className="verifying-panel">
            <div className="verifying-spinner" />
            <p>正在校验文件完整性 (SHA-256)...</p>
          </div>
        )}

        {transferComplete && verifyResult && verifyResult.valid && (
          <div className="complete-panel">
            <h3>🎉 传输完成</h3>
            <p>文件已成功接收并通过 SHA-256 哈希校验</p>
            {role === 'receiver' && receivedFileUrl && (
              <button className="btn btn-primary" onClick={handleSaveFile}>
                💾 保存文件
              </button>
            )}
            <button className="btn btn-secondary" onClick={handleReset} style={{ marginLeft: 12 }}>
              🔄 新建传输
            </button>
          </div>
        )}

        {transferError && (
          <div className="error-panel">
            <h3>⚠️ 传输错误</h3>
            <p>{transferError}</p>
            <button className="btn btn-secondary" onClick={handleReset}>
              重新开始
            </button>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>P2P File Transfer · WebRTC DataChannel · BitTorrent 式多源下载 · 无服务器直传</p>
      </footer>
    </div>
  );
}
