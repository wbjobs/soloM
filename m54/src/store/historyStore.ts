import { create } from 'zustand';
import type { SnapshotMeta } from '@/utils/snapshotService';

interface HistoryState {
  snapshots: SnapshotMeta[];
  currentIndex: number;
  isViewingHistory: boolean;
  previewContent: string | null;
  setSnapshots: (snapshots: SnapshotMeta[]) => void;
  addSnapshot: (meta: SnapshotMeta) => void;
  setCurrentIndex: (index: number) => void;
  setIsViewingHistory: (viewing: boolean) => void;
  setPreviewContent: (content: string | null) => void;
  reset: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  snapshots: [],
  currentIndex: -1,
  isViewingHistory: false,
  previewContent: null,
  setSnapshots: (snapshots) => set({ snapshots }),
  addSnapshot: (meta) =>
    set((state) => ({
      snapshots: [...state.snapshots, meta],
      currentIndex: state.isViewingHistory ? state.currentIndex : state.snapshots.length,
    })),
  setCurrentIndex: (index) => set({ currentIndex: index, isViewingHistory: true }),
  setIsViewingHistory: (viewing) => set({ isViewingHistory: viewing }),
  setPreviewContent: (content) => set({ previewContent: content }),
  reset: () =>
    set({
      snapshots: [],
      currentIndex: -1,
      isViewingHistory: false,
      previewContent: null,
    }),
}));
