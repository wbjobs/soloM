export interface LogEntry {
  term: number;
  index: number;
  data: string;
}

export interface RaftNodeState {
  id: number;
  role: "leader" | "follower" | "candidate";
  term: number;
  logLength: number;
  commitIndex: number;
  votedFor: number | null;
  networkOnline: boolean;
}

export interface RaftEvent {
  timestamp: number;
  eventType: "election" | "heartbeat" | "log_replication" | "network_change" | "state_change";
  sourceNode: number;
  targetNode?: number;
  detail: string;
}

export interface RaftStateMessage {
  type: "state_update";
  nodes: RaftNodeState[];
}

export interface RaftEventMessage {
  type: "event";
  event: RaftEvent;
}

export interface NetworkLink {
  from: number;
  to: number;
  rpcType: "heartbeat" | "vote" | "append_entries";
  progress: number;
}

export interface ClusterSnapshot {
  timestamp: number;
  nodes: RaftNodeState[];
  snapshotIndex: number;
}

export const ROLE_COLORS: Record<string, string> = {
  leader: "#ffd700",
  follower: "#4a9eff",
  candidate: "#ff8c00",
};

export const ROLE_GLOW_COLORS: Record<string, string> = {
  leader: "#ffee88",
  follower: "#88bbff",
  candidate: "#ffaa44",
};

export const RPC_COLORS: Record<string, string> = {
  heartbeat: "#00f0ff",
  vote: "#ff8c00",
  append_entries: "#44ff88",
};
