struct Particle {
    position: vec2<f32>,
    velocity: vec2<f32>,
    density: f32,
    pressure: f32,
    color: vec3<f32>,
};

struct SimParams {
    gravity: f32,
    viscosity: f32,
    particleRadius: f32,
    restDensity: f32,
    smoothingLength: f32,
    stiffness: f32,
    dt: f32,
    numParticles: u32,
    boundaryMin: vec2<f32>,
    boundaryMax: vec2<f32>,
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read> sortedIndices: array<u32>;
@group(0) @binding(3) var<storage, read_write> cellStart: array<i32>;
@group(0) @binding(4) var<storage, read_write> cellEnd: array<i32>;

fn poly6Kernel(r: f32, h: f32) -> f32 {
    if (r > h) { return 0.0; }
    let h2 = h * h;
    let r2 = r * r;
    let diff = h2 - r2;
    return (315.0 / (64.0 * 3.14159265359 * pow(h, 9.0))) * diff * diff * diff;
}

fn spikyKernelGradient(r: vec2<f32>, h: f32) -> vec2<f32> {
    let rLen = length(r);
    if (rLen > h || rLen < 0.0001) { return vec2<f32>(0.0); }
    let diff = h - rLen;
    let factor = -45.0 / (3.14159265359 * pow(h, 6.0)) * diff * diff;
    return normalize(r) * factor;
}

fn viscosityKernelLaplacian(r: f32, h: f32) -> f32 {
    if (r > h) { return 0.0; }
    let diff = h - r;
    return 45.0 / (3.14159265359 * pow(h, 6.0)) * diff;
}

fn getCellIndex(pos: vec2<f32>) -> vec2<i32> {
    let cellSize = params.smoothingLength;
    return vec2<i32>(
        i32(floor((pos.x - params.boundaryMin.x) / cellSize)),
        i32(floor((pos.y - params.boundaryMin.y) / cellSize))
    );
}

fn getCellHash(cell: vec2<i32>) -> u32 {
    let gridSize = vec2<i32>(
        i32(ceil((params.boundaryMax.x - params.boundaryMin.x) / params.smoothingLength)) + 1,
        i32(ceil((params.boundaryMax.y - params.boundaryMin.y) / params.smoothingLength)) + 1
    );
    let p = vec2<i32>(
        cell.x % gridSize.x,
        cell.y % gridSize.y
    );
    return u32(p.y * gridSize.x + p.x);
}

fn hashToIndex(hash: u32, tableSize: u32) -> u32 {
    return hash % tableSize;
}
