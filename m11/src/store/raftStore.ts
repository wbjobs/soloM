import { create } from "zustand";
import type { RaftNodeState, RaftEvent, NetworkLink, ClusterSnapshot } from "@/types/raft";

const API_BASE = "";

interface RaftStore {
  nodes: RaftNodeState[];
  displayNodes: RaftNodeState[];
  events: RaftEvent[];
  selectedNodeId: number | null;
  networkLinks: NetworkLink[];
  connected: boolean;

  snapshots: ClusterSnapshot[];
  isReplayMode: boolean;
  currentSnapshotIndex: number;
  targetSnapshotIndex: number | null;

  setNodes: (nodes: RaftNodeState[]) => void;
  addEvent: (event: RaftEvent) => void;
  setSelectedNode: (id: number | null) => void;
  addNetworkLink: (link: NetworkLink) => void;
  removeNetworkLink: (from: number, to: number) => void;
  setConnected: (v: boolean) => void;

  setSnapshots: (snapshots: ClusterSnapshot[]) => void;
  addSnapshot: (snapshot: ClusterSnapshot) => void;
  enterReplayMode: () => void;
  exitReplayMode: () => void;
  setCurrentSnapshotIndex: (index: number) => void;
  fetchSnapshots: () => Promise<void>;

  toggleNetwork: (nodeId: number, online: boolean) => Promise<void>;
  stopNode: (nodeId: number) => Promise<void>;
  startNode: (nodeId: number) => Promise<void>;
  submitLog: (data: string) => Promise<void>;
  triggerElection: (nodeId: number) => Promise<void>;
  resetCluster: () => Promise<void>;
}

export const useRaftStore = create<RaftStore>((set, get) => ({
  nodes: [
    { id: 1, role: "follower", term: 0, logLength: 0, commitIndex: 0, votedFor: null, networkOnline: true },
    { id: 2, role: "follower", term: 0, logLength: 0, commitIndex: 0, votedFor: null, networkOnline: true },
    { id: 3, role: "follower", term: 0, logLength: 0, commitIndex: 0, votedFor: null, networkOnline: true },
  ],
  displayNodes: [
    { id: 1, role: "follower", term: 0, logLength: 0, commitIndex: 0, votedFor: null, networkOnline: true },
    { id: 2, role: "follower", term: 0, logLength: 0, commitIndex: 0, votedFor: null, networkOnline: true },
    { id: 3, role: "follower", term: 0, logLength: 0, commitIndex: 0, votedFor: null, networkOnline: true },
  ],
  events: [],
  selectedNodeId: null,
  networkLinks: [],
  connected: false,

  snapshots: [],
  isReplayMode: false,
  currentSnapshotIndex: -1,
  targetSnapshotIndex: null,

  setNodes: (nodes) => set((s) => {
    const next = { ...s, nodes };
    if (!s.isReplayMode) {
      next.displayNodes = nodes;
    }
    return next;
  }),
  addEvent: (event) => set((s) => {
    const next = [...s.events, event];
    return { events: next.length > 100 ? next.slice(-100) : next };
  }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  addNetworkLink: (link) => set((s) => ({ networkLinks: [...s.networkLinks, link] })),
  removeNetworkLink: (from, to) =>
    set((s) => ({ networkLinks: s.networkLinks.filter((l) => !(l.from === from && l.to === to)) })),
  setConnected: (v) => set({ connected: v }),

  setSnapshots: (snapshots) => set({ snapshots }),
  addSnapshot: (snapshot) => set((s) => {
    const next = [...s.snapshots, snapshot];
    return { snapshots: next.length > 50 ? next.slice(-50) : next };
  }),
  enterReplayMode: () => set((s) => {
    if (s.snapshots.length === 0) return s;
    const latestIdx = s.snapshots[s.snapshots.length - 1].snapshotIndex;
    return {
      isReplayMode: true,
      currentSnapshotIndex: latestIdx,
      targetSnapshotIndex: latestIdx,
    };
  }),
  exitReplayMode: () => set((s) => ({
    isReplayMode: false,
    currentSnapshotIndex: -1,
    targetSnapshotIndex: null,
    displayNodes: s.nodes,
  })),
  setCurrentSnapshotIndex: (index) => set((s) => {
    if (!s.isReplayMode) return s;
    const snapshot = s.snapshots.find((sn) => sn.snapshotIndex === index);
    if (!snapshot) return s;
    return {
      currentSnapshotIndex: index,
      targetSnapshotIndex: index,
      displayNodes: snapshot.nodes,
    };
  }),
  fetchSnapshots: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cluster/snapshots`);
      const data = await res.json();
      if (data.snapshots) {
        set({ snapshots: data.snapshots });
      }
    } catch {}
  },

  toggleNetwork: async (nodeId, online) => {
    const state = get();
    if (state.isReplayMode) return;
    await fetch(`${API_BASE}/api/nodes/${nodeId}/network`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online }),
    });
  },

  stopNode: async (nodeId) => {
    const state = get();
    if (state.isReplayMode) return;
    await fetch(`${API_BASE}/api/nodes/${nodeId}/stop`, { method: "POST" });
  },

  startNode: async (nodeId) => {
    const state = get();
    if (state.isReplayMode) return;
    await fetch(`${API_BASE}/api/nodes/${nodeId}/start`, { method: "POST" });
  },

  submitLog: async (data) => {
    const state = get();
    if (state.isReplayMode) return;
    await fetch(`${API_BASE}/api/cluster/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
  },

  triggerElection: async (nodeId) => {
    const state = get();
    if (state.isReplayMode) return;
    await fetch(`${API_BASE}/api/cluster/elect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId }),
    });
  },

  resetCluster: async () => {
    await fetch(`${API_BASE}/api/cluster/reset`, { method: "POST" });
    set({ events: [], networkLinks: [], snapshots: [], isReplayMode: false, currentSnapshotIndex: -1, targetSnapshotIndex: null });
  },
}));
