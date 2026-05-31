import * as THREE from 'three';

export function velocityToColor(
  speed: number,
  maxSpeed: number
): THREE.Color {
  const t = Math.min(speed / maxSpeed, 1.0);

  const hue = (1.0 - t) * 0.65;
  const saturation = 0.8;
  const lightness = 0.4 + t * 0.3;

  return new THREE.Color().setHSL(hue, saturation, lightness);
}

export function massToColor(mass: number, maxMass: number): THREE.Color {
  const t = Math.min(Math.log10(mass + 1) / Math.log10(maxMass + 1), 1.0);

  const hue = 0.08 + t * 0.5;
  const saturation = 0.7;
  const lightness = 0.3 + t * 0.4;

  return new THREE.Color().setHSL(hue, saturation, lightness);
}

export function createParticleColors(
  positions: Float32Array,
  velocities: Float32Array,
  masses: Float32Array,
  colorMode: 'mass' | 'velocity' | 'fixed'
): Float32Array {
  const count = positions.length / 3;
  const colors = new Float32Array(count * 3);

  if (count === 0) return colors;

  let maxSpeed = 1;
  let maxMass = 1;

  if (colorMode === 'velocity') {
    for (let i = 0; i < count; i++) {
      const vx = velocities[i * 3];
      const vy = velocities[i * 3 + 1];
      const vz = velocities[i * 3 + 2];
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (speed > maxSpeed) maxSpeed = speed;
    }
  } else if (colorMode === 'mass') {
    maxMass = Math.max(...masses);
  }

  for (let i = 0; i < count; i++) {
    let color: THREE.Color;

    if (colorMode === 'velocity') {
      const vx = velocities[i * 3];
      const vy = velocities[i * 3 + 1];
      const vz = velocities[i * 3 + 2];
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      color = velocityToColor(speed, maxSpeed);
    } else if (colorMode === 'mass') {
      color = massToColor(masses[i], maxMass);
    } else {
      color = new THREE.Color(0x6366f1);
    }

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  return colors;
}

export function createParticleSizes(
  masses: Float32Array,
  baseSize: number
): Float32Array {
  const count = masses.length;
  const sizes = new Float32Array(count);

  if (count === 0) return sizes;

  const maxMass = Math.max(...masses);

  for (let i = 0; i < count; i++) {
    const massRatio = masses[i] / maxMass;
    sizes[i] = baseSize * (0.5 + massRatio * 1.5);
  }

  return sizes;
}
