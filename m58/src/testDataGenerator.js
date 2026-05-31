import { getElementData } from './elements.js';

const ELEMENTS = ['H', 'C', 'N', 'O', 'S', 'P', 'Cl', 'Fe', 'Zn', 'Ca'];

function generateSpherePacking(atomCount, radius = 1.2) {
    const atoms = [];
    const minDist = radius * 2.2;
    const gridSize = Math.ceil(Math.pow(atomCount, 1/3));
    const spacing = minDist;
    
    let count = 0;
    for (let x = 0; x < gridSize && count < atomCount; x++) {
        for (let y = 0; y < gridSize && count < atomCount; y++) {
            for (let z = 0; z < gridSize && count < atomCount; z++) {
                const elementIndex = Math.floor(Math.random() * ELEMENTS.length);
                const symbol = ELEMENTS[elementIndex];
                
                const jitter = 0.3;
                const px = (x - gridSize/2) * spacing + (Math.random() - 0.5) * jitter;
                const py = (y - gridSize/2) * spacing + (Math.random() - 0.5) * jitter;
                const pz = (z - gridSize/2) * spacing + (Math.random() - 0.5) * jitter;
                
                const elementData = getElementData(symbol);
                atoms.push({
                    id: count,
                    symbol,
                    name: elementData.name,
                    nameCN: elementData.nameCN,
                    x: px,
                    y: py,
                    z: pz,
                    elementData
                });
                
                count++;
            }
        }
    }
    
    return atoms;
}

function calculateBonds(atoms) {
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
    
    return bonds;
}

export function generateTestMolecule(atomCount = 1000, name = 'Test Protein') {
    const atoms = generateSpherePacking(atomCount);
    const bonds = calculateBonds(atoms);
    
    return {
        title: `${name} (${atomCount} atoms)`,
        filename: `test_${atomCount}_atoms.xyz`,
        format: 'xyz',
        atoms,
        bonds,
        atomCount: atoms.length,
        bondCount: bonds.length
    };
}

export function generateXYZContent(moleculeData) {
    let content = `${moleculeData.atomCount}\n`;
    content += `${moleculeData.title}\n`;
    
    moleculeData.atoms.forEach(atom => {
        content += `${atom.symbol.padEnd(4)}${atom.x.toFixed(6).padStart(12)}${atom.y.toFixed(6).padStart(12)}${atom.z.toFixed(6).padStart(12)}\n`;
    });
    
    return content;
}

export function downloadTestFile(atomCount) {
    const molecule = generateTestMolecule(atomCount);
    const content = generateXYZContent(molecule);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test_${atomCount}_atoms.xyz`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
