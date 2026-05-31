struct Particle {
    position: vec2<f32>,
    velocity: vec2<f32>,
    density: f32,
    pressure: f32,
    color: vec3<f32>,
};

struct Uniforms {
    resolution: vec2<f32>,
    particleRadius: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec3<f32>,
};

@vertex
fn vertexMain(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    var out: VertexOutput;
    
    let positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, 1.0)
    );
    
    let particle = particles[instanceIndex];
    let pos = particle.position;
    let radius = uniforms.particleRadius;
    
    let uv = positions[vertexIndex];
    out.uv = uv;
    out.color = particle.color;
    
    let screenPos = (pos / uniforms.resolution * 2.0 - 1.0) * vec2<f32>(1.0, -1.0);
    let size = radius * 2.0 / uniforms.resolution * 2.0;
    
    out.position = vec4<f32>(screenPos + uv * size, 0.0, 1.0);
    
    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    let dist = length(in.uv);
    if (dist > 1.0) { discard; }
    
    let alpha = smoothstep(1.0, 0.5, dist);
    let glow = exp(-dist * 2.0) * 0.3;
    
    return vec4<f32>(in.color + glow, alpha);
}
