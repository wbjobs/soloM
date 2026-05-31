import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../store/simulationStore';

const TRAIL_BODY_LIMIT = 500;
const TRAIL_LENGTH_SCALED = (bodyCount: number) => {
  if (bodyCount <= 100) return 150;
  if (bodyCount <= 500) return 80;
  if (bodyCount <= 2000) return 40;
  return 20;
};

export function ParticleSystem() {
  const pointsRef = useRef<THREE.Points>(null);
  const trailLinesRef = useRef<THREE.LineSegments | null>(null);
  const trailPosBufferRef = useRef<Float32Array | null>(null);
  const trailIndexRef = useRef(0);
  const trailFilledRef = useRef(false);
  const prevBodyCountRef = useRef(0);

  const {
    positions,
    velocities,
    masses,
    bodyCount,
    particleSize,
    colorMode,
    showTrails: showTrailsFromStore,
  } = useSimulationStore();

  const shouldShowTrails = showTrailsFromStore && bodyCount <= TRAIL_BODY_LIMIT;
  const trailLen = useMemo(() => TRAIL_LENGTH_SCALED(bodyCount), [bodyCount]);

  const pointMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        pixelRatio: { value: window.devicePixelRatio },
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float pixelRatio;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
          float glow = exp(-dist * 4.0);
          vec3 finalColor = vColor * (1.0 + glow * 0.5);
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(bodyCount * 3, 30000)), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(bodyCount * 3, 30000)), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(Math.max(bodyCount, 10000)), 1));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  useEffect(() => {
    if (positions.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr.array.length < positions.length) {
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions.length), 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(positions.length), 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(bodyCount), 1));
    }

    const pa = geometry.getAttribute('position') as THREE.BufferAttribute;
    (pa.array as Float32Array).set(positions);
    pa.needsUpdate = true;

    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const newColors = computeColors(positions, velocities, masses, bodyCount, colorMode);
    (colorAttr.array as Float32Array).set(newColors);
    colorAttr.needsUpdate = true;

    const sizeAttr = geometry.getAttribute('size') as THREE.BufferAttribute;
    const newSizes = computeSizes(masses, bodyCount, particleSize);
    (sizeAttr.array as Float32Array).set(newSizes);
    sizeAttr.needsUpdate = true;

    geometry.setDrawRange(0, bodyCount);
  }, [positions, velocities, masses, bodyCount, colorMode, particleSize, geometry]);

  useEffect(() => {
    if (!shouldShowTrails || bodyCount === 0 || bodyCount > TRAIL_BODY_LIMIT) {
      if (trailLinesRef.current) {
        trailLinesRef.current.visible = false;
      }
      trailPosBufferRef.current = null;
      return;
    }

    const numTrailBodies = bodyCount;
    const maxTrailPoints = numTrailBodies * trailLen;
    const posBuffer = new Float32Array(maxTrailPoints * 3);
    trailPosBufferRef.current = posBuffer;
    trailIndexRef.current = 0;
    trailFilledRef.current = false;

    if (!trailLinesRef.current) {
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(posBuffer, 3));
      trailGeo.setDrawRange(0, 0);

      const trailMat = new THREE.LineBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const lineSegments = new THREE.LineSegments(trailGeo, trailMat);
      lineSegments.frustumCulled = false;
      lineSegments.matrixAutoUpdate = false;

      const group = pointsRef.current?.parent;
      if (group) {
        group.add(lineSegments);
      }
      trailLinesRef.current = lineSegments;
    } else {
      const trailGeo = trailLinesRef.current.geometry;
      trailGeo.setAttribute('position', new THREE.BufferAttribute(posBuffer, 3));
      trailGeo.setDrawRange(0, 0);
      trailLinesRef.current.visible = true;
    }

    prevBodyCountRef.current = bodyCount;
  }, [bodyCount, shouldShowTrails, trailLen]);

  useEffect(() => {
    if (bodyCount !== prevBodyCountRef.current && shouldShowTrails && bodyCount <= TRAIL_BODY_LIMIT) {
      prevBodyCountRef.current = bodyCount;
    }
  }, [bodyCount, shouldShowTrails]);

  useFrame(() => {
    if (!shouldShowTrails || !trailPosBufferRef.current || bodyCount === 0 || bodyCount > TRAIL_BODY_LIMIT) return;

    const posBuffer = trailPosBufferRef.current;
    const idx = trailIndexRef.current;

    for (let i = 0; i < bodyCount && i < TRAIL_BODY_LIMIT; i++) {
      const srcIdx = i * 3;
      if (srcIdx + 2 >= positions.length) break;

      const prevFrameIdx = idx > 0 ? idx - 1 : trailLen - 1;

      const fromOffset = i * trailLen * 3 + prevFrameIdx * 3;
      const toOffset = i * trailLen * 3 + idx * 3;

      posBuffer[fromOffset] = positions[srcIdx];
      posBuffer[fromOffset + 1] = positions[srcIdx + 1];
      posBuffer[fromOffset + 2] = positions[srcIdx + 2];
    }

    trailIndexRef.current = (idx + 1) % trailLen;
    if (idx + 1 >= trailLen) trailFilledRef.current = true;

    if (trailLinesRef.current) {
      const trailGeo = trailLinesRef.current.geometry;
      const posAttr = trailGeo.getAttribute('position') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;

      const filled = trailLen;
      const numSegments = bodyCount * (filled - 1);
      const numIndices = numSegments * 2;
      trailGeo.setDrawRange(0, numIndices);
    }
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      pointMaterial.dispose();
      if (trailLinesRef.current) {
        trailLinesRef.current.geometry.dispose();
        (trailLinesRef.current.material as THREE.Material).dispose();
      }
    };
  }, [geometry, pointMaterial]);

  return (
    <points ref={pointsRef} geometry={geometry} material={pointMaterial} frustumCulled={false} />
  );
}

