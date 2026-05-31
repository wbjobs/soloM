import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem';
import { StarField } from './StarField';
import { useSimulationStore } from '../store/simulationStore';

function AdaptivePostProcessing() {
  const { bodyCount } = useSimulationStore();

  const isHeavy = bodyCount > 3000;
  const isVeryHeavy = bodyCount > 8000;

  return (
    <EffectComposer multisampling={isHeavy ? 0 : 4}>
      <Bloom
        intensity={isVeryHeavy ? 0.8 : isHeavy ? 1.0 : 1.5}
        luminanceThreshold={isHeavy ? 0.4 : 0.2}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      {!isHeavy && <Vignette offset={0.5} darkness={0.8} />}
    </EffectComposer>
  );
}

function SceneContent() {
  const groupRef = useRef<THREE.Group>(null);
  const { positions, bodyCount } = useSimulationStore();

  const bounds = useMemo(() => {
    if (bodyCount === 0) return { center: new THREE.Vector3(), radius: 50 };

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < bodyCount; i++) {
      minX = Math.min(minX, positions[i * 3]);
      maxX = Math.max(maxX, positions[i * 3]);
      minY = Math.min(minY, positions[i * 3 + 1]);
      maxY = Math.max(maxY, positions[i * 3 + 1]);
      minZ = Math.min(minZ, positions[i * 3 + 2]);
      maxZ = Math.max(maxZ, positions[i * 3 + 2]);
    }

    const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 10;

    return { center, radius: Math.max(radius, 50) };
  }, [positions, bodyCount]);

  useFrame((state) => {
    if (groupRef.current && bodyCount > 0) {
      state.camera.lookAt(bounds.center);
    }
  });

  return (
    <>
      <ambientLight intensity={0.1} />
      <group ref={groupRef}>
        <StarField count={bodyCount > 3000 ? 3000 : 8000} radius={800} />
        <ParticleSystem />
      </group>
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={2000}
        makeDefault
      />
      <AdaptivePostProcessing />
    </>
  );
}

export function NBodyScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 100], fov: 60, near: 0.1, far: 5000 }}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
      }}
      dpr={1}
      style={{ background: 'linear-gradient(to bottom, #0a0e1a, #050810)' }}
    >
      <SceneContent />
    </Canvas>
  );
}
