import type {
  FileMetadata,
  CreateFileRequest,
  CreateFileResponse,
  FileDetailResponse,
  StorageStats,
  CreateShareLinkRequest,
  CreateShareLinkResponse,
  ValidateShareLinkResponse,
  DestroyResult,
} from '../../shared/types.ts';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

export const apiClient = {
  createFile: (data: CreateFileRequest) =>
    fetchJSON<CreateFileResponse>('/files', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getFiles: () => fetchJSON<FileMetadata[]>('/files'),

  getFileDetail: (id: string) => fetchJSON<FileDetailResponse>(`/files/${id}`),

  getChunkStatus: (id: string) =>
    fetchJSON<{ fileId: string; totalChunks: number; uploadedIndices: number[]; missingIndices: number[] }>(
      `/files/${id}/chunk-status`
    ),

  completeFile: (id: string) =>
    fetchJSON<{ success: boolean }>(`/files/${id}/complete`, {
      method: 'PUT',
    }),

  deleteFile: (id: string) =>
    fetchJSON<{ success: boolean }>(`/files/${id}`, {
      method: 'DELETE',
    }),

  uploadChunk: async (fileId: string, chunkIndex: number, iv: string, data: Blob): Promise<boolean> => {
    const formData = new FormData();
    formData.append('iv', iv);
    formData.append('data', data);

    const response = await fetch(`${API_BASE_URL}/files/${fileId}/chunks/${chunkIndex}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.success;
  },

  downloadChunk: async (fileId: string, chunkIndex: number): Promise<{ data: ArrayBuffer; iv: string }> => {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/chunks/${chunkIndex}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const iv = response.headers.get('X-IV') || '';
    const data = await response.arrayBuffer();

    return { data, iv };
  },

  createShareLink: (data: CreateShareLinkRequest) =>
    fetchJSON<CreateShareLinkResponse>('/shares', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getShareInfo: (shareId: string) =>
    fetchJSON<ValidateShareLinkResponse>(`/shares/${shareId}`),

  verifySharePassword: (shareId: string, password: string) =>
    fetchJSON<ValidateShareLinkResponse & { valid: boolean }>(`/shares/${shareId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  emergencyDestroy: (fileId: string) =>
    fetchJSON<DestroyResult>(`/admin/destroy/${fileId}`, {
      method: 'POST',
    }),

  getDestroyHistory: () =>
    fetchJSON<{ id: string; fileId: string; fileName: string; chunksDestroyed: number; destroyedAt: string }[]>(
      '/admin/destroy-history'
    ),

  getAdminStats: () => fetchJSON<StorageStats>('/admin/stats'),
};
