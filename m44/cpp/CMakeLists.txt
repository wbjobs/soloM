cmake_minimum_required(VERSION 3.15)
project(FluidSolver)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(fluid_solver
    fluid_solver.cpp
    main.cpp
)

target_include_directories(fluid_solver PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

set_target_properties(fluid_solver PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "--bind -s INITIAL_MEMORY=64MB -s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=512MB -s MODULARIZE=1 -s EXPORT_NAME='createFluidSolverModule' -s EXPORT_ES6=1 -s STACK_SIZE=1MB -O3"
)
