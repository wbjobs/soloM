import {
  RaftNode,
  type RaftEvent,
  type RaftNodeState,
  type RequestVoteRequest,
  type RequestVoteResponse,
  type AppendEntriesRequest,
  type AppendEntriesResponse,
  type RPCTransport,
} from "./raft-node.js";

type EventCallback = (event: RaftEvent) => void;
type StateChangeCallback = () => void;

export interface ClusterSnapshot {
  timestamp: number;
  nodes: RaftNodeState[];
  snapshotIndex: number;
}

export class ClusterManager implements RPCTransport {
  nodes: Map<number, RaftNode> = new Map();
  private eventListeners: EventCallback[] = [];
  private stateChangeListeners: StateChangeCallback[] = [];
  private snapshots: ClusterSnapshot[] = [];
  private snapshotCounter: number = 0;
  private maxSnapshots: number = 50;
  private lastSnapshotTime: number = 0;
  private snapshotDebounceMs: number = 100;

  constructor(nodeCount: number = 3) {
    this.initializeNodes(nodeCount);
  }

  private initializeNodes(count: number): void {
    this.nodes.clear();
    for (let i = 1; i <= count; i++) {
      const node = new RaftNode(i, this);
      this.nodes.set(i, node);
    }
  }

  startAll(): void {
    for (const node of this.nodes.values()) {
      node.start();
    }
  }

  onEvent(callback: EventCallback): void {
    this.eventListeners.push(callback);
  }

  onStateChange(callback: StateChangeCallback): void {
    this.stateChangeListeners.push(callback);
  }

  emitEvent(event: RaftEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  emitStateChange(): void {
    this.recordSnapshot();
    for (const listener of this.stateChangeListeners) {
      listener();
    }
  }

  private recordSnapshot(): void {
    const now = Date.now();
    if (now - this.lastSnapshotTime < this.snapshotDebounceMs) {
      return;
    }
    this.lastSnapshotTime = now;

    const snapshot: ClusterSnapshot = {
      timestamp: now,
      nodes: this.getNodeStates(),
      snapshotIndex: this.snapshotCounter++,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getSnapshots(): ClusterSnapshot[] {
    return [...this.snapshots];
  }

  getSnapshot(index: number): ClusterSnapshot | null {
    return this.snapshots.find((s) => s.snapshotIndex === index) || null;
  }

  getLatestSnapshot(): ClusterSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  getAllNodeIds(): number[] {
    return Array.from(this.nodes.keys());
  }

  async sendRequestVote(targetId: number, request: RequestVoteRequest): Promise<RequestVoteResponse> {
    const target = this.nodes.get(targetId);
    if (!target) {
      return { term: 0, voteGranted: false };
    }
    const source = this.nodes.get(request.candidateId);
    if (source && !source.networkOnline) {
      return Promise.reject(new Error("Source node network offline"));
    }
    if (!target.networkOnline) {
      return Promise.reject(new Error("Target node network offline"));
    }
    return target.handleRequestVote(request);
  }

  async sendAppendEntries(targetId: number, request: AppendEntriesRequest): Promise<AppendEntriesResponse> {
    const target = this.nodes.get(targetId);
    if (!target) {
      return { term: 0, success: false, matchIndex: 0 };
    }
    const source = this.nodes.get(request.leaderId);
    if (source && !source.networkOnline) {
      return Promise.reject(new Error("Source node network offline"));
    }
    if (!target.networkOnline) {
      return Promise.reject(new Error("Target node network offline"));
    }
    return target.handleAppendEntries(request);
  }

  getNodeStates(): RaftNodeState[] {
    return Array.from(this.nodes.values()).map((n) => n.getState());
  }

  toggleNetwork(nodeId: number, online: boolean): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    node.setNetworkOnline(online);
    return true;
  }

  stopNode(nodeId: number): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    node.stop();
    this.emitEvent({
      timestamp: Date.now(),
      eventType: "state_change",
      sourceNode: nodeId,
      detail: `Node ${nodeId} stopped`,
    });
    this.emitStateChange();
    return true;
  }

  startNode(nodeId: number): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    node.start();
    this.emitEvent({
      timestamp: Date.now(),
      eventType: "state_change",
      sourceNode: nodeId,
      detail: `Node ${nodeId} started`,
    });
    return true;
  }

  submitLog(data: string): { success: boolean; logIndex: number } {
    const leader = this.findLeader();
    if (!leader) {
      return { success: false, logIndex: 0 };
    }
    const logIndex = leader.appendLogEntry(data);
    return { success: true, logIndex };
  }

  triggerElection(nodeId: number): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    node.triggerElection();
    return true;
  }

  reset(): void {
    for (const node of this.nodes.values()) {
      node.reset();
    }
    this.initializeNodes(this.nodes.size);
    this.startAll();
    this.emitEvent({
      timestamp: Date.now(),
      eventType: "state_change",
      sourceNode: 0,
      detail: "Cluster reset",
    });
    this.emitStateChange();
  }

  private findLeader(): RaftNode | null {
    for (const node of this.nodes.values()) {
      if (node.role === "leader" && node.networkOnline && node.running) {
        return node;
      }
    }
    return null;
  }
}
