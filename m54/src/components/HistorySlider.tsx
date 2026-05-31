import { useState, useCallback, useMemo } from 'react';
import { useHistoryStore } from '@/store/historyStore';
import {
  Clock,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';

interface HistorySliderProps {
  onRestore: (snapshotId: string) => void;
  onPreview: (snapshotId: string) => void;
  onClose: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const time = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (isToday) return time;

  const date = d.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
  return `${date} ${time}`;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export function HistorySlider({ onRestore, onPreview, onClose }: HistorySliderProps) {
  const { snapshots, currentIndex, isViewingHistory, setCurrentIndex, setIsViewingHistory } =
    useHistoryStore();
  const [isDragging, setIsDragging] = useState(false);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value, 10);
      setCurrentIndex(idx);
      if (snapshots[idx]) {
        onPreview(snapshots[idx].id);
      }
    },
    [snapshots, onPreview, setCurrentIndex],
  );

  const handleStepBack = useCallback(() => {
    if (currentIndex > 0) {
      const newIdx = currentIndex - 1;
      setCurrentIndex(newIdx);
      if (snapshots[newIdx]) onPreview(snapshots[newIdx].id);
    }
  }, [currentIndex, snapshots, onPreview, setCurrentIndex]);

  const handleStepForward = useCallback(() => {
    if (currentIndex < snapshots.length - 1) {
      const newIdx = currentIndex + 1;
      setCurrentIndex(newIdx);
      if (snapshots[newIdx]) onPreview(snapshots[newIdx].id);
    }
  }, [currentIndex, snapshots, onPreview, setCurrentIndex]);

  const handleRestore = useCallback(() => {
    if (snapshots[currentIndex]) {
      onRestore(snapshots[currentIndex].id);
    }
  }, [currentIndex, snapshots, onRestore]);

  const handleBackToCurrent = useCallback(() => {
    setIsViewingHistory(false);
    setCurrentIndex(snapshots.length - 1);
    onClose();
  }, [snapshots.length, setIsViewingHistory, setCurrentIndex, onClose]);

  const currentSnapshot = snapshots[currentIndex];
  const oldestSnapshot = snapshots[0];
  const newestSnapshot = snapshots[snapshots.length - 1];

  const timeMarkers = useMemo(() => {
    if (snapshots.length === 0) return [];
    const step = Math.max(1, Math.floor(snapshots.length / 5));
    const markers: { index: number; label: string }[] = [];
    for (let i = 0; i < snapshots.length; i += step) {
      markers.push({
        index: i,
        label: formatTime(snapshots[i].timestamp),
      });
    }
    if (markers[markers.length - 1]?.index !== snapshots.length - 1) {
      markers.push({
        index: snapshots.length - 1,
        label: formatTime(snapshots[snapshots.length - 1].timestamp),
      });
    }
    return markers;
  }, [snapshots]);

  if (snapshots.length === 0) {
    return (
      <div
        className="border-t px-4 py-3"
        style={{ background: '#161B22', borderColor: '#30363D' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm" style={{ color: '#8B949E' }}>
            <Clock className="w-4 h-4" />
            版本历史
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: '#8B949E' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: '#484F58' }}>
          暂无版本记录，编辑器将每 30 秒自动创建快照
        </p>
      </div>
    );
  }

  return (
    <div
      className="border-t"
      style={{ background: '#161B22', borderColor: '#30363D' }}
    >
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#E6EDF3' }}>
          <Clock className="w-4 h-4" style={{ color: '#A371F7' }} />
          版本历史
          <span className="text-xs font-normal" style={{ color: '#8B949E' }}>
            ({snapshots.length} 个快照)
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isViewingHistory && (
            <button
              onClick={handleRestore}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-black transition-all hover:brightness-110"
              style={{ background: '#00D68F' }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              还原到此版本
            </button>
          )}
          <button
            onClick={handleBackToCurrent}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border hover:bg-white/5"
            style={{ color: '#8B949E', borderColor: '#30363D' }}
          >
            <Eye className="w-3.5 h-3.5" />
            返回当前
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: '#8B949E' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-2">
        {isViewingHistory && currentSnapshot && (
          <div
            className="flex items-center gap-3 mb-2 px-3 py-2 rounded-md text-xs"
            style={{ background: '#FFB80015', color: '#FFB800' }}
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span>
              正在查看: {formatTime(currentSnapshot.timestamp)}
              {currentSnapshot.label ? ` — ${currentSnapshot.label}` : ''} ·
              {currentSnapshot.charCount} 字符 ·
              {formatRelativeTime(currentSnapshot.timestamp)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleStepBack}
            disabled={currentIndex <= 0}
            className="p-1 rounded transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: '#8B949E' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 relative">
            <input
              type="range"
              min={0}
              max={snapshots.length - 1}
              value={isViewingHistory ? currentIndex : snapshots.length - 1}
              onChange={handleSliderChange}
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={() => setIsDragging(false)}
              onTouchStart={() => setIsDragging(true)}
              onTouchEnd={() => setIsDragging(false)}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: isViewingHistory
                  ? `linear-gradient(to right, #A371F7 0%, #A371F7 ${
                      (currentIndex / (snapshots.length - 1)) * 100
                    }%, #30363D ${
                      (currentIndex / (snapshots.length - 1)) * 100
                    }%, #30363D 100%)`
                  : '#30363D',
              }}
            />

            <div
              className="flex justify-between mt-1"
              style={{ color: '#484F58', fontSize: '10px' }}
            >
              <span>{oldestSnapshot ? formatTime(oldestSnapshot.timestamp) : ''}</span>
              <span>{newestSnapshot ? formatTime(newestSnapshot.timestamp) : ''}</span>
            </div>

            {isDragging && currentSnapshot && (
              <div
                className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none"
                style={{
                  background: '#30363D',
                  color: '#E6EDF3',
                }}
              >
                {formatTime(currentSnapshot.timestamp)}
              </div>
            )}
          </div>

          <button
            onClick={handleStepForward}
            disabled={currentIndex >= snapshots.length - 1}
            className="p-1 rounded transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: '#8B949E' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${isViewingHistory ? '#A371F7' : '#00D68F'};
          cursor: pointer;
          border: 2px solid #0D1117;
          box-shadow: 0 0 0 1px ${isViewingHistory ? '#A371F7' : '#00D68F'};
          transition: transform 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.3);
        }
        input[type="range"]::-webkit-slider-thumb:active {
          transform: scale(1.1);
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${isViewingHistory ? '#A371F7' : '#00D68F'};
          cursor: pointer;
          border: 2px solid #0D1117;
          box-shadow: 0 0 0 1px ${isViewingHistory ? '#A371F7' : '#00D68F'};
        }
      `}</style>
    </div>
  );
}
