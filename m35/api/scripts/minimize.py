#!/usr/bin/env python3
"""OpenMM energy minimization script.

Reads a PDB file, sets up a force field, runs energy minimization,
and outputs energy data as JSON lines to stdout.

Usage:
    python minimize.py --pdb <path> --steps <n> --force-field <name> --output-dir <path>
"""

import argparse
import json
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="OpenMM Energy Minimization")
    parser.add_argument("--pdb", required=True, help="Path to input PDB file")
    parser.add_argument("--steps", type=int, default=1000, help="Number of minimization steps")
    parser.add_argument("--force-field", default="amber14-all", help="Force field name")
    parser.add_argument("--output-dir", required=True, help="Output directory")
    args = parser.parse_args()

    try:
        from simtk.openmm import app
        import simtk.openmm as mm
        from simtk import unit
    except ImportError:
        print(json.dumps({"type": "error", "message": "OpenMM not installed"}), flush=True)
        sys.exit(1)

    pdb = app.PDBFile(args.pdb)

    forcefield = app.ForceField("amber14-all.xml", "amber14/tip3pfb.xml")

    system = forcefield.createSystem(
        pdb.topology,
        nonbondedMethod=app.NoCutoff,
        constraints=app.HBonds,
    )

    integrator = mm.LangevinIntegrator(
        300 * unit.kelvin,
        1.0 / unit.picoseconds,
        2.0 * unit.femtoseconds,
    )

    simulation = app.Simulation(pdb.topology, system, integrator)
    simulation.context.setPositions(pdb.positions)

    state = simulation.context.getState(getEnergy=True)
    initial_energy = state.getPotentialEnergy().value_in_unit(unit.kilojoules_per_mole)

    report_interval = max(1, args.steps // 50)

    for step in range(1, args.steps + 1):
        simulation.step(1)

        if step % report_interval == 0 or step == args.steps:
            state = simulation.context.getState(getEnergy=True, getPositions=True)
            energy = state.getPotentialEnergy().value_in_unit(unit.kilojoules_per_mole)
            print(json.dumps({
                "type": "energy",
                "step": step,
                "energy": energy,
            }), flush=True)

    final_state = simulation.context.getState(getEnergy=True, getPositions=True)
    final_energy = final_state.getPotentialEnergy().value_in_unit(unit.kilojoules_per_mole)

    os.makedirs(args.output_dir, exist_ok=True)

    minimized_path = os.path.join(args.output_dir, "minimized.pdb")
    with open(minimized_path, "w") as f:
        app.PDBFile.writeFile(
            pdb.topology,
            final_state.getPositions(),
            f,
        )

    energies_path = os.path.join(args.output_dir, "energies.json")
    all_energies = [{"step": 0, "energy": initial_energy}]
    energy_data = []
    with open(energies_path, "w") as f:
        json.dump([{"step": 0, "energy": initial_energy}], f)

    print(json.dumps({
        "type": "complete",
        "final_energy": final_energy,
    }), flush=True)


if __name__ == "__main__":
    main()
