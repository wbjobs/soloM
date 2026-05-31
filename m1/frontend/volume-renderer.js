const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_texCoord;

void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

varying vec2 v_texCoord;

uniform sampler2D u_volume;
uniform sampler2D u_transferFunc;
uniform vec3 u_volumeSize;
uniform vec3 u_voxelSize;
uniform mat4 u_invModelView;
uniform float u_stepSize;
uniform float u_opacityScale;
uniform float u_ambient;
uniform float u_diffuse;
uniform float u_specular;
uniform float u_shininess;
uniform vec3 u_lightDir;
uniform int u_renderMode;
uniform float u_threshold;
uniform float u_windowCenter;
uniform float u_windowWidth;
uniform float u_slicesPerRow;
uniform vec2 u_texSize;

struct Ray {
    vec3 origin;
    vec3 direction;
};

struct AABB {
    vec3 min;
    vec3 max;
};

bool intersectAABB(Ray ray, AABB box, out float tNear, out float tFar) {
    vec3 invDir = 1.0 / ray.direction;
    vec3 t1 = (box.min - ray.origin) * invDir;
    vec3 t2 = (box.max - ray.origin) * invDir;

    vec3 tMin = min(t1, t2);
    vec3 tMax = max(t1, t2);

    tNear = max(max(tMin.x, tMin.y), tMin.z);
    tFar = min(min(tMax.x, tMax.y), tMax.z);

    return tFar > tNear && tFar > 0.0;
}

vec3 alignToVolume(vec3 pos) {
    vec3 aspect = u_voxelSize * u_volumeSize;
    float maxDim = max(aspect.x, max(aspect.y, aspect.z));
    vec3 scale = aspect / maxDim;
    return (pos / scale + 1.0) * 0.5;
}

float sampleVolume(vec3 pos) {
    if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0 || pos.z < 0.0 || pos.z > 1.0) {
        return 0.0;
    }

    float zIndex = floor(pos.z * u_volumeSize.z);
    zIndex = clamp(zIndex, 0.0, u_volumeSize.z - 1.0);

    float row = floor(zIndex / u_slicesPerRow);
    float col = mod(zIndex, u_slicesPerRow);

    float tileWidth = u_volumeSize.x / u_texSize.x;
    float tileHeight = u_volumeSize.y / u_texSize.y;

    float offsetX = col * tileWidth;
    float offsetY = row * tileHeight;

    vec2 texCoord = vec2(
        offsetX + pos.x * tileWidth,
        offsetY + pos.y * tileHeight
    );

    return texture2D(u_volume, texCoord).r;
}

vec4 sampleTransferFunction(float value) {
    return texture2D(u_transferFunc, vec2(value, 0.5));
}

vec3 computeGradient(vec3 pos, float step) {
    float dx = sampleVolume(pos + vec3(step, 0.0, 0.0)) - sampleVolume(pos - vec3(step, 0.0, 0.0));
    float dy = sampleVolume(pos + vec3(0.0, step, 0.0)) - sampleVolume(pos - vec3(0.0, step, 0.0));
    float dz = sampleVolume(pos + vec3(0.0, 0.0, step)) - sampleVolume(pos - vec3(0.0, 0.0, step));
    return normalize(vec3(dx, dy, dz));
}

vec3 phongShading(vec3 normal, vec3 viewDir, vec3 color) {
    vec3 lightDir = normalize(u_lightDir);
    float nDotL = max(dot(normal, lightDir), 0.0);
    vec3 reflectDir = reflect(-lightDir, normal);
    float rDotV = max(dot(reflectDir, viewDir), 0.0);

    vec3 ambient = u_ambient * color;
    vec3 diffuse = u_diffuse * nDotL * color;
    vec3 specular = u_specular * pow(rDotV, u_shininess) * vec3(1.0);

    return ambient + diffuse + specular;
}

