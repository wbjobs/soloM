import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ROLE_COLORS, ROLE_GLOW_COLORS } from "@/types/raft";
import type { RaftNodeState } from "@/types/raft";

interface ServerNodeProps {
  node: RaftNodeState;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}

function lerpColor(current: THREE.Color, target: THREE.Color, alpha: number): void {
  current.r += (target.r - current.r) * alpha;
  current.g += (target.g - current.g) * alpha;
  current.b += (target.b - current.b) * alpha;
}

function ServerBody({ node }: { node: RaftNodeState }) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ledRef = useRef<THREE.Mesh>(null);
  const panelRef = useRef<THREE.Mesh>(null);

  const roleColorRef = useRef(new THREE.Color(ROLE_COLORS[node.role] || "#4a9eff"));
  const glowColorRef = useRef(new THREE.Color(ROLE_GLOW_COLORS[node.role] || "#88bbff"));
  const networkOpacityRef = useRef(node.networkOnline ? 0 : 0.25);

  useEffect(() => {
    roleColorRef.current = new THREE.Color(ROLE_COLORS[node.role] || "#4a9eff");
    glowColorRef.current = new THREE.Color(ROLE_GLOW_COLORS[node.role] || "#88bbff");
  }, [node.role]);

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.y += delta * 0.5;
    }

    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.12 + Math.sin(Date.now() * 0.003) * 0.06;
      lerpColor(mat.color as THREE.Color, glowColorRef.current, delta * 8);
    }

    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      lerpColor(mat.color as THREE.Color, roleColorRef.current, delta * 8);
    }

    if (panelRef.current) {
      const mat = panelRef.current.material as THREE.MeshStandardMaterial;
      lerpColor(mat.color as THREE.Color, roleColorRef.current, delta * 8);
      lerpColor(mat.emissive as THREE.Color, roleColorRef.current, delta * 8);
    }

    if (ledRef.current) {
      const mat = ledRef.current.material as THREE.MeshStandardMaterial;
      lerpColor(mat.color as THREE.Color, roleColorRef.current, delta * 8);
      lerpColor(mat.emissive as THREE.Color, roleColorRef.current, delta * 8);
    }

    const targetNetworkOpacity = node.networkOnline ? 0 : 0.25;
    networkOpacityRef.current += (targetNetworkOpacity - networkOpacityRef.current) * delta * 5;
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 1.8, 0.8]} />
        <meshStandardMaterial
          color="#1a1a2e"
          metalness={0.8}
          roughness={0.2}
          transparent
          opacity={0.9}
        />
      </mesh>

      <mesh ref={panelRef} position={[0, 0.5, 0.41]}>
        <planeGeometry args={[0.8, 0.3]} />
        <meshStandardMaterial
          color={ROLE_COLORS[node.role]}
          emissive={ROLE_COLORS[node.role]}
          emissiveIntensity={0.8}
          transparent
          opacity={0.9}
        />
      </mesh>

      <mesh position={[-0.2, -0.1, 0.41]}>
        <circleGeometry args={[0.04, 16]} />
        <meshStandardMaterial
          color="#00ff88"
          emissive="#00ff88"
          emissiveIntensity={1}
        />
      </mesh>

      <mesh ref={ledRef} position={[0, -0.1, 0.41]}>
        <circleGeometry args={[0.04, 16]} />
        <meshStandardMaterial
          color={ROLE_COLORS[node.role]}
          emissive={ROLE_COLORS[node.role]}
          emissiveIntensity={1}
        />
      </mesh>

      <mesh position={[0.2, -0.1, 0.41]}>
        <circleGeometry args={[0.04, 16]} />
        <meshStandardMaterial
          color={ROLE_COLORS[node.role]}
          emissive={ROLE_COLORS[node.role]}
          emissiveIntensity={1}
        />
      </mesh>

      {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
        <mesh key={`slot-${i}`} position={[x, -0.45, 0.41]}>
          <planeGeometry args={[0.12, 0.35]} />
          <meshStandardMaterial color="#0d0d1a" />
        </mesh>
      ))}

      <mesh ref={glowRef} position={[0, 0, 0]}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial color={ROLE_GLOW_COLORS[node.role]} transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>

      <mesh ref={ringRef} position={[0, -1.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.9, 0.02, 8, 64]} />
        <meshBasicMaterial color={ROLE_COLORS[node.role]} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

export function ServerNode({ node, position, isSelected, onClick }: ServerNodeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const networkPlaneRef = useRef<THREE.Mesh>(null);
  const heightRef = useRef(position[1]);

  const targetHeight = position[1] + (node.role === "leader" ? 0.3 : 0);

  useFrame((_, delta) => {
    if (groupRef.current) {
      heightRef.current += (targetHeight - heightRef.current) * delta * 3;
      groupRef.current.position.y = heightRef.current;
    }

    if (networkPlaneRef.current) {
      const mat = networkPlaneRef.current.material as THREE.MeshBasicMaterial;
      const targetOpacity = node.networkOnline ? 0 : 0.25;
      mat.opacity += (targetOpacity - mat.opacity) * delta * 5;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1], position[2]]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <ServerBody node={node} />

      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1.5, 2.1, 1.1]} />
          <meshBasicMaterial color={ROLE_COLORS[node.role]} transparent opacity={0.1} wireframe />
        </mesh>
      )}

      <mesh ref={networkPlaneRef} position={[0, 0, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[2.0, 2.5, 0.05]} />
        <meshBasicMaterial color="#ff0044" transparent opacity={0} />
      </mesh>
    </group>
  );
}
