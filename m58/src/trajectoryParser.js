import { getElementData } from './elements.js';

export class TrajectoryFrame {
    constructor(atoms, time = 0, step = 0) {
        this.atoms = atoms;
        this.time = time;
        this.step = step;
        this.box = null;
    }

    getPosition(index) {
        const atom = this.atoms[index];
        return [atom.x, atom.y, atom.z];
    }

    getPositions() {
        return this.atoms.map(a => [a.x, a.y, a.z]);
    }

    getAtomCount() {
        return this.atoms.length;
    }
}

export class TrajectoryData {
    constructor() {
        this.frames = [];
        this.atomSymbols = [];
        this.topology = null;
        this.filename = '';
        this.format = '';
    }

    addFrame(frame) {
        this.frames.push(frame);
    }

    getFrame(index) {
        if (index < 0 || index >= this.frames.length) return null;
        return this.frames[index];
    }

    getFrameCount() {
        return this.frames.length;
    }

    getAtomCount() {
        return this.atomSymbols.length;
    }

    getTotalTime() {
        if (this.frames.length === 0) return 0;
        return this.frames[this.frames.length - 1].time;
    }

    getTimeStep() {
        if (this.frames.length < 2) return 1;
        return this.frames[1].time - this.frames[0].time;
    }
}

export function parseMultiFrameXYZ(content, filename = 'trajectory.xyz') {
    const trajectory = new TrajectoryData();
    trajectory.filename = filename;
    trajectory.format = 'xyz';
    
    const lines = content.trim().split('\n');
    let lineIndex = 0;
    
    while (lineIndex < lines.length) {
        if (lineIndex + 1 >= lines.length) break;
        
        const atomCountLine = lines[lineIndex].trim();
        if (!atomCountLine) {
            lineIndex++;
            continue;
        }
        
        const atomCount = parseInt(atomCountLine);
        if (isNaN(atomCount) || atomCount <= 0) {
            lineIndex++;
            continue;
        }
        
        const titleLine = lines[lineIndex + 1] || '';
        const { time, step } = parseTitleLine(titleLine);
        
        const atoms = [];
        const symbols = [];
        
        for (let i = 0; i < atomCount; i++) {
            const dataLine = lines[lineIndex + 2 + i];
            if (!dataLine) break;
            
            const parts = dataLine.trim().split(/\s+/);
            if (parts.length < 4) continue;
            
            const symbol = parts[0];
            const x = parseFloat(parts[1]);
            const y = parseFloat(parts[2]);
            const z = parseFloat(parts[3]);
            
            if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
            
            const elementData = getElementData(symbol);
            atoms.push({
                id: i,
                symbol,
                name: elementData.name,
                nameCN: elementData.nameCN,
                x, y, z,
                elementData
            });
            
            symbols.push(symbol);
        }
        
        if (atoms.length > 0) {
            if (trajectory.atomSymbols.length === 0) {
                trajectory.atomSymbols = symbols;
            }
            
            const frame = new TrajectoryFrame(atoms, time, step);
            trajectory.addFrame(frame);
        }
        
        lineIndex += 2 + atomCount;
    }
    
    if (trajectory.frames.length > 0) {
        const firstFrame = trajectory.frames[0];
        trajectory.topology = {
            atoms: firstFrame.atoms.map(a => ({
                symbol: a.symbol,
                name: a.name,
                nameCN: a.nameCN,
                elementData: a.elementData
            })),
            bonds: calculateBonds(firstFrame.atoms)
        };
    }
    
    return trajectory;
}

function parseTitleLine(titleLine) {
    let time = 0;
    let step = 0;
    
    const timeMatch = titleLine.match(/[Tt]ime\s*[=:]\s*([-+]?\d*\.?\d+)/);
    if (timeMatch) {
        time = parseFloat(timeMatch[1]);
    }
    
    const stepMatch = titleLine.match(/[Ss]tep\s*[=:]\s*(\d+)/);
    if (stepMatch) {
        step = parseInt(stepMatch[1]);
    }
    
    const parts = titleLine.trim().split(/\s+/);
    if (!timeMatch && parts.length > 0) {
        const num = parseFloat(parts[0]);
        if (!isNaN(num)) time = num;
    }
    
    return { time, step };
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
            
            const r1 = atoms[i].elementData.covalentRadius;
            const r2 = atoms[j].elementData.covalentRadius;
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
    
    return bonds;
}

