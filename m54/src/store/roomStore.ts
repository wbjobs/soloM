import { create } from 'zustand';

interface Member {
  id: string;
  username: string;
  color: string;
  cursorPosition?: number;
}

interface RoomState {
  roomId: string | null;
  username: string;
  members: Member[];
  setRoomId: (id: string | null) => void;
  setUsername: (name: string) => void;
  setMembers: (members: Member[]) => void;
  addMember: (member: Member) => void;
  removeMember: (id: string) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: null,
  username: '',
  members: [],
  setRoomId: (id) => set({ roomId: id }),
  setUsername: (name) => set({ username: name }),
  setMembers: (members) => set({ members }),
  addMember: (member) => set((state) => ({ members: [...state.members, member] })),
  removeMember: (id) => set((state) => ({
    members: state.members.filter((m) => m.id !== id),
  })),
  reset: () => set({ roomId: null, members: [] }),
}));
