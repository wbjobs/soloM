export interface LogEntry {
  term: number;
  index: number;
  data: string;
}

export interface RequestVoteRequest {
  term: number;
  candidateId: number;
  lastLogIndex: number;
  lastLogTerm: number;
}

export interface RequestVoteResponse {
  term: number;
  voteGranted: boolean;
}

export interface AppendEntriesRequest {
  term: number;
  leaderId: number;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: LogEntry[];
  leaderCommit: number;
}

export interface AppendEntriesResponse {
  term: number;
  success: boolean;
  matchIndex: number;
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

type Role = "follower" | "candidate" | "leader";

export interface RPCTransport {
  sendRequestVote(targetId: number, request: RequestVoteRequest): Promise<RequestVoteResponse>;
  sendAppendEntries(targetId: number, request: AppendEntriesRequest): Promise<AppendEntriesResponse>;
  emitEvent(event: RaftEvent): void;
  emitStateChange(): void;
  getAllNodeIds(): number[];
}

const ELECTION_TIMEOUT_MIN = 1500;
const ELECTION_TIMEOUT_MAX = 3000;
const HEARTBEAT_INTERVAL = 500;

function randomElectionTimeout(): number {
  return ELECTION_TIMEOUT_MIN + Math.random() * (ELECTION_TIMEOUT_MAX - ELECTION_TIMEOUT_MIN);
}

export class RaftNode {
  id: number;
  currentTerm: number = 0;
  votedFor: number | null = null;
  role: Role = "follower";
  log: LogEntry[] = [];
  commitIndex: number = 0;
  lastApplied: number = 0;
  networkOnline: boolean = true;
  running: boolean = false;

  nextIndex: Map<number, number> = new Map();
  matchIndex: Map<number, number> = new Map();

  private electionTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private transport: RPCTransport;
  private electionTimeout: number = randomElectionTimeout();

  constructor(id: number, transport: RPCTransport) {
    this.id = id;
    this.transport = transport;
  }

  getState(): RaftNodeState {
    return {
      id: this.id,
      role: this.role,
      term: this.currentTerm,
      logLength: this.log.length,
      commitIndex: this.commitIndex,
      votedFor: this.votedFor,
      networkOnline: this.networkOnline,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resetElectionTimer();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetElectionTimer(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
    }
    if (!this.running) return;
    this.electionTimeout = randomElectionTimeout();
    this.electionTimer = setTimeout(() => {
      if (!this.running || !this.networkOnline) return;
      if (this.role !== "leader") {
        this.startElection();
      }
    }, this.electionTimeout);
  }

  private resetHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    if (!this.running || this.role !== "leader") return;
    this.heartbeatTimer = setTimeout(() => {
      if (!this.running || !this.networkOnline || this.role !== "leader") return;
      this.sendHeartbeats();
      this.resetHeartbeatTimer();
    }, HEARTBEAT_INTERVAL);
  }

  private startElection(): void {
    this.role = "candidate";
    this.currentTerm += 1;
    this.votedFor = this.id;
    this.transport.emitStateChange();
    this.transport.emitEvent({
      timestamp: Date.now(),
      eventType: "election",
      sourceNode: this.id,
      detail: `Node ${this.id} starts election for term ${this.currentTerm}`,
    });

    this.resetElectionTimer();

    const nodeIds = this.transport.getAllNodeIds().filter((nid) => nid !== this.id);
    let votesGranted = 1;
    const votesNeeded = Math.ceil((nodeIds.length + 1) / 2) + 1;
    let responsesRemaining = nodeIds.length;
    const termAtElection = this.currentTerm;

    const lastLogIndex = this.log.length > 0 ? this.log[this.log.length - 1].index : 0;
    const lastLogTerm = this.log.length > 0 ? this.log[this.log.length - 1].term : 0;

    for (const targetId of nodeIds) {
      this.transport
        .sendRequestVote(targetId, {
          term: termAtElection,
          candidateId: this.id,
          lastLogIndex,
          lastLogTerm,
        })
        .then((response) => {
          if (this.role !== "candidate" || this.currentTerm !== termAtElection) return;

          if (response.term > this.currentTerm) {
            this.becomeFollower(response.term);
            return;
          }

          if (response.voteGranted) {
            votesGranted++;
            this.transport.emitEvent({
              timestamp: Date.now(),
              eventType: "election",
              sourceNode: this.id,
              targetNode: targetId,
              detail: `Node ${targetId} voted for Node ${this.id} in term ${termAtElection}`,
            });
          }

          if (votesGranted >= votesNeeded) {
            this.becomeLeader();
          }
        })
        .catch(() => {})
        .finally(() => {
          responsesRemaining--;
        });
    }

    if (nodeIds.length === 0 && votesGranted >= votesNeeded) {
      this.becomeLeader();
    }
  }

