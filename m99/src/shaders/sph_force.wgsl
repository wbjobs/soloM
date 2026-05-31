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

@compute @workgroup_size(256)
fn computeForces(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.numParticles) { return; }
    
    let pos_i = particles[i].position;
    let vel_i = particles[i].velocity;
    let den_i = particles[i].density;
    let pre_i = particles[i].pressure;
    let h = params.smoothingLength;
    
    var pressureForce = vec2<f32>(0.0);
    var viscosityForce = vec2<f32>(0.0);
    
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
                if (j_orig == i) { continue; }
                
                let pos_j = particles[j_orig].position;
                let vel_j = particles[j_orig].velocity;
                let den_j = particles[j_orig].density;
                let pre_j = particles[j_orig].pressure;
                
                let r_vec = pos_i - pos_j;
                let r = length(r_vec);
                
                if (r < h && r > 0.0001) {
                    let pTerm = (pre_i / (den_i * den_i)) + (pre_j / (den_j * den_j));
                    pressureForce += pTerm * spikyKernelGradient(r_vec, h);
                    
                    let velDiff = vel_j - vel_i;
                    viscosityForce += params.viscosity * velDiff * viscosityKernelLaplacian(r, h) / den_j;
                }
            }
        }
    }
    
    pressureForce *= -den_i;
    
    var mouseForce = vec2<f32>(0.0);
    if (params.mouseActive == 1u) {
        let toMouse = params.mousePos - pos_i;
        let distToMouse = length(toMouse);
        
        if (distToMouse < params.mouseRadius && distToMouse > 0.0001) {
            let falloff = 1.0 - (distToMouse / params.mouseRadius);
            let falloffSq = falloff * falloff;
            
            let velDiff = params.mouseVel - vel_i;
            mouseForce = velDiff * falloffSq * params.mouseStrength * den_i;
            
            let pushForce = normalize(toMouse) * falloffSq * params.mouseStrength * 0.5 * den_i;
            mouseForce += pushForce;
        }
    }
    
    let gravityForce = vec2<f32>(0.0, params.gravity) * den_i;
    let totalForce = pressureForce + viscosityForce + gravityForce + mouseForce;
    
    let acceleration = totalForce / den_i;
    particles[i].velocity += acceleration * params.dt;
}

@compute @workgroup_size(256)
fn integrate(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.numParticles) { return; }
    
    particles[i].position += particles[i].velocity * params.dt;
    
    let pos = particles[i].position;
    let vel = particles[i].velocity;
    let radius = params.particleRadius;
    let minPos = params.boundaryMin + vec2<f32>(radius);
    let maxPos = params.boundaryMax - vec2<f32>(radius);
    
    var newPos = pos;
    var newVel = vel;
    let bounce = 0.3;
    let friction = 0.98;
    
    if (pos.x < minPos.x) {
        newPos.x = minPos.x + (minPos.x - pos.x) * 0.5;
        newVel.x = abs(vel.x) * bounce;
    }
    if (pos.x > maxPos.x) {
        newPos.x = maxPos.x - (pos.x - maxPos.x) * 0.5;
        newVel.x = -abs(vel.x) * bounce;
    }
    if (pos.y < minPos.y) {
        newPos.y = minPos.y + (minPos.y - pos.y) * 0.5;
        newVel.y = abs(vel.y) * bounce;
    }
    if (pos.y > maxPos.y) {
        newPos.y = maxPos.y - (pos.y - maxPos.y) * 0.5;
        newVel.y = -abs(vel.y) * bounce;
    }
    
    newVel *= friction;
    
    let maxSpeed = 5.0;
    let speed = length(newVel);
    if (speed > maxSpeed) {
        newVel = normalize(newVel) * maxSpeed;
    }
    
    particles[i].position = newPos;
    particles[i].velocity = newVel;
    
    let t = clamp(speed * 0.1, 0.0, 1.0);
    particles[i].color = mix(vec3<f32>(0.0, 0.5, 1.0), vec3<f32>(1.0, 0.8, 0.2), t);
}
