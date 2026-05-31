#include <emscripten/bind.h>
#include "fluid_solver.h"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(fluid_solver) {
    class_<FluidSolver>("FluidSolver")
        .constructor<int, int, float, float, float>()
        .function("addDensity", &FluidSolver::addDensity)
        .function("addVelocity", &FluidSolver::addVelocity)
        .function("addObstacle", &FluidSolver::addObstacle)
        .function("removeObstacle", &FluidSolver::removeObstacle)
        .function("clearObstacles", &FluidSolver::clearObstacles)
        .function("isObstacle", &FluidSolver::isObstacle)
        .function("step", &FluidSolver::step)
        .function("reset", &FluidSolver::reset)
        .function("resetAll", &FluidSolver::resetAll)
        .function("getDensity", &FluidSolver::getDensity)
        .function("getVelocityX", &FluidSolver::getVelocityX)
        .function("getVelocityY", &FluidSolver::getVelocityY)
        .function("getObstacles", &FluidSolver::getObstacles)
        .function("getWidth", &FluidSolver::getWidth)
        .function("getHeight", &FluidSolver::getHeight)
        .property("viscosity", &FluidSolver::getViscosity, &FluidSolver::setViscosity)
        .property("diffusion", &FluidSolver::getDiffusion, &FluidSolver::setDiffusion)
        .property("dt", &FluidSolver::getDt, &FluidSolver::setDt);

    register_vector<float>("VectorFloat");
    register_vector<bool>("VectorBool");
}