  private becomeLeader(): void {
    if (this.role === "leader") return;
    this.role = "leader";
    this.clearTimers();
    this.transport.emitStateChange();
    this.transport.emitEvent({
      timestamp: Date.now(),
      eventType: "state_change",
      sourceNode: this.id,
      detail: `Node ${this.id} becomes leader for term ${this.currentTerm}`,
    });

    const nodeIds = this.transport.getAllNodeIds().filter((nid) => nid !== this.id);
    const nextIdx = this.log.length + 1;
    for (const nid of nodeIds) {
      this.nextIndex.set(nid, nextIdx);
      this.matchIndex.set(nid, 0);
    }

    this.sendHeartbeats();
    this.resetHeartbeatTimer();
  }

  private becomeFollower(term: number): void {
    const wasCandidate = this.role === "candidate";
    const wasLeader = this.role === "leader";
    this.role = "follower";
    this.currentTerm = term;
    this.votedFor = null;
    this.clearTimers();
    this.transport.emitStateChange();
    if (wasCandidate || wasLeader) {
      this.transport.emitEvent({
        timestamp: Date.now(),
        eventType: "state_change",
        sourceNode: this.id,
        detail: `Node ${this.id} steps down to follower for term ${term}`,
      });
    }
    this.resetElectionTimer();
  }

  private sendHeartbeats(): void {
    if (this.role !== "leader" || !this.networkOnline) return;

    const nodeIds = this.transport.getAllNodeIds().filter((nid) => nid !== this.id);
    for (const targetId of nodeIds) {
      const nextIdx = this.nextIndex.get(targetId) ?? 1;
      const prevLogIndex = nextIdx - 1;
      const prevLogTerm =
        prevLogIndex > 0 && prevLogIndex <= this.log.length
          ? this.log[prevLogIndex - 1].term
          : 0;

      const entries: LogEntry[] = [];
      for (let i = nextIdx - 1; i < this.log.length; i++) {
        entries.push(this.log[i]);
      }

      const request: AppendEntriesRequest = {
        term: this.currentTerm,
        leaderId: this.id,
        prevLogIndex,
        prevLogTerm,
        entries,
        leaderCommit: this.commitIndex,
      };

      this.transport
        .sendAppendEntries(targetId, request)
        .then((response) => {
          if (this.role !== "leader") return;

          if (response.term > this.currentTerm) {
            this.becomeFollower(response.term);
            return;
          }

          if (response.success) {
            this.nextIndex.set(targetId, response.matchIndex + 1);
            this.matchIndex.set(targetId, response.matchIndex);

            if (entries.length > 0) {
              this.transport.emitEvent({
                timestamp: Date.now(),
                eventType: "log_replication",
                sourceNode: this.id,
                targetNode: targetId,
                detail: `Replicated ${entries.length} entries to Node ${targetId} (matchIndex=${response.matchIndex})`,
              });
            } else {
              this.transport.emitEvent({
                timestamp: Date.now(),
                eventType: "heartbeat",
                sourceNode: this.id,
                targetNode: targetId,
                detail: `Heartbeat ack from Node ${targetId} for term ${this.currentTerm}`,
              });
            }

            this.tryAdvanceCommitIndex();
          } else {
            this.nextIndex.set(targetId, Math.max(1, nextIdx - 1));
          }
        })
        .catch(() => {});
    }
  }

  private tryAdvanceCommitIndex(): void {
    const nodeIds = this.transport.getAllNodeIds();
    const totalNodes = nodeIds.length;
    const majority = Math.ceil(totalNodes / 2);

    for (let n = this.log.length; n > this.commitIndex; n--) {
      if (this.log[n - 1].term !== this.currentTerm) continue;
      let replicated = 1;
      for (const nid of nodeIds) {
        if (nid !== this.id && (this.matchIndex.get(nid) ?? 0) >= n) {
          replicated++;
        }
      }
      if (replicated >= majority) {
        this.commitIndex = n;
        this.lastApplied = n;
        this.transport.emitStateChange();
        this.transport.emitEvent({
          timestamp: Date.now(),
          eventType: "log_replication",
          sourceNode: this.id,
          detail: `Commit index advanced to ${n}`,
        });
        break;
      }
    }
  }

