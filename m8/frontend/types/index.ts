export interface Source {
  id: number;
  file_name: string;
  page?: number | null;
  content: string;
  source: string;
  highlighted_content?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
  timestamp?: Date;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  file_name: string;
  chunks_count: number;
  index_name: string;
}

export interface IndexListResponse {
  indexes: string[];
}

export interface QueryRequest {
  question: string;
  index_name?: string;
  k?: number;
}

export interface QueryResponse {
  answer: string;
  sources: Source[];
  question: string;
}

export interface StreamChunk {
  type: 'sources' | 'content' | 'error';
  data: any;
}

export interface DatasetInfo {
  id: string;
  name: string;
  file_name: string;
  total_samples: number;
  created_at: string;
  format: string;
  size_bytes: number;
}

export interface DatasetListResponse {
  datasets: DatasetInfo[];
}

export interface DatasetUploadResponse {
  success: boolean;
  message: string;
  dataset_id: string;
  total_samples: number;
  file_name: string;
}

export interface DatasetStats {
  total: number;
  with_context: number;
  avg_question_length: number;
  avg_answer_length: number;
  min_question_length: number;
  max_question_length: number;
  min_answer_length: number;
  max_answer_length: number;
}

export interface LossPoint {
  step: number;
  loss: number;
  epoch?: number | null;
}

export interface FinetuneConfig {
  dataset_id: string;
  base_model?: string;
  num_epochs?: number;
  batch_size?: number;
  learning_rate?: number;
  lora_r?: number;
  lora_alpha?: number;
  lora_dropout?: number;
  max_seq_length?: number;
}

export interface FinetuneTask {
  task_id: string;
  dataset_id: string;
  dataset_name: string;
  base_model: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  config: Record<string, any>;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  current_epoch: number;
  total_epochs: number;
  current_step: number;
  total_steps: number;
  loss_history: LossPoint[];
  error_message?: string | null;
  output_path?: string | null;
}

export interface FinetuneTaskListResponse {
  tasks: FinetuneTask[];
}

export interface FinetuneStatusResponse {
  task_id: string;
  status: string;
  current_epoch: number;
  total_epochs: number;
  current_step: number;
  total_steps: number;
  loss_history: LossPoint[];
  error_message?: string | null;
}

export interface StartFinetuneResponse {
  success: boolean;
  message: string;
  task_id: string;
}

export interface CancelFinetuneResponse {
  success: boolean;
  message: string;
}

export interface DeleteDatasetResponse {
  success: boolean;
  message: string;
}

export interface FinetuneDefaults {
  base_model: string;
  num_epochs: number;
  batch_size: number;
  learning_rate: number;
  lora_r: number;
  lora_alpha: number;
  lora_dropout: number;
  max_seq_length: number;
}
