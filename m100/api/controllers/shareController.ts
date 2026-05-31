import { Context } from 'koa';
import crypto from 'crypto';
import {
  createShareLink,
  getShareLink,
  getFileMetadataById,
  incrementShareDownloadCount,
} from '../db/repository.ts';

async function computeKeyHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = Buffer.from(salt, 'base64');

  return new Promise((resolve) => {
    crypto.pbkdf2(passwordBuffer, saltBuffer, 100000, 32, 'sha256', (err, derivedKey) => {
      if (err) throw err;
      resolve(derivedKey.toString('base64'));
    });
  });
}

export async function createShare(ctx: Context) {
  const { fileId, password, expiresAt, maxDownloads } = ctx.request.body as {
    fileId: string;
    password: string;
    expiresAt?: string;
    maxDownloads?: number;
  };

  if (!fileId || !password) {
    ctx.status = 400;
    ctx.body = { error: 'Missing required fields' };
    return;
  }

  const file = getFileMetadataById(fileId);
  if (!file) {
    ctx.status = 404;
    ctx.body = { error: 'File not found' };
    return;
  }

  if (file.status !== 'complete') {
    ctx.status = 400;
    ctx.body = { error: 'File not complete' };
    return;
  }

  const keyHash = await computeKeyHash(password, file.salt);
  const { id: shareId } = createShareLink(
    fileId,
    keyHash,
    expiresAt || null,
    maxDownloads || null
  );

  const shareUrl = `${ctx.protocol}://${ctx.host}/share/${shareId}`;

  ctx.body = {
    shareId,
    shareUrl,
  };
}

export async function getShareInfo(ctx: Context) {
  const { id } = ctx.params;

  const share = getShareLink(id);
  if (!share) {
    ctx.status = 404;
    ctx.body = { error: 'Share link not found' };
    return;
  }

  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    ctx.status = 410;
    ctx.body = { error: 'Share link expired' };
    return;
  }

  if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
    ctx.status = 410;
    ctx.body = { error: 'Share link max downloads reached' };
    return;
  }

  const file = getFileMetadataById(share.fileId);
  if (!file) {
    ctx.status = 404;
    ctx.body = { error: 'File not found' };
    return;
  }

  ctx.body = {
    valid: true,
    fileId: file.id,
    fileName: file.fileName,
    fileSize: file.fileSize,
    salt: file.salt,
    algorithm: file.algorithm,
  };
}

export async function verifySharePassword(ctx: Context) {
  const { id } = ctx.params;
  const { password } = ctx.request.body as { password: string };

  if (!password) {
    ctx.status = 400;
    ctx.body = { error: 'Password required' };
    return;
  }

  const share = getShareLink(id);
  if (!share) {
    ctx.status = 404;
    ctx.body = { valid: false, error: 'Share link not found' };
    return;
  }

  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    ctx.status = 410;
    ctx.body = { valid: false, error: 'Share link expired' };
    return;
  }

  if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
    ctx.status = 410;
    ctx.body = { valid: false, error: 'Share link max downloads reached' };
    return;
  }

  const file = getFileMetadataById(share.fileId);
  if (!file) {
    ctx.status = 404;
    ctx.body = { valid: false, error: 'File not found' };
    return;
  }

  const keyHash = await computeKeyHash(password, file.salt);
  const isValid = keyHash === share.keyHash;

  if (isValid) {
    incrementShareDownloadCount(id);
  }

  ctx.body = {
    valid: isValid,
    fileId: file.id,
    fileName: file.fileName,
    fileSize: file.fileSize,
    salt: file.salt,
    algorithm: file.algorithm,
  };
}
