import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { ClusterManager } from "./cluster.js";
import type { RaftEvent, RaftNodeState } from "./raft-node.js";

interface RaftStateMessage {
  type: "state_update";
  nodes: RaftNodeState[];
}

interface RaftEventMessage {
  type: "event";
  event: RaftEvent;
}

const FLUSH_INTERVAL = 50;
const MAX_PENDING_EVENTS = 50;

export class WsHub {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private cluster: ClusterManager;

  private stateDirty: boolean = false;
  private pendingEvents: RaftEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(server: Server, cluster: ClusterManager) {
    this.cluster = cluster;
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws) => {
      ws.on("close", () => {
        this.clients.delete(ws);
      });

      ws.on("error", () => {
        this.clients.delete(ws);
      });

      this.clients.add(ws);
      this.sendToClient(ws, this.buildStateMessage());
    });

    cluster.onEvent((event) => {
      this.enqueueEvent(event);
    });

    cluster.onStateChange(() => {
      this.stateDirty = true;
      this.ensureFlushTimer();
    });

    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL);
  }

  private enqueueEvent(event: RaftEvent): void {
    if (this.pendingEvents.length >= MAX_PENDING_EVENTS) {
      this.pendingEvents.shift();
    }
    this.pendingEvents.push(event);
    this.ensureFlushTimer();
  }

  private ensureFlushTimer(): void {
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL);
    }
  }

  private buildStateMessage(): RaftStateMessage {
    return {
      type: "state_update",
      nodes: this.cluster.getNodeStates(),
    };
  }

  private flush(): void {
    if (this.clients.size === 0) {
      this.pendingEvents = [];
      this.stateDirty = false;
      return;
    }

    const messages: string[] = [];

    if (this.stateDirty) {
      messages.push(JSON.stringify(this.buildStateMessage()));
      this.stateDirty = false;
    }

    if (this.pendingEvents.length > 0) {
      for (const event of this.pendingEvents) {
        messages.push(JSON.stringify({ type: "event", event }));
      }
      this.pendingEvents = [];
    }

    if (messages.length === 0) return;

    const deadClients: WebSocket[] = [];

    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        deadClients.push(client);
        continue;
      }

      for (const msg of messages) {
        try {
          client.send(msg);
        } catch {
          deadClients.push(client);
          break;
        }
      }
    }

    for (const dc of deadClients) {
      this.clients.delete(dc);
      try { dc.close(); } catch {}
    }
  }

  private sendToClient(ws: WebSocket, message: RaftStateMessage): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(message));
    } catch {}
  }

  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.wss.close();
  }
}
