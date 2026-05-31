import { create } from 'zustand';
import type {
  SimulationState,
  SimulationConfig,
  SimulationStats,
  ScenePreset,
} from '../types/simulation';

interface SimulationStore {
  positions: Float32Array;
  velocities: Float32Array;
  masses: Float32Array;
  bodyCount: number;
  frame: number;
  config: SimulationConfig;
  stats: SimulationStats;
  scenes: ScenePreset[];
  currentSceneId: string | null;
  isConnected: boolean;
  isRunning: boolean;
  isPaused: boolean;
  showTrails: boolean;
  trailLength: number;
  particleSize: number;
  colorMode: 'mass' | 'velocity' | 'fixed';
  deviceInfo: {
    backend: string;
    device: string;
    is_gpu: boolean;
  } | null;

  setPositions: (positions: number[] | Float32Array, count: number) => void;
  setVelocities: (velocities: number[] | Float32Array) => void;
  setMasses: (masses: number[] | Float32Array) => void;
  setFrame: (frame: number) => void;
  setConfig: (config: Partial<SimulationConfig>) => void;
  setStats: (stats: Partial<SimulationStats>) => void;
  setScenes: (scenes: ScenePreset[]) => void;
  setCurrentSceneId: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
  setRunning: (running: boolean) => void;
  setPaused: (paused: boolean) => void;
  setShowTrails: (show: boolean) => void;
  setTrailLength: (length: number) => void;
  setParticleSize: (size: number) => void;
  setColorMode: (mode: 'mass' | 'velocity' | 'fixed') => void;
  setDeviceInfo: (info: { backend: string; device: string; is_gpu: boolean } | null) => void;
  reset: () => void;
}

const defaultConfig: SimulationConfig = {
  gravitationalConstant: 1.0,
  timeStep: 0.05,
  softening: 0.3,
  theta: 0.7,
};

const defaultStats: SimulationStats = {
  frame: 0,
  bodyCount: 0,
  fps: 0,
  totalFrameTime: 0,
  computeTime: 0,
  avgComputeTime: 0,
  maxComputeTime: 0,
  isRunning: false,
  isPaused: false,
};

export const useSimulationStore = create<SimulationStore>((set) => ({
  positions: new Float32Array(),
  velocities: new Float32Array(),
  masses: new Float32Array(),
  bodyCount: 0,
  frame: 0,
  config: defaultConfig,
  stats: defaultStats,
  scenes: [],
  currentSceneId: null,
  isConnected: false,
  isRunning: false,
  isPaused: false,
  showTrails: true,
  trailLength: 150,
  particleSize: 2.0,
  colorMode: 'velocity',
  deviceInfo: null,

  setPositions: (positions, count) =>
    set(() => ({
      positions: positions instanceof Float32Array ? positions : new Float32Array(positions),
      bodyCount: count,
    })),

  setVelocities: (velocities) =>
    set(() => ({
      velocities: velocities instanceof Float32Array ? velocities : new Float32Array(velocities),
    })),

  setMasses: (masses) =>
    set(() => ({
      masses: masses instanceof Float32Array ? masses : new Float32Array(masses),
    })),

  setFrame: (frame) => set(() => ({ frame })),

  setConfig: (config) =>
    set((state) => ({
      config: { ...state.config, ...config },
    })),

  setStats: (stats) =>
    set((state) => ({
      stats: { ...state.stats, ...stats },
      isRunning: stats.isRunning ?? state.isRunning,
      isPaused: stats.isPaused ?? state.isPaused,
    })),

  setScenes: (scenes) => set(() => ({ scenes })),

  setCurrentSceneId: (id) => set(() => ({ currentSceneId: id })),

  setConnected: (connected) => set(() => ({ isConnected: connected })),

  setRunning: (running) => set(() => ({ isRunning: running })),

  setPaused: (paused) => set(() => ({ isPaused: paused })),

  setShowTrails: (show) => set(() => ({ showTrails: show })),

  setTrailLength: (length) => set(() => ({ trailLength: length })),

  setParticleSize: (size) => set(() => ({ particleSize: size })),

  setColorMode: (mode) => set(() => ({ colorMode: mode })),

  setDeviceInfo: (info) => set(() => ({ deviceInfo: info })),

  reset: () =>
    set(() => ({
      frame: 0,
      positions: new Float32Array(),
      velocities: new Float32Array(),
      masses: new Float32Array(),
    })),
}));
