import { apiClient } from '../api/client.ts';
import { generateSalt, arrayBufferToBase64 } from './crypto/keyDerivation.ts';
import { cryptoWorker } from './crypto/workerManager.ts';
import { getFileChunk, calculateTotalChunks, DEFAULT_CHUNK_SIZE } from './crypto/chunker.ts';
import type { CreateFileRequest, UploadProgress } from '../../shared/types.ts';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000;
const MAX_RETRY_JITTER = 1000;

export interface UploadOptions {
  chunkSize?: number;
  onProgress?: (progress: UploadProgress[]) => void;
  onComplete?: (fileId: string) => void;
  onError?: (error: Error) => void;
}

export interface UploadTask {
  fileId: string;
  file: File;
  progress: UploadProgress[];
  isComplete: boolean;
  failedChunks: number[];
  cancel: () => void;
  retry: () => void;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateRetryDelay(attempt: number): number {
  const exponential = BASE_RETRY_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * MAX_RETRY_JITTER;
  return exponential + jitter;
}

async function uploadChunkWithRetry(
  fileId: string,
  chunkIndex: number,
  ivBase64: string,
  blob: Blob,
  maxRetries: number = MAX_RETRIES
): Promise<boolean> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiClient.uploadChunk(fileId, chunkIndex, ivBase64, blob);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = calculateRetryDelay(attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`Chunk ${chunkIndex} upload failed after ${maxRetries + 1} attempts`);
}

export class FileUploader {
  private tasks: Map<string, UploadTask> = new Map();
  private defaultChunkSize: number;
  private activeControllers: Map<string, AbortController> = new Map();

  constructor(chunkSize: number = DEFAULT_CHUNK_SIZE) {
    this.defaultChunkSize = chunkSize;
  }

  async upload(
    file: File,
    password: string,
    options: UploadOptions = {}
  ): Promise<UploadTask> {
    const {
      chunkSize = this.defaultChunkSize,
      onProgress,
      onComplete,
      onError,
    } = options;

    const totalChunks = calculateTotalChunks(file.size, chunkSize);
    const progress: UploadProgress[] = Array.from({ length: totalChunks }, (_, i) => ({
      chunkIndex: i,
      status: 'pending' as const,
      progress: 0,
    }));

    const salt = generateSalt();
    const saltBase64 = arrayBufferToBase64(salt);

    const createFileRequest: CreateFileRequest = {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      chunkSize,
      totalChunks,
      salt: saltBase64,
      algorithm: 'AES-GCM-256',
    };

    const { id: fileId } = await apiClient.createFile(createFileRequest);

    const abortController = new AbortController();
    this.activeControllers.set(fileId, abortController);

    let isCancelled = false;

    const task: UploadTask = {
      fileId,
      file,
      progress,
      isComplete: false,
      failedChunks: [],
      cancel: () => {
        isCancelled = true;
        abortController.abort();
        this.activeControllers.delete(fileId);
      },
      retry: () => {
        this.retryFailedChunks(fileId, options);
      },
    };

    this.tasks.set(fileId, task);

    try {
      await cryptoWorker.deriveKey(password, saltBase64);
    } catch (error) {
      onError?.(error as Error);
      return task;
    }

    this.processChunks(fileId, file, chunkSize, totalChunks, progress, onProgress, onComplete, onError, isCancelled);

    return task;
  }

  async resumeUpload(
    fileId: string,
    file: File,
    password: string,
    options: UploadOptions = {}
  ): Promise<UploadTask> {
    const { onProgress, onComplete, onError } = options;

    const fileDetail = await apiClient.getFileDetail(fileId);
    const saltBase64 = fileDetail.salt;
    const totalChunks = fileDetail.totalChunks;
    const chunkSize = fileDetail.chunkSize;

    const uploadedIndices = new Set(fileDetail.chunks.map((c) => c.chunkIndex));

    const progress: UploadProgress[] = Array.from({ length: totalChunks }, (_, i) => {
      if (uploadedIndices.has(i)) {
        return { chunkIndex: i, status: 'done' as const, progress: 100 };
      }
      return { chunkIndex: i, status: 'pending' as const, progress: 0 };
    });

    const abortController = new AbortController();
    this.activeControllers.set(fileId, abortController);

    let isCancelled = false;

    const task: UploadTask = {
      fileId,
      file,
      progress,
      isComplete: false,
      failedChunks: [],
      cancel: () => {
        isCancelled = true;
        abortController.abort();
        this.activeControllers.delete(fileId);
      },
      retry: () => {
        this.retryFailedChunks(fileId, options);
      },
    };

    this.tasks.set(fileId, task);

    try {
      await cryptoWorker.deriveKey(password, saltBase64);
    } catch (error) {
      onError?.(error as Error);
      return task;
    }

    const pendingIndices = Array.from({ length: totalChunks }, (_, i) => i).filter(
      (i) => !uploadedIndices.has(i)
    );

    this.processChunkQueue(
      fileId, file, chunkSize, pendingIndices, progress, onProgress, onComplete, onError, isCancelled
    );

    return task;
  }

