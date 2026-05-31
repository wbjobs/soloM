export const SAMPLE_MOLECULES = {
    water: {
        title: 'Water (H2O)',
        format: 'xyz',
        filename: 'water.xyz',
        atoms: [
            { symbol: 'O', x: 0.000, y: 0.000, z: 0.000 },
            { symbol: 'H', x: 0.958, y: 0.000, z: 0.000 },
            { symbol: 'H', x: -0.239, y: 0.927, z: 0.000 }
        ]
    },
    methane: {
        title: 'Methane (CH4)',
        format: 'xyz',
        filename: 'methane.xyz',
        atoms: [
            { symbol: 'C', x: 0.000, y: 0.000, z: 0.000 },
            { symbol: 'H', x: 1.087, y: 0.000, z: 0.000 },
            { symbol: 'H', x: -0.362, y: 1.025, z: 0.000 },
            { symbol: 'H', x: -0.362, y: -0.513, z: 0.889 },
            { symbol: 'H', x: -0.362, y: -0.513, z: -0.889 }
        ]
    },
    ethanol: {
        title: 'Ethanol (C2H6O)',
        format: 'xyz',
        filename: 'ethanol.xyz',
        atoms: [
            { symbol: 'C', x: 0.000, y: 0.000, z: 0.000 },
            { symbol: 'C', x: 1.510, y: 0.000, z: 0.000 },
            { symbol: 'O', x: 2.270, y: 1.260, z: 0.000 },
            { symbol: 'H', x: 3.200, y: 1.260, z: 0.000 },
            { symbol: 'H', x: -0.510, y: -0.930, z: 0.000 },
            { symbol: 'H', x: -0.360, y: 0.520, z: 0.880 },
            { symbol: 'H', x: -0.360, y: 0.520, z: -0.880 },
            { symbol: 'H', x: 1.870, y: -0.520, z: 0.880 },
            { symbol: 'H', x: 1.870, y: -0.520, z: -0.880 }
        ]
    },
    benzene: {
        title: 'Benzene (C6H6)',
        format: 'xyz',
        filename: 'benzene.xyz',
        atoms: [
            { symbol: 'C', x: 0.000, y: 1.390, z: 0.000 },
            { symbol: 'C', x: 1.205, y: 0.695, z: 0.000 },
            { symbol: 'C', x: 1.205, y: -0.695, z: 0.000 },
            { symbol: 'C', x: 0.000, y: -1.390, z: 0.000 },
            { symbol: 'C', x: -1.205, y: -0.695, z: 0.000 },
            { symbol: 'C', x: -1.205, y: 0.695, z: 0.000 },
            { symbol: 'H', x: 0.000, y: 2.470, z: 0.000 },
            { symbol: 'H', x: 2.140, y: 1.235, z: 0.000 },
            { symbol: 'H', x: 2.140, y: -1.235, z: 0.000 },
            { symbol: 'H', x: 0.000, y: -2.470, z: 0.000 },
            { symbol: 'H', x: -2.140, y: -1.235, z: 0.000 },
            { symbol: 'H', x: -2.140, y: 1.235, z: 0.000 }
        ]
    }
};

export function getSampleMoleculeData(name) {
    const sample = SAMPLE_MOLECULES[name];
    if (!sample) return null;
    
    const atoms = sample.atoms.map((atom, index) => ({
        id: index,
        ...atom
    }));
    
    const bonds = [];
    const maxBondLength = 1.8;
    
    for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
            const dx = atoms[j].x - atoms[i].x;
            const dy = atoms[j].y - atoms[i].y;
            const dz = atoms[j].z - atoms[i].z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance < maxBondLength && distance > 0.1) {
                bonds.push({
                    atom1: i,
                    atom2: j,
                    order: 1,
                    distance
                });
            }
        }
    }
    
    return {
        ...sample,
        atoms,
        bonds,
        atomCount: atoms.length,
        bondCount: bonds.length
    };
}
