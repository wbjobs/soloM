import { SimParams, PARTICLE_SIZE, defaultParams } from './types';

import sphHashShader from './shaders/sph_hash.wgsl?raw';
import sphDensityShader from './shaders/sph_density.wgsl?raw';
import sphForceShader from './shaders/sph_force.wgsl?raw';
import sphRenderShader from './shaders/sph_render.wgsl?raw';

export class SPHSimulator {
    private device!: GPUDevice;
    private context!: GPUCanvasContext;
    private canvas: HTMLCanvasElement;
    
    private params: SimParams;
    private isRunning: boolean = false;
    
    private particleBuffer!: GPUBuffer;
    private sortedIndicesBuffer!: GPUBuffer;
    private cellStartBuffer!: GPUBuffer;
    private cellEndBuffer!: GPUBuffer;
    private simParamsBuffer!: GPUBuffer;
    private renderUniformsBuffer!: GPUBuffer;
    
    private hashPipeline!: GPUComputePipeline;
    private resetCellPipeline!: GPUComputePipeline;
    private findCellPipeline!: GPUComputePipeline;
    private densityPipeline!: GPUComputePipeline;
    private forcePipeline!: GPUComputePipeline;
    private integratePipeline!: GPUComputePipeline;
    private renderPipeline!: GPURenderPipeline;
    
    private computeBindGroup!: GPUBindGroup;
    private renderBindGroup!: GPUBindGroup;
    
    private workgroupSize: number = 256;
    private cellTableSize: number = 1024 * 1024;
    
    private frameCount: number = 0;
    private lastFpsTime: number = 0;
    private fps: number = 0;
    private computeTime: number = 0;
    
    private onStatsUpdate?: (stats: { fps: number; particles: number; computeTime: number }) => void;
    
    private lastMousePos: [number, number] = [0, 0];
    private currentMousePos: [number, number] = [0, 0];
    private isMouseDown: boolean = false;
    private mouseEventListeners: (() => void)[] = [];
    
    constructor(canvas: HTMLCanvasElement, params?: Partial<SimParams>) {
        this.canvas = canvas;
        this.params = { ...defaultParams, ...params };
    }
    
    async init(): Promise<void> {
        if (!navigator.gpu) {
            throw new Error('WebGPU is not supported');
        }
        
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('Failed to get GPU adapter');
        }
        
        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu')!;
        
