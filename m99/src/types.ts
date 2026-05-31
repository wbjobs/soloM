export interface SimParams {
    gravity: number;
    viscosity: number;
    particleRadius: number;
    restDensity: number;
    smoothingLength: number;
    stiffness: number;
    dt: number;
    numParticles: number;
    boundaryMin: [number, number];
    boundaryMax: [number, number];
    mousePos: [number, number];
    mouseVel: [number, number];
    mouseRadius: number;
    mouseStrength: number;
    mouseActive: number;
}

export interface Particle {
    position: [number, number];
    velocity: [number, number];
    density: number;
    pressure: number;
    color: [number, number, number];
}

export const PARTICLE_SIZE = 4 * 2 + 4 * 2 + 4 + 4 + 4 * 3;

export const defaultParams: SimParams = {
    gravity: -9.8,
    viscosity: 0.05,
    particleRadius: 0.025,
    restDensity: 1000,
    smoothingLength: 0.1,
    stiffness: 1000,
    dt: 0.001,
    numParticles: 100000,
    boundaryMin: [0, 0],
    boundaryMax: [2, 2],
    mousePos: [0, 0],
    mouseVel: [0, 0],
    mouseRadius: 0.3,
    mouseStrength: 5.0,
    mouseActive: 0
};
