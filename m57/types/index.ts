export type DocumentStatus = "uploading" | "processing" | "completed" | "failed";

export interface Document {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadTime: string;
  status: DocumentStatus;
  chunkCount: number;
}

export interface Source {
  id: string;
  source_id?: number;
  documentName: string;
  document_id?: string;
  pageNumber?: number;
  chunkIndex?: number;
  content: string;
  score: number;
  confidence?: number;
  relevance?: "high" | "medium" | "low";
  is_table?: boolean;
  chunk_type?: "text" | "table";
  matched_keywords?: string[];
  highlight_spans?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  metadata?: {
    chunk_type?: string;
    is_table?: boolean;
    page_number?: number;
    document_name?: string;
  };
}

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  sources?: Source[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

export interface ChatRequest {
  question: string;
  conversationId?: string;
  model?: string;
  stream?: boolean;
}

export interface ChatResponse {
  answer: string;
  conversationId: string;
  sources: Source[];
  model: string;
  responseTime: number;
}

export interface UploadResponse {
  id: string;
  name: string;
  size: number;
  type: string;
  status: DocumentStatus;
  message: string;
}

export interface Model {
  id: string;
  name: string;
  description: string;
  provider: string;
  contextLength: number;
}

export interface HealthCheckResponse {
  status: "healthy" | "unhealthy";
  version: string;
  models: {
    embedding: boolean;
    llm: boolean;
  };
  database: boolean;
}
