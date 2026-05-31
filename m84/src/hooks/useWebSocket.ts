import { useEffect, useRef, useCallback } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import type {
  SimulationConfig,
  SimulationStats,
  ScenePreset,
  SceneLoadedData,
  ControlCommand,
} from '../types/simulation';

const WS_URL = 'ws://localhost:8765';

function decodeBinaryState(buffer: ArrayBuffer): {
  count: number;
  frame: number;
  positions: Float32Array;
  velocities: Float32Array;
  masses: Float32Array;
} | null {
  try {
    const view = new DataView(buffer);
    const count = view.getUint32(0, true);
    const frame = view.getUint32(4, true);

    const posBytes = count * 3 * 4;
    const velBytes = count * 3 * 4;
    const massBytes = count * 4;

    const expectedSize = 8 + posBytes + velBytes + massBytes;
    if (buffer.byteLength < expectedSize) return null;

    const positions = new Float32Array(buffer, 8, count * 3);
    const velocities = new Float32Array(buffer, 8 + posBytes, count * 3);
    const masses = new Float32Array(buffer, 8 + posBytes + velBytes, count);

    return {
      count,
      frame,
      positions: new Float32Array(positions),
      velocities: new Float32Array(velocities),
      masses: new Float32Array(masses),
    };
  } catch {
    return null;
  }
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pendingFrameRef = useRef<{
    positions: Float32Array;
    velocities: Float32Array;
    masses: Float32Array;
    count: number;
    frame: number;
  } | null>(null);
  const rafIdRef = useRef<number>(0);
  const lastApplyTimeRef = useRef(0);
  const APPLY_INTERVAL = 16;

  const {
    setPositions,
    setVelocities,
    setMasses,
    setFrame,
    setConfig,
    setStats,
    setScenes,
    setCurrentSceneId,
    setConnected,
    setRunning,
    setPaused,
    setDeviceInfo,
    reset,
  } = useSimulationStore();

  const applyLatestFrame = useCallback(() => {
    const pending = pendingFrameRef.current;
    if (!pending) return;

    const now = performance.now();
    if (now - lastApplyTimeRef.current < APPLY_INTERVAL) {
      rafIdRef.current = requestAnimationFrame(applyLatestFrame);
      return;
    }
    lastApplyTimeRef.current = now;

    setPositions(pending.positions, pending.count);
    setVelocities(pending.velocities);
    setMasses(pending.masses);
    setFrame(pending.frame);
    pendingFrameRef.current = null;
  }, [setPositions, setVelocities, setMasses, setFrame]);

  const handleBinaryMessage = useCallback(
    (buffer: ArrayBuffer) => {
      const decoded = decodeBinaryState(buffer);
      if (!decoded) return;

      pendingFrameRef.current = decoded;

      if (rafIdRef.current === 0) {
        rafIdRef.current = requestAnimationFrame(applyLatestFrame);
      }
    },
    [applyLatestFrame]
  );

  const handleTextMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'state': {
            const data = message.data;
            setPositions(data.positions, data.count);
            setVelocities(data.velocities);
            setMasses(data.masses);
            setFrame(data.frame);
            break;
          }
          case 'stats': {
            const data = message.data as SimulationStats;
            setStats(data);
            break;
          }
          case 'config': {
            const data = message.data as SimulationConfig;
            setConfig(data);
            break;
          }
          case 'config_updated': {
            const data = message.data as SimulationConfig;
            setConfig(data);
            break;
          }
          case 'scenes': {
            const data = message.data as ScenePreset[];
            setScenes(data);
            break;
          }
          case 'scene_loaded': {
            const data = message.data as SceneLoadedData;
            setCurrentSceneId(data.id);
            setConfig(data.config);
            reset();
            break;
          }
          case 'scene_changed': {
            const data = message.data as SceneLoadedData;
            setCurrentSceneId(data.id);
            setConfig(data.config);
            if (data.device) {
              setDeviceInfo({
                backend: data.device.current_backend,
                device: data.device.device,
                is_gpu: data.device.is_gpu,
              });
            }
            break;
          }
          case 'control_ack': {
            const data = message.data;
            setRunning(data.isRunning);
            setPaused(data.isPaused);
            break;
          }
          case 'error': {
            console.error('Server error:', message.message);
            break;
          }
          default:
            console.warn('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
    [
      setPositions,
      setVelocities,
      setMasses,
      setFrame,
      setConfig,
      setStats,
      setScenes,
      setCurrentSceneId,
      setRunning,
      setPaused,
      reset,
    ]
  );

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        reconnectAttemptsRef.current = 0;

        ws.send(JSON.stringify({ type: 'get_config' }));
        ws.send(JSON.stringify({ type: 'get_stats' }));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          handleBinaryMessage(event.data);
        } else {
          handleTextMessage(event);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);

        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }, [handleBinaryMessage, handleTextMessage, setConnected]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
  }, []);

  const sendMessage = useCallback((type: string, data: any = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  const loadScene = useCallback(
    (sceneId: string, params?: Record<string, any>) => {
      sendMessage('scene', { sceneId, params });
    },
    [sendMessage]
  );

  const updateConfig = useCallback(
    (config: Partial<SimulationConfig>) => {
      sendMessage('config', { config });
    },
    [sendMessage]
  );

  const sendControl = useCallback(
    (command: ControlCommand) => {
      sendMessage('control', { command });
    },
    [sendMessage]
  );

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    loadScene,
    updateConfig,
    sendControl,
    sendMessage,
  };
}
