import { 
  UploadResponse, 
  IndexListResponse, 
  QueryRequest, 
  QueryResponse, 
  Source,
  DatasetInfo,
  DatasetListResponse,
  DatasetUploadResponse,
  DatasetStats,
  FinetuneTask,
  FinetuneTaskListResponse,
  FinetuneStatusResponse,
  FinetuneConfig,
  FinetuneDefaults,
  StartFinetuneResponse,
  CancelFinetuneResponse,
  DeleteDatasetResponse,
  LossPoint,
} from '@/types';

const API_BASE = '/api';

export async function uploadDocument(
  file: File,
  indexName: string = 'default'
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE}/upload?index_name=${indexName}`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '上传失败');
  }
  
  return response.json();
}

export async function uploadMultipleDocuments(
  files: File[],
  indexName: string = 'default'
): Promise<UploadResponse[]> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  
  const response = await fetch(`${API_BASE}/upload/batch?index_name=${indexName}`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '批量上传失败');
  }
  
  return response.json();
}

export async function getIndexes(): Promise<IndexListResponse> {
  const response = await fetch(`${API_BASE}/indexes`);
  
  if (!response.ok) {
    throw new Error('获取索引列表失败');
  }
  
  return response.json();
}

export async function queryRAG(
  question: string,
  indexName: string = 'default',
  k?: number
): Promise<QueryResponse> {
  const body: QueryRequest = {
    question,
    index_name: indexName,
    k,
  };
  
  const response = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '查询失败');
  }
  
  return response.json();
}

class SSEParser {
  private buffer: string = '';
  private textDecoder: TextDecoder;

  constructor() {
    this.textDecoder = new TextDecoder('utf-8', { fatal: false });
  }

  decode(chunk: Uint8Array): string {
    return this.textDecoder.decode(chunk, { stream: true });
  }

  flush(): string {
    return this.textDecoder.decode();
  }

  push(chunk: string): void {
    this.buffer += chunk;
  }

  parseMessages(): Array<{ type: string; data: any } | null> {
    const messages: Array<{ type: string; data: any } | null> = [];
    
    while (true) {
      const doubleNewlineIndex = this.buffer.indexOf('\n\n');
      
      if (doubleNewlineIndex === -1) {
        if (this.buffer.length > 1024 * 1024) {
          console.warn('SSE buffer too large, clearing to prevent memory issues');
          this.buffer = '';
        }
        break;
      }

      const rawMessage = this.buffer.slice(0, doubleNewlineIndex);
      this.buffer = this.buffer.slice(doubleNewlineIndex + 2);

      if (!rawMessage.trim()) {
        continue;
      }

      const message = this.parseSingleMessage(rawMessage);
      if (message !== null) {
        messages.push(message);
      }
    }

    return messages;
  }

  private parseSingleMessage(rawMessage: string): { type: string; data: any } | null {
    const lines = rawMessage.split('\n');
    let dataField = '';

    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataField += line.slice(5).trimStart();
      } else if (line.startsWith(':')) {
        continue;
      }
    }

    if (!dataField) {
      return null;
    }

    if (dataField === '[DONE]') {
      return { type: 'done', data: null };
    }

    try {
      const parsed = JSON.parse(dataField);
      return { type: parsed.type || 'unknown', data: parsed.data };
    } catch (e) {
      console.warn('Failed to parse SSE JSON:', e, 'Raw data:', dataField);
      return null;
    }
  }

  getBufferLength(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = '';
  }
}

export async function queryStream(
  question: string,
  indexName: string = 'default',
  k?: number,
  onContent: (content: string) => void,
  onSources: (sources: Source[]) => void,
  onComplete: () => void,
  onError: (error: string) => void
): Promise<void> {
  const body: QueryRequest = {
    question,
    index_name: indexName,
    k,
  };

  const sseParser = new SSEParser();
  let sourcesReceived = false;
  let isComplete = false;

  const cleanup = () => {
    sseParser.clear();
  };

  try {
    const response = await fetch(`${API_BASE}/query/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '查询失败');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        const remaining = sseParser.flush();
        if (remaining) {
          sseParser.push(remaining);
          const messages = sseParser.parseMessages();
          for (const msg of messages) {
            if (msg) {
              if (msg.type === 'content') {
                onContent(msg.data);
              } else if (msg.type === 'sources') {
                sourcesReceived = true;
                onSources(msg.data);
              }
            }
          }
        }
        break;
      }

      try {
        const decoded = sseParser.decode(value);
        sseParser.push(decoded);

        const messages = sseParser.parseMessages();
        for (const msg of messages) {
          if (msg === null) continue;

          if (msg.type === 'done') {
            isComplete = true;
          } else if (msg.type === 'content') {
            if (typeof msg.data === 'string') {
              onContent(msg.data);
            }
          } else if (msg.type === 'sources') {
            if (Array.isArray(msg.data)) {
              sourcesReceived = true;
              onSources(msg.data);
            }
          } else if (msg.type === 'error') {
            throw new Error(msg.data || '流处理错误');
          }
        }
      } catch (parseError) {
        console.error('SSE parse error:', parseError);
        sseParser.clear();
      }
    }

    if (!isComplete && sseParser.getBufferLength() > 0) {
      console.warn('Stream ended with incomplete message in buffer');
    }

    if (!sourcesReceived) {
      console.warn('No sources received in stream');
    }

    onComplete();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    onError(errorMessage);
  } finally {
    cleanup();
  }
}

