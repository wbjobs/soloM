import { useState, useCallback, useMemo } from 'react';

function formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

function formatRelative(ts, now) {
  const diff = now - ts;
  if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

export default function TimelineSlider({
  timestamps,
  currentIndex,
  isTimeTraveling,
  loading,
  summary,
  onSeek,
  onRestore,
  onBackToPresent,
  onForceSnapshot,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const currentTimestamp = useMemo(() => {
    if (currentIndex >= 0 && currentIndex < timestamps.length) {
      return timestamps[currentIndex];
    }
    return null;
  }, [currentIndex, timestamps]);

  const handleSliderChange = useCallback((e) => {
    const index = parseInt(e.target.value);
    onSeek(index);
  }, [onSeek]);

  const now = Date.now();

  if (timestamps.length === 0) {
    return (
      <div className="timeline-bar timeline-collapsed">
        <button
          className="timeline-toggle-btn"
          onClick={onForceSnapshot}
          title="创建快照"
        >
          <span className="timeline-icon">⏱</span>
          <span className="timeline-label">时光机</span>
          <span className="timeline-badge">暂无历史</span>
        </button>
      </div>
    );
  }

  const percentage = timestamps.length > 1
    ? (currentIndex / (timestamps.length - 1)) * 100
    : 100;

  return (
    <div className={`timeline-bar ${isExpanded ? 'timeline-expanded' : 'timeline-collapsed'}`}>
      <div className="timeline-header">
        <button
          className="timeline-toggle-btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="timeline-icon">⏱</span>
          <span className="timeline-label">时光机</span>
          {isTimeTraveling && <span className="timeline-badge traveling">历史预览</span>}
          {!isTimeTraveling && summary && (
            <span className="timeline-badge">{summary.count} 条记录</span>
          )}
          <span className={`timeline-chevron ${isExpanded ? 'up' : 'down'}`}>▸</span>
        </button>

        <div className="timeline-header-actions">
          {isTimeTraveling && (
            <>
              <button
                className="timeline-restore-btn"
                onClick={onRestore}
                disabled={loading}
                title="将当前历史版本恢复为最新版本"
              >
                恢复此版本
              </button>
              <button
                className="timeline-back-btn"
                onClick={onBackToPresent}
                title="返回当前版本"
              >
                返回当前
              </button>
            </>
          )}
          {!isTimeTraveling && (
            <button
              className="timeline-snapshot-btn"
              onClick={onForceSnapshot}
              title="立即创建快照"
            >
              拍快照
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="timeline-body">
          <div className="timeline-info-row">
            <div className="timeline-time-info">
              {currentTimestamp && (
                <>
                  <span className="timeline-date">{formatDate(currentTimestamp)}</span>
                  <span className="timeline-time">{formatTime(currentTimestamp)}</span>
                  <span className="timeline-relative">{formatRelative(currentTimestamp, now)}</span>
                </>
              )}
            </div>
            {isTimeTraveling && (
              <div className="timeline-traveling-indicator">
                <span className="pulse-dot"></span>
                历史预览模式 - 编辑已禁用
              </div>
            )}
          </div>

          <div className="timeline-slider-container">
            <div className="timeline-slider-track">
              <div
                className="timeline-slider-fill"
                style={{ width: `${percentage}%` }}
              ></div>
              <div
                className="timeline-slider-thumb"
                style={{ left: `${percentage}%` }}
              ></div>
            </div>
            <input
              type="range"
              className="timeline-slider-input"
              min={0}
              max={timestamps.length - 1}
              value={currentIndex}
              onChange={handleSliderChange}
            />
          </div>

          <div className="timeline-labels">
            {timestamps.length > 0 && (
              <>
                <span className="timeline-label-start">
                  {formatTime(timestamps[0])}
                </span>
                <span className="timeline-label-end">
                  {formatTime(timestamps[timestamps.length - 1])}
                </span>
              </>
            )}
          </div>

          <div className="timeline-events">
            {timestamps
              .filter((_, i) => {
                const step = Math.max(1, Math.floor(timestamps.length / 8));
                return i === 0 || i === timestamps.length - 1 || i % step === 0;
              })
              .map((ts, i, arr) => {
                const realIndex = timestamps.indexOf(ts);
                const isActive = realIndex === currentIndex;
                return (
                  <button
                    key={ts}
                    className={`timeline-event ${isActive ? 'active' : ''}`}
                    onClick={() => onSeek(realIndex)}
                  >
                    <span className="timeline-event-dot"></span>
                    <span className="timeline-event-time">{formatTime(ts)}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
