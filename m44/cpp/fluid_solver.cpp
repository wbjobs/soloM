#include "fluid_solver.h"
#include <cmath>
#include <algorithm>

FluidSolver::FluidSolver(int width, int height, float viscosity, float diffusion, float dt)
    : N(width), size((width + 2) * (height + 2)), viscosity(viscosity), diffusion(diffusion), dt(dt),
      s(size, 0.0f), density(size, 0.0f), Vx(size, 0.0f), Vy(size, 0.0f),
      Vx0(size, 0.0f), Vy0(size, 0.0f), p(size, 0.0f), div(size, 0.0f),
      obstacles(size, false) {}

FluidSolver::~FluidSolver() {}

int FluidSolver::IX(int x, int y) const {
    return x + y * (N + 2);
}

void FluidSolver::addDensity(int x, int y, float amount, float radius) {
    for (int i = -radius; i <= radius; i++) {
        for (int j = -radius; j <= radius; j++) {
            int px = x + i;
            int py = y + j;
            if (px >= 0 && px < N && py >= 0 && py < N) {
                float dist = sqrt(i * i + j * j);
                if (dist <= radius) {
                    float factor = 1.0f - dist / radius;
                    density[IX(px + 1, py + 1)] += amount * factor * factor;
                }
            }
        }
    }
}

void FluidSolver::addVelocity(int x, int y, float amountX, float amountY, float radius) {
    for (int i = -radius; i <= radius; i++) {
        for (int j = -radius; j <= radius; j++) {
            int px = x + i;
            int py = y + j;
            if (px >= 0 && px < N && py >= 0 && py < N) {
                float dist = sqrt(i * i + j * j);
                if (dist <= radius) {
                    float factor = 1.0f - dist / radius;
                    Vx[IX(px + 1, py + 1)] += amountX * factor * factor;
                    Vy[IX(px + 1, py + 1)] += amountY * factor * factor;
                }
            }
        }
    }
}

void FluidSolver::addObstacle(int x, int y, int radius) {
    for (int i = -radius; i <= radius; i++) {
        for (int j = -radius; j <= radius; j++) {
            int px = x + i;
            int py = y + j;
            if (px >= 0 && px < N && py >= 0 && py < N) {
                float dist = sqrt(i * i + j * j);
                if (dist <= radius) {
                    obstacles[IX(px + 1, py + 1)] = true;
                }
            }
        }
    }
}

void FluidSolver::removeObstacle(int x, int y, int radius) {
    for (int i = -radius; i <= radius; i++) {
        for (int j = -radius; j <= radius; j++) {
            int px = x + i;
            int py = y + j;
            if (px >= 0 && px < N && py >= 0 && py < N) {
                float dist = sqrt(i * i + j * j);
                if (dist <= radius) {
                    obstacles[IX(px + 1, py + 1)] = false;
                }
            }
        }
    }
}

void FluidSolver::clearObstacles() {
    std::fill(obstacles.begin(), obstacles.end(), false);
}

bool FluidSolver::isObstacle(int x, int y) const {
    if (x < 0 || x >= N || y < 0 || y >= N) return true;
    return obstacles[IX(x + 1, y + 1)];
}

const std::vector<bool>& FluidSolver::getObstacles() const {
    return obstacles;
}

void FluidSolver::setBoundary(int b, std::vector<float>& x) {
    for (int i = 1; i <= N; i++) {
        x[IX(0, i)] = b == 1 ? -x[IX(1, i)] : x[IX(1, i)];
        x[IX(N + 1, i)] = b == 1 ? -x[IX(N, i)] : x[IX(N, i)];
        x[IX(i, 0)] = b == 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
        x[IX(i, N + 1)] = b == 2 ? -x[IX(i, N)] : x[IX(i, N)];
    }
    x[IX(0, 0)] = 0.5f * (x[IX(1, 0)] + x[IX(0, 1)]);
    x[IX(0, N + 1)] = 0.5f * (x[IX(1, N + 1)] + x[IX(0, N)]);
    x[IX(N + 1, 0)] = 0.5f * (x[IX(N, 0)] + x[IX(N + 1, 1)]);
    x[IX(N + 1, N + 1)] = 0.5f * (x[IX(N, N + 1)] + x[IX(N + 1, N)]);
    
    applyObstacleBoundary(b, x);
}

void FluidSolver::applyObstacleBoundary(int b, std::vector<float>& x) {
    for (int j = 1; j <= N; j++) {
        for (int i = 1; i <= N; i++) {
            if (obstacles[IX(i, j)]) {
                x[IX(i, j)] = 0.0f;
                
                float avg = 0.0f;
                int count = 0;
                
                if (!obstacles[IX(i + 1, j)] && i + 1 <= N) {
                    avg += (b == 1) ? -x[IX(i + 1, j)] : x[IX(i + 1, j)];
                    count++;
                }
                if (!obstacles[IX(i - 1, j)] && i - 1 >= 1) {
                    avg += (b == 1) ? -x[IX(i - 1, j)] : x[IX(i - 1, j)];
                    count++;
                }
                if (!obstacles[IX(i, j + 1)] && j + 1 <= N) {
                    avg += (b == 2) ? -x[IX(i, j + 1)] : x[IX(i, j + 1)];
                    count++;
                }
                if (!obstacles[IX(i, j - 1)] && j - 1 >= 1) {
                    avg += (b == 2) ? -x[IX(i, j - 1)] : x[IX(i, j - 1)];
                    count++;
                }
                
                if (count > 0) {
                    x[IX(i, j)] = avg / count;
                }
            }
        }
    }
}

