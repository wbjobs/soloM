export interface SystemData {
  cpu: CpuData;
  memory: MemoryData;
  disk: DiskData;
  network: NetworkData;
  processes: ProcessData[];
  timestamp: number;
}

export interface CpuData {
  usage: number;
  temperature: number;
  cores: number;
}

export interface MemoryData {
  used: number;
  total: number;
  percentage: number;
}

export interface DiskData {
  read: number;
  write: number;
}

export interface NetworkData {
  upload: number;
  download: number;
}

export interface ProcessData {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

export interface ChartDataPoint {
  time: string;
  value: number;
}

export interface RecordingState {
  isRecording: boolean;
  sampleCount: number;
  bufferDurationMs: number;
  maxDurationMs: number;
}

export interface ExportResult {
  success: boolean;
  path?: string;
  error?: string;
}
