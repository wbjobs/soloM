#ifndef FLUID_SOLVER_H
#define FLUID_SOLVER_H

#include <vector>

class FluidSolver {
public:
    FluidSolver(int width, int height, float viscosity, float diffusion, float dt);
    ~FluidSolver();

    void addDensity(int x, int y, float amount, float radius);
    void addVelocity(int x, int y, float amountX, float amountY, float radius);
    void addObstacle(int x, int y, int radius);
    void removeObstacle(int x, int y, int radius);
    void clearObstacles();
    bool isObstacle(int x, int y) const;
    const std::vector<bool>& getObstacles() const;
    void step();
    void reset();
    void resetAll();

    const std::vector<float>& getDensity() const;
    const std::vector<float>& getVelocityX() const;
    const std::vector<float>& getVelocityY() const;

    int getWidth() const { return N; }
    int getHeight() const { return N; }

    void setViscosity(float v) { viscosity = v; }
    void setDiffusion(float d) { diffusion = d; }
    void setDt(float t) { dt = t; }

    float getViscosity() const { return viscosity; }
    float getDiffusion() const { return diffusion; }
    float getDt() const { return dt; }

private:
    int N;
    int size;
    float viscosity;
    float diffusion;
    float dt;

    std::vector<float> s;
    std::vector<float> density;
    std::vector<float> Vx;
    std::vector<float> Vy;
    std::vector<float> Vx0;
    std::vector<float> Vy0;
    std::vector<float> p;
    std::vector<float> div;
    std::vector<bool> obstacles;

    int IX(int x, int y) const;
    void setBoundary(int b, std::vector<float>& x);
    void applyObstacleBoundary(int b, std::vector<float>& x);
    void linSolve(int b, std::vector<float>& x, const std::vector<float>& x0, float a, float c, int maxIterations = 20);
    void diffuse(int b, std::vector<float>& x, const std::vector<float>& x0, float diff);
    void project(std::vector<float>& velocX, std::vector<float>& velocY);
    void advect(int b, std::vector<float>& d, const std::vector<float>& d0, const std::vector<float>& velocX, const std::vector<float>& velocY);
};

#endif
