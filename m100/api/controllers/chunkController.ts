import { Context } from 'koa';
import { getFileMetadataById, createChunkIndex } from '../db/repository.ts';
import { getStorageBackend } from '../storage/index.ts';
import { IncomingForm } from 'formidable';
import fs from 'fs';

export async function uploadChunk(ctx: Context) {
  const { fileId, index } = ctx.params;

  const file = getFileMetadataById(fileId);
  if (!file) {
    ctx.status = 404;
    ctx.body = { error: 'File not found' };
    return;
  }

  const form = new IncomingForm({
    keepExtensions: true,
    maxFileSize: Infinity,
  });

  try {
    const [fields, files] = await form.parse(ctx.req);
    const iv = Array.isArray(fields.iv) ? fields.iv[0] : fields.iv;
    const dataFile = Array.isArray(files.data) ? files.data[0] : files.data;

    if (!iv || !dataFile) {
      ctx.status = 400;
      ctx.body = { error: 'Missing iv or data' };
      return;
    }

    const data = await fs.promises.readFile(dataFile.filepath);
    const storage = getStorageBackend('local');
    const { storagePath, size } = await storage.saveChunk(fileId, parseInt(index), data);

    await fs.promises.unlink(dataFile.filepath);

    createChunkIndex(
      fileId,
      parseInt(index),
      file.chunkSize,
      size,
      iv,
      'local',
      storagePath
    );

    ctx.body = { success: true };
  } catch (error) {
    console.error('Upload chunk error:', error);
    ctx.status = 500;
    ctx.body = { error: 'Failed to upload chunk' };
  }
}

export async function downloadChunk(ctx: Context) {
  const { fileId, index } = ctx.params;

  const { getChunkByFileIdAndIndex } = await import('../db/repository.ts');
  const chunk = getChunkByFileIdAndIndex(fileId, parseInt(index));

  if (!chunk) {
    ctx.status = 404;
    ctx.body = { error: 'Chunk not found' };
    return;
  }

  const storage = getStorageBackend(chunk.storageBackend as 'local' | 'minio');
  const data = await storage.getChunk(chunk.storagePath);

  ctx.set('Content-Type', 'application/octet-stream');
  ctx.set('X-IV', chunk.iv);
  ctx.set('X-Chunk-Index', index);
  ctx.body = data;
}
