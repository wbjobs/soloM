export interface BodyState {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mass: number;
}

export interface SimulationState {
  count: number;
  positions: number[];
  velocities: number[];
  masses: number[];
  frame: number;
}

export interface SimulationConfig {
  gravitationalConstant: number;
  timeStep: number;
  softening: number;
  theta: number;
}

export interface SimulationStats {
  frame: number;
  bodyCount: number;
  fps: number;
  totalFrameTime: number;
  computeTime: number;
  avgComputeTime: number;
  maxComputeTime: number;
  isRunning: boolean;
  isPaused: boolean;
}

export interface ScenePreset {
  id: string;
  name: string;
  description: string;
  bodyCount: number;
}

export interface SceneLoadedData extends ScenePreset {
  config: SimulationConfig;
}

export type ControlCommand = 'start' | 'pause' | 'resume' | 'reset' | 'step';

export type WebSocketMessageType =
  | 'state'
  | 'stats'
  | 'config'
  | 'scenes'
  | 'scene_changed'
  | 'scene_loaded'
  | 'config_updated'
  | 'control_ack'
  | 'error';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
}
