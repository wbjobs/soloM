export interface FileMetadata {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  salt: string;
  algorithm: string;
  status: 'uploading' | 'complete' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface ChunkIndex {
  id: string;
  fileId: string;
  chunkIndex: number;
  chunkSize: number;
  encryptedSize: number;
  iv: string;
  storageBackend: 'local' | 'minio';
  storagePath: string;
  uploadedAt: string;
}

export interface CreateFileRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  salt: string;
  algorithm: string;
}

export interface CreateFileResponse {
  id: string;
  createdAt: string;
}

export interface FileDetailResponse extends FileMetadata {
  chunks: ChunkIndex[];
}

export interface StorageStats {
  totalFiles: number;
  totalChunks: number;
  totalSize: number;
  totalEncryptedSize: number;
}

export interface UploadProgress {
  chunkIndex: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
}

export type DownloadProgress = UploadProgress;

export interface ShareLink {
  id: string;
  fileId: string;
  keyHash: string;
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
  maxDownloads: number | null;
}

export interface CreateShareLinkRequest {
  fileId: string;
  password: string;
  expiresAt?: string;
  maxDownloads?: number;
}

export interface CreateShareLinkResponse {
  shareId: string;
  shareUrl: string;
}

export interface ValidateShareLinkResponse {
  valid: boolean;
  fileId: string;
  fileName: string;
  fileSize: number;
  salt: string;
  algorithm: string;
}

export interface DestroyResult {
  success: boolean;
  chunksDestroyed: number;
  metadataDeleted: boolean;
  destroyedAt: string;
}
