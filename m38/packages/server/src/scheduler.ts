import Docker from 'dockerode';
import { StepConfig, LogEntry } from './types';

const docker = new Docker();

type LogCallback = (entry: LogEntry) => void;

const ANSI_REGEX = /[\u001b\u009b]\[[0-9;]*[a-zA-Z]|[\u001b\u009b]\].*?(?:\u0007|\u001b\\)|[\u001b\u009b][()].[^\u001b\u009b]*|[\u001b\u009b][0-9;]*[a-zA-Z]/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

const DEFAULT_STEP_TIMEOUT_MS = 30 * 60 * 1000;

export interface RunStepResult {
  exitCode: number;
  fileContents: Map<string, string>;
}

class ContainerScheduler {
  private async forceRemoveContainer(containerId: string): Promise<void> {
    try {
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 5 });
      }
      await container.remove({ force: true });
    } catch {}
  }

  async runStep(
    step: StepConfig,
    runId: string,
    env: Record<string, string>,
    onLog: LogCallback,
    extraVolumes: string[] = [],
    readFiles: string[] = [],
    timeoutMs: number = DEFAULT_STEP_TIMEOUT_MS
  ): Promise<RunStepResult> {
    const volumeName = `cicd-workspace-${runId}`;
    const fileContents = new Map<string, string>();

    try {
      await docker.createVolume({ Name: volumeName });
    } catch {}

    const mergedEnv: Record<string, string> = { ...env, ...step.env };
    const envArray: string[] = Object.entries(mergedEnv).map(
      ([key, value]) => `${key}=${value}`
    );

    const binds: string[] = [`${volumeName}:/workspace`];
    if (step.volumes) {
      binds.push(...step.volumes);
    }
    binds.push(...extraVolumes);

    const containerConfig: Docker.ContainerCreateOptions = {
      Image: step.image,
      Cmd: ['/bin/sh', '-c', step.commands.join(' && ')],
      Env: envArray,
      WorkingDir: step.workdir || '/workspace',
      HostConfig: {
        Binds: binds,
        AutoRemove: false,
      },
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: false,
    };

    let container: Docker.Container | null = null;
    let containerId: string | null = null;

    try {
      container = await docker.createContainer(containerConfig);
      containerId = container.id;

      await container.start();

      const logsStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
      });

      const streamEnded = new Promise<void>((resolve) => {
        logsStream.on('data', (chunk: Buffer) => {
          const headerByte = chunk[0];
          const streamType = headerByte === 1 ? 'stdout' : headerByte === 2 ? 'stderr' : 'stdout';
          const raw = chunk.slice(8).toString('utf-8');
          const data = stripAnsi(raw);

          if (data.trim()) {
            onLog({
              runId,
              stepName: step.name,
              timestamp: new Date().toISOString(),
              stream: streamType,
              data,
            });
          }
        });

        logsStream.on('end', resolve);
        logsStream.on('error', resolve);
      });

      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          onLog({
            runId,
            stepName: step.name,
            timestamp: new Date().toISOString(),
            stream: 'stderr',
            data: `[TIMEOUT] Step exceeded ${timeoutMs / 1000}s, terminating container\n`,
          });
          resolve();
        }, timeoutMs);
      });

      await Promise.race([streamEnded, timeout]);

      if (container) {
        try {
          const info = await container.inspect();
          if (info.State.Running) {
            await container.stop({ t: 5 });
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch {}
      }

      for (const filePath of readFiles) {
        try {
          const exec = await container!.exec({
            Cmd: ['/bin/sh', '-c', `cat ${filePath} 2>/dev/null || true`],
            AttachStdout: true,
            AttachStderr: false,
          });
          let content = '';
          const stream = await exec.start({});
          await new Promise<void>((resolve) => {
            stream.on('data', (chunk: Buffer) => {
              content += chunk.slice(8).toString('utf-8');
            });
            stream.on('end', resolve);
            stream.on('error', resolve);
          });
          fileContents.set(filePath, content);
        } catch {}
      }

      let exitCode = -1;
      try {
        const inspectResult = await container!.inspect();
        exitCode = inspectResult.State.ExitCode;
      } catch {}

      return { exitCode, fileContents };
    } catch (err) {
      return { exitCode: -1, fileContents };
    } finally {
      if (containerId) {
        await this.forceRemoveContainer(containerId);
      }
    }
  }

  async cleanupWorkspace(runId: string): Promise<void> {
    const volumeName = `cicd-workspace-${runId}`;
    try {
      const volume = docker.getVolume(volumeName);
      await volume.remove({ force: true });
    } catch {}
  }
}

export const scheduler = new ContainerScheduler();
