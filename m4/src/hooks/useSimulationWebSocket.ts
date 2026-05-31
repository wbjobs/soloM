import { useCallback, useRef, useEffect } from "react";
import { useSimulationStore } from "../store/simulationStore";
import type { SimulationParams, FrameData } from "../types/simulation";

interface UseSimulationWebSocketOptions {
  url?: string;
}

export function useSimulationWebSocket({
  url = "ws://localhost:8000/ws/simulate",
}: UseSimulationWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  const {
    params,
    setWsConnected,
    setCurrentFrame,
    addFrameToHistory,
    setStatus,
    setFps,
    setRdfData,
  } = useSimulationStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onmessage = (event) => {
        try {
          const data: FrameData = JSON.parse(event.data);
          setCurrentFrame(data);
          addFrameToHistory(data);

          if (data.rdf) {
            setRdfData(data.rdf);
          }

          frameCountRef.current++;
          const now = Date.now();
          if (now - lastFpsTimeRef.current >= 1000) {
            setFps(frameCountRef.current);
            frameCountRef.current = 0;
            lastFpsTimeRef.current = now;
          }
        } catch (e) {
          console.error("Failed to parse frame data:", e);
        }
      };
    } catch (e) {
      console.error("Failed to connect:", e);
    }
  }, [url, setWsConnected, setCurrentFrame, addFrameToHistory, setFps, setRdfData]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsConnected(false);
  }, [setWsConnected]);

  const send = useCallback(
    (message: object) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      } else {
        connect();
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
          }
        }, 100);
      }
    },
    [connect]
  );

  const start = useCallback(
    (simParams?: SimulationParams) => {
      send({ action: "start", params: simParams ?? params });
      setStatus("running");
    },
    [send, params, setStatus]
  );

  const pause = useCallback(() => {
    send({ action: "pause" });
    setStatus("paused");
  }, [send, setStatus]);

  const resume = useCallback(() => {
    send({ action: "resume" });
    setStatus("running");
  }, [send, setStatus]);

  const reset = useCallback(
    (simParams?: SimulationParams) => {
      send({ action: "reset", params: simParams ?? params });
      setStatus("idle");
    },
    [send, params, setStatus]
  );

  const step = useCallback(() => {
    send({ action: "step" });
  }, [send]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    start,
    pause,
    resume,
    reset,
    step,
  };
}
