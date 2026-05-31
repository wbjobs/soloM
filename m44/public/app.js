class FluidSolverJS {
    constructor(width, height, viscosity, diffusion, dt) {
        this.N = width;
        this.N_plus_2 = width + 2;
        this.size = (width + 2) * (height + 2);
        this.viscosity = viscosity;
        this.diffusion = diffusion;
        this.dt = dt;

        this.s = new Float32Array(this.size);
        this.density = new Float32Array(this.size);
        this.Vx = new Float32Array(this.size);
        this.Vy = new Float32Array(this.size);
        this.Vx0 = new Float32Array(this.size);
        this.Vy0 = new Float32Array(this.size);
        this.p = new Float32Array(this.size);
        this.div = new Float32Array(this.size);
        this.obstacles = new Uint8Array(this.size);
    }

    IX(x, y) {
        return x + y * this.N_plus_2;
    }

    addDensity(x, y, amount, radius) {
        const rSq = radius * radius;
        for (let i = -radius; i <= radius; i++) {
            for (let j = -radius; j <= radius; j++) {
                const px = x + i;
                const py = y + j;
                if (px >= 0 && px < this.N && py >= 0 && py < this.N) {
                    const distSq = i * i + j * j;
                    if (distSq <= rSq) {
                        const factor = 1.0 - Math.sqrt(distSq) / radius;
                        this.density[this.IX(px + 1, py + 1)] += amount * factor * factor;
                    }
                }
            }
        }
    }

    addVelocity(x, y, amountX, amountY, radius) {
        const rSq = radius * radius;
        for (let i = -radius; i <= radius; i++) {
            for (let j = -radius; j <= radius; j++) {
                const px = x + i;
                const py = y + j;
                if (px >= 0 && px < this.N && py >= 0 && py < this.N) {
                    const distSq = i * i + j * j;
                    if (distSq <= rSq) {
                        const factor = 1.0 - Math.sqrt(distSq) / radius;
                        this.Vx[this.IX(px + 1, py + 1)] += amountX * factor * factor;
                        this.Vy[this.IX(px + 1, py + 1)] += amountY * factor * factor;
                    }
                }
            }
        }
    }

    addObstacle(x, y, radius) {
        const rSq = radius * radius;
        for (let i = -radius; i <= radius; i++) {
            for (let j = -radius; j <= radius; j++) {
                const px = x + i;
                const py = y + j;
                if (px >= 0 && px < this.N && py >= 0 && py < this.N) {
                    const distSq = i * i + j * j;
                    if (distSq <= rSq) {
                        this.obstacles[this.IX(px + 1, py + 1)] = 1;
                    }
                }
            }
        }
    }

    removeObstacle(x, y, radius) {
        const rSq = radius * radius;
        for (let i = -radius; i <= radius; i++) {
            for (let j = -radius; j <= radius; j++) {
                const px = x + i;
                const py = y + j;
                if (px >= 0 && px < this.N && py >= 0 && py < this.N) {
                    const distSq = i * i + j * j;
                    if (distSq <= rSq) {
                        this.obstacles[this.IX(px + 1, py + 1)] = 0;
                    }
                }
            }
        }
    }

    clearObstacles() {
        this.obstacles.fill(0);
    }

    isObstacle(x, y) {
        if (x < 0 || x >= this.N || y < 0 || y >= this.N) return 1;
        return this.obstacles[this.IX(x + 1, y + 1)];
    }

    getObstacles() {
        return this.obstacles;
    }

    setBoundary(b, x) {
        const N = this.N;
        for (let i = 1; i <= N; i++) {
            x[this.IX(0, i)] = b === 1 ? -x[this.IX(1, i)] : x[this.IX(1, i)];
            x[this.IX(N + 1, i)] = b === 1 ? -x[this.IX(N, i)] : x[this.IX(N, i)];
            x[this.IX(i, 0)] = b === 2 ? -x[this.IX(i, 1)] : x[this.IX(i, 1)];
            x[this.IX(i, N + 1)] = b === 2 ? -x[this.IX(i, N)] : x[this.IX(i, N)];
        }
        x[this.IX(0, 0)] = 0.5 * (x[this.IX(1, 0)] + x[this.IX(0, 1)]);
        x[this.IX(0, N + 1)] = 0.5 * (x[this.IX(1, N + 1)] + x[this.IX(0, N)]);
        x[this.IX(N + 1, 0)] = 0.5 * (x[this.IX(N, 0)] + x[this.IX(N + 1, 1)]);
        x[this.IX(N + 1, N + 1)] = 0.5 * (x[this.IX(N, N + 1)] + x[this.IX(N + 1, N)]);
        
        this.applyObstacleBoundary(b, x);
    }

    applyObstacleBoundary(b, x) {
        const N = this.N;
        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                if (this.obstacles[this.IX(i, j)]) {
                    x[this.IX(i, j)] = 0;
                    
                    let avg = 0;
                    let count = 0;
                    
                    if (!this.obstacles[this.IX(i + 1, j)] && i + 1 <= N) {
                        avg += (b === 1) ? -x[this.IX(i + 1, j)] : x[this.IX(i + 1, j)];
                        count++;
                    }
                    if (!this.obstacles[this.IX(i - 1, j)] && i - 1 >= 1) {
                        avg += (b === 1) ? -x[this.IX(i - 1, j)] : x[this.IX(i - 1, j)];
                        count++;
                    }
                    if (!this.obstacles[this.IX(i, j + 1)] && j + 1 <= N) {
                        avg += (b === 2) ? -x[this.IX(i, j + 1)] : x[this.IX(i, j + 1)];
                        count++;
                    }
                    if (!this.obstacles[this.IX(i, j - 1)] && j - 1 >= 1) {
                        avg += (b === 2) ? -x[this.IX(i, j - 1)] : x[this.IX(i, j - 1)];
                        count++;
                    }
                    
                    if (count > 0) {
                        x[this.IX(i, j)] = avg / count;
                    }
                }
            }
        }
    }

    linSolve(b, x, x0, a, c) {
        const cRecip = 1.0 / c;
        const N = this.N;
        const iterations = N <= 128 ? 20 : (N <= 256 ? 15 : 10);
        for (let k = 0; k < iterations; k++) {
            for (let j = 1; j <= N; j++) {
                for (let i = 1; i <= N; i++) {
                    const idx = this.IX(i, j);
                    x[idx] = (x0[idx] + a * (
                        x[this.IX(i + 1, j)] + x[this.IX(i - 1, j)] +
                        x[this.IX(i, j + 1)] + x[this.IX(i, j - 1)]
                    )) * cRecip;
                }
            }
            this.setBoundary(b, x);
        }
    }

    diffuse(b, x, x0, diff) {
        const a = this.dt * diff * this.N * this.N;
        this.linSolve(b, x, x0, a, 1 + 4 * a);
    }

    project(velocX, velocY) {
        const N = this.N;
        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                this.div[this.IX(i, j)] = -0.5 * (
                    velocX[this.IX(i + 1, j)] - velocX[this.IX(i - 1, j)] +
                    velocY[this.IX(i, j + 1)] - velocY[this.IX(i, j - 1)]
                ) / N;
                this.p[this.IX(i, j)] = 0;
            }
        }
        this.setBoundary(0, this.div);
        this.setBoundary(0, this.p);
        this.linSolve(0, this.p, this.div, 1, 4);

        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                velocX[this.IX(i, j)] -= 0.5 * (this.p[this.IX(i + 1, j)] - this.p[this.IX(i - 1, j)]) * N;
                velocY[this.IX(i, j)] -= 0.5 * (this.p[this.IX(i, j + 1)] - this.p[this.IX(i, j - 1)]) * N;
            }
        }
        this.setBoundary(1, velocX);
        this.setBoundary(2, velocY);
    }

    advect(b, d, d0, velocX, velocY) {
        const dtx = this.dt * this.N;
        const dty = this.dt * this.N;
        const N = this.N;

        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                if (this.obstacles[this.IX(i, j)]) {
                    d[this.IX(i, j)] = 0;
                    continue;
                }
                
                let x = i - dtx * velocX[this.IX(i, j)];
                let y = j - dty * velocY[this.IX(i, j)];

                if (x < 0.5) x = 0.5;
                if (x > N + 0.5) x = N + 0.5;
                const i0 = Math.floor(x);
                const i1 = i0 + 1;

                if (y < 0.5) y = 0.5;
                if (y > N + 0.5) y = N + 0.5;
                const j0 = Math.floor(y);
                const j1 = j0 + 1;

                const s1 = x - i0;
                const s0 = 1 - s1;
                const t1 = y - j0;
                const t0 = 1 - t1;

                d[this.IX(i, j)] = s0 * (t0 * d0[this.IX(i0, j0)] + t1 * d0[this.IX(i0, j1)]) +
                                   s1 * (t0 * d0[this.IX(i1, j0)] + t1 * d0[this.IX(i1, j1)]);
            }
        }
        this.setBoundary(b, d);
    }

    step() {
        this.diffuse(1, this.Vx0, this.Vx, this.viscosity);
        this.diffuse(2, this.Vy0, this.Vy, this.viscosity);

        this.project(this.Vx0, this.Vy0);

        this.advect(1, this.Vx, this.Vx0, this.Vx0, this.Vy0);
        this.advect(2, this.Vy, this.Vy0, this.Vx0, this.Vy0);

        this.project(this.Vx, this.Vy);

        this.diffuse(0, this.s, this.density, this.diffusion);
        this.advect(0, this.density, this.s, this.Vx, this.Vy);

        for (let i = 0; i < this.size; i++) {
            this.density[i] *= 0.995;
            this.Vx[i] *= 0.999;
            this.Vy[i] *= 0.999;
        }

        for (let i = 0; i < this.size; i++) {
            if (this.obstacles[i]) {
                this.density[i] = 0;
                this.Vx[i] = 0;
                this.Vy[i] = 0;
            }
        }
    }

    reset() {
        this.s.fill(0);
        this.density.fill(0);
        this.Vx.fill(0);
        this.Vy.fill(0);
        this.Vx0.fill(0);
        this.Vy0.fill(0);
        this.p.fill(0);
        this.div.fill(0);
    }

    resetAll() {
        this.reset();
        this.obstacles.fill(0);
    }

    getDensity() {
        return this.density;
    }

    getVelocityX() {
        return this.Vx;
    }

    getVelocityY() {
        return this.Vy;
    }

    getWidth() {
        return this.N;
    }

    getHeight() {
        return this.N;
    }
}

