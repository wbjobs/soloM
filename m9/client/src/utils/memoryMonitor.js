class MemoryMonitor {
  constructor() {
    this.stats = {
      gpuMemoryEstimate: 0,
      featureCount: 0,
      vertexCount: 0,
      drawCalls: 0,
      fps: 60,
      frameTime: 0,
      qualityLevel: 'high'
    };
    this.history = [];
    this.maxHistoryLength = 60;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fpsUpdateInterval = 1000;
    this.lastFpsUpdate = performance.now();
    this.callbacks = [];
  }

  static getInstance() {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  onUpdate(callback) {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  notifyCallbacks() {
    this.callbacks.forEach(cb => cb(this.stats));
  }

  updateFrame() {
    const now = performance.now();
    this.frameCount++;
    
    const delta = now - this.lastFrameTime;
    this.stats.frameTime = delta;
    this.lastFrameTime = now;

    if (now - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.stats.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;

      this.history.push({ ...this.stats, timestamp: now });
      if (this.history.length > this.maxHistoryLength) {
        this.history.shift();
      }

      this.autoAdjustQuality();
      this.notifyCallbacks();
    }
  }

  estimateGPUMemory(features, layerType) {
    let bytes = 0;

    for (const feature of features) {
      if (feature.geometry?.type === 'Polygon') {
        const coords = feature.geometry.coordinates?.[0] || feature.geometry.coordinates || [];
        const vertexCount = coords.length;
        bytes += vertexCount * (3 * 4 + 4 * 1);
        bytes += 256;
      } else if (feature.geometry?.type === 'LineString') {
        const coords = feature.geometry.coordinates || [];
        const segmentCount = coords.length - 1;
        bytes += segmentCount * 6 * (3 * 4 + 4 * 1);
        bytes += 128;
      }
    }

    return bytes;
  }

  updateFeatureStats(buildings, pipes, lodLevel) {
    let totalVertices = 0;
    let totalMemory = 0;
    let featureCount = 0;

    if (buildings) {
      const buildingMem = this.estimateGPUMemory(buildings, 'polygon');
      totalMemory += buildingMem;
      featureCount += buildings.length;
      totalVertices += buildings.reduce((sum, f) => {
        const coords = f.geometry?.coordinates?.[0] || f.geometry?.coordinates || [];
        return sum + coords.length;
      }, 0);
    }

    if (pipes) {
      const pipeMem = this.estimateGPUMemory(pipes, 'line');
      totalMemory += pipeMem * 2;
      featureCount += pipes.length;
      totalVertices += pipes.reduce((sum, f) => {
        const coords = f.geometry?.coordinates || [];
        return sum + (coords.length - 1) * 6;
      }, 0);
    }

    this.stats.gpuMemoryEstimate = totalMemory;
    this.stats.vertexCount = totalVertices;
    this.stats.featureCount = featureCount;
    this.stats.lodLevel = lodLevel;
  }

  autoAdjustQuality() {
    const { fps, gpuMemoryEstimate } = this.stats;
    const memoryMB = gpuMemoryEstimate / (1024 * 1024);

    if (fps < 20 || memoryMB > 500) {
      if (this.stats.qualityLevel === 'high') {
        this.stats.qualityLevel = 'medium';
        console.warn('Performance: Reducing quality to MEDIUM due to low FPS or high memory usage');
      } else if (this.stats.qualityLevel === 'medium') {
        this.stats.qualityLevel = 'low';
        console.warn('Performance: Reducing quality to LOW due to low FPS or high memory usage');
      } else if (this.stats.qualityLevel === 'low') {
        this.stats.qualityLevel = 'verylow';
        console.warn('Performance: Reducing quality to VERY LOW due to critical resource usage');
      }
    } else if (fps > 50 && memoryMB < 200) {
      if (this.stats.qualityLevel === 'verylow') {
        this.stats.qualityLevel = 'low';
        console.info('Performance: Increasing quality to LOW');
      } else if (this.stats.qualityLevel === 'low') {
        this.stats.qualityLevel = 'medium';
        console.info('Performance: Increasing quality to MEDIUM');
      } else if (this.stats.qualityLevel === 'medium') {
        this.stats.qualityLevel = 'high';
        console.info('Performance: Increasing quality to HIGH');
      }
    }
  }

  getStats() {
    return { ...this.stats };
  }

  getHistory() {
    return [...this.history];
  }

  getFormattedStats() {
    const { gpuMemoryEstimate, featureCount, vertexCount, fps, frameTime, qualityLevel } = this.stats;
    return {
      memory: `${(gpuMemoryEstimate / (1024 * 1024)).toFixed(1)} MB`,
      features: featureCount.toLocaleString(),
      vertices: vertexCount.toLocaleString(),
      fps: `${fps} FPS`,
      frameTime: `${frameTime.toFixed(1)} ms`,
      quality: qualityLevel.toUpperCase()
    };
  }

  shouldRenderOutline() {
    return this.stats.qualityLevel === 'high' || this.stats.qualityLevel === 'medium';
  }

  shouldRenderGlow() {
    return this.stats.qualityLevel === 'high';
  }

  getMaxFeatures() {
    switch (this.stats.qualityLevel) {
      case 'high': return Infinity;
      case 'medium': return 5000;
      case 'low': return 2000;
      case 'verylow': return 800;
      default: return Infinity;
    }
  }

  reset() {
    this.stats = {
      gpuMemoryEstimate: 0,
      featureCount: 0,
      vertexCount: 0,
      drawCalls: 0,
      fps: 60,
      frameTime: 0,
      qualityLevel: 'high'
    };
    this.history = [];
  }
}

const memoryMonitor = MemoryMonitor.getInstance();

export default memoryMonitor;
export { MemoryMonitor };
