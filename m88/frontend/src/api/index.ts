import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export interface DocumentInfo {
  doc_id: string
  doc_name: string
  upload_time: string
  file_size: number
  chunk_count: number
  status: string
}

export interface RetrievedChunk {
  doc_id: string
  doc_name: string
  chunk_index: number
  content: string
  score: number
  metadata: Record<string, any>
  page: number | null
  bbox: number[] | null
  search_type: string
  vector_score: number
  bm25_score: number
}

export interface QueryRequest {
  question: string
  top_k?: number
  doc_ids?: string[]
  stream?: boolean
  search_mode?: 'vector' | 'bm25' | 'hybrid'
}

export interface DocumentUploadResponse {
  success: boolean
  message: string
  doc_id?: string
  doc_name?: string
  chunk_count?: number
}

export interface DocumentDeleteResponse {
  success: boolean
  message: string
  deleted_count: number
}

export interface DocumentListResponse {
  documents: DocumentInfo[]
  total: number
}

export interface HealthResponse {
  status: string
  milvus_connected: boolean
  embedding_model_loaded: boolean
  llm_model_loaded: boolean
  bm25_indexed: boolean
  total_documents: number
  total_vectors: number
}

export interface PdfPageInfo {
  page_num: number
  width: number
  height: number
}

export interface PdfInfo {
  doc_id: string
  page_count: number
  metadata: Record<string, any>
  pages: PdfPageInfo[]
}

export const documentApi = {
  list: () => api.get<DocumentListResponse>('/documents'),
  upload: (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<DocumentUploadResponse>('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total))
        }
      }
    })
  },
  delete: (docId: string) => api.delete<DocumentDeleteResponse>(`/documents/${docId}`)
}

export const chatApi = {
  query: async (
    request: QueryRequest,
    onToken?: (token: string) => void,
    onSources?: (sources: RetrievedChunk[]) => void,
    onDone?: (data: { latency: number; total_tokens: number }) => void
  ) => {
    if (request.stream) {
      const response = await fetch('/api/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'token' && onToken) {
                onToken(parsed.data)
              } else if (parsed.type === 'sources' && onSources) {
                onSources(JSON.parse(parsed.data))
              } else if (parsed.type === 'done' && onDone) {
                onDone(parsed.data)
              }
            } catch (e) {
              console.error('Parse error:', e)
            }
          }
        }
      }
    } else {
      const response = await api.post('/chat/query', request)
      return response.data
    }
  }
}

export const pdfApi = {
  previewUrl: (docId: string, page: number, dpi: number = 150) =>
    `/api/pdf/preview/${docId}?page=${page}&dpi=${dpi}`,
  info: (docId: string) => api.get<PdfInfo>(`/pdf/info/${docId}`)
}

export const healthApi = {
  check: () => api.get<HealthResponse>('/health')
}

export default api
