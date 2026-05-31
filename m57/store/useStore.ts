import { create } from "zustand";
import type { Document, Conversation, Message } from "@/types";
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  reindexDocument,
  sendMessage,
  getConversations,
  getConversation,
} from "@/lib/api";

interface LoadingStates {
  documents: boolean;
  conversations: boolean;
  messages: boolean;
  upload: boolean;
  delete: boolean;
  reindex: boolean;
}

interface StoreState {
  documents: Document[];
  conversations: Conversation[];
  currentConversation: Conversation | null;
  loading: LoadingStates;
  error: string | null;
  fetchDocuments: () => Promise<void>;
  addDocument: (file: File) => Promise<Document | null>;
  removeDocument: (id: string) => Promise<void>;
  reindexDocument: (id: string) => Promise<void>;
  sendChatMessage: (
    question: string,
    conversationId?: string
  ) => Promise<Message | null>;
  fetchConversations: () => Promise<void>;
  setCurrentConversation: (conversation: Conversation | null) => void;
  fetchConversation: (id: string) => Promise<void>;
  setError: (error: string | null) => void;
}

const useStore = create<StoreState>((set, get) => ({
  documents: [],
  conversations: [],
  currentConversation: null,
  loading: {
    documents: false,
    conversations: false,
    messages: false,
    upload: false,
    delete: false,
    reindex: false,
  },
  error: null,

  fetchDocuments: async () => {
    set((state) => ({ loading: { ...state.loading, documents: true } }));
    try {
      const documents = await getDocuments();
      set({ documents });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch documents";
      set({ error: message });
    } finally {
      set((state) => ({ loading: { ...state.loading, documents: false } }));
    }
  },

  addDocument: async (file: File) => {
    set((state) => ({ loading: { ...state.loading, upload: true } }));
    try {
      const response = await uploadDocument(file);
      const newDocument: Document = {
        id: response.id,
        name: response.name,
        size: response.size,
        type: response.type,
        uploadTime: new Date().toISOString(),
        status: response.status,
        chunkCount: 0,
      };
      set((state) => ({ documents: [...state.documents, newDocument] }));
      return newDocument;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload document";
      set({ error: message });
      return null;
    } finally {
      set((state) => ({ loading: { ...state.loading, upload: false } }));
    }
  },

  removeDocument: async (id: string) => {
    set((state) => ({ loading: { ...state.loading, delete: true } }));
    try {
      await deleteDocument(id);
      set((state) => ({
        documents: state.documents.filter((doc) => doc.id !== id),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete document";
      set({ error: message });
    } finally {
      set((state) => ({ loading: { ...state.loading, delete: false } }));
    }
  },

  reindexDocument: async (id: string) => {
    set((state) => ({ loading: { ...state.loading, reindex: true } }));
    try {
      const updatedDocument = await reindexDocument(id);
      set((state) => ({
        documents: state.documents.map((doc) =>
          doc.id === id ? updatedDocument : doc
        ),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reindex document";
      set({ error: message });
    } finally {
      set((state) => ({ loading: { ...state.loading, reindex: false } }));
    }
  },

  sendChatMessage: async (question: string, conversationId?: string) => {
    set((state) => ({ loading: { ...state.loading, messages: true } }));
    try {
      const response = await sendMessage(question, conversationId);

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
      };

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.answer,
        sources: response.sources,
        createdAt: new Date().toISOString(),
      };

      let currentConv = get().currentConversation;

      if (!currentConv || currentConv.id !== response.conversationId) {
        const conversation = await getConversation(response.conversationId);
        currentConv = conversation;
        set({ currentConversation: conversation });
        set((state) => {
          const exists = state.conversations.some((c) => c.id === conversation.id);
          if (!exists) {
            return { conversations: [conversation, ...state.conversations] };
          }
          return {
            conversations: state.conversations.map((c) =>
              c.id === conversation.id ? conversation : c
            ),
          };
        });
      }

      if (currentConv) {
        const updatedMessages = [
          ...(currentConv.messages || []),
          userMessage,
          assistantMessage,
        ];
        const updatedConversation: Conversation = {
          ...currentConv,
          messages: updatedMessages,
          updatedAt: new Date().toISOString(),
        };
        set({ currentConversation: updatedConversation });
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === updatedConversation.id ? updatedConversation : c
          ),
        }));
      }

      return assistantMessage;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message";
      set({ error: message });
      return null;
    } finally {
      set((state) => ({ loading: { ...state.loading, messages: false } }));
    }
  },

  fetchConversations: async () => {
    set((state) => ({ loading: { ...state.loading, conversations: true } }));
    try {
      const conversations = await getConversations();
      set({ conversations });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch conversations";
      set({ error: message });
    } finally {
      set((state) => ({ loading: { ...state.loading, conversations: false } }));
    }
  },

  setCurrentConversation: (conversation: Conversation | null) => {
    set({ currentConversation: conversation });
  },

  fetchConversation: async (id: string) => {
    set((state) => ({ loading: { ...state.loading, conversations: true } }));
    try {
      const conversation = await getConversation(id);
      set({ currentConversation: conversation });
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? conversation : c
        ),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch conversation";
      set({ error: message });
    } finally {
      set((state) => ({ loading: { ...state.loading, conversations: false } }));
    }
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));

export default useStore;