  handleRequestVote(request: RequestVoteRequest): RequestVoteResponse {
    if (request.term > this.currentTerm) {
      this.becomeFollower(request.term);
    }

    if (request.term < this.currentTerm) {
      return { term: this.currentTerm, voteGranted: false };
    }

    if (this.votedFor !== null && this.votedFor !== request.candidateId) {
      return { term: this.currentTerm, voteGranted: false };
    }

    const lastLogIndex = this.log.length > 0 ? this.log[this.log.length - 1].index : 0;
    const lastLogTerm = this.log.length > 0 ? this.log[this.log.length - 1].term : 0;

    if (request.lastLogTerm < lastLogTerm) {
      return { term: this.currentTerm, voteGranted: false };
    }
    if (request.lastLogTerm === lastLogTerm && request.lastLogIndex < lastLogIndex) {
      return { term: this.currentTerm, voteGranted: false };
    }

    this.votedFor = request.candidateId;
    this.resetElectionTimer();
    this.transport.emitStateChange();
    this.transport.emitEvent({
      timestamp: Date.now(),
      eventType: "election",
      sourceNode: this.id,
      targetNode: request.candidateId,
      detail: `Node ${this.id} voted for Node ${request.candidateId} in term ${request.term}`,
    });

    return { term: this.currentTerm, voteGranted: true };
  }

  handleAppendEntries(request: AppendEntriesRequest): AppendEntriesResponse {
    if (request.term < this.currentTerm) {
      return { term: this.currentTerm, success: false, matchIndex: 0 };
    }

    if (request.term > this.currentTerm) {
      this.becomeFollower(request.term);
    } else if (this.role === "candidate") {
      this.becomeFollower(request.term);
    }

    this.resetElectionTimer();

    if (request.prevLogIndex > 0) {
      if (request.prevLogIndex > this.log.length) {
        return { term: this.currentTerm, success: false, matchIndex: 0 };
      }
      if (this.log[request.prevLogIndex - 1].term !== request.prevLogTerm) {
        return { term: this.currentTerm, success: false, matchIndex: 0 };
      }
    }

    if (request.entries.length > 0) {
      for (let i = 0; i < request.entries.length; i++) {
        const entry = request.entries[i];
        const logPos = request.prevLogIndex + i;
        if (logPos < this.log.length) {
          if (this.log[logPos].term !== entry.term) {
            this.log = this.log.slice(0, logPos);
            this.log.push(entry);
          }
        } else {
          this.log.push(entry);
        }
      }
    }

    if (request.leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(request.leaderCommit, this.log.length);
      this.lastApplied = this.commitIndex;
    }

    this.transport.emitStateChange();

    const newMatchIndex = request.prevLogIndex + request.entries.length;

    return { term: this.currentTerm, success: true, matchIndex: newMatchIndex };
  }

  appendLogEntry(data: string): number {
    const index = this.log.length + 1;
    this.log.push({ term: this.currentTerm, index, data });
    this.transport.emitStateChange();
    this.transport.emitEvent({
      timestamp: Date.now(),
      eventType: "log_replication",
      sourceNode: this.id,
      detail: `Leader appended log entry at index ${index}: "${data}"`,
    });
    return index;
  }

  triggerElection(): void {
    if (!this.running || !this.networkOnline) return;
    this.startElection();
  }

  setNetworkOnline(online: boolean): void {
    this.networkOnline = online;
    if (!online) {
      this.clearTimers();
    } else {
      if (this.running) {
        if (this.role === "leader") {
          this.resetHeartbeatTimer();
        }
        this.resetElectionTimer();
      }
    }
    this.transport.emitStateChange();
    this.transport.emitEvent({
      timestamp: Date.now(),
      eventType: "network_change",
      sourceNode: this.id,
      detail: `Node ${this.id} network is now ${online ? "online" : "offline"}`,
    });
  }

  reset(): void {
    this.stop();
    this.currentTerm = 0;
    this.votedFor = null;
    this.role = "follower";
    this.log = [];
    this.commitIndex = 0;
    this.lastApplied = 0;
    this.networkOnline = true;
    this.nextIndex.clear();
    this.matchIndex.clear();
  }
}
