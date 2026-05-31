import { useMemo, useState, useCallback, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useRaftStore } from "@/store/raftStore";
import { ROLE_COLORS, RPC_COLORS } from "@/types/raft";
import { ServerNode } from "./ServerNode";
import { ActiveFlow, ConnectionLine } from "./ParticleFlow";
import { SceneEnvironment } from "./SceneEnvironment";
import type { RaftEvent } from "@/types/raft";

const NODE_POSITIONS: [number, number, number][] = [
  [0, 0.5, -1.5],
  [-2.5, 0.5, 1.5],
  [2.5, 0.5, 1.5],
];

function NodeLabel({ position, text, color }: { position: [number, number, number]; text: string; color: string }) {
  return (
    <Text
      position={[position[0], position[1] + 1.5, position[2]]}
      fontSize={0.3}
      color={color}
      anchorX="center"
      anchorY="middle"
      font={undefined}
    >
      {text}
    </Text>
  );
}

function NetworkStatus({ position, online }: { position: [number, number, number]; online: boolean }) {
  return (
    <mesh position={[position[0] + 0.8, position[1] - 0.8, position[2] + 0.41]}>
      <circleGeometry args={[0.08, 16]} />
      <meshBasicMaterial color={online ? "#00ff88" : "#ff0044"} />
    </mesh>
  );
}

const FLOW_LIFETIME_MS = 1500;

interface FlowEntry {
  key: string;
  event: RaftEvent;
}

function RecentFlows({ events, nodePositions }: { events: RaftEvent[]; nodePositions: Map<number, [number, number, number]> }) {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const flowsRef = useRef<FlowEntry[]>([]);
  const lastEventCountRef = useRef(0);

  useFrame(() => {
    const now = Date.now();
    if (events.length !== lastEventCountRef.current) {
      lastEventCountRef.current = events.length;
      const newFlows: FlowEntry[] = [];
      for (const e of events) {
        if (e.targetNode && e.eventType !== "network_change" && e.eventType !== "state_change") {
          const age = now - e.timestamp;
          if (age < FLOW_LIFETIME_MS) {
            const key = `${e.timestamp}-${e.sourceNode}-${e.targetNode}-${e.eventType}`;
            newFlows.push({ key, event: e });
          }
        }
      }
      flowsRef.current = newFlows.slice(-8);
    }

    flowsRef.current = flowsRef.current.filter((f) => now - f.event.timestamp < FLOW_LIFETIME_MS);

    const nextKeys = new Set(flowsRef.current.map((f) => f.key));
    if (nextKeys.size !== activeKeys.size || [...nextKeys].some((k) => !activeKeys.has(k))) {
      setActiveKeys(nextKeys);
    }
  });

  const handleExpired = useCallback((key: string) => {
    setActiveKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  return (
    <>
      {flowsRef.current
        .filter((f) => activeKeys.has(f.key))
        .map((f) => (
          <ActiveFlow
            key={f.key}
            flowKey={f.key}
            event={f.event}
            nodePositions={nodePositions}
            onExpired={handleExpired}
          />
        ))}
    </>
  );
}

function SceneContent() {
  const { displayNodes, events, selectedNodeId, setSelectedNode, isReplayMode } = useRaftStore();
  const nodes = displayNodes;

  const nodePositionsMap = useMemo(() => {
    const map = new Map<number, [number, number, number]>();
    nodes.forEach((node, i) => {
      map.set(node.id, NODE_POSITIONS[i] || [0, 0, 0]);
    });
    return map;
  }, [nodes]);

  const connections = useMemo(() => {
    const conns: { from: [number, number, number]; to: [number, number, number]; active: boolean; color: string }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const ni = nodes[i];
        const nj = nodes[j];
        const active = ni.networkOnline && nj.networkOnline;
        conns.push({
          from: NODE_POSITIONS[i],
          to: NODE_POSITIONS[j],
          active,
          color: active ? RPC_COLORS.heartbeat : "#331122",
        });
      }
    }
    return conns;
  }, [nodes]);

  return (
    <>
      <SceneEnvironment />

      {connections.map((conn, i) => (
        <ConnectionLine key={i} from={conn.from} to={conn.to} active={conn.active} color={conn.color} />
      ))}

      {!isReplayMode && <RecentFlows events={events} nodePositions={nodePositionsMap} />}

      {nodes.map((node, i) => (
        <group key={node.id}>
          <ServerNode
            node={node}
            position={NODE_POSITIONS[i]}
            isSelected={selectedNodeId === node.id}
            onClick={() => setSelectedNode(selectedNodeId === node.id ? null : node.id)}
          />
          <NodeLabel
            position={NODE_POSITIONS[i]}
            text={`Node ${node.id}`}
            color={ROLE_COLORS[node.role]}
          />
          <NetworkStatus position={NODE_POSITIONS[i]} online={node.networkOnline} />
        </group>
      ))}

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={4}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2}
        target={[0, 0, 0]}
      />
    </>
  );
}

export function RaftScene() {
  return (
    <Canvas
      camera={{ position: [0, 6, 10], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => useRaftStore.getState().setSelectedNode(null)}
    >
      <SceneContent />
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={0.8} />
      </EffectComposer>
    </Canvas>
  );
}
