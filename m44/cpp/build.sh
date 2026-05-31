#!/bin/bash
mkdir -p build
cd build
emcmake cmake ..
emmake make
cp fluid_solver.js ../../public/
cp fluid_solver.wasm ../../public/
