import { useState, useEffect } from "react";
import { api } from "../api";
import { SyncStatus } from "../types";

interface SyncPanelProps {
  onSyncCompleted: () => void;
}

function SyncPanel({ onSyncCompleted }: SyncPanelProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadSyncStatus();
    const interval = setInterval(loadSyncStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const setupListeners = async () => {
      const unlisten1 = await api.onSyncStatusChange((status) => {
        setSyncStatus(status);
      });
      const unlisten2 = await api.onSyncNoteUpdated(() => {
        onSyncCompleted();
      });
      const unlisten3 = await api.onSyncNoteDeleted(() => {
        onSyncCompleted();
      });
      const unlisten4 = await api.onSyncCompleted(() => {
        setIsSyncing(false);
        onSyncCompleted();
      });
      return [unlisten1, unlisten2, unlisten3, unlisten4];
    };

    const unlisteners = setupListeners();
    return () => {
      unlisteners.then((listeners) =>
        Promise.all(listeners).then((fns) => fns.forEach((fn) => fn()))
      );
    };
  }, [onSyncCompleted]);

  const loadSyncStatus = async () => {
    try {
      const status = await api.getSyncStatus();
      setSyncStatus(status);
    } catch {
      // ignore
    }
  };

  const handleStartSync = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const result = await api.startP2PSync();
      console.log("P2P sync started:", result);
      await loadSyncStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动同步失败");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopSync = async () => {
    setIsStopping(true);
    setError(null);
    try {
      await api.stopP2PSync();
      await loadSyncStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止同步失败");
    } finally {
      setIsStopping(false);
    }
  };

  const handleFullSync = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      await api.requestFullSync();
    } catch (err) {
      setIsSyncing(false);
      setError(err instanceof Error ? err.message : "请求全量同步失败");
    }
  };

  const formatPeerId = (peerId: string) => {
    if (peerId.length > 20) {
      return `${peerId.substring(0, 10)}...${peerId.substring(peerId.length - 6)}`;
    }
    return peerId;
  };

  const formatTime = (time: string | null) => {
    if (!time) return "从未";
    const date = new Date(time);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="sync-panel">
      <div
        className="sync-panel-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="sync-panel-title">
          <span className="sync-icon">
            {syncStatus?.is_running ? "🔄" : "📡"}
          </span>
          <span>局域网同步</span>
        </div>
        <div className="sync-panel-summary">
          {syncStatus?.is_running ? (
            <>
              <span className="sync-active-badge">运行中</span>
              <span className="sync-peer-count">
                {syncStatus.connected_peers.length} 台设备
              </span>
            </>
          ) : (
            <span className="sync-inactive-badge">未启动</span>
          )}
          <span className={`sync-expand-icon ${isExpanded ? "expanded" : ""}`}>
            ▼
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="sync-panel-body">
          {error && (
            <div className="sync-error" onClick={() => setError(null)}>
              ⚠ {error} ×
            </div>
          )}

          {!syncStatus?.is_running ? (
            <div className="sync-controls">
              <p className="sync-description">
                启动局域网同步后，同一 WiFi 下的设备可以自动同步加密笔记数据。
              </p>
              <button
                className="sync-start-btn"
                onClick={handleStartSync}
                disabled={isStarting}
              >
                {isStarting ? "启动中..." : "启动同步"}
              </button>
            </div>
          ) : (
            <div className="sync-info">
              <div className="sync-info-row">
                <span className="sync-info-label">本机 Peer ID</span>
                <span className="sync-info-value" title={syncStatus.peer_id}>
                  {formatPeerId(syncStatus.peer_id)}
                </span>
              </div>
              <div className="sync-info-row">
                <span className="sync-info-label">已连接设备</span>
                <span className="sync-info-value">
                  {syncStatus.connected_peers.length}
                </span>
              </div>
              {syncStatus.connected_peers.length > 0 && (
                <div className="sync-peers-list">
                  {syncStatus.connected_peers.map((peer, index) => (
                    <div key={index} className="sync-peer-item">
                      <span className="sync-peer-dot"></span>
                      <span className="sync-peer-id" title={peer.peer_id}>
                        {formatPeerId(peer.peer_id)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="sync-info-row">
                <span className="sync-info-label">同步次数</span>
                <span className="sync-info-value">{syncStatus.sync_count}</span>
              </div>
              <div className="sync-info-row">
                <span className="sync-info-label">上次同步</span>
                <span className="sync-info-value">
                  {formatTime(syncStatus.last_sync)}
                </span>
              </div>

              <div className="sync-actions">
                <button
                  className="sync-action-btn"
                  onClick={handleFullSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? "同步中..." : "全量同步"}
                </button>
                <button
                  className="sync-action-btn stop"
                  onClick={handleStopSync}
                  disabled={isStopping}
                >
                  {isStopping ? "停止中..." : "停止同步"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SyncPanel;
