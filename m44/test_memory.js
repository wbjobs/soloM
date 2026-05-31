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

        const totalBytes = this.size * 8 * 4;
        console.log(`分辨率 ${width}x${height}:`);
        console.log(`  网格大小: ${this.size}`);
        console.log(`  总内存: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
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

    step() {
        const start = Date.now();
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
        return Date.now() - start;
    }

    setBoundary(b, x) {
        const N = this.N;
        for (let i = 1; i <= N; i++) {
            x[this.IX(0, i)] = b === 1 ? -x[this.IX(1, i)] : x[this.IX(1, i)];
            x[this.IX(N + 1, i)] = b === 1 ? -x[this.IX(N, i)] : x[this.IX(N, i)];
            x[this.IX(i, 0)] = b === 2 ? -x[this.IX(i, 1)] : x[this.IX(i, 1)];
            x[this.IX(i, N + 1)] = b === 2 ? -x[this.IX(i, N)] : x[this.IX(i, N)];
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
}

console.log('=== 流体解算器内存测试 ===\n');

const resolutions = [128, 256, 384, 512];
const results = [];

for (const res of resolutions) {
    try {
        const solver = new FluidSolverJS(res, res, 0.0001, 0.00001, 0.2);
        
        solver.addDensity(Math.floor(res/2), Math.floor(res/2), 100, 10);
        solver.addVelocity(Math.floor(res/2), Math.floor(res/2), 10, 5, 10);
        
        const times = [];
        for (let i = 0; i < 10; i++) {
            times.push(solver.step());
        }
        
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        console.log(`  平均步进时间: ${avgTime.toFixed(2)}ms`);
        console.log(`  预计FPS: ${(1000 / avgTime).toFixed(1)}`);
        console.log('  ✓ 测试通过\n');
        
        results.push({ resolution: res, success: true, avgTime, fps: 1000 / avgTime });
    } catch (e) {
        console.log(`  ✗ 测试失败: ${e.message}\n`);
        results.push({ resolution: res, success: false, error: e.message });
    }
}

console.log('=== 测试总结 ===');
for (const r of results) {
    if (r.success) {
        console.log(`${r.resolution}x${r.resolution}: ✓ 通过, ${r.fps.toFixed(1)} FPS`);
    } else {
        console.log(`${r.resolution}x${r.resolution}: ✗ 失败 - ${r.error}`);
    }
}
