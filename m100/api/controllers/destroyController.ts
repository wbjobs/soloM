import { Context } from 'koa';
import {
  getFileMetadataById,
  deleteFile,
  deleteShareLinksByFileId,
  logDestroyAction,
} from '../db/repository.ts';
import { getStorageBackend } from '../storage/index.ts';

export async function emergencyDestroy(ctx: Context) {
  const { id } = ctx.params;

  const file = getFileMetadataById(id);
  if (!file) {
    ctx.status = 404;
    ctx.body = { error: 'File not found' };
    return;
  }

  const storage = getStorageBackend('local');
  const chunksDestroyed = await storage.destroyChunks(id);

  deleteShareLinksByFileId(id);

  const metadataDeleted = deleteFile(id);

  logDestroyAction(id, file.fileName, chunksDestroyed);

  ctx.body = {
    success: true,
    chunksDestroyed,
    metadataDeleted,
    destroyedAt: new Date().toISOString(),
  };
}

export async function getDestroyHistory(ctx: Context) {
  const { getDestroyLogs } = await import('../db/repository.ts');
  const logs = getDestroyLogs();
  ctx.body = logs;
}
