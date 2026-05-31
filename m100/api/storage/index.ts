import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHUNK_STORAGE_DIR = path.join(__dirname, '..', '..', 'data', 'chunks');

if (!fs.existsSync(CHUNK_STORAGE_DIR)) {
  fs.mkdirSync(CHUNK_STORAGE_DIR, { recursive: true });
}

export interface StorageBackend {
  saveChunk(fileId: string, chunkIndex: number, data: Buffer): Promise<{ storagePath: string; size: number }>;
  getChunk(storagePath: string): Promise<Buffer>;
  deleteChunk(storagePath: string): Promise<boolean>;
  deleteChunks(fileId: string): Promise<boolean>;
  destroyChunks(fileId: string): Promise<number>;
}

class LocalStorageBackend implements StorageBackend {
  private getChunkDir(fileId: string): string {
    return path.join(CHUNK_STORAGE_DIR, fileId);
  }

  private async overwriteFile(filePath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(filePath);
      const fileSize = stats.size;

      const passes = [
        Buffer.alloc(fileSize, 0x00),
        Buffer.alloc(fileSize, 0xFF),
        crypto.randomBytes(fileSize),
      ];

      for (const passData of passes) {
        const handle = await fs.promises.open(filePath, 'r+');
        await handle.write(passData, 0, passData.length, 0);
        await handle.datasync();
        await handle.close();
      }
    } catch (error) {
      console.warn('Overwrite warning:', error);
    }
  }

  async saveChunk(fileId: string, chunkIndex: number, data: Buffer): Promise<{ storagePath: string; size: number }> {
    const chunkDir = this.getChunkDir(fileId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    const chunkFileName = `${uuidv4()}.bin`;
    const storagePath = path.join(fileId, chunkFileName);
    const fullPath = path.join(CHUNK_STORAGE_DIR, storagePath);

    await fs.promises.writeFile(fullPath, data);

    return { storagePath, size: data.length };
  }

  async getChunk(storagePath: string): Promise<Buffer> {
    const fullPath = path.join(CHUNK_STORAGE_DIR, storagePath);
    return await fs.promises.readFile(fullPath);
  }

  async deleteChunk(storagePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(CHUNK_STORAGE_DIR, storagePath);
      await fs.promises.unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteChunks(fileId: string): Promise<boolean> {
    try {
      const chunkDir = this.getChunkDir(fileId);
      if (fs.existsSync(chunkDir)) {
        const files = await fs.promises.readdir(chunkDir);
        for (const file of files) {
          await fs.promises.unlink(path.join(chunkDir, file));
        }
        await fs.promises.rmdir(chunkDir);
      }
      return true;
    } catch {
      return false;
    }
  }

  async destroyChunks(fileId: string): Promise<number> {
    let destroyedCount = 0;
    try {
      const chunkDir = this.getChunkDir(fileId);
      if (fs.existsSync(chunkDir)) {
        const files = await fs.promises.readdir(chunkDir);
        for (const file of files) {
          const filePath = path.join(chunkDir, file);
          await this.overwriteFile(filePath);
          await fs.promises.unlink(filePath);
          destroyedCount++;
        }
        await fs.promises.rmdir(chunkDir);
      }
    } catch (error) {
      console.warn('Destroy warning:', error);
    }
    return destroyedCount;
  }
}

class MinioStorageBackend implements StorageBackend {
  async saveChunk(fileId: string, chunkIndex: number, data: Buffer): Promise<{ storagePath: string; size: number }> {
    throw new Error('MinIO backend not implemented yet');
  }

  async getChunk(storagePath: string): Promise<Buffer> {
    throw new Error('MinIO backend not implemented yet');
  }

  async deleteChunk(storagePath: string): Promise<boolean> {
    throw new Error('MinIO backend not implemented yet');
  }

  async deleteChunks(fileId: string): Promise<boolean> {
    throw new Error('MinIO backend not implemented yet');
  }

  async destroyChunks(fileId: string): Promise<number> {
    throw new Error('MinIO backend not implemented yet');
  }
}

const localBackend = new LocalStorageBackend();
const minioBackend = new MinioStorageBackend();

export function getStorageBackend(backend: 'local' | 'minio' = 'local'): StorageBackend {
  switch (backend) {
    case 'minio':
      return minioBackend;
    case 'local':
    default:
      return localBackend;
  }
}
