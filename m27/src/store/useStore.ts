import { create } from 'zustand'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface FileTransfer {
  fileId: string
  fileName: string
  fileSize: number
  fileType: string
  direction: 'sending' | 'receiving'
  progress: number
  speed: number
  status: 'pending' | 'transferring' | 'completed' | 'error'
  blob?: Blob
}

export interface TextMessage {
  id: string
  content: string
  direction: 'sending' | 'receiving'
  timestamp: number
}

interface StoreState {
  roomId: string | null
  connectionState: ConnectionState
  isInitiator: boolean
  transfers: FileTransfer[]
  textMessages: TextMessage[]
  errorMessage: string | null
  retryCount: number

  setRoomId: (roomId: string | null) => void
  setConnectionState: (state: ConnectionState) => void
  setIsInitiator: (v: boolean) => void
  addTransfer: (t: FileTransfer) => void
  updateTransfer: (fileId: string, update: Partial<FileTransfer>) => void
  removeTransfer: (fileId: string) => void
  addTextMessage: (msg: TextMessage) => void
  setError: (msg: string | null) => void
  setRetryCount: (count: number) => void
  reset: () => void
}

export const useStore = create<StoreState>((set) => ({
  roomId: null,
  connectionState: 'disconnected',
  isInitiator: false,
  transfers: [],
  textMessages: [],
  errorMessage: null,
  retryCount: 0,

  setRoomId: (roomId) => set({ roomId }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setIsInitiator: (isInitiator) => set({ isInitiator }),
  addTransfer: (t) => set((s) => ({ transfers: [...s.transfers, t] })),
  updateTransfer: (fileId, update) =>
    set((s) => ({
      transfers: s.transfers.map((t) =>
        t.fileId === fileId ? { ...t, ...update } : t
      ),
    })),
  removeTransfer: (fileId) =>
    set((s) => ({ transfers: s.transfers.filter((t) => t.fileId !== fileId) })),
  addTextMessage: (msg) =>
    set((s) => ({ textMessages: [...s.textMessages, msg] })),
  setError: (errorMessage) => set({ errorMessage }),
  setRetryCount: (retryCount) => set({ retryCount }),
  reset: () =>
    set({
      roomId: null,
      connectionState: 'disconnected',
      isInitiator: false,
      transfers: [],
      textMessages: [],
      errorMessage: null,
      retryCount: 0,
    }),
}))
