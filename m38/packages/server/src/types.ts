export interface PipelineConfig {
  name: string;
  triggers?: { event: string; branch?: string }[];
  steps: StepConfig[];
  env?: Record<string, string>;
}

export interface CacheConfig {
  key: string;
  path: string;
  hashFiles: string[];
}

export interface StepConfig {
  name: string;
  image: string;
  commands: string[];
  env?: Record<string, string>;
  workdir?: string;
  volumes?: string[];
  cache?: CacheConfig[];
}

export interface CacheHitDetail {
  key: string;
  path: string;
  hit: boolean;
  hash: string;
  volumeName: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  details: CacheHitDetail[];
}

export interface PipelineRun {
  id: string;
  pipelineName: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  trigger: string;
  branch?: string;
  commit?: string;
  repoUrl?: string;
  steps: StepRun[];
  cacheStats?: CacheStats;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface StepRun {
  name: string;
  image: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
}

export interface LogEntry {
  runId: string;
  stepName: string;
  timestamp: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

export interface WebhookPayload {
  repoUrl: string;
  branch: string;
  commit: string;
  event: string;
  pipelineName?: string;
}
