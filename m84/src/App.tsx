import { NBodyScene } from './components/NBodyScene';
import { ControlPanel } from './components/ControlPanel';
import { StatsHUD } from './components/StatsHUD';
import { useWebSocket } from './hooks/useWebSocket';

function App() {
  useWebSocket();

  return (
    <div className="w-full h-screen overflow-hidden relative bg-[#0a0e1a]">
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-transparent to-[#050810]/80" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <NBodyScene />
      <StatsHUD />
      <ControlPanel />

      <div className="fixed bottom-4 left-4 z-50 pointer-events-none">
        <h1
          className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400/80 via-purple-400/80 to-pink-400/80 tracking-widest drop-shadow-[0_0_20px_rgba(99,102,241,0.3)]"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          COSMOS
        </h1>
        <p className="text-xs text-slate-500 mt-0.5 tracking-wider">
          N-BODY GRAVITY SIMULATOR
        </p>
      </div>

      <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
        <div className="text-xs text-slate-600 font-mono">
          <p>Barnes-Hut Algorithm • O(N log N)</p>
          <p className="text-right">WebGL / Three.js</p>
        </div>
      </div>
    </div>
  );
}

export default App;
