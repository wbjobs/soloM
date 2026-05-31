import { useEffect, useRef, useCallback } from "react";
import { useRaftStore } from "@/store/raftStore";
import type { RaftStateMessage, RaftEventMessage, RaftEvent } from "@/types/raft";

const WS_URL = (() => {
  const loc = window.location;
  const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${loc.host}/ws`;
})();

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 16000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempt = useRef(0);
  const mountedRef = useRef(true);
  const messageQueueRef = useRef<{ type: string; data: unknown }[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setNodes = useRaftStore((s) => s.setNodes);
  const addEvent = useRaftStore((s) => s.addEvent);
  const setConnected = useRaftStore((s) => s.setConnected);

  const flushMessages = useCallback(() => {
    flushTimerRef.current = null;
    const queue = messageQueueRef.current;
    if (queue.length === 0) return;
    messageQueueRef.current = [];

    let latestState: RaftStateMessage | null = null;
    const events: RaftEvent[] = [];

    for (const msg of queue) {
      if (msg.type === "state_update") {
        latestState = msg.data as RaftStateMessage;
      } else if (msg.type === "event") {
        events.push((msg.data as RaftEventMessage).event);
      }
    }

    if (latestState) {
      setNodes(latestState.nodes);
    }
    for (const event of events) {
      addEvent(event);
    }
  }, [setNodes, addEvent]);

  const scheduleFlush = useCallback(() => {
    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(flushMessages, 0);
    }
  }, [flushMessages]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close(1000, "reconnecting");
      }
      wsRef.current = null;
    }

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      reconnectAttempt.current = 0;
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as RaftStateMessage | RaftEventMessage;
        messageQueueRef.current.push({ type: msg.type, data: msg });
        scheduleFlush();
      } catch {}
    };

    ws.onclose = (e) => {
      setConnected(false);
      wsRef.current = null;

      if (!mountedRef.current) return;

      if (e.code !== 1000) {
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current),
          RECONNECT_MAX_MS
        );
        reconnectAttempt.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      try { ws.close(1000, "error"); } catch {}
    };

    wsRef.current = ws;
  }, [setConnected, scheduleFlush]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, "unmount");
        wsRef.current = null;
      }
    };
  }, [connect]);
}
