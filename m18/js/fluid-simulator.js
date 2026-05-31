class FluidSimulator {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.initialResolution = options.resolution || 512;
    this.options = {
      resolution: this.initialResolution,
      timeStep: options.timeStep || 0.016,
      velocityDissipation: options.velocityDissipation || 0.985,
      densityDissipation: options.densityDissipation || 0.996,
      pressureIterations: options.pressureIterations || 12,
      splatRadius: options.splatRadius || 0.015,
      splatStrength: options.splatStrength || 8000,
      obstacleRadius: options.obstacleRadius || 0.03,
    };

    this.minResolution = 256;
    this.maxResolution = 1024;
    this.targetFps = 60;
    this.resolutionAdjustmentThreshold = 3;
    this.lowFpsCount = 0;
    this.highFpsCount = 0;

    this.device = null;
    this.context = null;
    this.presentationFormat = null;

    this.velocityTextures = [];
    this.densityTextures = [];
    this.pressureTextures = [];
    this.divergenceTexture = null;
    this.obstacleTexture = null;

    this.uniformBuffer = null;
    this.splatBuffer = null;
    this.sampler = null;

    this.uniformBindGroup = null;
    this.renderBindGroup = null;

    this.computeBindGroupLayout = null;
    this.renderBindGroupLayout = null;

    this.computeBindGroups = {
      ping: null,
      pong: null,
    };

    this.computePipelines = {};
    this.renderPipeline = null;

    this.commandEncoder = null;

    this.obstacleData = null;
    this.obstacleDirty = false;

    this.mouse = {
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      velocityX: 0,
      velocityY: 0,
      predictedX: 0,
      predictedY: 0,
      isDown: false,
      lastUpdateTime: 0,
    };

    this.interactionMode = 'fluid';
    this.pendingSplats = [];
    this.pendingObstacleDraws = [];

    this.animationId = null;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.fps = 0;
    this.frameTime = 0;
    this.onFpsUpdate = null;
    this.onResolutionChange = null;
  }

  async init() {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser.');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No GPU adapter found.');
    }

    this.device = await adapter.requestDevice({ requiredFeatures: [] });

    this.context = this.canvas.getContext('webgpu');
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.presentationFormat,
      alphaMode: 'premultiplied',
    });

    this.obstacleData = new Float32Array(this.options.resolution * this.options.resolution);

    await this.loadShaders();
    this.createSampler();
    this.createTextures();
    this.createBuffers();
    this.createBindGroupLayouts();
    this.createPipelines();
    this.createBindGroups();
    this.setupEventListeners();

    this.clearTextures();
    this.uploadObstacleTexture();
  }

  async loadShaders() {
    const [computeResponse, renderResponse] = await Promise.all([
      fetch('shaders/compute.wgsl'),
      fetch('shaders/render.wgsl'),
    ]);
    this.computeShaderCode = await computeResponse.text();
    this.renderShaderCode = await renderResponse.text();
  }

  createSampler() {
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  createTexture(format, width = this.options.resolution, height = this.options.resolution) {
    return this.device.createTexture({
      size: { width, height },
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }

  createTextures() {
    this.velocityTextures = [
      this.createTexture('rg32float'),
      this.createTexture('rg32float'),
    ];
    this.densityTextures = [
      this.createTexture('r32float'),
      this.createTexture('r32float'),
    ];
    this.pressureTextures = [
      this.createTexture('r32float'),
      this.createTexture('r32float'),
    ];
    this.divergenceTexture = this.createTexture('r32float');
    this.obstacleTexture = this.createTexture('r32float');
  }

  createBuffers() {
    this.uniformBuffer = this.device.createBuffer({
      size: 5 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.splatBuffer = this.device.createBuffer({
      size: 6 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  createBindGroupLayouts() {
    this.uniformBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });

    this.computeBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rg32float', access: 'write-only' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'r32float', access: 'write-only' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'r32float', access: 'write-only' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'r32float', access: 'write-only' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      ],
    });

    this.renderBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
  }

  createPipelines() {
    const computeModule = this.device.createShaderModule({ code: this.computeShaderCode });
    const renderModule = this.device.createShaderModule({ code: this.renderShaderCode });

    const computePipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.uniformBindGroupLayout, this.computeBindGroupLayout],
    });

    const computeEntries = [
      'advectionVelocity', 'advectionDensity', 'divergence',
      'pressureSolve', 'gradientSubtract', 'splat'
    ];

    for (const entry of computeEntries) {
      this.computePipelines[entry] = this.device.createComputePipeline({
        layout: computePipelineLayout,
        compute: { module: computeModule, entryPoint: entry },
      });
    }

    this.renderPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.renderBindGroupLayout],
      }),
      vertex: { module: renderModule, entryPoint: 'vs_main' },
      fragment: {
        module: renderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.presentationFormat }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  createBindGroups() {
    this.uniformBindGroup = this.device.createBindGroup({
      layout: this.uniformBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.splatBuffer } },
      ],
    });

    this.updateComputeBindGroups();
    this.updateRenderBindGroup();
  }

  updateComputeBindGroups() {
    const obstacleView = this.obstacleTexture.createView();

    this.computeBindGroups.ping = this.device.createBindGroup({
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: this.velocityTextures[0].createView() },
        { binding: 1, resource: this.velocityTextures[1].createView() },
        { binding: 2, resource: this.densityTextures[0].createView() },
        { binding: 3, resource: this.densityTextures[1].createView() },
        { binding: 4, resource: this.pressureTextures[0].createView() },
        { binding: 5, resource: this.pressureTextures[1].createView() },
        { binding: 6, resource: this.divergenceTexture.createView() },
        { binding: 7, resource: obstacleView },
      ],
    });

    this.computeBindGroups.pong = this.device.createBindGroup({
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: this.velocityTextures[1].createView() },
        { binding: 1, resource: this.velocityTextures[0].createView() },
        { binding: 2, resource: this.densityTextures[1].createView() },
        { binding: 3, resource: this.densityTextures[0].createView() },
        { binding: 4, resource: this.pressureTextures[1].createView() },
        { binding: 5, resource: this.pressureTextures[0].createView() },
        { binding: 6, resource: this.divergenceTexture.createView() },
        { binding: 7, resource: obstacleView },
      ],
    });

    this.currentComputeBindGroup = 'ping';
  }

  updateRenderBindGroup() {
    this.renderBindGroup = this.device.createBindGroup({
      layout: this.renderBindGroupLayout,
      entries: [
        { binding: 0, resource: this.densityTextures[0].createView() },
        { binding: 1, resource: this.velocityTextures[0].createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: this.obstacleTexture.createView() },
      ],
    });
  }

  clearTextures() {
    const encoder = this.device.createCommandEncoder();
    const zeroData = new Float32Array(this.options.resolution * this.options.resolution * 4);

    for (let i = 0; i < 2; i++) {
      this.writeTextureData(encoder, this.velocityTextures[i], zeroData, 2);
      this.writeTextureData(encoder, this.densityTextures[i], zeroData, 1);
      this.writeTextureData(encoder, this.pressureTextures[i], zeroData, 1);
    }
    this.writeTextureData(encoder, this.divergenceTexture, zeroData, 1);
    this.writeTextureData(encoder, this.obstacleTexture, zeroData, 1);

    this.device.queue.submit([encoder.finish()]);
  }

  writeTextureData(encoder, texture, data, components) {
    const bytesPerRow = this.options.resolution * components * 4;
    const buffer = this.device.createBuffer({
      size: data.length * 4,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();

    encoder.copyBufferToTexture(
      { buffer, bytesPerRow },
      { texture },
      { width: this.options.resolution, height: this.options.resolution }
    );
  }

  uploadObstacleTexture() {
    const res = this.options.resolution;
    const uploadData = new Float32Array(res * res);
    for (let i = 0; i < res * res; i++) {
      uploadData[i] = this.obstacleData[i] || 0;
    }

    const bytesPerRow = res * 4;
    this.device.queue.writeTexture(
      { texture: this.obstacleTexture },
      uploadData,
      { bytesPerRow, rowsPerImage: res },
      { width: res, height: res }
    );
  }

  processObstacleDraws() {
    if (this.pendingObstacleDraws.length === 0) return;

    const res = this.options.resolution;

    for (const draw of this.pendingObstacleDraws) {
      const cx = draw.x * res;
      const cy = draw.y * res;
      const r = draw.radius * res;

      const x0 = Math.max(0, Math.floor(cx - r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const x1 = Math.min(res - 1, Math.ceil(cx + r));
      const y1 = Math.min(res - 1, Math.ceil(cy + r));

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r) {
            if (draw.mode > 0.5) {
              this.obstacleData[y * res + x] = 1.0;
            } else {
              this.obstacleData[y * res + x] = 0.0;
            }
          }
        }
      }
    }

    this.pendingObstacleDraws = [];
    this.obstacleDirty = true;
  }

  setupEventListeners() {
    const handleMove = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const now = performance.now();
      const dt = Math.max((now - this.mouse.lastUpdateTime) / 1000, 0.001);
      this.mouse.lastUpdateTime = now;

      this.mouse.prevX = this.mouse.x;
      this.mouse.prevY = this.mouse.y;
      this.mouse.x = (clientX - rect.left) / rect.width;
      this.mouse.y = 1 - (clientY - rect.top) / rect.height;

      const dx = this.mouse.x - this.mouse.prevX;
      const dy = this.mouse.y - this.mouse.prevY;
      this.mouse.velocityX = dx / dt;
      this.mouse.velocityY = dy / dt;

      this.mouse.predictedX = this.mouse.x + this.mouse.velocityX * 0.016;
      this.mouse.predictedY = this.mouse.y + this.mouse.velocityY * 0.016;

      if (this.mouse.isDown) {
        if (this.interactionMode === 'obstacle') {
          this.pendingObstacleDraws.push({
            x: this.mouse.x,
            y: this.mouse.y,
            radius: this.options.obstacleRadius,
            mode: 1.0,
          });
        } else if (this.interactionMode === 'eraser') {
          this.pendingObstacleDraws.push({
            x: this.mouse.x,
            y: this.mouse.y,
            radius: this.options.obstacleRadius * 1.5,
            mode: 0.0,
          });
        } else {
          this.pendingSplats.push({
            x: this.mouse.predictedX,
            y: this.mouse.predictedY,
            dx: dx * 15,
            dy: dy * 15,
          });
        }
      }
    };

    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.mouse.isDown = true;
      handleMove(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      handleMove(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('mouseup', () => {
      this.mouse.isDown = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.isDown = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.mouse.isDown = true;
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    });

    this.canvas.addEventListener('touchend', () => {
      this.mouse.isDown = false;
    });
  }

  setInteractionMode(mode) {
    this.interactionMode = mode;
  }

  updateUniforms() {
    const uniformData = new Float32Array([
      this.options.resolution,
      this.options.resolution,
      this.options.timeStep,
      this.options.velocityDissipation,
      this.options.densityDissipation,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  updateSplatData(splat) {
    const splatData = new Float32Array([
      splat.x, splat.y, splat.dx, splat.dy,
      this.options.splatRadius, this.options.splatStrength,
    ]);
    this.device.queue.writeBuffer(this.splatBuffer, 0, splatData);
  }

  swapVelocity() { this.velocityTextures.reverse(); }
  swapDensity() { this.densityTextures.reverse(); }
  swapPressure() { this.pressureTextures.reverse(); }

  getComputeBindGroup() {
    return this.currentComputeBindGroup === 'ping'
      ? this.computeBindGroups.ping
      : this.computeBindGroups.pong;
  }

  toggleComputeBindGroup() {
    this.currentComputeBindGroup = this.currentComputeBindGroup === 'ping' ? 'pong' : 'ping';
  }

  dispatchCompute(pass, pipeline) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.uniformBindGroup);
    pass.setBindGroup(1, this.getComputeBindGroup());
    const workgroups = Math.ceil(this.options.resolution / 8);
    pass.dispatchWorkgroups(workgroups, workgroups);
  }

  processPendingSplats(pass) {
    if (this.pendingSplats.length === 0) return;
    for (const splat of this.pendingSplats) {
      this.updateSplatData(splat);
      this.dispatchCompute(pass, this.computePipelines.splat);
      this.swapVelocity();
      this.swapDensity();
      this.toggleComputeBindGroup();
    }
    this.pendingSplats = [];
  }

  step() {
    this.processObstacleDraws();

    if (this.obstacleDirty) {
      this.uploadObstacleTexture();
      this.obstacleDirty = false;
    }

    this.commandEncoder = this.device.createCommandEncoder();
    const computePass = this.commandEncoder.beginComputePass();

    this.dispatchCompute(computePass, this.computePipelines.advectionVelocity);
    this.swapVelocity();
    this.toggleComputeBindGroup();

    this.dispatchCompute(computePass, this.computePipelines.advectionDensity);
    this.swapDensity();
    this.toggleComputeBindGroup();

    this.processPendingSplats(computePass);

    this.dispatchCompute(computePass, this.computePipelines.divergence);
    this.toggleComputeBindGroup();

    for (let i = 0; i < this.options.pressureIterations; i++) {
      this.dispatchCompute(computePass, this.computePipelines.pressureSolve);
      this.swapPressure();
      this.toggleComputeBindGroup();
    }

    this.dispatchCompute(computePass, this.computePipelines.gradientSubtract);
    this.swapVelocity();
    this.toggleComputeBindGroup();

    computePass.end();
    this.device.queue.submit([this.commandEncoder.finish()]);
    this.commandEncoder = null;
  }

  render() {
    const encoder = this.device.createCommandEncoder();
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
      }],
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    renderPass.draw(6);
    renderPass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  updateFps() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFpsUpdate;

    if (elapsed >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameTime = elapsed / this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;

      if (this.onFpsUpdate) this.onFpsUpdate(this.fps);
      this.adaptiveResolution();
    }
  }

  adaptiveResolution() {
    if (this.fps < 30) {
      this.lowFpsCount++;
      this.highFpsCount = 0;
      if (this.lowFpsCount >= this.resolutionAdjustmentThreshold) {
        this.lowFpsCount = 0;
        this.downscaleResolution();
      }
    } else if (this.fps > 55 && this.options.resolution < this.initialResolution) {
      this.highFpsCount++;
      this.lowFpsCount = 0;
      if (this.highFpsCount >= this.resolutionAdjustmentThreshold * 2) {
        this.highFpsCount = 0;
        this.upscaleResolution();
      }
    } else {
      this.lowFpsCount = 0;
      this.highFpsCount = 0;
    }
  }

  downscaleResolution() {
    const newRes = Math.max(this.minResolution, this.options.resolution / 2);
    if (newRes !== this.options.resolution) this.changeResolution(newRes);
  }

  upscaleResolution() {
    const newRes = Math.min(this.initialResolution, this.options.resolution * 2);
    if (newRes !== this.options.resolution) this.changeResolution(newRes);
  }

  changeResolution(newResolution) {
    this.stop();
    this.options.resolution = newResolution;
    this.obstacleData = new Float32Array(newResolution * newResolution);
    this.createTextures();
    this.updateComputeBindGroups();
    this.updateRenderBindGroup();
    this.clearTextures();
    this.uploadObstacleTexture();
    if (this.onResolutionChange) this.onResolutionChange(newResolution);
    this.start();
  }

  addCircleObstacle(x, y, radius) {
    this.pendingObstacleDraws.push({
      x: x,
      y: y,
      radius: radius || this.options.obstacleRadius,
      mode: 1.0,
    });
  }

  clearObstacles() {
    this.obstacleData.fill(0);
    this.obstacleDirty = true;
  }

  animate() {
    const frameStartTime = performance.now();
    this.updateUniforms();
    this.step();
    this.render();
    this.updateFps();
    this.frameTime = performance.now() - frameStartTime;
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  start() { this.animate(); }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  reset() { this.clearTextures(); }
}

export default FluidSimulator;
