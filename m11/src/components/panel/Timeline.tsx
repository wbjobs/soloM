import { useState, useRef, useEffect, useCallback } from "react";
import { useRaftStore } from "@/store/raftStore";
import { Play, Pause, SkipBack, SkipForward, Clock, History, X, ChevronLeft, ChevronRight } from "lucide-react";

export function Timeline() {
  const {
    snapshots,
    isReplayMode,
    currentSnapshotIndex,
    enterReplayMode,
    exitReplayMode,
    setCurrentSnapshotIndex,
    fetchSnapshots,
  } = useRaftStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isReplayMode) {
      fetchSnapshots();
    }
  }, [isReplayMode, fetchSnapshots]);

  useEffect(() => {
    if (isPlaying && isReplayMode && snapshots.length > 0) {
      playTimerRef.current = setInterval(() => {
        const state = useRaftStore.getState();
        const currentIdx = state.currentSnapshotIndex;
        const firstIdx = state.snapshots[0]?.snapshotIndex ?? 0;
        const lastIdx = state.snapshots[state.snapshots.length - 1]?.snapshotIndex ?? 0;

        if (currentIdx >= lastIdx) {
          setCurrentSnapshotIndex(firstIdx);
        } else {
          const nextSnapshot = state.snapshots.find((s) => s.snapshotIndex > currentIdx);
          if (nextSnapshot) {
            setCurrentSnapshotIndex(nextSnapshot.snapshotIndex);
          } else {
            setIsPlaying(false);
          }
        }
      }, 500 / playbackSpeed);
    }

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, isReplayMode, snapshots, playbackSpeed, setCurrentSnapshotIndex]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      setCurrentSnapshotIndex(value);
      setIsPlaying(false);
    },
    [setCurrentSnapshotIndex]
  );

  const stepBackward = useCallback(() => {
    const state = useRaftStore.getState();
    const currentIdx = state.currentSnapshotIndex;
    const prevSnapshot = [...state.snapshots]
      .reverse()
      .find((s) => s.snapshotIndex < currentIdx);
    if (prevSnapshot) {
      setCurrentSnapshotIndex(prevSnapshot.snapshotIndex);
    }
    setIsPlaying(false);
  }, [setCurrentSnapshotIndex]);

  const stepForward = useCallback(() => {
    const state = useRaftStore.getState();
    const currentIdx = state.currentSnapshotIndex;
    const nextSnapshot = state.snapshots.find((s) => s.snapshotIndex > currentIdx);
    if (nextSnapshot) {
      setCurrentSnapshotIndex(nextSnapshot.snapshotIndex);
    }
    setIsPlaying(false);
  }, [setCurrentSnapshotIndex]);

  if (snapshots.length === 0 && !isReplayMode) {
    return (
      <div className="absolute bottom-4 left-4 right-4 z-20">
        <button
          onClick={() => {
            fetchSnapshots();
            setTimeout(enterReplayMode, 100);
          }}
          className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 font-mono text-xs text-cyan-400 transition-all hover:bg-cyan-500/20"
        >
          <History size={14} />
          进入回放模式
        </button>
      </div>
    );
  }

  const firstIdx = snapshots[0]?.snapshotIndex ?? 0;
  const lastIdx = snapshots[snapshots.length - 1]?.snapshotIndex ?? 0;

  if (!isReplayMode) {
    return (
      <div className="absolute bottom-4 left-4 right-4 z-20">
        <button
          onClick={enterReplayMode}
          className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 font-mono text-xs text-cyan-400 transition-all hover:bg-cyan-500/20"
        >
          <History size={14} />
          进入回放模式 ({snapshots.length} 个快照)
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/5 bg-[#0a0e1a]/95 backdrop-blur-xl">
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          onClick={exitReplayMode}
          className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-xs text-red-400 transition-all hover:bg-red-500/20"
        >
          <X size={12} />
          退出回放
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={stepBackward}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition-all hover:bg-white/10"
            title="上一个快照"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 transition-all hover:bg-cyan-500/20"
            title={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            onClick={stepForward}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition-all hover:bg-white/10"
            title="下一个快照"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex-1" ref={sliderRef}>
          <div className="relative">
            <input
              type="range"
              min={firstIdx}
              max={lastIdx}
              value={currentSnapshotIndex}
              onChange={handleSliderChange}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/5"
              style={{
                background: `linear-gradient(to right, #00f0ff ${((currentSnapshotIndex - firstIdx) / (lastIdx - firstIdx || 1)) * 100}%, rgba(255,255,255,0.05) ${((currentSnapshotIndex - firstIdx) / (lastIdx - firstIdx || 1)) * 100}%)`,
              }}
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-gray-500">
              <span>{new Date(snapshots[0]?.timestamp ?? 0).toLocaleTimeString()}</span>
              <span className="text-cyan-400">
                <Clock size={10} className="inline mr-1" />
                {snapshots.length} snapshots
              </span>
              <span>{new Date(snapshots[snapshots.length - 1]?.timestamp ?? 0).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-gray-500">速度:</span>
          {[0.5, 1, 2].map((speed) => (
            <button
              key={speed}
              onClick={() => setPlaybackSpeed(speed)}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] transition-all ${
                playbackSpeed === speed
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-gray-400">
          <span className="text-cyan-400">快照 #{currentSnapshotIndex}</span>
        </div>
      </div>
    </div>
  );
}
