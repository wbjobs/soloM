import { SimParams, defaultParams } from './types';

export class WebGLRenderer {
    private gl!: WebGL2RenderingContext;
    private canvas: HTMLCanvasElement;
    private program!: WebGLProgram;
    private params: SimParams;
    private particles!: Float32Array;
    private isRunning: boolean = false;
    private animationId: number = 0;
    private onStatsUpdate?: (stats: { fps: number; particles: number; computeTime: number }) => void;
    private frameCount: number = 0;
    private lastFpsTime: number = 0;
    private fps: number = 0;
    private positionBuffer: WebGLBuffer | null = null;
    private colorBuffer: WebGLBuffer | null = null;
    private lastMousePos: [number, number] = [0, 0];
    private currentMousePos: [number, number] = [0, 0];
    private isMouseDown: boolean = false;
    private mouseEventListeners: (() => void)[] = [];

    constructor(canvas: HTMLCanvasElement, params?: Partial<SimParams>) {
        this.canvas = canvas;
        this.params = { ...defaultParams, ...params };
    }

    async init(): Promise<void> {
        const numParticles = Math.min(this.params.numParticles, 10000);
        this.params.numParticles = numParticles;
        
        this.particles = new Float32Array(numParticles * (2 + 2 + 1 + 1 + 3));
        
        const gl = this.canvas.getContext('webgl2');
        if (!gl) {
            throw new Error('WebGL 2.0 not supported');
        }
        this.gl = gl;
        
        this.positionBuffer = gl.createBuffer();
        this.colorBuffer = gl.createBuffer();
        
        this.initParticles();
        this.createShaderProgram();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupMouseInteraction();
    }

    private setupMouseInteraction(): void {
        const handleMouseMove = (e: MouseEvent) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width * this.params.boundaryMax[0];
            const y = (1 - (e.clientY - rect.top) / rect.height) * this.params.boundaryMax[1];
            
            this.lastMousePos = [...this.currentMousePos];
            this.currentMousePos = [x, y];
            
            if (this.isMouseDown) {
                this.params.mousePos = [x, y];
                this.params.mouseVel = [
                    (x - this.lastMousePos[0]) * 60,
                    (y - this.lastMousePos[1]) * 60
                ];
                this.params.mouseActive = 1;
            }
        };
        
        const handleMouseDown = (e: MouseEvent) => {
            this.isMouseDown = true;
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width * this.params.boundaryMax[0];
            const y = (1 - (e.clientY - rect.top) / rect.height) * this.params.boundaryMax[1];
            this.currentMousePos = [x, y];
            this.lastMousePos = [x, y];
            this.params.mousePos = [x, y];
            this.params.mouseActive = 1;
        };
        
        const handleMouseUp = () => {
            this.isMouseDown = false;
            this.params.mouseActive = 0;
            this.params.mouseVel = [0, 0];
        };
        
        const handleMouseLeave = () => {
            this.isMouseDown = false;
            this.params.mouseActive = 0;
            this.params.mouseVel = [0, 0];
        };
        
        this.canvas.addEventListener('mousemove', handleMouseMove);
        this.canvas.addEventListener('mousedown', handleMouseDown);
        this.canvas.addEventListener('mouseup', handleMouseUp);
        this.canvas.addEventListener('mouseleave', handleMouseLeave);
        
