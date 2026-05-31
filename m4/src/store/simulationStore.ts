import { create } from "zustand";
import type {
  SimulationParams,
  FrameData,
  RDFData,
  SimStatus,
} from "../types/simulation";
import { PRESET_GAS } from "../types/simulation";

interface SimulationState {
  params: SimulationParams;
  status: SimStatus;
  currentFrame: FrameData | null;
  frameHistory: FrameData[];
  showTrails: boolean;
  velocityTab: "vx" | "vy" | "speed";
  wsConnected: boolean;
  fps: number;
  rdfData: RDFData | null;
}

interface SimulationActions {
  setParams: (params: SimulationParams) => void;
  updateParam: <K extends keyof SimulationParams>(
    key: K,
    value: SimulationParams[K]
  ) => void;
  setStatus: (status: SimStatus) => void;
  setCurrentFrame: (frame: FrameData | null) => void;
  addFrameToHistory: (frame: FrameData) => void;
  reset: () => void;
  toggleTrails: () => void;
  setVelocityTab: (tab: "vx" | "vy" | "speed") => void;
  setWsConnected: (connected: boolean) => void;
  setFps: (fps: number) => void;
  setRdfData: (data: RDFData | null) => void;
}

const MAX_HISTORY = 200;

export const useSimulationStore = create<SimulationState & SimulationActions>(
  (set) => ({
    params: { ...PRESET_GAS },
    status: "idle",
    currentFrame: null,
    frameHistory: [],
    showTrails: false,
    velocityTab: "speed",
    wsConnected: false,
    fps: 0,
    rdfData: null,

    setParams: (params) => set({ params }),
    updateParam: (key, value) =>
      set((state) => ({
        params: { ...state.params, [key]: value },
      })),
    setStatus: (status) => set({ status }),
    setCurrentFrame: (currentFrame) => set({ currentFrame }),
    addFrameToHistory: (frame) =>
      set((state) => ({
        frameHistory: [...state.frameHistory.slice(-(MAX_HISTORY - 1)), frame],
      })),
    reset: () =>
      set({
        params: { ...PRESET_GAS },
        status: "idle",
        currentFrame: null,
        frameHistory: [],
        fps: 0,
        rdfData: null,
      }),
    toggleTrails: () => set((state) => ({ showTrails: !state.showTrails })),
    setVelocityTab: (velocityTab) => set({ velocityTab }),
    setWsConnected: (wsConnected) => set({ wsConnected }),
    setFps: (fps) => set({ fps }),
    setRdfData: (rdfData) => set({ rdfData }),
  })
);
