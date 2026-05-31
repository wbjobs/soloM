import { create } from 'zustand';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface ConnectionState {
  status: ConnectionStatus;
  isOnline: boolean;
  setStatus: (status: ConnectionStatus) => void;
  setOnline: (online: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'disconnected',
  isOnline: navigator.onLine,
  setStatus: (status) => set({ status }),
  setOnline: (online) => set({ isOnline: online, status: online ? 'connecting' : 'disconnected' }),
}));
