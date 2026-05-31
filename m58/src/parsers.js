import { getElementData } from './elements.js';

export function parseXYZ(content, filename = 'unknown.xyz') {
    const lines = content.trim().split('\n');
    const atoms = [];
    const bonds = [];
    
    if (lines.length < 2) {
        throw new Error('无效的XYZ文件：文件内容过短');
    }
    
    const atomCount = parseInt(lines[0].trim());
    if (isNaN(atomCount) || atomCount <= 0) {
        throw new Error('无效的XYZ文件：第一行必须是原子数量');
    }
    
    const title = lines[1].trim() || filename;
    
    for (let i = 2; i < Math.min(2 + atomCount, lines.length); i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length < 4) continue;
        
        const symbol = parts[0];
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const z = parseFloat(parts[3]);
        
        if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
        
        const elementData = getElementData(symbol);
        atoms.push({
            id: i - 2,
            symbol,
            name: elementData.name,
            nameCN: elementData.nameCN,
            x, y, z,
            elementData
        });
    }
    
    calculateBonds(atoms, bonds);
    
    return {
        title,
        filename,
        format: 'xyz',
        atoms,
        bonds,
        atomCount: atoms.length,
        bondCount: bonds.length
    };
}

export function parsePDB(content, filename = 'unknown.pdb') {
    const lines = content.trim().split('\n');
    const atoms = [];
    const bonds = [];
    let title = filename;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const recordType = line.substring(0, 6).trim();
        
        if (recordType === 'TITLE' && title === filename) {
            title = line.substring(10).trim() || filename;
        }
        
        if (recordType === 'ATOM' || recordType === 'HETATM') {
            const atom = parsePDBAtom(line, atoms.length);
            if (atom) atoms.push(atom);
        }
        
        if (recordType === 'CONECT') {
            parsePDBConect(line, atoms, bonds);
        }
    }
    
    if (bonds.length === 0) {
        calculateBonds(atoms, bonds);
    }
    
    return {
        title,
        filename,
        format: 'pdb',
        atoms,
        bonds,
        atomCount: atoms.length,
        bondCount: bonds.length
    };
}

function parsePDBAtom(line, index) {
    try {
        const serial = parseInt(line.substring(6, 11).trim());
        const name = line.substring(12, 16).trim();
        const altLoc = line.substring(16, 17);
        const resName = line.substring(17, 20).trim();
        const chainID = line.substring(21, 22);
        const resSeq = parseInt(line.substring(22, 26).trim());
        const x = parseFloat(line.substring(30, 38).trim());
        const y = parseFloat(line.substring(38, 46).trim());
        const z = parseFloat(line.substring(46, 54).trim());
        const occupancy = parseFloat(line.substring(54, 60).trim()) || 1.0;
        const tempFactor = parseFloat(line.substring(60, 66).trim()) || 0.0;
        const element = line.substring(76, 78).trim() || name.replace(/[0-9]/g, '');
        const charge = line.substring(78, 80).trim();
        
        const symbol = element.charAt(0).toUpperCase() + element.slice(1).toLowerCase();
        const elementData = getElementData(symbol);
        
        return {
            id: index,
            serial,
            name,
            symbol,
            altLoc,
            resName,
            chainID,
            resSeq,
            x, y, z,
            occupancy,
            tempFactor,
            charge,
            name: elementData.name,
            nameCN: elementData.nameCN,
            elementData
        };
    } catch (e) {
        console.warn('解析PDB原子失败:', line, e);
        return null;
    }
}

function parsePDBConect(line, atoms, bonds) {
    try {
        const atomSerial = parseInt(line.substring(6, 11).trim());
        const bondedSerials = [];
        
        for (let pos = 11; pos < line.length; pos += 5) {
            if (pos + 5 > line.length) break;
            const serial = parseInt(line.substring(pos, pos + 5).trim());
            if (!isNaN(serial) && serial > 0) {
                bondedSerials.push(serial);
            }
        }
        
        const atomIndex = atoms.findIndex(a => a.serial === atomSerial);
        if (atomIndex === -1) return;
        
        for (const bondedSerial of bondedSerials) {
            const bondedIndex = atoms.findIndex(a => a.serial === bondedSerial);
            if (bondedIndex === -1 || bondedIndex <= atomIndex) continue;
            
            const bondExists = bonds.some(b => 
                (b.atom1 === atomIndex && b.atom2 === bondedIndex) ||
                (b.atom1 === bondedIndex && b.atom2 === atomIndex)
            );
            
            if (!bondExists) {
                bonds.push({
                    atom1: atomIndex,
                    atom2: bondedIndex,
                    order: 1
                });
            }
        }
    } catch (e) {
        console.warn('解析PDB CONECT失败:', line, e);
    }
}

function calculateBonds(atoms, bonds) {
    const maxBondLength = 1.8;
    
    for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
            const atom1 = atoms[i];
            const atom2 = atoms[j];
            
            const dx = atom2.x - atom1.x;
            const dy = atom2.y - atom1.y;
            const dz = atom2.z - atom1.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            const r1 = atom1.elementData.covalentRadius;
            const r2 = atom2.elementData.covalentRadius;
            const maxDist = Math.min(maxBondLength, (r1 + r2) * 1.3);
            
            if (distance < maxDist && distance > 0.1) {
                bonds.push({
                    atom1: i,
                    atom2: j,
                    order: 1,
                    distance
                });
            }
        }
    }
}

export function parseFile(content, filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    if (ext === 'xyz') {
        return parseXYZ(content, filename);
    } else if (ext === 'pdb') {
        return parsePDB(content, filename);
    } else {
        throw new Error(`不支持的文件格式: .${ext}。请使用 .pdb 或 .xyz 文件。`);
    }
}
