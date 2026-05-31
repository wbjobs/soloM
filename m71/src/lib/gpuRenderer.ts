import { DicomImage } from '@/types/dicom';

const VERTEX_SHADER = `#version 300 es
  in vec2 a_position;
  out vec2 v_texCoord;
  
  void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `#version 300 es
  precision highp float;
  
  in vec2 v_texCoord;
  out vec4 fragColor;
  
  uniform sampler2D u_texture;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform vec2 u_resolution;
  
  void main() {
    vec4 texColor = texture(u_texture, v_texCoord);
    
    float gray = texColor.r;
    
    gray = (gray - 0.5) * u_contrast + 0.5 + u_brightness;
    gray = clamp(gray, 0.0, 1.0);
    
    fragColor = vec4(gray, gray, gray, 1.0);
  }
`;

export class GPURenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private brightnessLocation: WebGLUniformLocation | null = null;
  private contrastLocation: WebGLUniformLocation | null = null;
  private textureWidth: number = 0;
  private textureHeight: number = 0;
  private canvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initWebGL();
  }

  private initWebGL(): void {
    if (!this.canvas) return;

    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      throw new Error('WebGL 2 not supported');
    }

    this.gl = gl;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) return;

    this.program = gl.createProgram();
    if (!this.program) return;

    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      return;
    }

    gl.useProgram(this.program);

    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.brightnessLocation = gl.getUniformLocation(this.program, 'u_brightness');
    this.contrastLocation = gl.getUniformLocation(this.program, 'u_contrast');

    const positions = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  setImageData(image: DicomImage, windowCenter: number, windowWidth: number): void {
    if (!this.gl || !this.texture || !this.canvas) return;

    const { columns, rows, pixelData, minPixelValue, maxPixelValue } = image;
    const lower = windowCenter - windowWidth / 2;
    const upper = windowCenter + windowWidth / 2;

    const pixels = new Uint8Array(columns * rows);
    const range = upper - lower;

    if (range <= 0) {
      pixels.fill(128);
    } else {
      const slope = image.rescaleSlope;
      const intercept = image.rescaleIntercept;

      for (let i = 0; i < columns * rows; i++) {
        const rawValue = pixelData[i];
        const rescaled = rawValue * slope + intercept;
        let normalized: number;

        if (rescaled <= lower) {
          normalized = 0;
        } else if (rescaled >= upper) {
          normalized = 255;
        } else {
          normalized = ((rescaled - lower) / range) * 255;
        }

        pixels[i] = Math.min(255, Math.max(0, Math.round(normalized)));
      }
    }

    this.textureWidth = columns;
    this.textureHeight = rows;

    this.canvas.width = columns;
    this.canvas.height = rows;
    this.gl.viewport(0, 0, columns, rows);

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.R8,
      columns,
      rows,
      0,
      this.gl.RED,
      this.gl.UNSIGNED_BYTE,
      pixels
    );
  }

  render(brightness: number, contrast: number): void {
    if (!this.gl || !this.program || !this.texture) return;

    this.gl.useProgram(this.program);

    this.gl.uniform1f(this.brightnessLocation, brightness);
    this.gl.uniform1f(this.contrastLocation, contrast);

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.gl) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  destroy(): void {
    if (!this.gl) return;

    if (this.program) this.gl.deleteProgram(this.program);
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);

    this.gl = null;
    this.program = null;
    this.texture = null;
    this.positionBuffer = null;
    this.canvas = null;
  }

  isSupported(): boolean {
    return !!this.gl && !!this.program;
  }
}
