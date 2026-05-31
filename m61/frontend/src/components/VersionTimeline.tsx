import { useEffect } from 'react';
import { useVersionStore } from '../store/useVersionStore';

interface VersionTimelineProps {
  snippetId: string;
  onClose: () => void;
}

const VersionTimeline = ({ snippetId, onClose }: VersionTimelineProps) => {
  const { versions, isLoading, fetchVersions, rollbackToVersion } = useVersionStore();

  useEffect(() => {
    fetchVersions(snippetId);
  }, [snippetId]);

  const handleRollback = async (targetVersion: number) => {
    if (window.confirm(`确定要回滚到版本 ${targetVersion} 吗？此操作将创建一个新的版本记录。`)) {
      const success = await rollbackToVersion(snippetId, targetVersion);
      if (success) {
        await fetchVersions(snippetId);
      }
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="version-timeline">
      <div className="version-timeline-header">
        <h3>版本历史</h3>
        <button className="version-close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="version-timeline-body">
        {isLoading ? (
          <div className="version-loading">加载中...</div>
        ) : versions.length === 0 ? (
          <div className="version-empty">暂无历史版本</div>
        ) : (
          <div className="version-list">
            {versions.map((v, index) => (
              <div key={v.version} className="version-item">
                <div className="version-timeline-dot-container">
                  <div className={`version-timeline-dot ${index === 0 ? 'current' : ''}`} />
                  {index < versions.length - 1 && <div className="version-timeline-line" />}
                </div>
                <div className="version-item-content">
                  <div className="version-item-header">
                    <span className="version-number">v{v.version}</span>
                    <span className="version-time">{formatTime(v.createdAt)}</span>
                  </div>
                  <div className="version-description">{v.description}</div>
                  <div className="version-meta">
                    <span className="version-author">{v.modifiedBy}</span>
                    {index !== 0 && (
                      <button
                        className="version-rollback-btn"
                        onClick={() => handleRollback(v.version)}
                      >
                        回滚到此版本
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VersionTimeline;
