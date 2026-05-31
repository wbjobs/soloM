struct Uniforms {
  resolution: vec2f,
  timeStep: f32,
  velocityDissipation: f32,
  densityDissipation: f32,
};

struct SplatData {
  position: vec2f,
  velocity: vec2f,
  radius: f32,
  strength: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> splatData: SplatData;

@group(1) @binding(0) var velocityTextureIn: texture_2d<f32>;
@group(1) @binding(1) var velocityTextureOut: texture_storage_2d<rg32float, write>;
@group(1) @binding(2) var densityTextureIn: texture_2d<f32>;
@group(1) @binding(3) var densityTextureOut: texture_storage_2d<r32float, write>;
@group(1) @binding(4) var pressureTextureIn: texture_2d<f32>;
@group(1) @binding(5) var pressureTextureOut: texture_storage_2d<r32float, write>;
@group(1) @binding(6) var divergenceTexture: texture_storage_2d<r32float, write>;
@group(1) @binding(7) var obstacleTexture: texture_2d<f32>;

var<private> texelSize: vec2f;
var<private> res: vec2u;

fn initParams() {
  texelSize = vec2f(1.0) / uniforms.resolution;
  res = vec2u(uniforms.resolution);
}

fn bilerp(tex: texture_2d<f32>, uv: vec2f) -> vec4f {
  let st = uv * uniforms.resolution - vec2f(0.5);
  let i0 = vec2u(clamp(floor(st), vec2f(0.0), uniforms.resolution - vec2f(1.0)));
  let i1 = i0 + vec2u(1);
  let f = fract(st);
  
  let v00 = textureLoad(tex, i0, 0);
  let v10 = textureLoad(tex, vec2u(i1.x, i0.y), 0);
  let v01 = textureLoad(tex, vec2u(i0.x, i1.y), 0);
  let v11 = textureLoad(tex, i1, 0);
  
  return mix(
    mix(v00, v10, f.x),
    mix(v01, v11, f.x),
    f.y
  );
}

fn bilerpWithObstacle(tex: texture_2d<f32>, uv: vec2f) -> vec4f {
  let st = uv * uniforms.resolution - vec2f(0.5);
  let i0 = vec2u(clamp(floor(st), vec2f(0.0), uniforms.resolution - vec2f(1.0)));
  let i1 = i0 + vec2u(1);
  let f = fract(st);
  
  var v00 = textureLoad(tex, i0, 0);
  var v10 = textureLoad(tex, vec2u(i1.x, i0.y), 0);
  var v01 = textureLoad(tex, vec2u(i0.x, i1.y), 0);
  var v11 = textureLoad(tex, i1, 0);
  
  if (textureLoad(obstacleTexture, i0, 0).x > 0.5) { v00 = vec4f(0.0); }
  if (textureLoad(obstacleTexture, vec2u(i1.x, i0.y), 0).x > 0.5) { v10 = vec4f(0.0); }
  if (textureLoad(obstacleTexture, vec2u(i0.x, i1.y), 0).x > 0.5) { v01 = vec4f(0.0); }
  if (textureLoad(obstacleTexture, i1, 0).x > 0.5) { v11 = vec4f(0.0); }
  
  return mix(
    mix(v00, v10, f.x),
    mix(v01, v11, f.x),
    f.y
  );
}

fn checkBounds(coord: vec2u) -> bool {
  return coord.x < res.x && coord.y < res.y;
}

fn isObstacle(coord: vec2u) -> bool {
  if (coord.x >= res.x || coord.y >= res.y) {
    return true;
  }
  return textureLoad(obstacleTexture, coord, 0).x > 0.5;
}

fn getNeighborCoord(base: vec2u, offset_x: i32, offset_y: i32) -> vec2u {
  let x = clamp(i32(base.x) + offset_x, 0, i32(res.x) - 1);
  let y = clamp(i32(base.y) + offset_y, 0, i32(res.y) - 1);
  return vec2u(x, y);
}

@compute @workgroup_size(8, 8)
fn advectionVelocity(@builtin(global_invocation_id) id: vec3u) {
  initParams();
  let coord = vec2u(id.xy);
  
  if (!checkBounds(coord)) { return; }
  
  if (isObstacle(coord)) {
    textureStore(velocityTextureOut, coord, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }
  
  let uv = (vec2f(coord) + vec2f(0.5)) * texelSize;
  let velocity = textureLoad(velocityTextureIn, coord, 0).xy;
  let backPos = uv - velocity * uniforms.timeStep * texelSize;
  let advected = bilerpWithObstacle(velocityTextureIn, backPos).xy;
  
  textureStore(velocityTextureOut, coord, vec4f(advected * uniforms.velocityDissipation, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn advectionDensity(@builtin(global_invocation_id) id: vec3u) {
  initParams();
  let coord = vec2u(id.xy);
  
  if (!checkBounds(coord)) { return; }
  
  if (isObstacle(coord)) {
    textureStore(densityTextureOut, coord, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }
  
  let uv = (vec2f(coord) + vec2f(0.5)) * texelSize;
  let velocity = bilerpWithObstacle(velocityTextureIn, uv).xy;
  let backPos = uv - velocity * uniforms.timeStep * texelSize;
  let advected = bilerpWithObstacle(densityTextureIn, backPos).x;
  
  textureStore(densityTextureOut, coord, vec4f(advected * uniforms.densityDissipation, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn divergence(@builtin(global_invocation_id) id: vec3u) {
  initParams();
  let coord = vec2u(id.xy);
  
  if (!checkBounds(coord)) { return; }
  
  if (isObstacle(coord)) {
    textureStore(divergenceTexture, coord, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }
  
  let coordL = getNeighborCoord(coord, -1, 0);
  let coordR = getNeighborCoord(coord, 1, 0);
  let coordB = getNeighborCoord(coord, 0, -1);
  let coordT = getNeighborCoord(coord, 0, 1);
  
  let obsL = isObstacle(coordL);
  let obsR = isObstacle(coordR);
  let obsB = isObstacle(coordB);
  let obsT = isObstacle(coordT);
  
  let velC = textureLoad(velocityTextureIn, coord, 0).xy;
  
  let velL = select(textureLoad(velocityTextureIn, coordL, 0).x, -velC.x, obsL);
  let velR = select(textureLoad(velocityTextureIn, coordR, 0).x, velC.x, obsR);
  let velB = select(textureLoad(velocityTextureIn, coordB, 0).y, -velC.y, obsB);
  let velT = select(textureLoad(velocityTextureIn, coordT, 0).y, velC.y, obsT);
  
  let div = 0.5 * ((velR - velL) + (velT - velB));
  textureStore(divergenceTexture, coord, vec4f(div, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn pressureSolve(@builtin(global_invocation_id) id: vec3u) {
  initParams();
  let coord = vec2u(id.xy);
  
  if (!checkBounds(coord)) { return; }
  
  if (isObstacle(coord)) {
    textureStore(pressureTextureOut, coord, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }
  
  let coordL = getNeighborCoord(coord, -1, 0);
  let coordR = getNeighborCoord(coord, 1, 0);
  let coordB = getNeighborCoord(coord, 0, -1);
  let coordT = getNeighborCoord(coord, 0, 1);
  
  let obsL = isObstacle(coordL);
  let obsR = isObstacle(coordR);
  let obsB = isObstacle(coordB);
  let obsT = isObstacle(coordT);
  
  let pC = textureLoad(pressureTextureIn, coord, 0).x;
  let pL = select(textureLoad(pressureTextureIn, coordL, 0).x, pC, obsL);
  let pR = select(textureLoad(pressureTextureIn, coordR, 0).x, pC, obsR);
  let pB = select(textureLoad(pressureTextureIn, coordB, 0).x, pC, obsB);
  let pT = select(textureLoad(pressureTextureIn, coordT, 0).x, pC, obsT);
  
  let div = textureLoad(divergenceTexture, coord, 0).x;
  
  let validNeighbors = f32(
    select(1u, 0u, obsL) + select(1u, 0u, obsR) +
    select(1u, 0u, obsB) + select(1u, 0u, obsT)
  );
  
  if (validNeighbors > 0.0) {
    let pressure = (pL + pR + pB + pT - div) / validNeighbors;
    textureStore(pressureTextureOut, coord, vec4f(pressure, 0.0, 0.0, 0.0));
  } else {
    textureStore(pressureTextureOut, coord, vec4f(0.0, 0.0, 0.0, 0.0));
  }
}

@compute @workgroup_size(8, 8)
fn gradientSubtract(@builtin(global_invocation_id) id: vec3u) {
  initParams();
  let coord = vec2u(id.xy);
  
  if (!checkBounds(coord)) { return; }
  
  if (isObstacle(coord)) {
    textureStore(velocityTextureOut, coord, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }
  
  let coordL = getNeighborCoord(coord, -1, 0);
  let coordR = getNeighborCoord(coord, 1, 0);
  let coordB = getNeighborCoord(coord, 0, -1);
  let coordT = getNeighborCoord(coord, 0, 1);
  
  let obsL = isObstacle(coordL);
  let obsR = isObstacle(coordR);
  let obsB = isObstacle(coordB);
  let obsT = isObstacle(coordT);
  
  let pC = textureLoad(pressureTextureIn, coord, 0).x;
  let pL = select(textureLoad(pressureTextureIn, coordL, 0).x, pC, obsL);
  let pR = select(textureLoad(pressureTextureIn, coordR, 0).x, pC, obsR);
  let pB = select(textureLoad(pressureTextureIn, coordB, 0).x, pC, obsB);
  let pT = select(textureLoad(pressureTextureIn, coordT, 0).x, pC, obsT);
  
  let grad = vec2f(pR - pL, pT - pB) * 0.5;
  let velocity = textureLoad(velocityTextureIn, coord, 0).xy - grad;
  
  textureStore(velocityTextureOut, coord, vec4f(velocity, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn splat(@builtin(global_invocation_id) id: vec3u) {
  initParams();
  let coord = vec2u(id.xy);
  
  if (!checkBounds(coord)) { return; }
  
  if (isObstacle(coord)) {
    textureStore(velocityTextureOut, coord, vec4f(0.0, 0.0, 0.0, 0.0));
    textureStore(densityTextureOut, coord, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }
  
  let uv = (vec2f(coord) + vec2f(0.5)) * texelSize;
  let dist = distance(uv, splatData.position);
  let radiusSq = splatData.radius * splatData.radius;
  
  if (dist * dist < radiusSq * 4.0) {
    let influence = exp(-dist * dist / radiusSq);
    
    if (influence > 0.001) {
      let velocity = textureLoad(velocityTextureIn, coord, 0).xy;
      let density = textureLoad(densityTextureIn, coord, 0).x;
      
      let newVelocity = velocity + splatData.velocity * influence * splatData.strength * uniforms.timeStep;
      let newDensity = density + influence * 5.0;
      
      textureStore(velocityTextureOut, coord, vec4f(newVelocity, 0.0, 0.0));
      textureStore(densityTextureOut, coord, vec4f(newDensity, 0.0, 0.0, 0.0));
    } else {
      textureStore(velocityTextureOut, coord, textureLoad(velocityTextureIn, coord, 0));
      textureStore(densityTextureOut, coord, textureLoad(densityTextureIn, coord, 0));
    }
  } else {
    textureStore(velocityTextureOut, coord, textureLoad(velocityTextureIn, coord, 0));
    textureStore(densityTextureOut, coord, textureLoad(densityTextureIn, coord, 0));
  }
}
