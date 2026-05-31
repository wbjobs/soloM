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
@group(0) @binding(2) var<storage, read_write> sortedIndices: array<u32>;
@group(0) @binding(3) var<storage, read_write> cellStart: array<i32>;
@group(0) @binding(4) var<storage, read_write> cellEnd: array<i32>;

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
fn computeHash(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.numParticles) { return; }
    
    let pos = particles[i].position;
    let cell = getCellIndex(pos);
    let hash = getCellHash(cell);
    sortedIndices[i] = hash << 32 | i;
}

@compute @workgroup_size(256)
fn resetCellStart(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    let tableSize = arrayLength(&cellStart);
    if (i >= tableSize) { return; }
    cellStart[i] = -1;
    cellEnd[i] = -1;
}

@compute @workgroup_size(1)
fn findCellStartEnd() {
    let numParticles = params.numParticles;
    if (numParticles == 0u) { return; }
    
    let tableSize = arrayLength(&cellStart);
    
    var prevHash = sortedIndices[0] >> 32;
    cellStart[prevHash % tableSize] = 0;
    
    for (var i = 1u; i < numParticles; i++) {
        let hash = sortedIndices[i] >> 32;
        if (hash != prevHash) {
            cellEnd[prevHash % tableSize] = i32(i);
            cellStart[hash % tableSize] = i32(i);
            prevHash = hash;
        }
    }
    cellEnd[prevHash % tableSize] = i32(numParticles);
}