export function parseBinaryTrajectory(buffer, filename = 'trajectory.bin') {
    const trajectory = new TrajectoryData();
    trajectory.filename = filename;
    trajectory.format = 'binary';
    
    const view = new DataView(buffer);
    let offset = 0;
    
    const magic = view.getUint32(offset, true);
    offset += 4;
    
    if (magic !== 0x5452414A) {
        throw new Error('无效的二进制轨迹文件');
    }
    
    const version = view.getUint16(offset, true);
    offset += 2;
    
    const atomCount = view.getUint32(offset, true);
    offset += 4;
    
    const frameCount = view.getUint32(offset, true);
    offset += 4;
    
    const hasBox = view.getUint8(offset);
    offset += 1;
    
    for (let i = 0; i < atomCount; i++) {
        const symbolLen = view.getUint8(offset);
        offset += 1;
        
        const symbolBytes = new Uint8Array(buffer, offset, symbolLen);
        const symbol = new TextDecoder().decode(symbolBytes);
        offset += symbolLen;
        
        trajectory.atomSymbols.push(symbol);
    }
    
    for (let f = 0; f < frameCount; f++) {
        const step = view.getUint32(offset, true);
        offset += 4;
        
        const time = view.getFloat32(offset, true);
        offset += 4;
        
        let box = null;
        if (hasBox) {
            box = [
                view.getFloat32(offset, true),
                view.getFloat32(offset + 4, true),
                view.getFloat32(offset + 8, true)
            ];
            offset += 12;
        }
        
        const atoms = [];
        for (let i = 0; i < atomCount; i++) {
            const x = view.getFloat32(offset, true);
            const y = view.getFloat32(offset + 4, true);
            const z = view.getFloat32(offset + 8, true);
            offset += 12;
            
            const symbol = trajectory.atomSymbols[i];
            const elementData = getElementData(symbol);
            
            atoms.push({
                id: i,
                symbol,
                name: elementData.name,
                nameCN: elementData.nameCN,
                x, y, z,
                elementData
            });
        }
        
        const frame = new TrajectoryFrame(atoms, time, step);
        frame.box = box;
        trajectory.addFrame(frame);
    }
    
    if (trajectory.frames.length > 0) {
        const firstFrame = trajectory.frames[0];
        trajectory.topology = {
            atoms: firstFrame.atoms.map(a => ({
                symbol: a.symbol,
                name: a.name,
                nameCN: a.nameCN,
                elementData: a.elementData
            })),
            bonds: calculateBonds(firstFrame.atoms)
        };
    }
    
    return trajectory;
}

export function parseXTC(content, filename = 'trajectory.xtc') {
    console.warn('XTC 格式解析需要第三方库支持，目前使用简化解析');
    console.warn('如需完整 XTC 支持，请安装: npm install @md-js/xtc-reader');
    
    return parseMultiFrameXYZ(content, filename);
}

export function parseTrajectory(content, filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    if (ext === 'xyz') {
        return parseMultiFrameXYZ(content, filename);
    } else if (ext === 'xtc') {
        return parseXTC(content, filename);
    } else if (ext === 'trr' || ext === 'bin') {
        if (content instanceof ArrayBuffer) {
            return parseBinaryTrajectory(content, filename);
        } else {
            throw new Error('二进制轨迹文件需要作为 ArrayBuffer 读取');
        }
    } else {
        throw new Error(`不支持的轨迹格式: .${ext}`);
    }
}

export function createBinaryTrajectory(trajectory) {
    const atomCount = trajectory.getAtomCount();
    const frameCount = trajectory.getFrameCount();
    const hasBox = trajectory.frames.some(f => f.box !== null);
    
    let totalSize = 4 + 2 + 4 + 4 + 1;
    
    const symbolLengths = trajectory.atomSymbols.map(s => s.length);
    totalSize += symbolLengths.reduce((a, b) => a + b + 1, 0);
    
    const frameSize = 4 + 4 + (hasBox ? 12 : 0) + atomCount * 12;
    totalSize += frameCount * frameSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;
    
    view.setUint32(offset, 0x5452414A, true);
    offset += 4;
    
    view.setUint16(offset, 1, true);
    offset += 2;
    
    view.setUint32(offset, atomCount, true);
    offset += 4;
    
    view.setUint32(offset, frameCount, true);
    offset += 4;
    
    view.setUint8(offset, hasBox ? 1 : 0);
    offset += 1;
    
    const encoder = new TextEncoder();
    trajectory.atomSymbols.forEach(symbol => {
        view.setUint8(offset, symbol.length);
        offset += 1;
        
        const encoded = encoder.encode(symbol);
        for (let i = 0; i < encoded.length; i++) {
            view.setUint8(offset + i, encoded[i]);
        }
        offset += encoded.length;
    });
    
    trajectory.frames.forEach(frame => {
        view.setUint32(offset, frame.step, true);
        offset += 4;
        
        view.setFloat32(offset, frame.time, true);
        offset += 4;
        
        if (hasBox) {
            const box = frame.box || [0, 0, 0];
            view.setFloat32(offset, box[0], true);
            view.setFloat32(offset + 4, box[1], true);
            view.setFloat32(offset + 8, box[2], true);
            offset += 12;
        }
        
        frame.atoms.forEach(atom => {
            view.setFloat32(offset, atom.x, true);
            view.setFloat32(offset + 4, atom.y, true);
            view.setFloat32(offset + 8, atom.z, true);
            offset += 12;
        });
    });
    
    return buffer;
}
