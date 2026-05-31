import { useRaftStore } from "@/store/raftStore";
import { NodeCard } from "./NodeCard";
import { ActionButtons } from "./ActionButtons";
import { EventLog } from "./EventLog";
import { Activity } from "lucide-react";

export function ControlPanel() {
  const connected = useRaftStore((s) => s.connected);

  return (
    <div className="flex h-full w-80 flex-col gap-4 border-l border-white/5 bg-[#0a0e1a]/95 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-widest text-white">
          <Activity size={16} className="text-cyan-400" />
          Raft Cluster
        </h2>
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
            style={{
              boxShadow: connected ? "0 0 6px #00ff88" : "0 0 6px #ff0044",
            }}
          />
          <span className="font-mono text-xs text-gray-500">
            {connected ? "WS Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-mono text-xs uppercase tracking-wider text-gray-400">Nodes</h3>
        {[1, 2, 3].map((id) => (
          <NodeCard key={id} nodeId={id} />
        ))}
      </div>

      <div className="border-t border-white/5 pt-3">
        <ActionButtons />
      </div>

      <div className="mt-auto border-t border-white/5 pt-3">
        <EventLog />
      </div>
    </div>
  );
}
