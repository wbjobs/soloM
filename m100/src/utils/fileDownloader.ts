import { apiClient } from '../api/client.ts';
import { base64ToArrayBuffer } from './crypto/keyDerivation.ts';
import { cryptoWorker } from './crypto/workerManager.ts';
import type { FileDetailResponse, DownloadProgress } from '../../shared/types.ts';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_JITTER = 1000;

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress[]) => void;
  onComplete?: (blob: Blob, fileName: string) => void;
  onError?: (error: Error) => void;
}

export interface DownloadTask {
  fileId: string;
  fileName: string;
  progress: DownloadProgress[];
  isComplete: boolean;
  cancel: () => void;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateRetryDelay(attempt: number): number {
  const exponential = BASE_RETRY_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * MAX_RETRY_JITTER;
  return exponential + jitter;
}

async function downloadChunkWithRetry(
  fileId: string,
  chunkIndex: number,
  maxRetries: number = MAX_RETRIES
): Promise<{ data: ArrayBuffer; iv: string }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiClient.downloadChunk(fileId, chunkIndex);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = calculateRetryDelay(attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Chunk ${chunkIndex} download failed after ${maxRetries + 1} attempts`);
}

export class FileDownloader {
  private tasks: Map<string, DownloadTask> = new Map();

  async download(
    fileId: string,
    password: string,
    options: DownloadOptions = {}
  ): Promise<DownloadTask> {
    const { onProgress, onComplete, onError } = options;

    const fileDetail = await apiClient.getFileDetail(fileId);
    const saltBase64 = fileDetail.salt;

    const totalChunks = fileDetail.totalChunks;
    const progress: DownloadProgress[] = Array.from({ length: totalChunks }, (_, i) => ({
      chunkIndex: i,
      status: 'pending' as const,
      progress: 0,
    }));

    let isCancelled = false;

    const task: DownloadTask = {
      fileId,
      fileName: fileDetail.fileName,
      progress,
      isComplete: false,
      cancel: () => {
        isCancelled = true;
      },
    };

    this.tasks.set(fileId, task);

    try {
      await cryptoWorker.deriveKey(password, saltBase64);
    } catch (error) {
      onError?.(error as Error);
      return task;
    }

    (async () => {
      try {
        const chunks: ArrayBuffer[] = new Array(totalChunks);

        for (let i = 0; i < totalChunks; i++) {
          if (isCancelled) break;

          const prog = progress[i];
          prog.status = 'uploading';
          prog.progress = 0;
          onProgress?.([...progress]);

          try {
            const { data: encryptedData, iv: ivBase64 } = await downloadChunkWithRetry(fileId, i);
            prog.progress = 40;
            onProgress?.([...progress]);

            const decryptedData = await cryptoWorker.decryptChunk(encryptedData, ivBase64);
            prog.progress = 80;
            onProgress?.([...progress]);

            chunks[i] = decryptedData;

            prog.status = 'done';
            prog.progress = 100;
            onProgress?.([...progress]);
          } catch (error) {
            prog.status = 'error';
            prog.progress = 0;
            onProgress?.([...progress]);
            throw error;
          }
        }

        if (!isCancelled) {
          const blob = new Blob(chunks, { type: fileDetail.mimeType });
          task.isComplete = true;
          await cryptoWorker.clearKey();
          onComplete?.(blob, fileDetail.fileName);
        }
      } catch (error) {
        await cryptoWorker.clearKey();
        if (!isCancelled) {
          onError?.(error as Error);
        }
      }
    })();

    return task;
  }

  getTask(fileId: string): DownloadTask | undefined {
    return this.tasks.get(fileId);
  }

  cancelTask(fileId: string): void {
    const task = this.tasks.get(fileId);
    if (task) {
      task.cancel();
    }
  }
}

export const fileDownloader = new FileDownloader();
