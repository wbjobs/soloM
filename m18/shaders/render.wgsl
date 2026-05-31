struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@group(0) @binding(0) var densityTexture: texture_2d<f32>;
@group(0) @binding(1) var velocityTexture: texture_2d<f32>;
@group(0) @binding(2) var samplerLinear: sampler;
@group(0) @binding(3) var obstacleTexture: texture_2d<f32>;

fn hsv2rgb(c: vec3f) -> vec3f {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0)
  );
  
  var output: VertexOutput;
  output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  output.uv = pos[vertexIndex] * 0.5 + 0.5;
  output.uv.y = 1.0 - output.uv.y;
  return output;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let obstacle = textureSample(obstacleTexture, samplerLinear, uv).x;
  
  if (obstacle > 0.5) {
    let obstacleBaseColor = vec3f(0.12, 0.13, 0.18);
    
    let iuv = vec2u(uv * vec2f(textureDimensions(obstacleTexture)));
    let edgeL = textureLoad(obstacleTexture, vec2u(max(iuv.x - 1u, 0u), iuv.y), 0).x;
    let edgeR = textureLoad(obstacleTexture, vec2u(min(iuv.x + 1u, textureDimensions(obstacleTexture).x - 1u), iuv.y), 0).x;
    let edgeB = textureLoad(obstacleTexture, vec2u(iuv.x, max(iuv.y - 1u, 0u)), 0).x;
    let edgeT = textureLoad(obstacleTexture, vec2u(iuv.x, min(iuv.y + 1u, textureDimensions(obstacleTexture).y - 1u)), 0).x;
    
    let isEdge = (edgeL < 0.5) || (edgeR < 0.5) || (edgeB < 0.5) || (edgeT < 0.5);
    
    if (isEdge) {
      let edgeGlow = vec3f(0.3, 0.5, 0.8);
      return vec4f(edgeGlow, 1.0);
    }
    
    return vec4f(obstacleBaseColor, 1.0);
  }
  
  let density = textureSample(densityTexture, samplerLinear, uv).x;
  let velocity = textureSample(velocityTexture, samplerLinear, uv).xy;
  
  let velocityMag = length(velocity) * 0.01;
  
  let hueBase = 0.55;
  let hueShift = velocityMag * 0.3;
  let hue = hueBase + density * 0.15 - hueShift;
  
  let saturation = 0.6 + density * 0.3;
  let value = density * 1.5 + velocityMag * 0.5;
  
  let rgb = hsv2rgb(vec3f(hue, saturation, min(value, 1.0)));
  
  let glow = smoothstep(0.0, 0.3, density) * 0.5;
  let finalColor = rgb + vec3f(glow * 0.3, glow * 0.5, glow * 0.8);
  
  let alpha = smoothstep(0.02, 0.15, density);
  
  let bgColor = vec3f(0.02, 0.02, 0.05);
  let mixedColor = mix(bgColor, finalColor, alpha);
  
  return vec4f(mixedColor, 1.0);
}