void main() {
    vec4 cameraPos = u_invModelView * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 cameraDir = u_invModelView * vec4(0.0, 0.0, -1.0, 0.0);

    Ray ray;
    ray.origin = cameraPos.xyz;
    ray.direction = normalize(cameraDir.xyz);

    AABB box;
    box.min = vec3(-1.0);
    box.max = vec3(1.0);

    float tNear, tFar;
    if (!intersectAABB(ray, box, tNear, tFar)) {
        gl_FragColor = vec4(0.05, 0.05, 0.05, 1.0);
        return;
    }

    tNear = max(tNear, 0.0);

    vec3 aspect = u_voxelSize * u_volumeSize;
    float maxDim = max(aspect.x, max(aspect.y, aspect.z));
    vec3 scale = aspect / maxDim;

    vec4 colorAccum = vec4(0.0);
    float depthAccum = 0.0;

    float step = u_stepSize;
    int maxSteps = int(3.0 / step);

    for (int i = 0; i < 512; i++) {
        if (i >= maxSteps) break;
        if (colorAccum.a > 0.95) break;

        float t = tNear + float(i) * step;
        if (t > tFar) break;

        vec3 pos = ray.origin + ray.direction * t;
        vec3 volPos = (pos / scale + 1.0) * 0.5;

        float intensity = sampleVolume(volPos);

        if (u_renderMode == 1) {
            float wc = u_windowCenter / 255.0;
            float ww = u_windowWidth / 255.0;
            float lo = wc - ww * 0.5;
            float hi = wc + ww * 0.5;
            intensity = clamp((intensity - lo) / max(hi - lo, 0.001), 0.0, 1.0);
        }

        vec4 tfColor = sampleTransferFunction(intensity);

        if (intensity < u_threshold) {
            tfColor.a = 0.0;
        }

        tfColor.a *= u_opacityScale;

        if (tfColor.a > 0.01) {
            if (u_renderMode == 0 || u_renderMode == 1) {
                vec3 normal = computeGradient(volPos, 1.0 / max(u_volumeSize.x, max(u_volumeSize.y, u_volumeSize.z)));
                vec3 shaded = phongShading(normal, -ray.direction, tfColor.rgb);
                tfColor.rgb = shaded;
            }

            tfColor.a *= step * 10.0;
            tfColor.rgb *= tfColor.a;
            colorAccum += tfColor * (1.0 - colorAccum.a);
            depthAccum = t;
        }
    }

    colorAccum.rgb += vec3(0.05) * (1.0 - colorAccum.a);
    colorAccum.a = 1.0;

    gl_FragColor = colorAccum;
}
`;

const TRANSFER_VERTEX = `
attribute vec2 a_position;
varying vec2 v_texCoord;

void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const TRANSFER_FRAGMENT = `
precision highp float;
varying vec2 v_texCoord;

uniform vec4 u_controlPoints[8];
uniform int u_numControlPoints;
uniform int u_colorMode;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    float x = v_texCoord.x;

    vec4 color = vec4(0.0);

    if (u_numControlPoints <= 0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    if (x <= u_controlPoints[0].x) {
        color = vec4(u_controlPoints[0].yzw, u_controlPoints[0].w > 0.0 ? 0.0 : 0.0);
        color.a = 0.0;
    } else if (x >= u_controlPoints[u_numControlPoints - 1].x) {
        vec4 cp = u_controlPoints[u_numControlPoints - 1];
        color = vec4(cp.y, cp.z, cp.w, cp.w);
    }

    for (int i = 0; i < 7; i++) {
        if (i >= u_numControlPoints - 1) break;
        float x0 = u_controlPoints[i].x;
        float x1 = u_controlPoints[i + 1].x;
        if (x >= x0 && x <= x1) {
            float t = (x - x0) / max(x1 - x0, 0.001);
            t = t * t * (3.0 - 2.0 * t);

            vec4 c0 = u_controlPoints[i];
            vec4 c1 = u_controlPoints[i + 1];

            color.r = mix(c0.y, c1.y, t);
            color.g = mix(c0.z, c1.z, t);
            color.b = mix(c0.w, c1.w, t);
            color.a = mix(c0.w, c1.w, t);
            break;
        }
    }

    gl_FragColor = color;
}
`;

