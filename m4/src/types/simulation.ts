export interface SimulationParams {
  num_particles: number;
  temperature: number;
  density: number;
  epsilon: number;
  sigma: number;
  dt: number;
  r_cutoff: number;
  steps_per_frame: number;
}

export interface RDFData {
  r: number[];
  g_r: number[];
  sample_count: number;
}

export interface FrameData {
  step: number;
  time: number;
  positions: [number, number][];
  velocities: [number, number][];
  kinetic_energy: number;
  potential_energy: number;
  total_energy: number;
  temperature: number;
  pressure: number;
  rdf: RDFData;
}

export interface StatusData {
  status: "running" | "paused" | "idle" | "error";
  step: number;
  fps: number;
}

export type ClientMessage =
  | { type: "start"; params: SimulationParams }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "reset" }
  | { type: "step" };

export type ServerMessage =
  | { type: "frame"; data: FrameData }
  | { type: "status"; data: StatusData }
  | { type: "error"; message: string };

export type SimStatus = "idle" | "running" | "paused" | "error";

export const PRESET_GAS: SimulationParams = {
  num_particles: 64,
  temperature: 2.0,
  density: 0.1,
  epsilon: 1.0,
  sigma: 1.0,
  dt: 0.005,
  r_cutoff: 2.5,
  steps_per_frame: 5,
};

export const PRESET_LIQUID: SimulationParams = {
  num_particles: 64,
  temperature: 0.8,
  density: 0.7,
  epsilon: 1.0,
  sigma: 1.0,
  dt: 0.005,
  r_cutoff: 2.5,
  steps_per_frame: 5,
};

export const PRESET_SOLID: SimulationParams = {
  num_particles: 64,
  temperature: 0.1,
  density: 0.9,
  epsilon: 1.0,
  sigma: 1.0,
  dt: 0.005,
  r_cutoff: 2.5,
  steps_per_frame: 5,
};