        this.mouseEventListeners.push(() => {
            this.canvas.removeEventListener('mousemove', handleMouseMove);
            this.canvas.removeEventListener('mousedown', handleMouseDown);
            this.canvas.removeEventListener('mouseup', handleMouseUp);
            this.canvas.removeEventListener('mouseleave', handleMouseLeave);
        });
    }

    private resize(): void {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.canvas.clientWidth * dpr;
        this.canvas.height = this.canvas.clientHeight * dpr;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        const aspect = this.canvas.width / this.canvas.height;
        const height = 2;
        const width = height * aspect;
        this.params.boundaryMax = [width, height];
    }

    private initParticles(): void {
        const numParticles = this.params.numParticles;
        const [minX, minY] = this.params.boundaryMin;
        const [maxX, maxY] = this.params.boundaryMax;
        const radius = this.params.particleRadius;
        
        const rows = Math.floor(Math.sqrt(numParticles * (maxX - minX) / (maxY - minY)));
        const cols = Math.ceil(numParticles / rows);
        const spacing = Math.min((maxX - minX) / (cols + 2), (maxY - minY) / (rows + 2));
        
        let idx = 0;
        const stride = 2 + 2 + 1 + 1 + 3;
        
        for (let i = 0; i < rows && idx < numParticles; i++) {
            for (let j = 0; j < cols && idx < numParticles; j++) {
                const baseIdx = idx * stride;
                
                this.particles[baseIdx + 0] = minX + (j + 1) * spacing + (Math.random() - 0.5) * radius * 0.5;
                this.particles[baseIdx + 1] = minY + (i + 1) * spacing + (Math.random() - 0.5) * radius * 0.5;
                
                this.particles[baseIdx + 2] = (Math.random() - 0.5) * 0.1;
                this.particles[baseIdx + 3] = (Math.random() - 0.5) * 0.1;
                
                this.particles[baseIdx + 4] = this.params.restDensity;
                this.particles[baseIdx + 5] = 0;
                
                this.particles[baseIdx + 6] = 0.0;
                this.particles[baseIdx + 7] = 0.5;
                this.particles[baseIdx + 8] = 1.0;
                
                idx++;
            }
        }
    }

    private createShaderProgram(): void {
        const gl = this.gl;
        
        const vsSource = `#version 300 es
            in vec2 a_position;
            in vec3 a_color;
            uniform vec2 u_resolution;
            uniform float u_particleSize;
            out vec3 v_color;
            void main() {
                vec2 clipSpace = (a_position / u_resolution * 2.0 - 1.0) * vec2(1.0, -1.0);
                gl_Position = vec4(clipSpace, 0.0, 1.0);
                gl_PointSize = u_particleSize;
                v_color = a_color;
            }
        `;
        
        const fsSource = `#version 300 es
            precision mediump float;
            in vec3 v_color;
            out vec4 fragColor;
            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                float alpha = smoothstep(0.5, 0.25, dist);
                fragColor = vec4(v_color, alpha);
            }
        `;
        
        const vs = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);
        
        const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);
        
        this.program = gl.createProgram()!;
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
    }

    setOnStatsUpdate(callback: (stats: { fps: number; particles: number; computeTime: number }) => void): void {
        this.onStatsUpdate = callback;
    }

    updateParams(params: Partial<SimParams>): void {
        const needRecreate = params.numParticles !== undefined && params.numParticles !== this.params.numParticles;
        
        this.params = { ...this.params, ...params };
        this.params.numParticles = Math.min(this.params.numParticles, 10000);
        
        if (needRecreate) {
            this.particles = new Float32Array(this.params.numParticles * (2 + 2 + 1 + 1 + 3));
            this.initParticles();
        }
    }

    getParams(): SimParams {
        return { ...this.params };
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastFpsTime = performance.now();
        this.frameCount = 0;
        this.animate();
    }

    stop(): void {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }

    reset(): void {
        this.initParticles();
    }

    private poly6Kernel(r: number, h: number): number {
        if (r > h) return 0;
        const h2 = h * h;
        const r2 = r * r;
        const diff = h2 - r2;
        return (315.0 / (64.0 * Math.PI * Math.pow(h, 9))) * diff * diff * diff;
    }

    private animate(): void {
        if (!this.isRunning) return;
        
        const startTime = performance.now();
        
        this.simulate();
        this.render();
        
        const computeTime = performance.now() - startTime;
        
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.lastFpsTime));
            this.frameCount = 0;
            this.lastFpsTime = now;
            
            if (this.onStatsUpdate) {
                this.onStatsUpdate({
                    fps: this.fps,
                    particles: this.params.numParticles,
                    computeTime
                });
            }
        }
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    private simulate(): void {
        const numParticles = this.params.numParticles;
        const stride = 2 + 2 + 1 + 1 + 3;
        const h = this.params.smoothingLength;
        const dt = this.params.dt * 5;
        const gravity = this.params.gravity;
        const viscosity = this.params.viscosity;
        const stiffness = this.params.stiffness;
        const restDensity = this.params.restDensity;
        const radius = this.params.particleRadius;
        const [minX, minY] = this.params.boundaryMin;
        const [maxX, maxY] = this.params.boundaryMax;
        
        const densities = new Float32Array(numParticles);
        const pressures = new Float32Array(numParticles);
        
        for (let i = 0; i < numParticles; i++) {
            const baseIdx = i * stride;
            const px = this.particles[baseIdx];
            const py = this.particles[baseIdx + 1];
            
            let density = 0;
            
            for (let j = 0; j < numParticles; j++) {
                const jBase = j * stride;
                const jx = this.particles[jBase];
                const jy = this.particles[jBase + 1];
                const dx = px - jx;
                const dy = py - jy;
                const r = Math.sqrt(dx * dx + dy * dy);
                if (r < h) {
                    density += this.poly6Kernel(r, h);
                }
            }
            
            densities[i] = density;
            pressures[i] = stiffness * Math.max(density - restDensity, 0);
        }
        
        for (let i = 0; i < numParticles; i++) {
            const baseIdx = i * stride;
            const px = this.particles[baseIdx];
            const py = this.particles[baseIdx + 1];
            const vx = this.particles[baseIdx + 2];
            const vy = this.particles[baseIdx + 3];
            
            let fx = 0;
            let fy = 0;
            const den_i = densities[i];
            const pre_i = pressures[i];
            
            for (let j = 0; j < numParticles; j++) {
                if (i === j) continue;
                const jBase = j * stride;
                const jx = this.particles[jBase];
                const jy = this.particles[jBase + 1];
                const jvx = this.particles[jBase + 2];
                const jvy = this.particles[jBase + 3];
                const den_j = densities[j];
                const pre_j = pressures[j];
                
                const dx = px - jx;
                const dy = py - jy;
                const r = Math.sqrt(dx * dx + dy * dy);
                
                if (r < h && r > 0.0001) {
                    const diff = h - r;
                    const factor = -45.0 / (Math.PI * Math.pow(h, 6)) * diff * diff;
                    const gradX = (dx / r) * factor;
                    const gradY = (dy / r) * factor;
                    
                    const pTerm = (pre_i / (den_i * den_i)) + (pre_j / (den_j * den_j));
                    fx += pTerm * gradX;
                    fy += pTerm * gradY;
                    
                    const viscFactor = 45.0 / (Math.PI * Math.pow(h, 6)) * (h - r) / den_j;
                    fx += viscosity * (jvx - vx) * viscFactor;
                    fy += viscosity * (jvy - vy) * viscFactor;
                }
            }
            
            fx *= -den_i;
            fy *= -den_i;
            
            let mfx = 0;
            let mfy = 0;
            if (this.params.mouseActive === 1) {
                const dx = this.params.mousePos[0] - px;
                const dy = this.params.mousePos[1] - py;
                const distToMouse = Math.sqrt(dx * dx + dy * dy);
                
                if (distToMouse < this.params.mouseRadius && distToMouse > 0.0001) {
                    const falloff = 1 - (distToMouse / this.params.mouseRadius);
                    const falloffSq = falloff * falloff;
                    
                    const vdx = this.params.mouseVel[0] - vx;
                    const vdy = this.params.mouseVel[1] - vy;
                    mfx = vdx * falloffSq * this.params.mouseStrength * den_i;
                    mfy = vdy * falloffSq * this.params.mouseStrength * den_i;
                    
                    const pushX = (dx / distToMouse) * falloffSq * this.params.mouseStrength * 0.5 * den_i;
                    const pushY = (dy / distToMouse) * falloffSq * this.params.mouseStrength * 0.5 * den_i;
                    mfx += pushX;
                    mfy += pushY;
                }
            }
            
            fy += gravity * den_i;
            
            const ax = (fx + mfx) / (den_i + 0.001);
            const ay = (fy + mfy) / (den_i + 0.001);
            
            let newVx = vx + ax * dt;
            let newVy = vy + ay * dt;
            
            let newPx = px + newVx * dt;
            let newPy = py + newVy * dt;
            
            const minPosX = minX + radius;
            const minPosY = minY + radius;
            const maxPosX = maxX - radius;
            const maxPosY = maxY - radius;
            const bounce = 0.3;
            const friction = 0.98;
            
            if (newPx < minPosX) {
                newPx = minPosX;
                newVx = Math.abs(newVx) * bounce;
            }
            if (newPx > maxPosX) {
                newPx = maxPosX;
                newVx = -Math.abs(newVx) * bounce;
            }
            if (newPy < minPosY) {
                newPy = minPosY;
                newVy = Math.abs(newVy) * bounce;
            }
            if (newPy > maxPosY) {
                newPy = maxPosY;
                newVy = -Math.abs(newVy) * bounce;
            }
            
            newVx *= friction;
            newVy *= friction;
            
            const speed = Math.sqrt(newVx * newVx + newVy * newVy);
            const maxSpeed = 5.0;
            if (speed > maxSpeed) {
                newVx = (newVx / speed) * maxSpeed;
                newVy = (newVy / speed) * maxSpeed;
            }
            
            this.particles[baseIdx] = newPx;
            this.particles[baseIdx + 1] = newPy;
            this.particles[baseIdx + 2] = newVx;
            this.particles[baseIdx + 3] = newVy;
            
            const t = Math.min(speed * 0.1, 1.0);
            this.particles[baseIdx + 6] = 0.0 + (1.0 - 0.0) * t;
            this.particles[baseIdx + 7] = 0.5 + (0.8 - 0.5) * t;
            this.particles[baseIdx + 8] = 1.0 + (0.2 - 1.0) * t;
        }
    }

    private render(): void {
        const gl = this.gl;
        const numParticles = this.params.numParticles;
        const stride = 2 + 2 + 1 + 1 + 3;
        
        gl.clearColor(0.05, 0.05, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        gl.useProgram(this.program);
        
        const posLoc = gl.getAttribLocation(this.program, 'a_position');
        const colorLoc = gl.getAttribLocation(this.program, 'a_color');
        
        const resolutionLoc = gl.getUniformLocation(this.program, 'u_resolution');
        const sizeLoc = gl.getUniformLocation(this.program, 'u_particleSize');
        
        gl.uniform2f(resolutionLoc, this.canvas.width, this.canvas.height);
        gl.uniform1f(sizeLoc, this.params.particleRadius * Math.min(this.canvas.width, this.canvas.height) / 2 * 2);
        
        const positions = new Float32Array(numParticles * 2);
        for (let i = 0; i < numParticles; i++) {
            positions[i * 2] = this.particles[i * stride];
            positions[i * 2 + 1] = this.particles[i * stride + 1];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        const colors = new Float32Array(numParticles * 3);
        for (let i = 0; i < numParticles; i++) {
            colors[i * 3] = this.particles[i * stride + 6];
            colors[i * 3 + 1] = this.particles[i * stride + 7];
            colors[i * 3 + 2] = this.particles[i * stride + 8];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.POINTS, 0, numParticles);
    }

    async getParticleData(): Promise<{ positions: number[][]; colors: number[][] }> {
        const numParticles = this.params.numParticles;
        const stride = 2 + 2 + 1 + 1 + 3;
        const positions: number[][] = [];
        const colors: number[][] = [];
        
        for (let i = 0; i < numParticles; i++) {
            const baseIdx = i * stride;
            positions.push([this.particles[baseIdx], this.particles[baseIdx + 1], 0]);
            colors.push([this.particles[baseIdx + 6], this.particles[baseIdx + 7], this.particles[baseIdx + 8]]);
        }
        
        return { positions, colors };
    }
}
