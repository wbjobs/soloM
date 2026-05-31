import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RPC_COLORS } from "@/types/raft";
import type { RaftEvent } from "@/types/raft";

const FLOW_LIFETIME_MS = 1500;
const FLOW_FADE_MS = 400;

interface ParticleFlowProps {
  from: [number, number, number];
  to: [number, number, number];
  rpcType: "heartbeat" | "vote" | "append_entries";
  createdAt: number;
}

function FlowParticles({ from, to, rpcType, createdAt }: ParticleFlowProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const progressRef = useRef(0);
  const particleCount = 12;

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    return [pos, col];
  }, []);

  const baseColor = useMemo(
    () => new THREE.Color(RPC_COLORS[rpcType] || "#00f0ff"),
    [rpcType]
  );

  useFrame(() => {
    progressRef.current = (progressRef.current + 0.006) % 1;

    const age = Date.now() - createdAt;
    const fadeStart = FLOW_LIFETIME_MS - FLOW_FADE_MS;
    const globalAlpha = age > fadeStart
      ? Math.max(0, 1 - (age - fadeStart) / FLOW_FADE_MS)
      : 1;

    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;

      for (let i = 0; i < particleCount; i++) {
        const t = (i / particleCount + progressRef.current) % 1;
        const arcY = Math.sin(t * Math.PI) * 0.5;
        posAttr.setXYZ(
          i,
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t + arcY,
          from[2] + (to[2] - from[2]) * t
        );
        const alpha = Math.sin(t * Math.PI) * globalAlpha;
        colAttr.setXYZ(i, baseColor.r * alpha, baseColor.g * alpha, baseColor.b * alpha);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={particleCount} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} count={particleCount} />
      </bufferGeometry>
      <pointsMaterial size={0.1} vertexColors transparent opacity={0.9} sizeAttenuation depthWrite={false} />
    </points>
  );
}

interface ActiveFlowProps {
  event: RaftEvent;
  nodePositions: Map<number, [number, number, number]>;
  onExpired: (key: string) => void;
  flowKey: string;
}

export function ActiveFlow({ event, nodePositions, onExpired, flowKey }: ActiveFlowProps) {
  const from = nodePositions.get(event.sourceNode);
  const to = event.targetNode ? nodePositions.get(event.targetNode) : undefined;
  const expiredRef = useRef(false);

  useFrame(() => {
    if (expiredRef.current) return;
    const age = Date.now() - event.timestamp;
    if (age > FLOW_LIFETIME_MS) {
      expiredRef.current = true;
      onExpired(flowKey);
    }
  });

  if (!from || !to) return null;

  const rpcType =
    event.eventType === "heartbeat"
      ? "heartbeat"
      : event.eventType === "election"
        ? "vote"
        : "append_entries";

  const age = Date.now() - event.timestamp;
  if (age > FLOW_LIFETIME_MS) return null;

  return <FlowParticles from={from} to={to} rpcType={rpcType} createdAt={event.timestamp} />;
}

interface ConnectionLineProps {
  from: [number, number, number];
  to: [number, number, number];
  active: boolean;
  color: string;
}

export function ConnectionLine({ from, to, active, color }: ConnectionLineProps) {
  const lineObj = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 32;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push(
        new THREE.Vector3(
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t + Math.sin(t * Math.PI) * 0.3,
          from[2] + (to[2] - from[2]) * t
        )
      );
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: active ? 0.6 : 0.15,
    });
    return new THREE.Line(geo, mat);
  }, [from, to, active, color]);

  return <primitive object={lineObj} />;
}
