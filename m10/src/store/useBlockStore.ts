import { create } from 'zustand';
import type { Block, BlockDetail, GasRankingItem, AnalyzeResponse } from '../../shared/types';

interface BlockState {
  blocks: Block[];
  latestHeight: number;
  blockDetail: BlockDetail | null;
  gasRanking: GasRankingItem[];
  analyzeResult: AnalyzeResponse | null;
  loading: boolean;
  error: string | null;
  fetchBlocks: (limit?: number) => Promise<void>;
  fetchBlockDetail: (height: number) => Promise<void>;
  fetchGasRanking: (limit?: number) => Promise<void>;
  analyzeContract: (code: string) => Promise<void>;
  clearAnalyzeResult: () => void;
}

const API_BASE = 'http://localhost:3002/api';

export const useBlockStore = create<BlockState>((set) => ({
  blocks: [],
  latestHeight: 0,
  blockDetail: null,
  gasRanking: [],
  analyzeResult: null,
  loading: false,
  error: null,

  fetchBlocks: async (limit = 10) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/blocks?limit=${limit}`);
      const data = await res.json();
      if (data.success) {
        set({ blocks: data.data, latestHeight: data.latestHeight, loading: false });
      } else {
        set({ error: data.error || 'Failed to fetch blocks', loading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchBlockDetail: async (height: number) => {
    set({ loading: true, error: null, blockDetail: null });
    try {
      const res = await fetch(`${API_BASE}/blocks/${height}`);
      const data = await res.json();
      if (data.success) {
        set({ blockDetail: data.data, loading: false });
      } else {
        set({ error: data.error || 'Failed to fetch block detail', loading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchGasRanking: async (limit = 20) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/gas/ranking?limit=${limit}`);
      const data = await res.json();
      if (data.success) {
        set({ gasRanking: data.data, loading: false });
      } else {
        set({ error: data.error || 'Failed to fetch gas ranking', loading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  analyzeContract: async (code: string) => {
    set({ loading: true, error: null, analyzeResult: null });
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.status === 429) {
        set({ error: '请求过于频繁，请稍后再试', loading: false });
        return;
      }
      const data = await res.json();
      set({ analyzeResult: data, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  clearAnalyzeResult: () => {
    set({ analyzeResult: null });
  },
}));
