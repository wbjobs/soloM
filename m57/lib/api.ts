import axios, { AxiosInstance } from "axios";
import type {
  Document,
  Message,
  Conversation,
  ChatRequest,
  ChatResponse,
  UploadResponse,
  Model,
  HealthCheckResponse,
} from "@/types";

const apiClient: AxiosInstance = axios.create({
  baseURL: "http://localhost:8000/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 60000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API Error:", error);
    if (error.response?.status === 401) {
      console.warn("Unauthorized access - please check your credentials");
    }
    return Promise.reject(error);
  }
);

export const uploadDocument = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<UploadResponse>("/documents/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export const getDocuments = async (): Promise<Document[]> => {
  const response = await apiClient.get<Document[]>("/documents");
  return response.data;
};

export const deleteDocument = async (id: string): Promise<void> => {
  await apiClient.delete(`/documents/${id}`);
};

export const reindexDocument = async (id: string): Promise<Document> => {
  const response = await apiClient.post<Document>(`/documents/${id}/reindex`);
  return response.data;
};

export const sendMessage = async (
  question: string,
  conversationId?: string
): Promise<ChatResponse> => {
  const request: ChatRequest = {
    question,
    conversationId,
    stream: false,
  };

  const response = await apiClient.post<ChatResponse>("/chat", request);
  return response.data;
};

export const getConversations = async (): Promise<Conversation[]> => {
  const response = await apiClient.get<Conversation[]>("/conversations");
  return response.data;
};

export const getConversation = async (id: string): Promise<Conversation> => {
  const response = await apiClient.get<Conversation>(`/conversations/${id}`);
  return response.data;
};

export const getModels = async (): Promise<Model[]> => {
  const response = await apiClient.get<Model[]>("/models");
  return response.data;
};

export const healthCheck = async (): Promise<HealthCheckResponse> => {
  const response = await apiClient.get<HealthCheckResponse>("/health");
  return response.data;
};

export default apiClient;
