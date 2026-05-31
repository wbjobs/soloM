import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function StarField() {
  const ref = useRef<THREE.Points>(null);
  const count = 800;

  const positions = (() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    return pos;
  })();

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.01;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial color="#4466aa" size={0.08} sizeAttenuation transparent opacity={0.6} />
    </points>
  );
}

function GridFloor() {
  return (
    <gridHelper
      args={[40, 40, "#112244", "#0a1530"]}
      position={[0, -3, 0]}
      rotation={[0, 0, 0]}
    />
  );
}

export function SceneEnvironment() {
  return (
    <>
      <color attach="background" args={["#060a14"]} />
      <fog attach="fog" args={["#060a14", 15, 40]} />

      <ambientLight intensity={0.3} color="#8899cc" />
      <directionalLight position={[5, 8, 5]} intensity={0.5} color="#aaccff" />
      <pointLight position={[0, 5, 0]} intensity={0.4} color="#00f0ff" distance={20} />

      <StarField />
      <GridFloor />
    </>
  );
}
