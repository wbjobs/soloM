import { create } from 'zustand';
import axios from 'axios';

interface Snippet {
  ydocId: string;
  title: string;
  language: string;
  updatedAt: string;
  version: number;
}

interface SnippetState {
  snippets: Snippet[];
  currentSnippetId: string | null;
  isLoading: boolean;
  fetchSnippets: () => Promise<void>;
  createSnippet: (title?: string, language?: string) => Promise<string>;
  deleteSnippet: (snippetId: string) => Promise<void>;
  setCurrentSnippetId: (id: string | null) => void;
}

export const useSnippetStore = create<SnippetState>((set) => ({
  snippets: [],
  currentSnippetId: null,
  isLoading: false,

  fetchSnippets: async () => {
    set({ isLoading: true });
    try {
      const response = await axios.get('/api/snippets');
      set({ snippets: response.data });
    } catch (error) {
      console.error('Failed to fetch snippets:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createSnippet: async (title: string = 'Untitled Snippet', language: string = 'javascript') => {
    const response = await axios.post('/api/snippets', { title, language });
    const newSnippet = response.data;
    set((state) => ({
      snippets: [newSnippet, ...state.snippets],
    }));
    return newSnippet.ydocId;
  },

  deleteSnippet: async (snippetId: string) => {
    await axios.delete(`/api/snippets/${snippetId}`);
    set((state) => ({
      snippets: state.snippets.filter((s) => s.ydocId !== snippetId),
      currentSnippetId: state.currentSnippetId === snippetId ? null : state.currentSnippetId,
    }));
  },

  setCurrentSnippetId: (id: string | null) => {
    set({ currentSnippetId: id });
  },
}));
