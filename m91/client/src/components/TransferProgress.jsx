import React, { useMemo } from 'react';
import { formatFileSize } from '../services/fileChunker';

const PEER_COLORS = [
  '#6c5ce7',
  '#00cec9',
  '#00b894',
  '#fdcb6e',
  '#e17055',
  '#74b9ff',
  '#ff7675',
  '#a29bfe',
];

function getPeerColor(peerId, allPeerIds) {
  const idx = allPeerIds.indexOf(peerId);
  return PEER_COLORS[idx % PEER_COLORS.length];
}

export default function TransferProgress({ progress, isSending, metadata, peers, myPeerId }) {
  if (!progress && !metadata) return null;

  const pct = progress ? (progress.progress * 100).toFixed(1) : 0;
  const speed = progress ? formatFileSize(progress.speed) + '/s' : '--';
  const transferred = progress ? formatFileSize(progress.bytesTransferred) : '0 B';
  const total = metadata ? formatFileSize(metadata.fileSize) : '--';
  const currentChunk = progress ? progress.currentChunk + 1 : 0;
  const totalChunks = metadata ? metadata.totalChunks : 0;

  const peerIdsWithMe = useMemo(() => {
    const ids = [];
    if (myPeerId) ids.push(myPeerId);
    if (peers) {
      for (const p of peers) {
        if (!ids.includes(p.peerId)) ids.push(p.peerId);
      }
    }
    return ids;
  }, [peers, myPeerId]);

  const chunkSources = progress?.chunkSources || {};

  return (
    <div className="transfer-progress">
      <h3>{isSending ? '📤 发送进度' : '📥 接收进度'}</h3>
      {metadata && (
        <div className="transfer-file-info">
          <p>文件: <strong>{metadata.fileName}</strong></p>
          <p>大小: {formatFileSize(metadata.fileSize)}</p>
          <p>分片数: {metadata.totalChunks}</p>
          <p>文件哈希: <code className="hash">{metadata.fileHash.slice(0, 16)}...</code></p>
        </div>
      )}
      <div className="progress-bar large">
        <div
          className="progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="transfer-stats">
        <div className="stat">
          <span className="stat-label">进度</span>
          <span className="stat-value">{pct}%</span>
        </div>
        <div className="stat">
          <span className="stat-label">速率</span>
          <span className="stat-value">{speed}</span>
        </div>
        <div className="stat">
          <span className="stat-label">已传输</span>
          <span className="stat-value">{transferred} / {total}</span>
        </div>
        <div className="stat">
          <span className="stat-label">分片</span>
          <span className="stat-value">{currentChunk} / {totalChunks}</span>
        </div>
      </div>

      {peers && peers.length > 0 && (
        <div className="peer-panel">
          <h4>🌐 连接节点 ({peers.length})</h4>
          <div className="peer-list">
            {peers.map((p) => (
              <div key={p.peerId} className={`peer-card ${p.connected ? 'online' : 'offline'}`}>
                <span
                  className="peer-color-dot"
                  style={{ backgroundColor: getPeerColor(p.peerId, peerIdsWithMe) }}
                />
                <div className="peer-info-text">
                  <span className="peer-id-text">{p.peerId.slice(0, 8)}</span>
                  <span className="peer-stats-text">
                    {p.connected
                      ? p.hasAllChunks
                        ? `种子节点 · ${formatFileSize(p.bytesReceived)} 已接收`
                        : `${formatFileSize(p.bytesReceived)} 已接收 · ${formatFileSize(p.bytesSent)} 已上传`
                      : '已断开'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="legend">
            <h5>分片来源图例</h5>
            <div className="legend-items">
              {peers.map((p) => (
                <div key={p.peerId} className="legend-item">
                  <span
                    className="legend-color"
                    style={{ backgroundColor: getPeerColor(p.peerId, peerIdsWithMe) }}
                  />
                  <span>节点 {p.peerId.slice(0, 8)}</span>
                </div>
              ))}
              <div className="legend-item">
                <span
                  className="legend-color"
                  style={{ backgroundColor: getPeerColor(myPeerId, peerIdsWithMe) }}
                />
                <span>本端 (已拥有)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {metadata && metadata.chunkHashes && (
        <div className="chunk-grid">
          {metadata.chunkHashes.map((_, i) => {
            const isDone = progress
              ? progress.receivedCount
                ? i < progress.receivedCount || chunkSources[i] !== undefined
                : i <= progress.currentChunk
              : false;

            const sourcePeerId = chunkSources[i];
            let bgColor = 'var(--surface-2)';
            if (isDone) {
              if (sourcePeerId) {
                bgColor = getPeerColor(sourcePeerId, peerIdsWithMe);
              } else {
                bgColor = getPeerColor(myPeerId, peerIdsWithMe);
              }
            }

            return (
              <div
                key={i}
                className={`chunk-cell ${isDone ? 'done' : ''} ${progress && i === progress.currentChunk ? 'active' : ''}`}
                style={isDone ? { backgroundColor: bgColor } : {}}
                title={`分片 ${i}: ${isDone ? (sourcePeerId ? `来自 ${sourcePeerId.slice(0, 8)}` : '本端已有') : '等待中'}`}
              >
                {i}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
