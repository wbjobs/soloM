import { PipelineRun, StepRun, LogEntry } from './types';

class PipelineStore {
  private runs: Map<string, PipelineRun> = new Map();
  private logs: Map<string, LogEntry[]> = new Map();

  createRun(run: PipelineRun): PipelineRun {
    this.runs.set(run.id, run);
    this.logs.set(run.id, []);
    return run;
  }

  getRun(id: string): PipelineRun | undefined {
    return this.runs.get(id);
  }

  listRuns(): PipelineRun[] {
    return Array.from(this.runs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  updateRun(id: string, updates: Partial<PipelineRun>): PipelineRun | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    Object.assign(run, updates);
    return run;
  }

  updateStep(runId: string, stepName: string, updates: Partial<StepRun>): StepRun | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    const step = run.steps.find(s => s.name === stepName);
    if (!step) return undefined;
    Object.assign(step, updates);
    return step;
  }

  appendLog(entry: LogEntry): void {
    const runLogs = this.logs.get(entry.runId);
    if (runLogs) {
      runLogs.push(entry);
    }
  }

  getLogs(runId: string): LogEntry[] {
    return this.logs.get(runId) || [];
  }

  getRecentRuns(limit: number = 20): PipelineRun[] {
    return this.listRuns().slice(0, limit);
  }
}

export const store = new PipelineStore();
