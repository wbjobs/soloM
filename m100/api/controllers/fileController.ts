import { Context } from 'koa';
import {
  createFileMetadata,
  getFileMetadataById,
  getAllFiles,
  updateFileStatus,
  deleteFile,
  createChunkIndex,
  getChunksByFileId,
  getChunkByFileIdAndIndex,
  getUploadedChunkCount,
} from '../db/repository.ts';
import { CreateFileRequest, FileDetailResponse } from '../../shared/types.ts';

export async function createFile(ctx: Context) {
  const body = ctx.request.body as CreateFileRequest;

  if (!body.fileName || !body.fileSize || !body.mimeType || !body.chunkSize || !body.totalChunks || !body.salt) {
    ctx.status = 400;
    ctx.body = { error: 'Missing required fields' };
    return;
  }

  const file = createFileMetadata(body);
  ctx.status = 201;
  ctx.body = { id: file.id, createdAt: file.createdAt };
}

export async function getFiles(ctx: Context) {
  const files = getAllFiles();
  ctx.body = files;
}

export async function getFile(ctx: Context) {
  const { id } = ctx.params;
  const file = getFileMetadataById(id);

  if (!file) {
    ctx.status = 404;
    ctx.body = { error: 'File not found' };
    return;
  }

  const chunks = getChunksByFileId(id);
  ctx.body = {
    ...file,
    chunks,
  } as FileDetailResponse;
}

export async function completeFile(ctx: Context) {
  const { id } = ctx.params;
  const file = getFileMetadataById(id);

  if (!file) {
    ctx.status = 404;
    ctx.body = { error: 'File not found' };
    return;
  }

  const uploadedChunks = getUploadedChunkCount(id);
  if (uploadedChunks !== file.totalChunks) {
    ctx.status = 400;
    ctx.body = { error: `Not all chunks uploaded. Expected ${file.totalChunks}, got ${uploadedChunks}` };
    return;
  }

  updateFileStatus(id, 'complete');
  ctx.body = { success: true };
}

export async function removeFile(ctx: Context) {
  const { id } = ctx.params;
  const file = getFileMetadataById(id);

  if (!file) {
    ctx.status = 404;
    ctx.body = { error: 'File not found' };
    return;
  }

  const { getStorageBackend } = await import('../storage/index.ts');
  const storage = getStorageBackend('local');
  await storage.deleteChunks(id);

  deleteFile(id);
  ctx.body = { success: true };
}

export async function getChunkStatus(ctx: Context) {
  const { id } = ctx.params;
  const file = getFileMetadataById(id);

  if (!file) {
    ctx.status = 404;
    ctx.body = { error: 'File not found' };
    return;
  }

  const chunks = getChunksByFileId(id);
  const uploadedIndices = chunks.map((c) => c.chunkIndex);

  ctx.body = {
    fileId: id,
    totalChunks: file.totalChunks,
    uploadedIndices,
    missingIndices: Array.from({ length: file.totalChunks }, (_, i) => i).filter(
      (i) => !uploadedIndices.includes(i)
    ),
  };
}

export async function getAdminStats(ctx: Context) {
  const files = getAllFiles();
  const totalFiles = files.length;
  let totalSize = 0;
  let totalChunks = 0;
  let totalEncryptedSize = 0;

  for (const file of files) {
    totalSize += file.fileSize;
    totalChunks += file.totalChunks;
    const chunks = getChunksByFileId(file.id);
    for (const chunk of chunks) {
      totalEncryptedSize += chunk.encryptedSize;
    }
  }

  ctx.body = {
    totalFiles,
    totalChunks,
    totalSize,
    totalEncryptedSize,
  };
}
