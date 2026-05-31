import React, { useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import VoxelWorld from './components/VoxelWorld'

export default function App() {
  const [useDemo, setUseDemo] = useState(true)
  const [worldPath, setWorldPath] = useState('')
  const [connected, setConnected] = useState(false)
  const [showHelp, setShowHelp] = useState(true)

  const handleConnect = useCallback(() => {
    setUseDemo(false)
    setConnected(true)
  }, [])

  const handleDemo = useCallback(() => {
    setUseDemo(true)
    setConnected(false)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas
        shadows
        camera={{ fov: 70, near: 0.1, far: 500 }}
        style={{ background: '#87ceeb' }}
        gl={{ antialias: true, alpha: false }}
      >
        <VoxelWorld useDemoData={useDemo} worldPath={worldPath} />
      </Canvas>

      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        gap: 8,
        zIndex: 100,
      }}>
        <button
          onClick={handleDemo}
          style={{
            padding: '6px 14px',
            background: useDemo ? '#4a9eff' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Demo Terrain
        </button>
        <input
          type="text"
          value={worldPath}
          onChange={e => setWorldPath(e.target.value)}
          placeholder="World path (e.g. ./world)"
          style={{
            padding: '6px 10px',
            background: '#222',
            color: '#eee',
            border: '1px solid #555',
            borderRadius: 4,
            fontSize: 13,
            width: 200,
          }}
        />
        <button
          onClick={handleConnect}
          style={{
            padding: '6px 14px',
            background: connected ? '#4aff7f' : '#4a9eff',
            color: '#111',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Connect gRPC
        </button>
      </div>

      {showHelp && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          color: '#eee',
          padding: '12px 20px',
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.6,
          zIndex: 100,
          maxWidth: 420,
          textAlign: 'center',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>
            🎮 Controls
          </div>
          <div>Click canvas to lock mouse • WASD to move • Space/Shift for up/down</div>
          <div>Mouse look • Left click on block to break</div>
          <div>Press ESC to unlock mouse</div>
          <button
            onClick={() => setShowHelp(false)}
            style={{
              marginTop: 6,
              padding: '2px 12px',
              background: '#555',
              color: '#ddd',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Got it
          </button>
        </div>
      )}

      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        background: 'rgba(0,0,0,0.6)',
        color: '#aaa',
        padding: '6px 10px',
        borderRadius: 4,
        fontSize: 11,
        zIndex: 100,
      }}>
        Voxel Map Viewer v1.0
      </div>
    </div>
  )
}
