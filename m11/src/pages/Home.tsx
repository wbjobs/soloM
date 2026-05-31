import { RaftScene } from "@/components/scene/RaftScene";
import { ControlPanel } from "@/components/panel/ControlPanel";
import { Timeline } from "@/components/panel/Timeline";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function Home() {
  useWebSocket();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#060a14]">
      <div className="relative flex-1">
        <RaftScene />
        <div className="pointer-events-none absolute left-4 top-4 z-10">
          <h1 className="font-mono text-lg font-bold tracking-wider text-white/80">
            RAFT <span className="text-cyan-400">CONSENSUS</span> VISUALIZER
          </h1>
          <p className="font-mono text-xs text-gray-500">Interactive Distributed Consensus Algorithm</p>
        </div>
        <Timeline />
      </div>
      <ControlPanel />
    </div>
  );
}