void FluidSolver::linSolve(int b, std::vector<float>& x, const std::vector<float>& x0, float a, float c, int maxIterations) {
    float cRecip = 1.0f / c;
    int iterations = N <= 128 ? 20 : (N <= 256 ? 15 : 10);
    if (maxIterations > 0 && maxIterations < iterations) {
        iterations = maxIterations;
    }
    for (int k = 0; k < iterations; k++) {
        for (int j = 1; j <= N; j++) {
            for (int i = 1; i <= N; i++) {
                x[IX(i, j)] = (x0[IX(i, j)] + a * (x[IX(i + 1, j)] + x[IX(i - 1, j)] + x[IX(i, j + 1)] + x[IX(i, j - 1)])) * cRecip;
            }
        }
        setBoundary(b, x);
    }
}

void FluidSolver::diffuse(int b, std::vector<float>& x, const std::vector<float>& x0, float diff) {
    float a = dt * diff * N * N;
    linSolve(b, x, x0, a, 1 + 4 * a);
}

void FluidSolver::project(std::vector<float>& velocX, std::vector<float>& velocY) {
    for (int j = 1; j <= N; j++) {
        for (int i = 1; i <= N; i++) {
            div[IX(i, j)] = -0.5f * (velocX[IX(i + 1, j)] - velocX[IX(i - 1, j)] + velocY[IX(i, j + 1)] - velocY[IX(i, j - 1)]) / N;
            p[IX(i, j)] = 0;
        }
    }
    setBoundary(0, div);
    setBoundary(0, p);
    linSolve(0, p, div, 1, 4);

    for (int j = 1; j <= N; j++) {
        for (int i = 1; i <= N; i++) {
            velocX[IX(i, j)] -= 0.5f * (p[IX(i + 1, j)] - p[IX(i - 1, j)]) * N;
            velocY[IX(i, j)] -= 0.5f * (p[IX(i, j + 1)] - p[IX(i, j - 1)]) * N;
        }
    }
    setBoundary(1, velocX);
    setBoundary(2, velocY);
}

void FluidSolver::advect(int b, std::vector<float>& d, const std::vector<float>& d0, const std::vector<float>& velocX, const std::vector<float>& velocY) {
    float dtx = dt * N;
    float dty = dt * N;

    for (int j = 1; j <= N; j++) {
        for (int i = 1; i <= N; i++) {
            if (obstacles[IX(i, j)]) {
                d[IX(i, j)] = 0.0f;
                continue;
            }
            
            float x = i - dtx * velocX[IX(i, j)];
            float y = j - dty * velocY[IX(i, j)];

            if (x < 0.5f) x = 0.5f;
            if (x > N + 0.5f) x = N + 0.5f;
            int i0 = (int)x;
            int i1 = i0 + 1;

            if (y < 0.5f) y = 0.5f;
            if (y > N + 0.5f) y = N + 0.5f;
            int j0 = (int)y;
            int j1 = j0 + 1;

            float s1 = x - i0;
            float s0 = 1 - s1;
            float t1 = y - j0;
            float t0 = 1 - t1;

            d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) + s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
        }
    }
    setBoundary(b, d);
}

void FluidSolver::step() {
    diffuse(1, Vx0, Vx, viscosity);
    diffuse(2, Vy0, Vy, viscosity);

    project(Vx0, Vy0);

    advect(1, Vx, Vx0, Vx0, Vy0);
    advect(2, Vy, Vy0, Vx0, Vy0);

    project(Vx, Vy);

    diffuse(0, s, density, diffusion);
    advect(0, density, s, Vx, Vy);

    for (int i = 0; i < size; i++) {
        density[i] *= 0.995f;
        Vx[i] *= 0.999f;
        Vy[i] *= 0.999f;
    }

    for (int i = 0; i < size; i++) {
        if (obstacles[i]) {
            density[i] = 0.0f;
            Vx[i] = 0.0f;
            Vy[i] = 0.0f;
        }
    }
}

void FluidSolver::reset() {
    std::fill(s.begin(), s.end(), 0.0f);
    std::fill(density.begin(), density.end(), 0.0f);
    std::fill(Vx.begin(), Vx.end(), 0.0f);
    std::fill(Vy.begin(), Vy.end(), 0.0f);
    std::fill(Vx0.begin(), Vx0.end(), 0.0f);
    std::fill(Vy0.begin(), Vy0.end(), 0.0f);
    std::fill(p.begin(), p.end(), 0.0f);
    std::fill(div.begin(), div.end(), 0.0f);
}

void FluidSolver::resetAll() {
    reset();
    std::fill(obstacles.begin(), obstacles.end(), false);
}

const std::vector<float>& FluidSolver::getDensity() const {
    return density;
}

const std::vector<float>& FluidSolver::getVelocityX() const {
    return Vx;
}

const std::vector<float>& FluidSolver::getVelocityY() const {
    return Vy;
}
