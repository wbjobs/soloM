import { useState } from "react";
import { useRaftStore } from "@/store/raftStore";
import { Send, Zap, RefreshCw } from "lucide-react";

export function ActionButtons() {
  const submitLog = useRaftStore((s) => s.submitLog);
  const resetCluster = useRaftStore((s) => s.resetCluster);
  const displayNodes = useRaftStore((s) => s.displayNodes);
  const isReplayMode = useRaftStore((s) => s.isReplayMode);
  const [logData, setLogData] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const leader = displayNodes.find((n) => n.role === "leader" && n.networkOnline);

  const handleSubmitLog = async () => {
    if (!logData.trim() || !leader) return;
    setIsSubmitting(true);
    await submitLog(logData.trim());
    setLogData("");
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitLog();
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-gray-400">
          Submit Log Entry
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={logData}
            onChange={(e) => setLogData(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={leader ? "Enter log data..." : "No leader available"}
            disabled={!leader || isReplayMode}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder-gray-600 outline-none transition-all focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-40"
          />
          <button
            onClick={handleSubmitLog}
            disabled={!leader || !logData.trim() || isSubmitting || isReplayMode}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500/20 px-3 py-2 font-mono text-xs text-cyan-400 transition-all hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={12} />
            Submit
          </button>
        </div>
        {!leader && (
          <p className="mt-1 font-mono text-xs text-amber-500/70">
            Waiting for leader election...
          </p>
        )}
        {isReplayMode && (
          <p className="mt-1 font-mono text-xs text-cyan-500/70">
            Replay mode: operations disabled
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={resetCluster}
          disabled={isReplayMode}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <RefreshCw size={12} />
          Reset Cluster
        </button>
      </div>

      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
        <div className="flex items-center gap-2 font-mono text-xs text-gray-500">
          <Zap size={10} className="text-cyan-500" />
          <span>Leader: {leader ? `Node ${leader.id} (Term ${leader.term})` : "None"}</span>
        </div>
      </div>
    </div>
  );
}
