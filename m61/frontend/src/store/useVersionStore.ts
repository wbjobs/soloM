import { create } from 'zustand';
import axios from 'axios';

interface VersionRecord {
  version: number;
  modifiedBy: string;
  description: string;
  title: string;
  createdAt: string;
}

interface VersionState {
  versions: VersionRecord[];
  isLoading: boolean;
  fetchVersions: (ydocId: string) => Promise<void>;
  rollbackToVersion: (ydocId: string, targetVersion: number) => Promise<boolean>;
  clearVersions: () => void;
}

export const useVersionStore = create<VersionState>((set) => ({
  versions: [],
  isLoading: false,

  fetchVersions: async (ydocId: string) => {
    set({ isLoading: true });
    try {
      const response = await axios.get(`/api/versions/${ydocId}`);
      set({ versions: response.data });
    } catch (error) {
      console.error('Failed to fetch version history:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  rollbackToVersion: async (ydocId: string, targetVersion: number) => {
    try {
      await axios.post(`/api/versions/${ydocId}/rollback`, { targetVersion });
      const response = await axios.get(`/api/versions/${ydocId}`);
      set({ versions: response.data });
      return true;
    } catch (error) {
      console.error('Failed to rollback version:', error);
      return false;
    }
  },

  clearVersions: () => {
    set({ versions: [] });
  }
}));