export async function healthCheck(): Promise<{ status: string; indexes: string[] }> {
  const response = await fetch(`${API_BASE}/health`);
  
  if (!response.ok) {
    throw new Error('健康检查失败');
  }
  
  return response.json();
}

export async function getDatasets(): Promise<DatasetListResponse> {
  const response = await fetch(`${API_BASE}/finetune/datasets`);
  
  if (!response.ok) {
    throw new Error('获取数据集列表失败');
  }
  
  return response.json();
}

export async function getDataset(datasetId: string): Promise<DatasetInfo> {
  const response = await fetch(`${API_BASE}/finetune/datasets/${datasetId}`);
  
  if (!response.ok) {
    throw new Error('获取数据集信息失败');
  }
  
  return response.json();
}

export async function getDatasetStats(datasetId: string): Promise<DatasetStats> {
  const response = await fetch(`${API_BASE}/finetune/datasets/${datasetId}/stats`);
  
  if (!response.ok) {
    throw new Error('获取数据集统计失败');
  }
  
  return response.json();
}

export async function uploadDataset(
  file: File,
  datasetName?: string
): Promise<DatasetUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  
  const url = datasetName
    ? `${API_BASE}/finetune/datasets/upload?dataset_name=${encodeURIComponent(datasetName)}`
    : `${API_BASE}/finetune/datasets/upload`;
  
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '上传数据集失败');
  }
  
  return response.json();
}

export async function deleteDataset(datasetId: string): Promise<DeleteDatasetResponse> {
  const response = await fetch(`${API_BASE}/finetune/datasets/${datasetId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '删除数据集失败');
  }
  
  return response.json();
}

export async function getFinetuneTasks(): Promise<FinetuneTaskListResponse> {
  const response = await fetch(`${API_BASE}/finetune/tasks`);
  
  if (!response.ok) {
    throw new Error('获取微调任务列表失败');
  }
  
  return response.json();
}

export async function getFinetuneTaskStatus(taskId: string): Promise<FinetuneStatusResponse> {
  const response = await fetch(`${API_BASE}/finetune/tasks/${taskId}`);
  
  if (!response.ok) {
    throw new Error('获取任务状态失败');
  }
  
  return response.json();
}

export async function getFinetuneDefaults(): Promise<FinetuneDefaults> {
  const response = await fetch(`${API_BASE}/finetune/config/defaults`);
  
  if (!response.ok) {
    throw new Error('获取默认配置失败');
  }
  
  return response.json();
}

export async function startFinetune(config: FinetuneConfig): Promise<StartFinetuneResponse> {
  const response = await fetch(`${API_BASE}/finetune/tasks/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '启动微调失败');
  }
  
  return response.json();
}

export async function cancelFinetune(taskId: string): Promise<CancelFinetuneResponse> {
  const response = await fetch(`${API_BASE}/finetune/tasks/${taskId}/cancel`, {
    method: 'POST',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || '取消微调失败');
  }
  
  return response.json();
}

export function streamFinetuneStatus(
  taskId: string,
  onStatus: (status: FinetuneStatusResponse) => void,
  onComplete: () => void,
  onError: (error: string) => void
): () => void {
  let isCancelled = false;
  
  async function connect() {
    try {
      const response = await fetch(`${API_BASE}/finetune/tasks/${taskId}/stream`, {
        headers: {
          'Accept': 'text/event-stream',
        },
      });
      
      if (!response.ok) {
        throw new Error('连接状态流失败');
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }
      
      const decoder = new TextDecoder('utf-8', { fatal: false });
      let buffer = '';
      
      while (!isCancelled) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'status') {
                const statusData = data.data;
                const lossHistory: LossPoint[] = statusData.loss_history?.map((lp: any) => ({
                  step: lp.step,
                  loss: lp.loss,
                  epoch: lp.epoch,
                })) || [];
                
                onStatus({
                  task_id: statusData.task_id,
                  status: statusData.status,
                  current_epoch: statusData.current_epoch,
                  total_epochs: statusData.total_epochs,
                  current_step: statusData.current_step,
                  total_steps: statusData.total_steps,
                  loss_history: lossHistory,
                  error_message: statusData.error_message,
                });
                
                if (['completed', 'failed', 'cancelled'].includes(statusData.status)) {
                  onComplete();
                  return;
                }
              }
            } catch (e) {
              console.warn('Failed to parse SSE message:', e);
            }
          }
        }
      }
      
      onComplete();
    } catch (error) {
      if (!isCancelled) {
        onError(error instanceof Error ? error.message : '连接失败');
      }
    }
  }
  
  connect();
  
  return () => {
    isCancelled = true;
  };
}
