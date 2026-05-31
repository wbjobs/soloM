import { create } from 'zustand';
import { DocumentRecord } from '@/utils/db';

interface DocState {
  documents: DocumentRecord[];
  currentDocId: string | null;
  cryptoKeys: Map<string, CryptoKey>;
  setDocuments: (docs: DocumentRecord[]) => void;
  addDocument: (doc: DocumentRecord) => void;
  removeDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<DocumentRecord>) => void;
  setCurrentDocId: (id: string | null) => void;
  setCryptoKey: (docId: string, key: CryptoKey) => void;
  getCryptoKey: (docId: string) => CryptoKey | undefined;
  removeCryptoKey: (docId: string) => void;
}

export const useDocStore = create<DocState>((set, get) => ({
  documents: [],
  currentDocId: null,
  cryptoKeys: new Map(),
  setDocuments: (docs) => set({ documents: docs }),
  addDocument: (doc) => set((state) => ({ documents: [...state.documents, doc] })),
  removeDocument: (id) => set((state) => ({
    documents: state.documents.filter((d) => d.id !== id),
  })),
  updateDocument: (id, updates) => set((state) => ({
    documents: state.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
  })),
  setCurrentDocId: (id) => set({ currentDocId: id }),
  setCryptoKey: (docId, key) => set((state) => {
    const newKeys = new Map(state.cryptoKeys);
    newKeys.set(docId, key);
    return { cryptoKeys: newKeys };
  }),
  getCryptoKey: (docId) => get().cryptoKeys.get(docId),
  removeCryptoKey: (docId) => set((state) => {
    const newKeys = new Map(state.cryptoKeys);
    newKeys.delete(docId);
    return { cryptoKeys: newKeys };
  }),
}));