        const format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format,
            alphaMode: 'premultiplied'
        });
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.createBuffers();
        this.createPipelines(format);
        this.createBindGroups();
        this.initParticles();
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
        
        const aspect = this.canvas.width / this.canvas.height;
        const height = 2;
        const width = height * aspect;
        this.params.boundaryMax = [width, height];
        
        if (this.renderUniformsBuffer) {
            this.updateRenderUniforms();
        }
    }
    
    private createBuffers(): void {
        const numParticles = this.params.numParticles;
        const particleBufferSize = numParticles * PARTICLE_SIZE;
        
        this.particleBuffer = this.device.createBuffer({
            size: particleBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        
        this.sortedIndicesBuffer = this.device.createBuffer({
            size: numParticles * 8,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        this.cellStartBuffer = this.device.createBuffer({
            size: this.cellTableSize * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        this.cellEndBuffer = this.device.createBuffer({
            size: this.cellTableSize * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        this.simParamsBuffer = this.device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.renderUniformsBuffer = this.device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.updateSimParams();
        this.updateRenderUniforms();
    }
    
    private updateSimParams(): void {
        const data = new Float32Array([
            this.params.gravity,
            this.params.viscosity,
            this.params.particleRadius,
            this.params.restDensity,
            this.params.smoothingLength,
            this.params.stiffness,
            this.params.dt,
            this.params.numParticles,
            this.params.boundaryMin[0],
            this.params.boundaryMin[1],
            this.params.boundaryMax[0],
            this.params.boundaryMax[1],
            this.params.mousePos[0],
            this.params.mousePos[1],
            this.params.mouseVel[0],
            this.params.mouseVel[1],
            this.params.mouseRadius,
            this.params.mouseStrength,
            this.params.mouseActive
        ]);
        
        this.device.queue.writeBuffer(this.simParamsBuffer, 0, data);
    }
    
    private updateRenderUniforms(): void {
        const data = new Float32Array([
            this.canvas.width,
            this.canvas.height,
            this.params.particleRadius * Math.min(this.canvas.width, this.canvas.height) / 2
        ]);
        
        this.device.queue.writeBuffer(this.renderUniformsBuffer, 0, data);
    }
    
    private createPipelines(format: GPUTextureFormat): void {
        const simBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
            ]
        });
        
        const simPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [simBindGroupLayout]
        });
        
        this.hashPipeline = this.device.createComputePipeline({
            layout: simPipelineLayout,
            compute: { module: this.device.createShaderModule({ code: sphHashShader }), entryPoint: 'computeHash' }
        });
        
        this.resetCellPipeline = this.device.createComputePipeline({
            layout: simPipelineLayout,
            compute: { module: this.device.createShaderModule({ code: sphHashShader }), entryPoint: 'resetCellStart' }
        });
        
        this.findCellPipeline = this.device.createComputePipeline({
            layout: simPipelineLayout,
            compute: { module: this.device.createShaderModule({ code: sphHashShader }), entryPoint: 'findCellStartEnd' }
        });
        
        this.densityPipeline = this.device.createComputePipeline({
            layout: simPipelineLayout,
            compute: { module: this.device.createShaderModule({ code: sphDensityShader }), entryPoint: 'computeDensityPressure' }
        });
        
        this.forcePipeline = this.device.createComputePipeline({
            layout: simPipelineLayout,
            compute: { module: this.device.createShaderModule({ code: sphForceShader }), entryPoint: 'computeForces' }
        });
        
        this.integratePipeline = this.device.createComputePipeline({
            layout: simPipelineLayout,
            compute: { module: this.device.createShaderModule({ code: sphForceShader }), entryPoint: 'integrate' }
        });
        
        const renderBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
            ]
        });
        
        const renderPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [renderBindGroupLayout]
        });
        
        this.renderPipeline = this.device.createRenderPipeline({
            layout: renderPipelineLayout,
            vertex: { module: this.device.createShaderModule({ code: sphRenderShader }), entryPoint: 'vertexMain' },
            fragment: {
                module: this.device.createShaderModule({ code: sphRenderShader }),
                entryPoint: 'fragmentMain',
                targets: [{ format, blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }}]
            },
            primitive: { topology: 'triangle-list' }
        });
    }
    
    private createBindGroups(): void {
        this.computeBindGroup = this.device.createBindGroup({
            layout: this.hashPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.simParamsBuffer } },
                { binding: 1, resource: { buffer: this.particleBuffer } },
                { binding: 2, resource: { buffer: this.sortedIndicesBuffer } },
                { binding: 3, resource: { buffer: this.cellStartBuffer } },
                { binding: 4, resource: { buffer: this.cellEndBuffer } }
            ]
        });
        
        this.renderBindGroup = this.device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.renderUniformsBuffer } },
                { binding: 1, resource: { buffer: this.particleBuffer } }
            ]
        });
    }
    
    private initParticles(): void {
        const numParticles = this.params.numParticles;
        const data = new Float32Array(numParticles * (2 + 2 + 1 + 1 + 3));
        
        const [minX, minY] = this.params.boundaryMin;
        const [maxX, maxY] = this.params.boundaryMax;
        const radius = this.params.particleRadius;
        
        const rows = Math.floor(Math.sqrt(numParticles * (maxX - minX) / (maxY - minY)));
        const cols = Math.ceil(numParticles / rows);
        const spacing = Math.min((maxX - minX) / (cols + 2), (maxY - minY) / (rows + 2));
        
        let idx = 0;
        for (let i = 0; i < rows && idx < numParticles; i++) {
            for (let j = 0; j < cols && idx < numParticles; j++) {
                const baseIdx = idx * (2 + 2 + 1 + 1 + 3);
                
                data[baseIdx + 0] = minX + (j + 1) * spacing + (Math.random() - 0.5) * radius * 0.5;
                data[baseIdx + 1] = minY + (i + 1) * spacing + (Math.random() - 0.5) * radius * 0.5;
                
                data[baseIdx + 2] = (Math.random() - 0.5) * 0.1;
                data[baseIdx + 3] = (Math.random() - 0.5) * 0.1;
                
                data[baseIdx + 4] = this.params.restDensity;
                data[baseIdx + 5] = 0;
                
                data[baseIdx + 6] = 0.0;
                data[baseIdx + 7] = 0.5;
                data[baseIdx + 8] = 1.0;
                
                idx++;
            }
        }
        
        this.device.queue.writeBuffer(this.particleBuffer, 0, data);
    }
    
    setOnStatsUpdate(callback: (stats: { fps: number; particles: number; computeTime: number }) => void): void {
        this.onStatsUpdate = callback;
    }
    
    updateParams(params: Partial<SimParams>): void {
        const needRecreate = params.numParticles !== undefined && params.numParticles !== this.params.numParticles;
        
        this.params = { ...this.params, ...params };
        
        if (needRecreate) {
            this.createBuffers();
            this.createBindGroups();
            this.initParticles();
        }
        
        this.updateSimParams();
        this.updateRenderUniforms();
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
    }
    
    reset(): void {
        this.initParticles();
    }
    
    private animate(): void {
        if (!this.isRunning) return;
        
        const startTime = performance.now();
        
        this.updateSimParams();
        
        const computeEncoder = this.device.createCommandEncoder();
        
        const hashPass = computeEncoder.beginComputePass();
        hashPass.setPipeline(this.hashPipeline);
        hashPass.setBindGroup(0, this.computeBindGroup);
        hashPass.dispatchWorkgroups(Math.ceil(this.params.numParticles / this.workgroupSize));
        hashPass.end();
        
        const resetPass = computeEncoder.beginComputePass();
        resetPass.setPipeline(this.resetCellPipeline);
        resetPass.setBindGroup(0, this.computeBindGroup);
        resetPass.dispatchWorkgroups(Math.ceil(this.cellTableSize / this.workgroupSize));
        resetPass.end();
        
        const cellPass = computeEncoder.beginComputePass();
        cellPass.setPipeline(this.findCellPipeline);
        cellPass.setBindGroup(0, this.computeBindGroup);
        cellPass.dispatchWorkgroups(1);
        cellPass.end();
        
        const densityPass = computeEncoder.beginComputePass();
        densityPass.setPipeline(this.densityPipeline);
        densityPass.setBindGroup(0, this.computeBindGroup);
        densityPass.dispatchWorkgroups(Math.ceil(this.params.numParticles / this.workgroupSize));
        densityPass.end();
        
        const forcePass = computeEncoder.beginComputePass();
        forcePass.setPipeline(this.forcePipeline);
        forcePass.setBindGroup(0, this.computeBindGroup);
        forcePass.dispatchWorkgroups(Math.ceil(this.params.numParticles / this.workgroupSize));
        forcePass.end();
        
        const integratePass = computeEncoder.beginComputePass();
        integratePass.setPipeline(this.integratePipeline);
        integratePass.setBindGroup(0, this.computeBindGroup);
        integratePass.dispatchWorkgroups(Math.ceil(this.params.numParticles / this.workgroupSize));
        integratePass.end();
        
        const renderEncoder = this.device.createCommandEncoder();
        
        const renderPass = renderEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroup);
        renderPass.draw(6, this.params.numParticles);
        renderPass.end();
        
        this.device.queue.submit([computeEncoder.finish(), renderEncoder.finish()]);
        
        this.computeTime = performance.now() - startTime;
        
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
                    computeTime: this.computeTime
                });
            }
        }
        
        requestAnimationFrame(() => this.animate());
    }
    
    async getParticleData(): Promise<{ positions: number[][]; colors: number[][] }> {
        await this.particleBuffer.mapAsync(GPUMapMode.READ);
        const data = new Float32Array(this.particleBuffer.getMappedRange());
        
        const positions: number[][] = [];
        const colors: number[][] = [];
        
        const stride = 2 + 2 + 1 + 1 + 3;
        for (let i = 0; i < this.params.numParticles; i++) {
            const baseIdx = i * stride;
            positions.push([data[baseIdx], data[baseIdx + 1], 0]);
            colors.push([data[baseIdx + 6], data[baseIdx + 7], data[baseIdx + 8]]);
        }
        
        this.particleBuffer.unmap();
        
        return { positions, colors };
    }
}