export class VolumeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });

    if (!this.gl) {
      throw new Error('WebGL not supported');
    }

    this.volumeTexture = null;
    this.transferTexture = null;
    this.program = null;
    this.transferProgram = null;

    this.rotationX = -0.4;
    this.rotationY = 0.3;
    this.zoom = 2.5;

    this.stepSize = 0.008;
    this.opacityScale = 1.0;
    this.ambient = 0.3;
    this.diffuse = 0.6;
    this.specular = 0.2;
    this.shininess = 16.0;
    this.lightDir = [0.5, 0.8, 1.0];
    this.renderMode = 0;
    this.threshold = 0.02;
    this.windowCenter = 128;
    this.windowWidth = 256;

    this.controlPoints = [
      { x: 0.0, r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
      { x: 0.15, r: 0.0, g: 0.0, b: 0.2, a: 0.0 },
      { x: 0.3, r: 0.1, g: 0.2, b: 0.6, a: 0.15 },
      { x: 0.5, r: 0.3, g: 0.5, b: 0.8, a: 0.35 },
      { x: 0.7, r: 0.8, g: 0.7, b: 0.4, a: 0.55 },
      { x: 0.85, r: 1.0, g: 0.9, b: 0.7, a: 0.75 },
      { x: 1.0, r: 1.0, g: 1.0, b: 1.0, a: 0.9 },
    ];

    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.animationId = null;
    this.needsRender = true;

    this.volumeInfo = null;

    this._initShaders();
    this._initBuffers();
    this._initTransferFunction();
    this._initEvents();

    this._renderLoop();
  }

  _initShaders() {
    this.program = this._createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    this.transferProgram = this._createProgram(TRANSFER_VERTEX, TRANSFER_FRAGMENT);
  }

  _createProgram(vsSource, fsSource) {
    const gl = this.gl;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('VS:', gl.getShaderInfoLog(vs));
      throw new Error('Vertex shader compile error');
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('FS:', gl.getShaderInfoLog(fs));
      throw new Error('Fragment shader compile error');
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Link:', gl.getProgramInfoLog(program));
      throw new Error('Program link error');
    }

    return program;
  }

  _initBuffers() {
    const gl = this.gl;
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  }

  _initTransferFunction() {
    const gl = this.gl;

    this.transferFBO = gl.createFramebuffer();
    this.transferTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.transferTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    this._updateTransferFunction();
  }

  _updateTransferFunction() {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.transferFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.transferTexture, 0);

    gl.viewport(0, 0, 256, 1);
    gl.useProgram(this.transferProgram);

    const posLoc = gl.getAttribLocation(this.transferProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const cpData = new Float32Array(8 * 4);
    for (let i = 0; i < this.controlPoints.length && i < 8; i++) {
      const cp = this.controlPoints[i];
      cpData[i * 4 + 0] = cp.x;
      cpData[i * 4 + 1] = cp.r;
      cpData[i * 4 + 2] = cp.g;
      cpData[i * 4 + 3] = cp.b;
    }

    for (let i = 0; i < 8; i++) {
      const loc = gl.getUniformLocation(this.transferProgram, `u_controlPoints[${i}]`);
      gl.uniform4f(loc, cpData[i * 4], cpData[i * 4 + 1], cpData[i * 4 + 2], cpData[i * 4 + 3]);
    }

    gl.uniform1i(gl.getUniformLocation(this.transferProgram, 'u_numControlPoints'), this.controlPoints.length);
    gl.uniform1i(gl.getUniformLocation(this.transferProgram, 'u_colorMode'), 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _initEvents() {
    this.canvas.addEventListener('mousedown', this._onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this._onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this._onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this._onWheel.bind(this), { passive: false });

    this.canvas.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd.bind(this));
  }

  _onMouseDown(e) {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  _onMouseMove(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.rotationY += dx * 0.008;
    this.rotationX += dy * 0.008;
    this.rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotationX));
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.needsRender = true;
  }

  _onMouseUp() {
    this.isDragging = false;
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.05 : 0.95;
    this.zoom = Math.max(1.2, Math.min(8.0, this.zoom * delta));
    this.needsRender = true;
  }

  _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && this.isDragging) {
      const dx = e.touches[0].clientX - this.lastMouseX;
      const dy = e.touches[0].clientY - this.lastMouseY;
      this.rotationY += dx * 0.008;
      this.rotationX += dy * 0.008;
      this.rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotationX));
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;
      this.needsRender = true;
    }
  }

  _onTouchEnd() {
    this.isDragging = false;
  }

  loadVolume(volumeData, volumeInfo) {
    const gl = this.gl;

    this.volumeInfo = volumeInfo;

    if (this.volumeTexture) {
      gl.deleteTexture(this.volumeTexture);
    }

    const maxDim = Math.max(volumeInfo.width, volumeInfo.height, volumeInfo.depth);
    const texWidth = maxDim;
    const texHeight = maxDim;
    const slicesPerRow = Math.floor(texWidth / volumeInfo.width);
    const numRows = Math.ceil(volumeInfo.depth / slicesPerRow);

    const texData = new Uint8Array(texWidth * texHeight * 4);

    for (let z = 0; z < volumeInfo.depth; z++) {
      const row = Math.floor(z / slicesPerRow);
      const col = z % slicesPerRow;
      const offsetX = col * volumeInfo.width;
      const offsetY = row * volumeInfo.height;

      for (let y = 0; y < volumeInfo.height; y++) {
        for (let x = 0; x < volumeInfo.width; x++) {
          const srcIdx = (z * volumeInfo.height + y) * volumeInfo.width + x;
          const dstIdx = ((offsetY + y) * texWidth + (offsetX + x)) * 4;
          const val = volumeData[srcIdx] || 0;
          texData[dstIdx] = val;
          texData[dstIdx + 1] = val;
          texData[dstIdx + 2] = val;
          texData[dstIdx + 3] = 255;
        }
      }
    }

    this.volumeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.volumeTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.setParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texWidth, texHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, texData);

    this.slicesPerRow = slicesPerRow;
    this.texWidth = texWidth;
    this.texHeight = texHeight;

    console.log(`Volume texture created: ${texWidth}x${texHeight}, ${slicesPerRow} slices/row`);
    this.needsRender = true;
  }

  _getModelViewMatrix() {
    const cx = Math.cos(this.rotationX);
    const sx = Math.sin(this.rotationX);
    const cy = Math.cos(this.rotationY);
    const sy = Math.sin(this.rotationY);

    const rx = [
      1, 0, 0, 0,
      0, cx, -sx, 0,
      0, sx, cx, 0,
      0, 0, 0, 1,
    ];

    const ry = [
      cy, 0, sy, 0,
      0, 1, 0, 0,
      -sy, 0, cy, 0,
      0, 0, 0, 1,
    ];

    const tz = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, -this.zoom, 1,
    ];

    const mv = this._mulMat4(tz, this._mulMat4(ry, rx));

    return this._invertMat4(mv);
  }

  _mulMat4(a, b) {
    const r = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        r[j * 4 + i] = 0;
        for (let k = 0; k < 4; k++) {
          r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
        }
      }
    }
    return r;
  }

  _invertMat4(m) {
    const inv = new Float32Array(16);
    const out = new Float32Array(16);

    inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
    inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
    inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
    inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
    inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
    inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
    inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
    inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
    inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
    inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
    inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
    inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
    inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
    inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
    inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
    inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];

    let det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
    if (Math.abs(det) < 1e-10) return new Float32Array(16);

    det = 1.0 / det;
    for (let i = 0; i < 16; i++) out[i] = inv[i] * det;
    return out;
  }

  render() {
    if (!this.volumeTexture) return;

    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;

    gl.viewport(0, 0, w, h);
    gl.clearColor(0.05, 0.05, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.volumeTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_volume'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.transferTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_transferFunc'), 1);

    const vi = this.volumeInfo;
    gl.uniform3f(gl.getUniformLocation(this.program, 'u_volumeSize'), vi.width, vi.height, vi.depth);
    gl.uniform3f(gl.getUniformLocation(this.program, 'u_voxelSize'), vi.voxel_size[0], vi.voxel_size[1], vi.voxel_size[2]);

    const invMV = this._getModelViewMatrix();
    gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_invModelView'), false, invMV);

    gl.uniform1f(gl.getUniformLocation(this.program, 'u_stepSize'), this.stepSize);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_opacityScale'), this.opacityScale);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_ambient'), this.ambient);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_diffuse'), this.diffuse);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_specular'), this.specular);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_shininess'), this.shininess);
    gl.uniform3f(gl.getUniformLocation(this.program, 'u_lightDir'), this.lightDir[0], this.lightDir[1], this.lightDir[2]);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_renderMode'), this.renderMode);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_threshold'), this.threshold);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_windowCenter'), this.windowCenter);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_windowWidth'), this.windowWidth);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_slicesPerRow'), this.slicesPerRow || 1.0);
    gl.uniform2f(gl.getUniformLocation(this.program, 'u_texSize'), this.texWidth || 1.0, this.texHeight || 1.0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _renderLoop() {
    if (this.needsRender) {
      this.render();
      this.needsRender = false;
    }
    this.animationId = requestAnimationFrame(() => this._renderLoop());
  }

  setRotation(rx, ry) {
    this.rotationX = rx;
    this.rotationY = ry;
    this.needsRender = true;
  }

  setZoom(z) {
    this.zoom = Math.max(1.2, Math.min(8.0, z));
    this.needsRender = true;
  }

  setStepSize(s) {
    this.stepSize = s;
    this.needsRender = true;
  }

  setOpacityScale(o) {
    this.opacityScale = o;
    this.needsRender = true;
  }

  setThreshold(t) {
    this.threshold = t;
    this.needsRender = true;
  }

  setRenderMode(m) {
    this.renderMode = m;
    this.needsRender = true;
  }

  setLighting(ambient, diffuse, specular, shininess) {
    this.ambient = ambient;
    this.diffuse = diffuse;
    this.specular = specular;
    this.shininess = shininess;
    this.needsRender = true;
  }

  setWindow(center, width) {
    this.windowCenter = center;
    this.windowWidth = width;
    this.needsRender = true;
  }

  setControlPoints(points) {
    this.controlPoints = points;
    this._updateTransferFunction();
    this.needsRender = true;
  }

  applyPreset(preset) {
    const presets = {
      default: [
        { x: 0.0, r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        { x: 0.15, r: 0.0, g: 0.0, b: 0.2, a: 0.0 },
        { x: 0.3, r: 0.1, g: 0.2, b: 0.6, a: 0.15 },
        { x: 0.5, r: 0.3, g: 0.5, b: 0.8, a: 0.35 },
        { x: 0.7, r: 0.8, g: 0.7, b: 0.4, a: 0.55 },
        { x: 0.85, r: 1.0, g: 0.9, b: 0.7, a: 0.75 },
        { x: 1.0, r: 1.0, g: 1.0, b: 1.0, a: 0.9 },
      ],
      bone: [
        { x: 0.0, r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        { x: 0.3, r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        { x: 0.5, r: 0.8, g: 0.7, b: 0.5, a: 0.4 },
        { x: 0.7, r: 0.95, g: 0.9, b: 0.8, a: 0.7 },
        { x: 1.0, r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
      ],
      soft: [
        { x: 0.0, r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        { x: 0.2, r: 0.6, g: 0.1, b: 0.1, a: 0.2 },
        { x: 0.4, r: 0.8, g: 0.3, b: 0.1, a: 0.5 },
        { x: 0.6, r: 0.9, g: 0.5, b: 0.2, a: 0.6 },
        { x: 0.8, r: 1.0, g: 0.7, b: 0.4, a: 0.5 },
        { x: 1.0, r: 1.0, g: 0.9, b: 0.7, a: 0.3 },
      ],
      mip: [
        { x: 0.0, r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        { x: 0.3, r: 0.1, g: 0.1, b: 0.2, a: 0.05 },
        { x: 0.5, r: 0.3, g: 0.3, b: 0.5, a: 0.15 },
        { x: 0.7, r: 0.6, g: 0.6, b: 0.8, a: 0.4 },
        { x: 0.9, r: 0.9, g: 0.9, b: 1.0, a: 0.8 },
        { x: 1.0, r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
      ],
    };

    if (presets[preset]) {
      this.setControlPoints(presets[preset]);
    }
  }

  resetView() {
    this.rotationX = -0.4;
    this.rotationY = 0.3;
    this.zoom = 2.5;
    this.needsRender = true;
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    const gl = this.gl;
    if (this.volumeTexture) gl.deleteTexture(this.volumeTexture);
    if (this.transferTexture) gl.deleteTexture(this.transferTexture);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.program) gl.deleteProgram(this.program);
    if (this.transferProgram) gl.deleteProgram(this.transferProgram);
    if (this.transferFBO) gl.deleteFramebuffer(this.transferFBO);
  }
}