class FluidSimulation {
    constructor() {
        this.canvas = document.getElementById('fluidCanvas');
        this.velocityCanvas = document.getElementById('velocityCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.velCtx = this.velocityCanvas.getContext('2d');
        
        this.resolution = 128;
        this.canvasSize = 512;
        
        this.canvas.width = this.canvasSize;
        this.canvas.height = this.canvasSize;
        this.velocityCanvas.width = this.canvasSize;
        this.velocityCanvas.height = this.canvasSize;
        
        this.solver = new FluidSolverJS(this.resolution, this.resolution, 0.0001, 0.00001, 0.2);
        
        this.isPaused = false;
        this.showVelocity = true;
        this.colorMode = true;
        
        this.mouseDown = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        this.brushSize = 10;
        this.densityAmount = 100;
        this.velocityAmount = 10;
        this.obstacleSize = 5;
        this.obstacleMode = false;
        
        this.mouseRightDown = false;
        
        this.frameCount = 0;
        this.lastFpsUpdate = Date.now();
        this.fps = 0;
        
        this.hue = 0;
        this.colorTable = new Uint8ClampedArray(256 * 4);
        this.updateColorTable();
        
        this.initControls();
        this.initMouse();
        this.animate();
    }
    
    updateColorTable() {
        for (let i = 0; i < 256; i++) {
            const hue = (i * 0.5) % 360;
            const [r, g, b] = this.hsvToRgb(hue / 360, 0.8, i / 255);
            this.colorTable[i * 4] = r;
            this.colorTable[i * 4 + 1] = g;
            this.colorTable[i * 4 + 2] = b;
            this.colorTable[i * 4 + 3] = 255;
        }
    }
    
    initControls() {
        const controls = {
            viscosity: { element: 'viscosity', value: 'viscosityValue', setter: (v) => this.solver.viscosity = parseFloat(v) },
            diffusion: { element: 'diffusion', value: 'diffusionValue', setter: (v) => this.solver.diffusion = parseFloat(v) },
            dt: { element: 'dt', value: 'dtValue', setter: (v) => this.solver.dt = parseFloat(v) },
            resolution: { element: 'resolution', value: 'resolutionValue', setter: (v) => this.setResolution(parseInt(v)) },
            brushSize: { element: 'brushSize', value: 'brushSizeValue', setter: (v) => this.brushSize = parseInt(v) },
            densityAmount: { element: 'densityAmount', value: 'densityAmountValue', setter: (v) => this.densityAmount = parseInt(v) },
            velocityAmount: { element: 'velocityAmount', value: 'velocityAmountValue', setter: (v) => this.velocityAmount = parseInt(v) },
            obstacleSize: { element: 'obstacleSize', value: 'obstacleSizeValue', setter: (v) => this.obstacleSize = parseInt(v) }
        };
        
        Object.keys(controls).forEach(key => {
            const control = controls[key];
            const element = document.getElementById(control.element);
            const valueElement = document.getElementById(control.value);
            
            element.addEventListener('input', (e) => {
                valueElement.textContent = e.target.value;
                control.setter(e.target.value);
            });
        });
        
        document.getElementById('showVelocity').addEventListener('change', (e) => {
            this.showVelocity = e.target.checked;
            this.velocityCanvas.style.display = this.showVelocity ? 'block' : 'none';
        });
        
        document.getElementById('colorMode').addEventListener('change', (e) => {
            this.colorMode = e.target.checked;
        });
        
        document.getElementById('obstacleMode').addEventListener('change', (e) => {
            this.obstacleMode = e.target.checked;
        });
        
        document.getElementById('resetBtn').addEventListener('click', () => this.solver.reset());
        document.getElementById('clearObstaclesBtn').addEventListener('click', () => this.solver.clearObstacles());
        document.getElementById('resetAllBtn').addEventListener('click', () => this.solver.resetAll());
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.isPaused = !this.isPaused;
            document.getElementById('pauseBtn').textContent = this.isPaused ? '继续' : '暂停';
        });
        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveConfig());
        document.getElementById('screenshotBtn').addEventListener('click', () => this.takeScreenshot());
        
        document.getElementById('presetJet').addEventListener('click', () => this.presetJet());
        document.getElementById('presetVortex').addEventListener('click', () => this.presetVortex());
        document.getElementById('presetExplosion').addEventListener('click', () => this.presetExplosion());
        document.getElementById('presetDamBreak').addEventListener('click', () => this.presetDamBreak());
    }
    
    setResolution(res) {
        if (res >= 384) {
            if (!confirm(`高分辨率 ${res}x${res} 可能会降低性能，是否继续？`)) {
                document.getElementById('resolution').value = this.resolution;
                document.getElementById('resolutionValue').textContent = this.resolution;
                return;
            }
        }
        this.resolution = res;
        this.solver = new FluidSolverJS(res, res, this.solver.viscosity, this.solver.diffusion, this.solver.dt);
        this.updateColorTable();
        document.getElementById('gridInfo').textContent = `${res}x${res}`;
    }
    
    initMouse() {
        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) * (this.resolution / rect.width);
            const mouseY = this.resolution - 1 - (e.clientY - rect.top) * (this.resolution / rect.height);
            
            if (e.button === 2 || this.obstacleMode) {
                this.mouseRightDown = true;
                const x = Math.floor(mouseX);
                const y = Math.floor(mouseY);
                this.solver.addObstacle(x, y, this.obstacleSize);
            } else {
                this.mouseDown = true;
            }
            
            this.lastMouseX = mouseX;
            this.lastMouseY = mouseY;
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            this.mouseDown = false;
            this.mouseRightDown = false;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.mouseDown = false;
            this.mouseRightDown = false;
        });
        
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) * (this.resolution / rect.width);
            const mouseY = this.resolution - 1 - (e.clientY - rect.top) * (this.resolution / rect.height);
            
            if (this.mouseRightDown) {
                const x = Math.floor(mouseX);
                const y = Math.floor(mouseY);
                this.solver.addObstacle(x, y, this.obstacleSize);
            } else if (this.mouseDown) {
                const dx = mouseX - this.lastMouseX;
                const dy = mouseY - this.lastMouseY;
                
                const x = Math.floor(mouseX);
                const y = Math.floor(mouseY);
                
                this.solver.addDensity(x, y, this.densityAmount, this.brushSize);
                this.solver.addVelocity(x, y, dx * this.velocityAmount, dy * this.velocityAmount, this.brushSize);
            }
            
            this.lastMouseX = mouseX;
            this.lastMouseY = mouseY;
        });
        
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.mouseDown = true;
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.lastMouseX = (touch.clientX - rect.left) * (this.resolution / rect.width);
            this.lastMouseY = this.resolution - 1 - (touch.clientY - rect.top) * (this.resolution / rect.height);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.mouseDown = false;
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.mouseDown) return;
            
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = (touch.clientX - rect.left) * (this.resolution / rect.width);
            const mouseY = this.resolution - 1 - (touch.clientY - rect.top) * (this.resolution / rect.height);
            
            const dx = mouseX - this.lastMouseX;
            const dy = mouseY - this.lastMouseY;
            
            const x = Math.floor(mouseX);
            const y = Math.floor(mouseY);
            
            this.solver.addDensity(x, y, this.densityAmount, this.brushSize);
            this.solver.addVelocity(x, y, dx * this.velocityAmount, dy * this.velocityAmount, this.brushSize);
            
            this.lastMouseX = mouseX;
            this.lastMouseY = mouseY;
        });
    }
    
    presetJet() {
        this.solver.reset();
        const centerX = Math.floor(this.resolution / 2);
        const centerY = Math.floor(this.resolution / 2);
        
        for (let i = 0; i < 50; i++) {
            this.solver.addDensity(centerX, centerY, 50, 5);
            this.solver.addVelocity(centerX, centerY, 20, -5, 5);
        }
    }
    
    presetVortex() {
        this.solver.reset();
        const centerX = Math.floor(this.resolution / 2);
        const centerY = Math.floor(this.resolution / 2);
        const radius = Math.floor(this.resolution / 4);
        
        for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            const vx = -Math.sin(angle) * 15;
            const vy = Math.cos(angle) * 15;
            
            this.solver.addDensity(Math.floor(x), Math.floor(y), 30, 3);
            this.solver.addVelocity(Math.floor(x), Math.floor(y), vx, vy, 3);
        }
    }
    
    presetExplosion() {
        this.solver.reset();
        const centerX = Math.floor(this.resolution / 2);
        const centerY = Math.floor(this.resolution / 2);
        
        this.solver.addDensity(centerX, centerY, 500, 20);
        
        for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
            const vx = Math.cos(angle) * 30;
            const vy = Math.sin(angle) * 30;
            this.solver.addVelocity(centerX, centerY, vx, vy, 15);
        }
    }
    
    presetDamBreak() {
        this.solver.resetAll();
        const N = this.resolution;
        const damX = Math.floor(N / 3);
        
        for (let y = 0; y < damX; y++) {
            for (let x = 0; x < N; x++) {
                this.solver.addDensity(x, y + Math.floor(N / 2), 50, 1);
            }
        }
        
        for (let y = 0; y < N; y++) {
            this.solver.addObstacle(damX, y, 1);
        }
        this.solver.addObstacle(damX, Math.floor(N / 4), 3);
        this.solver.addObstacle(damX, Math.floor(N * 3 / 4), 3);
    }
    
    saveConfig() {
        const config = {
            viscosity: this.solver.viscosity,
            diffusion: this.solver.diffusion,
            dt: this.solver.dt,
            resolution: this.resolution,
            brushSize: this.brushSize,
            densityAmount: this.densityAmount,
            velocityAmount: this.velocityAmount,
            timestamp: new Date().toISOString()
        };
        
        fetch('http://localhost:5000/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        }).then(response => {
            if (response.ok) {
                alert('配置已保存到服务器！');
            } else {
                localStorage.setItem('fluidConfig', JSON.stringify(config));
                alert('配置已保存到本地（服务器未启动）');
            }
        }).catch(() => {
            localStorage.setItem('fluidConfig', JSON.stringify(config));
            alert('配置已保存到本地（服务器未启动）');
        });
    }
    
    takeScreenshot() {
        const link = document.createElement('a');
        link.download = `fluid-simulation-${Date.now()}.png`;
        link.href = this.canvas.toDataURL();
        link.click();
        
        const thumbnail = this.createThumbnail();
        const config = {
            viscosity: this.solver.viscosity,
            diffusion: this.solver.diffusion,
            dt: this.solver.dt,
            resolution: this.resolution,
            thumbnail: thumbnail
        };
        
        fetch('http://localhost:5000/api/thumbnail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        }).catch(() => {});
    }
    
    createThumbnail() {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 128;
        thumbCanvas.height = 128;
        const thumbCtx = thumbCanvas.getContext('2d');
        thumbCtx.drawImage(this.canvas, 0, 0, 128, 128);
        return thumbCanvas.toDataURL();
    }
    
    render() {
        const density = this.solver.getDensity();
        const obstacles = this.solver.getObstacles();
        const N = this.solver.getWidth();
        const imageData = this.ctx.createImageData(this.canvasSize, this.canvasSize);
        const data = imageData.data;
        
        const scale = this.canvasSize / N;
        const N_plus_2 = N + 2;
        
        if (this.colorMode) {
            const hueOffset = Math.floor(this.hue * 2) % 256;
            for (let y = 0; y < this.canvasSize; y++) {
                const fluidY = N - 1 - Math.floor(y / scale);
                const fy = fluidY + 1;
                const rowBase = fy * N_plus_2;
                for (let x = 0; x < this.canvasSize; x++) {
                    const fx = Math.floor(x / scale) + 1;
                    const idx = rowBase + fx;
                    const pixelIdx = (y * this.canvasSize + x) * 4;
                    
                    if (obstacles[idx]) {
                        data[pixelIdx] = 20;
                        data[pixelIdx + 1] = 20;
                        data[pixelIdx + 2] = 30;
                        data[pixelIdx + 3] = 255;
                    } else {
                        let d = density[idx];
                        if (d > 255) d = 255;
                        const dInt = Math.floor(d);
                        
                        const colorIdx = ((dInt + hueOffset) % 256) * 4;
                        data[pixelIdx] = this.colorTable[colorIdx];
                        data[pixelIdx + 1] = this.colorTable[colorIdx + 1];
                        data[pixelIdx + 2] = this.colorTable[colorIdx + 2];
                        data[pixelIdx + 3] = 255;
                    }
                }
            }
        } else {
            for (let y = 0; y < this.canvasSize; y++) {
                const fluidY = N - 1 - Math.floor(y / scale);
                const fy = fluidY + 1;
                const rowBase = fy * N_plus_2;
                for (let x = 0; x < this.canvasSize; x++) {
                    const fx = Math.floor(x / scale) + 1;
                    const idx = rowBase + fx;
                    const pixelIdx = (y * this.canvasSize + x) * 4;
                    
                    if (obstacles[idx]) {
                        data[pixelIdx] = 20;
                        data[pixelIdx + 1] = 20;
                        data[pixelIdx + 2] = 30;
                        data[pixelIdx + 3] = 255;
                    } else {
                        let d = density[idx];
                        if (d > 255) d = 255;
                        const gray = Math.floor(d);
                        
                        data[pixelIdx] = gray;
                        data[pixelIdx + 1] = gray;
                        data[pixelIdx + 2] = gray;
                        data[pixelIdx + 3] = 255;
                    }
                }
            }
        }
        
        this.ctx.putImageData(imageData, 0, 0);
        this.hue = (this.hue + 0.1) % 360;
        
        if (this.showVelocity) {
            this.renderVelocity();
        }
    }
    
    renderVelocity() {
        const vx = this.solver.getVelocityX();
        const vy = this.solver.getVelocityY();
        const obstacles = this.solver.getObstacles();
        const N = this.solver.getWidth();
        
        this.velCtx.clearRect(0, 0, this.canvasSize, this.canvasSize);
        this.velCtx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        this.velCtx.lineWidth = 1.5;
        
        const step = Math.max(8, Math.floor(N / 32));
        const scale = this.canvasSize / N;
        const velocityScale = 10;
        const N_plus_2 = N + 2;
        
        for (let fluidY = step; fluidY < N; fluidY += step) {
            const canvasY = (N - 1 - fluidY) * scale;
            const rowBase = (fluidY + 1) * N_plus_2;
            for (let x = step; x < N; x += step) {
                const idx = rowBase + (x + 1);
                if (obstacles[idx]) continue;
                
                const dx = vx[idx] * velocityScale;
                const dy = vy[idx] * velocityScale;
                
                const startX = x * scale;
                const startY = canvasY;
                const endX = startX + dx * scale;
                const endY = startY - dy * scale;
                
                this.velCtx.beginPath();
                this.velCtx.moveTo(startX, startY);
                this.velCtx.lineTo(endX, endY);
                this.velCtx.stroke();
                
                const angle = Math.atan2(endY - startY, endX - startX);
                const arrowSize = 5;
                this.velCtx.beginPath();
                this.velCtx.moveTo(endX, endY);
                this.velCtx.lineTo(
                    endX - arrowSize * Math.cos(angle - Math.PI / 6),
                    endY - arrowSize * Math.sin(angle - Math.PI / 6)
                );
                this.velCtx.moveTo(endX, endY);
                this.velCtx.lineTo(
                    endX - arrowSize * Math.cos(angle + Math.PI / 6),
                    endY - arrowSize * Math.sin(angle + Math.PI / 6)
                );
                this.velCtx.stroke();
            }
        }
    }
    
    hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        
        return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
    }
    
    updateFPS() {
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
            document.getElementById('fps').textContent = this.fps;
        }
    }
    
    animate() {
        if (!this.isPaused) {
            this.solver.step();
        }
        this.render();
        this.updateFPS();
        requestAnimationFrame(() => this.animate());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FluidSimulation();
});