  private async processChunks(
    fileId: string,
    file: File,
    chunkSize: number,
    totalChunks: number,
    progress: UploadProgress[],
    onProgress?: (progress: UploadProgress[]) => void,
    onComplete?: (fileId: string) => void,
    onError?: (error: Error) => void,
    isCancelled: boolean = false
  ): Promise<void> {
    const allIndices = Array.from({ length: totalChunks }, (_, i) => i);
    await this.processChunkQueue(fileId, file, chunkSize, allIndices, progress, onProgress, onComplete, onError, isCancelled);
  }

  private async processChunkQueue(
    fileId: string,
    file: File,
    chunkSize: number,
    chunkIndices: number[],
    progress: UploadProgress[],
    onProgress?: (progress: UploadProgress[]) => void,
    onComplete?: (fileId: string) => void,
    onError?: (error: Error) => void,
    isCancelled: boolean = false
  ): Promise<void> {
    const task = this.tasks.get(fileId);
    if (!task) return;

    const failedChunks: number[] = [];

    for (const chunkIndex of chunkIndices) {
      if (isCancelled) break;

      const prog = progress[chunkIndex];
      prog.status = 'uploading';
      prog.progress = 0;
      onProgress?.([...progress]);

      try {
        const chunk = await getFileChunk(file, chunkIndex, chunkSize);
        prog.progress = 30;
        onProgress?.([...progress]);

        const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(12)));
        const ivBase64 = arrayBufferToBase64(iv);

        const encryptedData = await cryptoWorker.encryptChunk(chunk.data, ivBase64);
        chunk.data = new ArrayBuffer(0);
        prog.progress = 60;
        onProgress?.([...progress]);

        const blob = new Blob([encryptedData]);

        await uploadChunkWithRetry(fileId, chunkIndex, ivBase64, blob);

        prog.status = 'done';
        prog.progress = 100;
        onProgress?.([...progress]);
      } catch (error) {
        prog.status = 'error';
        prog.progress = 0;
        onProgress?.([...progress]);
        failedChunks.push(chunkIndex);
      }
    }

    task.failedChunks = failedChunks;

    if (!isCancelled && failedChunks.length === 0) {
      try {
        await apiClient.completeFile(fileId);
        task.isComplete = true;
        await cryptoWorker.clearKey();
        onComplete?.(fileId);
      } catch (error) {
        onError?.(error as Error);
      }
    } else if (failedChunks.length > 0 && !isCancelled) {
      onError?.(new Error(`${failedChunks.length} 个分片上传失败，可点击重试`));
    }
  }

  private async retryFailedChunks(
    fileId: string,
    options: UploadOptions = {}
  ): Promise<void> {
    const task = this.tasks.get(fileId);
    if (!task || task.failedChunks.length === 0) return;

    const { onProgress, onComplete, onError } = options;
    const isCancelled = false;

    const failedIndices = [...task.failedChunks];
    task.failedChunks = [];

    for (const chunkIndex of failedIndices) {
      if (isCancelled) break;

      const prog = task.progress[chunkIndex];
      prog.status = 'uploading';
      prog.progress = 0;
      onProgress?.([...task.progress]);

      try {
        const chunk = await getFileChunk(task.file, chunkIndex, task.file.size > 0 ? Math.ceil(task.file.size / task.progress.length) : DEFAULT_CHUNK_SIZE);
        prog.progress = 30;
        onProgress?.([...task.progress]);

        const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(12)));
        const ivBase64 = arrayBufferToBase64(iv);

        const encryptedData = await cryptoWorker.encryptChunk(chunk.data, ivBase64);
        chunk.data = new ArrayBuffer(0);
        prog.progress = 60;
        onProgress?.([...task.progress]);

        const blob = new Blob([encryptedData]);
        await uploadChunkWithRetry(fileId, chunkIndex, ivBase64, blob);

        prog.status = 'done';
        prog.progress = 100;
        onProgress?.([...task.progress]);
      } catch (error) {
        prog.status = 'error';
        prog.progress = 0;
        onProgress?.([...task.progress]);
        task.failedChunks.push(chunkIndex);
      }
    }

    if (task.failedChunks.length === 0) {
      try {
        await apiClient.completeFile(fileId);
        task.isComplete = true;
        await cryptoWorker.clearKey();
        onComplete?.(fileId);
      } catch (error) {
        onError?.(error as Error);
      }
    } else {
      onError?.(new Error(`仍有 ${task.failedChunks.length} 个分片上传失败`));
    }
  }

  getTask(fileId: string): UploadTask | undefined {
    return this.tasks.get(fileId);
  }

  cancelTask(fileId: string): void {
    const task = this.tasks.get(fileId);
    if (task) {
      task.cancel();
    }
  }
}

export const fileUploader = new FileUploader();
