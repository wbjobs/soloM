import { useRaftStore } from "@/store/raftStore";
import { ROLE_COLORS } from "@/types/raft";
import { Wifi, WifiOff, Play, Square, RotateCcw } from "lucide-react";

interface NodeCardProps {
  nodeId: number;
}

export function NodeCard({ nodeId }: NodeCardProps) {
  const node = useRaftStore((s) => s.displayNodes.find((n) => n.id === nodeId));
  const toggleNetwork = useRaftStore((s) => s.toggleNetwork);
  const stopNode = useRaftStore((s) => s.stopNode);
  const startNode = useRaftStore((s) => s.startNode);
  const triggerElection = useRaftStore((s) => s.triggerElection);
  const isReplayMode = useRaftStore((s) => s.isReplayMode);

  if (!node) return null;

  const roleColor = ROLE_COLORS[node.role] || "#4a9eff";

  return (
    <div
      className="relative rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md transition-all duration-300 hover:border-white/20"
      style={{
        boxShadow: `0 0 20px ${roleColor}15, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: roleColor,
              boxShadow: `0 0 8px ${roleColor}`,
            }}
          />
          <span className="font-mono text-sm font-bold text-white">Node {nodeId}</span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: `${roleColor}20`,
            color: roleColor,
            border: `1px solid ${roleColor}40`,
          }}
        >
          {node.role}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-gray-400">
        <div>Term: <span className="text-cyan-300">{node.term}</span></div>
        <div>Commit: <span className="text-cyan-300">{node.commitIndex}</span></div>
        <div>Log: <span className="text-cyan-300">{node.logLength}</span></div>
        <div>Voted: <span className="text-cyan-300">{node.votedFor ?? "-"}</span></div>
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={() => toggleNetwork(nodeId, !node.networkOnline)}
          disabled={isReplayMode}
          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 font-mono text-xs transition-all ${
            node.networkOnline
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
          } disabled:opacity-30 disabled:cursor-not-allowed`}
          title={node.networkOnline ? "Disconnect network" : "Connect network"}
        >
          {node.networkOnline ? <WifiOff size={12} /> : <Wifi size={12} />}
          {node.networkOnline ? "Cut" : "Restore"}
        </button>

        <button
          onClick={() => {
            if (node.networkOnline) triggerElection(nodeId);
          }}
          disabled={!node.networkOnline || isReplayMode}
          className="flex items-center gap-1 rounded-lg bg-amber-500/20 px-2 py-1.5 font-mono text-xs text-amber-400 transition-all hover:bg-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Trigger election"
        >
          <RotateCcw size={12} />
          Elect
        </button>

        <button
          onClick={() => (node.networkOnline ? stopNode(nodeId) : startNode(nodeId))}
          disabled={isReplayMode}
          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 font-mono text-xs transition-all ${
            node.networkOnline
              ? "bg-gray-500/20 text-gray-400 hover:bg-gray-500/30"
              : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
          } disabled:opacity-30 disabled:cursor-not-allowed`}
          title={node.networkOnline ? "Stop node" : "Start node"}
        >
          {node.networkOnline ? <Square size={12} /> : <Play size={12} />}
          {node.networkOnline ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}
