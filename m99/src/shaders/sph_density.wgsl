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
    mousePos: vec2<f32>,
    mouseVel: vec2<f32>,
    mouseRadius: f32,
    mouseStrength: f32,
    mouseActive: u32,
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read> sortedIndices: array<u32>;
@group(0) @binding(3) var<storage, read> cellStart: array<i32>;
@group(0) @binding(4) var<storage, read> cellEnd: array<i32>;

fn poly6Kernel(r: f32, h: f32) -> f32 {
    if (r > h) { return 0.0; }
    let h2 = h * h;
    let r2 = r * r;
    let diff = h2 - r2;
    return (315.0 / (64.0 * 3.14159265359 * pow(h, 9.0))) * diff * diff * diff;
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

@compute @workgroup_size(256)
fn computeDensityPressure(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.numParticles) { return; }
    
    let pos_i = particles[i].position;
    let h = params.smoothingLength;
    let h2 = h * h;
    
    var density = 0.0;
    let cell_i = getCellIndex(pos_i);
    let tableSize = arrayLength(&cellStart);
    
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            let neighborCell = cell_i + vec2<i32>(dx, dy);
            let cellHash = getCellHash(neighborCell);
            let cellIdx = cellHash % tableSize;
            
            let start = cellStart[cellIdx];
            let end = cellEnd[cellIdx];
            
            if (start == -1) { continue; }
            
            for (var j = u32(start); j < u32(end); j++) {
                let j_orig = sortedIndices[j] & 0xFFFFFFFFu;
                let pos_j = particles[j_orig].position;
                let r = length(pos_i - pos_j);
                
                if (r < h) {
                    density += poly6Kernel(r, h);
                }
            }
        }
    }
    
    particles[i].density = density;
    particles[i].pressure = params.stiffness * max(density - params.restDensity, 0.0);
}
