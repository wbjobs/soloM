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

    getDensity() { return this.density; }
    getVelocityX() { return this.Vx; }
    getVelocityY() { return this.Vy; }
    getWidth() { return this.N; }
    getHeight() { return this.N; }
}

console.log('=== 障碍物功能测试 ===\n');

const testResolutions = [128, 256];

for (const res of testResolutions) {
    console.log(`测试分辨率 ${res}x${res}:`);
    
    const solver = new FluidSolverJS(res, res, 0.0001, 0.00001, 0.2);
    
    const centerX = Math.floor(res / 2);
    const centerY = Math.floor(res / 2);
    
    console.log(`  在 (${centerX}, ${centerY}) 添加半径为 10 的障碍物`);
    solver.addObstacle(centerX, centerY, 10);
    
    let obstacleCount = 0;
    for (let i = 0; i < solver.size; i++) {
        if (solver.obstacles[i]) obstacleCount++;
    }
    console.log(`  障碍物网格数: ${obstacleCount}`);
    
    console.log(`  验证障碍物位置: isObstacle(${centerX}, ${centerY}) = ${solver.isObstacle(centerX, centerY)}`);
    
    console.log(`  在障碍物左侧添加流体...`);
    solver.addDensity(centerX - 30, centerY, 100, 15);
    solver.addVelocity(centerX - 30, centerY, 20, 0, 15);
    
    let initialDensity = 0;
    for (let i = 0; i < solver.size; i++) {
        initialDensity += solver.density[i];
    }
    
    console.log(`  初始总密度: ${initialDensity.toFixed(2)}`);
    
    console.log(`  运行 10 步模拟...`);
    for (let i = 0; i < 10; i++) {
        solver.step();
    }
    
    let finalDensity = 0;
    let obstacleDensity = 0;
    for (let i = 0; i < solver.size; i++) {
        finalDensity += solver.density[i];
        if (solver.obstacles[i]) {
            obstacleDensity += solver.density[i];
        }
    }
    
    console.log(`  最终总密度: ${finalDensity.toFixed(2)}`);
    console.log(`  障碍物区域密度: ${obstacleDensity.toFixed(2)} (应该接近 0)`);
    
    if (obstacleDensity < 1) {
        console.log('  ✓ 障碍物边界条件工作正常!\n');
    } else {
        console.log('  ⚠ 障碍物区域仍有密度残留\n');
    }
}

console.log('=== 测试完成 ===');
console.log('\n障碍物功能已实现:');
console.log('1. addObstacle(x, y, radius) - 添加圆形障碍物');
console.log('2. removeObstacle(x, y, radius) - 移除障碍物');
console.log('3. clearObstacles() - 清除所有障碍物');
console.log('4. isObstacle(x, y) - 检查是否为障碍物');
console.log('5. getObstacles() - 获取障碍物数组');
console.log('6. resetAll() - 重置流体和障碍物');