function computeColors(
  positions: Float32Array,
  velocities: Float32Array,
  masses: Float32Array,
  count: number,
  mode: 'mass' | 'velocity' | 'fixed'
): Float32Array {
  const colors = new Float32Array(count * 3);
  if (count === 0) return colors;

  if (mode === 'velocity') {
    let maxSpeed = 1;
    for (let i = 0; i < count; i++) {
      const vx = velocities[i * 3] || 0;
      const vy = velocities[i * 3 + 1] || 0;
      const vz = velocities[i * 3 + 2] || 0;
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (speed > maxSpeed) maxSpeed = speed;
    }
    for (let i = 0; i < count; i++) {
      const vx = velocities[i * 3] || 0;
      const vy = velocities[i * 3 + 1] || 0;
      const vz = velocities[i * 3 + 2] || 0;
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const t = Math.min(speed / maxSpeed, 1.0);
      const hue = (1.0 - t) * 0.65;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.4 + t * 0.3);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
  } else if (mode === 'mass') {
    let maxMass = 1;
    for (let i = 0; i < count; i++) {
      if (masses[i] > maxMass) maxMass = masses[i];
    }
    for (let i = 0; i < count; i++) {
      const t = Math.min(Math.log10(masses[i] + 1) / Math.log10(maxMass + 1), 1.0);
      const color = new THREE.Color().setHSL(0.08 + t * 0.5, 0.7, 0.3 + t * 0.4);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
  } else {
    for (let i = 0; i < count; i++) {
      colors[i * 3] = 0.39;
      colors[i * 3 + 1] = 0.4;
      colors[i * 3 + 2] = 0.95;
    }
  }

  return colors;
}

function computeSizes(masses: Float32Array, count: number, baseSize: number): Float32Array {
  const sizes = new Float32Array(count);
  if (count === 0) return sizes;

  let maxMass = 1;
  for (let i = 0; i < count; i++) {
    if (masses[i] > maxMass) maxMass = masses[i];
  }
  for (let i = 0; i < count; i++) {
    const ratio = masses[i] / maxMass;
    sizes[i] = baseSize * (0.5 + ratio * 1.5);
  }
  return sizes;
}
