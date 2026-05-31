import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import Docker from 'dockerode';
import { PipelineConfig, PipelineRun, StepRun, LogEntry, CacheStats, CacheHitDetail } from './types';
import { store } from './store';
import { scheduler } from './scheduler';

const docker = new Docker();

function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function getCacheVolumeName(pipelineName: string, cacheKey: string, hash: string): string {
  const sanitized = pipelineName.replace(/[^a-zA-Z0-9_.-]/g, '-');
  return `cicd-cache-${sanitized}-${cacheKey}-${hash}`;
}

async function volumeExists(name: string): Promise<boolean> {
  try {
    const volume = docker.getVolume(name);
    await volume.inspect();
    return true;
  } catch {
    return false;
  }
}

interface CacheResult {
  details: CacheHitDetail[];
  volumeBinds: string[];
  hits: number;
  misses: number;
}

async function prepareCacheVolumes(
  pipelineName: string,
  allCacheConfigs: any[],
  fileContents: Map<string, string>
): Promise<CacheResult> {
  const details: CacheHitDetail[] = [];
  const volumeBinds: string[] = [];
  let hits = 0;
  let misses = 0;

  for (const cache of allCacheConfigs) {
    const hashInputs: string[] = [];
    for (const file of cache.hashFiles) {
      const content = fileContents.get(file) || '';
      hashInputs.push(`${file}:${computeContentHash(content)}`);
    }
    const combinedHash = computeContentHash(hashInputs.join('|'));
    const volumeName = getCacheVolumeName(pipelineName, cache.key, combinedHash);
    const hit = await volumeExists(volumeName);

    if (hit) {
      hits++;
    } else {
      misses++;
      try {
        await docker.createVolume({ Name: volumeName });
      } catch {}
    }

    details.push({
      key: cache.key,
      path: cache.path,
      hit,
      hash: combinedHash,
      volumeName,
    });

    volumeBinds.push(`${volumeName}:${cache.path}`);
  }

  return { details, volumeBinds, hits, misses };
}

function collectAllCacheConfigs(config: PipelineConfig): any[] {
  const cacheMap = new Map<string, any>();
  for (const step of config.steps) {
    if (step.cache) {
      for (const cache of step.cache) {
        if (!cacheMap.has(cache.key)) {
          cacheMap.set(cache.key, cache);
        }
      }
    }
  }
  return Array.from(cacheMap.values());
}

function collectAllHashFiles(config: PipelineConfig): string[] {
  const files = new Set<string>();
  for (const step of config.steps) {
    if (step.cache) {
      for (const cache of step.cache) {
        for (const file of cache.hashFiles) {
          files.add(file);
        }
      }
    }
  }
  return Array.from(files);
}

class PipelineEngine extends EventEmitter {
  async executePipeline(
    config: PipelineConfig,
    trigger: string,
    branch?: string,
    commit?: string,
    repoUrl?: string
  ): Promise<PipelineRun> {
    const runId = uuidv4();

    const stepRuns: StepRun[] = config.steps.map(step => ({
      name: step.name,
      image: step.image,
      status: 'pending',
    }));

    const run: PipelineRun = {
      id: runId,
      pipelineName: config.name,
      status: 'pending',
      trigger,
      branch,
      commit,
      repoUrl,
      steps: stepRuns,
      createdAt: new Date().toISOString(),
    };

    store.createRun(run);

    store.updateRun(runId, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    this.emit('run-status', { runId, status: 'running' });

    let failed = false;
    let fileContents = new Map<string, string>();
    let cacheVolumeBinds: string[] = [];
    let cacheDetails: CacheHitDetail[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;
    let cachePrepared = false;

    const allCacheConfigs = collectAllCacheConfigs(config);
    const hashFilesToRead = collectAllHashFiles(config);

    const mergedEnv: Record<string, string> = {
      ...config.env,
      REPO_URL: repoUrl || '',
      BRANCH: branch || 'main',
      COMMIT: commit || '',
    };

    const onLog = (entry: LogEntry) => {
      store.appendLog(entry);
      this.emit('log', entry);
    };

    for (let i = 0; i < config.steps.length; i++) {
      const stepConfig = config.steps[i];

      if (failed) {
        store.updateStep(runId, stepConfig.name, { status: 'skipped' });
        this.emit('step-status', { runId, stepName: stepConfig.name, status: 'skipped' });
        continue;
      }

      store.updateStep(runId, stepConfig.name, {
        status: 'running',
        startedAt: new Date().toISOString(),
      });
      this.emit('step-status', { runId, stepName: stepConfig.name, status: 'running' });

      if (!cachePrepared && hashFilesToRead.length > 0 && i > 0) {
        try {
          const cacheResult = await prepareCacheVolumes(config.name, allCacheConfigs, fileContents);
          cacheVolumeBinds = cacheResult.volumeBinds;
          cacheDetails = cacheResult.details;
          cacheHits = cacheResult.hits;
          cacheMisses = cacheResult.misses;
          cachePrepared = true;

          for (const detail of cacheDetails) {
            onLog({
              runId,
              stepName: stepConfig.name,
              timestamp: new Date().toISOString(),
              stream: 'stdout',
              data: `[CACHE] ${detail.key}: ${detail.hit ? 'HIT' : 'MISS'} (hash: ${detail.hash})\n`,
            });
          }
        } catch {}
      }

      const stepExtraVolumes = cachePrepared && stepConfig.cache ? cacheVolumeBinds : [];
      const stepReadFiles = i === 0 && hashFilesToRead.length > 0 ? hashFilesToRead : [];

      try {
        const result = await scheduler.runStep(
          stepConfig,
          runId,
          mergedEnv,
          onLog,
          stepExtraVolumes,
          stepReadFiles
        );

        if (i === 0) {
          fileContents = result.fileContents;
        }

        if (result.exitCode === 0) {
          store.updateStep(runId, stepConfig.name, {
            status: 'success',
            finishedAt: new Date().toISOString(),
            exitCode: result.exitCode,
          });
          this.emit('step-status', { runId, stepName: stepConfig.name, status: 'success' });
        } else {
          store.updateStep(runId, stepConfig.name, {
            status: 'failed',
            finishedAt: new Date().toISOString(),
            exitCode: result.exitCode,
          });
          this.emit('step-status', { runId, stepName: stepConfig.name, status: 'failed' });
          failed = true;
        }
      } catch (err) {
        store.updateStep(runId, stepConfig.name, {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          exitCode: -1,
        });
        this.emit('step-status', { runId, stepName: stepConfig.name, status: 'failed' });
        failed = true;
      }
    }

    const totalCache = cacheHits + cacheMisses;
    const cacheStats: CacheStats = {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: totalCache > 0 ? cacheHits / totalCache : 0,
      details: cacheDetails,
    };

    const finalStatus = failed ? 'failed' : 'success';
    store.updateRun(runId, {
      status: finalStatus,
      finishedAt: new Date().toISOString(),
      cacheStats,
    });
    this.emit('run-status', { runId, status: finalStatus, cacheStats });

    try {
      await scheduler.cleanupWorkspace(runId);
    } catch {}

    return store.getRun(runId)!;
  }
}

export const engine = new PipelineEngine();
