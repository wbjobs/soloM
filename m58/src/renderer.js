import * as THREE from 'three';
import { getElementColor, getElementRadius } from './elements.js';

class BVHNode {
    constructor(min, max, atomIndices) {
        this.min = min;
        this.max = max;
        this.atomIndices = atomIndices;
        this.left = null;
        this.right = null;
        this.isLeaf = atomIndices.length <= 8;
    }
}

class AtomBVH {
    constructor(atoms, positions, radii) {
        this.atoms = atoms;
        this.positions = positions;
        this.radii = radii;
        this.root = this.build([...Array(atoms.length).keys()]);
    }

    build(indices) {
        if (indices.length === 0) return null;

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const idx of indices) {
            const pos = this.positions[idx];
            const r = this.radii[idx];
            minX = Math.min(minX, pos.x - r);
            minY = Math.min(minY, pos.y - r);
            minZ = Math.min(minZ, pos.z - r);
            maxX = Math.max(maxX, pos.x + r);
            maxY = Math.max(maxY, pos.y + r);
            maxZ = Math.max(maxZ, pos.z + r);
        }

        const node = new BVHNode(
            new THREE.Vector3(minX, minY, minZ),
            new THREE.Vector3(maxX, maxY, maxZ),
            indices
        );

        if (indices.length <= 8) {
            return node;
        }

        const extentX = maxX - minX;
        const extentY = maxY - minY;
        const extentZ = maxZ - minZ;

        let axis = 0;
        if (extentY > extentX && extentY > extentZ) axis = 1;
        else if (extentZ > extentX) axis = 2;

        const sortedIndices = [...indices].sort((a, b) => {
            const posA = this.positions[a];
            const posB = this.positions[b];
            if (axis === 0) return posA.x - posB.x;
            if (axis === 1) return posA.y - posB.y;
            return posA.z - posB.z;
        });

        const mid = Math.floor(sortedIndices.length / 2);
        node.left = this.build(sortedIndices.slice(0, mid));
        node.right = this.build(sortedIndices.slice(mid));

        return node;
    }

    intersect(ray, matrixWorld) {
        const hits = [];
        this._intersectNode(this.root, ray, matrixWorld, hits);
        return hits.sort((a, b) => a.distance - b.distance);
    }

    _intersectNode(node, ray, matrixWorld, hits) {
        if (!node) return;

        if (!this._intersectBox(node.min, node.max, ray, matrixWorld)) {
            return;
        }

        if (node.isLeaf) {
            for (const idx of node.atomIndices) {
                const hit = this._intersectSphere(idx, ray, matrixWorld);
                if (hit) {
                    hits.push(hit);
                }
            }
        } else {
            this._intersectNode(node.left, ray, matrixWorld, hits);
            this._intersectNode(node.right, ray, matrixWorld, hits);
        }
    }

    _intersectBox(min, max, ray, matrixWorld) {
        const localMin = min.clone().applyMatrix4(matrixWorld);
        const localMax = max.clone().applyMatrix4(matrixWorld);

        let tMin = -Infinity;
        let tMax = Infinity;

        for (let i = 0; i < 3; i++) {
            const origin = ray.origin.getComponent(i);
            const dir = ray.direction.getComponent(i);
            const minVal = Math.min(localMin.getComponent(i), localMax.getComponent(i));
            const maxVal = Math.max(localMin.getComponent(i), localMax.getComponent(i));

            if (Math.abs(dir) < 1e-6) {
                if (origin < minVal || origin > maxVal) return false;
            } else {
                let t1 = (minVal - origin) / dir;
                let t2 = (maxVal - origin) / dir;

                if (t1 > t2) [t1, t2] = [t2, t1];
                tMin = Math.max(tMin, t1);
                tMax = Math.min(tMax, t2);

                if (tMin > tMax) return false;
            }
        }

        return tMax >= 0;
    }

    _intersectSphere(idx, ray, matrixWorld) {
        const pos = this.positions[idx].clone().applyMatrix4(matrixWorld);
        const radius = this.radii[idx] * matrixWorld.getMaxScaleOnAxis();

        const toSphere = pos.clone().sub(ray.origin);
        const tca = toSphere.dot(ray.direction);

        if (tca < 0) return null;

        const d2 = toSphere.dot(toSphere) - tca * tca;
        const radius2 = radius * radius;

        if (d2 > radius2) return null;

        const thc = Math.sqrt(radius2 - d2);
        const t = tca - thc;

        if (t < 0) return null;

        const point = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
        const normal = point.clone().sub(pos).normalize();

        return {
            distance: t,
            point: point,
            normal: normal,
            atomIndex: idx,
            atom: this.atoms[idx]
        };
    }
}

export class MoleculeRenderer {
    constructor(scene) {
        this.scene = scene;
        this.moleculeGroup = new THREE.Group();
        this.atomsGroup = new THREE.Group();
        this.bondsGroup = new THREE.Group();
        this.highlightMesh = null;
        
        this.moleculeGroup.add(this.atomsGroup);
        this.moleculeGroup.add(this.bondsGroup);
        this.scene.add(this.moleculeGroup);
        
        this.atomScale = 1.0;
        this.bondRadius = 0.15;
        
        this.atomGeometries = new Map();
        this.atomMaterials = new Map();
        this.bondMaterial = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            shininess: 100,
            specular: 0x222222
        });
        
        this.instancedMeshes = new Map();
        this.atomDataArray = [];
        this.atomPositions = [];
        this.atomRadii = [];
        this.bvh = null;
        
        this.highlightMaterial = new THREE.MeshPhongMaterial({
            color: 0xffff00,
            emissive: 0x666600,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });
        
        this.useInstancing = true;
        this.largeMoleculeThreshold = 1000;
    }
    
    getAtomGeometry(radius, quality = 'high') {
        const key = `${radius.toFixed(3)}_${quality}`;
        if (!this.atomGeometries.has(key)) {
            let segments;
            if (quality === 'low') {
                segments = Math.max(8, Math.floor(16 * radius));
            } else if (quality === 'medium') {
                segments = Math.max(12, Math.floor(24 * radius));
            } else {
                segments = Math.max(16, Math.floor(32 * radius));
            }
            segments = Math.min(segments, 32);
            
            const geometry = new THREE.SphereGeometry(radius, segments, segments);
            this.atomGeometries.set(key, geometry);
        }
        return this.atomGeometries.get(key);
    }
    
    getAtomMaterial(color) {
        const key = color.toString(16);
        if (!this.atomMaterials.has(key)) {
            const material = new THREE.MeshPhongMaterial({
                color: color,
                shininess: 100,
                specular: 0x444444
            });
            this.atomMaterials.set(key, material);
        }
        return this.atomMaterials.get(key);
    }
    
    createInstancedAtoms(moleculeData) {
        this._clearInstancedMeshes();
        this.atomDataArray = [];
        this.atomPositions = [];
        this.atomRadii = [];
        
        const atomsByType = new Map();
        moleculeData.atoms.forEach((atom, index) => {
            const symbol = atom.symbol;
            if (!atomsByType.has(symbol)) {
                atomsByType.set(symbol, []);
            }
            atomsByType.get(symbol).push({ atom, index });
        });
        
        const isLargeMolecule = moleculeData.atoms.length >= this.largeMoleculeThreshold;
        const quality = isLargeMolecule ? 'medium' : 'high';
        
        const dummy = new THREE.Object3D();
        
        for (const [symbol, atomList] of atomsByType) {
            const radius = getElementRadius(symbol, 0.5) * this.atomScale;
            const color = getElementColor(symbol);
            
            const geometry = this.getAtomGeometry(radius, quality);
            const material = this.getAtomMaterial(color);
            
            const instancedMesh = new THREE.InstancedMesh(
                geometry,
                material,
                atomList.length
            );
            
            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            instancedMesh.userData = {
                type: 'atomGroup',
                symbol: symbol,
                atomIndices: []
            };
            
            atomList.forEach((item, i) => {
                const { atom, index } = item;
                
                dummy.position.set(atom.x, atom.y, atom.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                
                instancedMesh.setMatrixAt(i, dummy.matrix);
                instancedMesh.userData.atomIndices.push(index);
                
                this.atomDataArray[index] = {
                    atom: atom,
                    symbol: symbol,
                    color: color,
                    radius: radius,
                    instanceId: i,
                    instancedMesh: instancedMesh
                };
                
                this.atomPositions[index] = new THREE.Vector3(atom.x, atom.y, atom.z);
                this.atomRadii[index] = radius;
            });
            
            instancedMesh.instanceMatrix.needsUpdate = true;
            this.atomsGroup.add(instancedMesh);
            this.instancedMeshes.set(symbol, instancedMesh);
        }
        
        this.bvh = new AtomBVH(
            moleculeData.atoms,
            this.atomPositions,
            this.atomRadii
        );
    }
    
    createLegacyAtoms(moleculeData) {
        this.atomDataArray = [];
        this.atomPositions = [];
        this.atomRadii = [];
        
        moleculeData.atoms.forEach((atom, index) => {
            const radius = getElementRadius(atom.symbol, 0.5) * this.atomScale;
            const color = getElementColor(atom.symbol);
            
            const geometry = this.getAtomGeometry(radius, 'high');
            const material = this.getAtomMaterial(color);
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(atom.x, atom.y, atom.z);
            mesh.userData = {
                type: 'atom',
                atomIndex: index,
                atomData: atom,
                originalColor: color
            };
            
            this.atomsGroup.add(mesh);
            
            this.atomDataArray[index] = {
                atom: atom,
                symbol: atom.symbol,
                color: color,
                radius: radius,
                mesh: mesh
            };
            
            this.atomPositions[index] = new THREE.Vector3(atom.x, atom.y, atom.z);
            this.atomRadii[index] = radius;
        });
        
        this.bvh = new AtomBVH(
            moleculeData.atoms,
            this.atomPositions,
            this.atomRadii
        );
    }
    
    createBonds(bondData, atoms) {
        if (atoms.length >= this.largeMoleculeThreshold) {
            this.createInstancedBonds(bondData, atoms);
            return;
        }
        
        this.bondMeshes = [];
        bondData.forEach(bond => {
            const atom1 = atoms[bond.atom1];
            const atom2 = atoms[bond.atom2];
            
            if (!atom1 || !atom2) return;
            
            const start = new THREE.Vector3(atom1.x, atom1.y, atom1.z);
            const end = new THREE.Vector3(atom2.x, atom2.y, atom2.z);
            const direction = end.clone().sub(start);
            const length = direction.length();
            
            const geometry = new THREE.CylinderGeometry(
                this.bondRadius,
                this.bondRadius,
                length,
                8
            );
            
            const mesh = new THREE.Mesh(geometry, this.bondMaterial);
            mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
            
            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                direction.clone().normalize()
            );
            mesh.rotation.setFromQuaternion(quaternion);
            
            this.bondsGroup.add(mesh);
            this.bondMeshes.push(mesh);
        });
    }
    
    createInstancedBonds(bondData, atoms) {
        const bondsByLength = new Map();
        
        bondData.forEach((bond, index) => {
            const atom1 = atoms[bond.atom1];
            const atom2 = atoms[bond.atom2];
            
            if (!atom1 || !atom2) return;
            
            const start = new THREE.Vector3(atom1.x, atom1.y, atom1.z);
            const end = new THREE.Vector3(atom2.x, atom2.y, atom2.z);
            const length = end.distanceTo(start);
            
            const lengthKey = length.toFixed(2);
            if (!bondsByLength.has(lengthKey)) {
                bondsByLength.set(lengthKey, []);
            }
            bondsByLength.get(lengthKey).push({ bond, start, end, length });
        });
        
        const dummy = new THREE.Object3D();
        
        for (const [lengthKey, bondList] of bondsByLength) {
            const length = parseFloat(lengthKey);
            const geometry = new THREE.CylinderGeometry(
                this.bondRadius,
                this.bondRadius,
                length,
                6
            );
            
            const instancedMesh = new THREE.InstancedMesh(
                geometry,
                this.bondMaterial,
                bondList.length
            );
            
            instancedMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
            
            bondList.forEach((item, i) => {
                const { start, end } = item;
                const direction = end.clone().sub(start).normalize();
                
                dummy.position.copy(start.clone().add(end).multiplyScalar(0.5));
                
                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    direction
                );
                dummy.rotation.setFromQuaternion(quaternion);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                
                instancedMesh.setMatrixAt(i, dummy.matrix);
            });
            
            instancedMesh.instanceMatrix.needsUpdate = true;
            this.bondsGroup.add(instancedMesh);
        }
    }
    
    renderMolecule(moleculeData) {
        this.clear();
        
        const positions = [];
        moleculeData.atoms.forEach(atom => {
            positions.push([atom.x, atom.y, atom.z]);
        });
        
        const center = this.calculateCenter(positions);
        moleculeData.atoms.forEach(atom => {
            atom.x -= center.x;
            atom.y -= center.y;
            atom.z -= center.z;
        });
        
        this.useInstancing = moleculeData.atoms.length >= 100;
        
        if (this.useInstancing) {
            this.createInstancedAtoms(moleculeData);
        } else {
            this.createLegacyAtoms(moleculeData);
        }
        
        this.createBonds(moleculeData.bonds, moleculeData.atoms);
        
        this.autoScale();
    }
    
    calculateCenter(positions) {
        if (positions.length === 0) return { x: 0, y: 0, z: 0 };
        
        const sum = positions.reduce(
            (acc, pos) => ({
                x: acc.x + pos[0],
                y: acc.y + pos[1],
                z: acc.z + pos[2]
            }),
            { x: 0, y: 0, z: 0 }
        );
        
        return {
            x: sum.x / positions.length,
            y: sum.y / positions.length,
            z: sum.z / positions.length
        };
    }
    
    autoScale() {
        if (this.atomPositions.length === 0) return;
        
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        
        for (let i = 0; i < this.atomPositions.length; i++) {
            const pos = this.atomPositions[i];
            const r = this.atomRadii[i];
            minX = Math.min(minX, pos.x - r);
            minY = Math.min(minY, pos.y - r);
            minZ = Math.min(minZ, pos.z - r);
            maxX = Math.max(maxX, pos.x + r);
            maxY = Math.max(maxY, pos.y + r);
            maxZ = Math.max(maxZ, pos.z + r);
        }
        
        const size = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);
        const maxDim = Math.max(size.x, size.y, size.z);
        
        if (maxDim > 20) {
            const scale = 15 / maxDim;
            this.moleculeGroup.scale.setScalar(scale);
        } else if (maxDim < 5) {
            const scale = 8 / maxDim;
            this.moleculeGroup.scale.setScalar(scale);
        }
    }
    
    intersectAtoms(ray) {
        if (!this.bvh) return [];
        
        const matrixWorld = this.moleculeGroup.matrixWorld;
        return this.bvh.intersect(ray, matrixWorld);
    }
    
    highlightAtomByIndex(atomIndex) {
        this.resetAllHighlights();
        
        if (atomIndex < 0 || atomIndex >= this.atomDataArray.length) return;
        
        const atomInfo = this.atomDataArray[atomIndex];
        if (!atomInfo) return;
        
        const pos = this.atomPositions[atomIndex];
        const radius = atomInfo.radius * 1.1;
        
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        this.highlightMesh = new THREE.Mesh(geometry, this.highlightMaterial);
        this.highlightMesh.position.copy(pos);
        this.highlightMesh.userData = { atomIndex: atomIndex };
        
        this.atomsGroup.add(this.highlightMesh);
    }
    
    resetAllHighlights() {
        if (this.highlightMesh) {
            this.atomsGroup.remove(this.highlightMesh);
            if (this.highlightMesh.geometry) {
                this.highlightMesh.geometry.dispose();
            }
            this.highlightMesh = null;
        }
    }
    
    getAtomDataByIndex(index) {
        if (index < 0 || index >= this.atomDataArray.length) return null;
        return this.atomDataArray[index]?.atom || null;
    }
    
    _clearInstancedMeshes() {
        this.instancedMeshes.forEach(mesh => {
            if (mesh.geometry) {
                mesh.geometry.dispose();
            }
        });
        this.instancedMeshes.clear();
    }
    
    clear() {
        while (this.atomsGroup.children.length > 0) {
            const child = this.atomsGroup.children[0];
            this.atomsGroup.remove(child);
            if (child.geometry && child !== this.highlightMesh) {
                child.geometry.dispose();
            }
        }
        
        while (this.bondsGroup.children.length > 0) {
            const child = this.bondsGroup.children[0];
            this.bondsGroup.remove(child);
            if (child.geometry) {
                child.geometry.dispose();
            }
        }
        
        this._clearInstancedMeshes();
        this.atomDataArray = [];
        this.atomPositions = [];
        this.atomRadii = [];
        this.bvh = null;
        this.highlightMesh = null;
        this.moleculeGroup.scale.setScalar(1);
    }
    
    getAtomMeshes() {
        if (this.useInstancing) {
            const meshes = [];
            this.instancedMeshes.forEach(mesh => meshes.push(mesh));
            return meshes;
        }
        
        const meshes = [];
        for (const info of this.atomDataArray) {
            if (info && info.mesh) {
                meshes.push(info.mesh);
            }
        }
        return meshes;
    }
    
    setRotation(x, y) {
        this.moleculeGroup.rotation.x = x;
        this.moleculeGroup.rotation.y = y;
    }
    
    rotate(deltaX, deltaY) {
        this.moleculeGroup.rotation.y += deltaX;
        this.moleculeGroup.rotation.x += deltaY;
        
        const maxRotX = Math.PI / 2;
        this.moleculeGroup.rotation.x = Math.max(
            -maxRotX,
            Math.min(maxRotX, this.moleculeGroup.rotation.x)
        );
    }
    
    setScale(scale) {
        const newScale = Math.max(0.1, Math.min(10, scale));
        this.moleculeGroup.scale.setScalar(newScale);
    }
    
    zoom(factor) {
        const currentScale = this.moleculeGroup.scale.x;
        const newScale = Math.max(0.1, Math.min(10, currentScale * factor));
        this.moleculeGroup.scale.setScalar(newScale);
    }
    
    resetView() {
        this.moleculeGroup.rotation.set(0, 0, 0);
        this.autoScale();
        this.resetAllHighlights();
    }
    
    getAtomCount() {
        return this.atomDataArray.length;
    }

    updateAtomPositions(positions) {
        if (positions.length !== this.atomDataArray.length) {
            console.warn('位置数组长度与原子数不匹配');
            return;
        }

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            this.atomPositions[i].set(pos[0], pos[1], pos[2]);

            const atomInfo = this.atomDataArray[i];
            if (!atomInfo) continue;

            if (this.useInstancing && atomInfo.instancedMesh) {
                const matrix = new THREE.Matrix4();
                matrix.makeTranslation(pos[0], pos[1], pos[2]);
                atomInfo.instancedMesh.setMatrixAt(atomInfo.instanceId, matrix);
                atomInfo.instancedMesh.instanceMatrix.needsUpdate = true;
            } else if (atomInfo.mesh) {
                atomInfo.mesh.position.set(pos[0], pos[1], pos[2]);
            }
        }

        if (this.highlightMesh && this.selectedAtomIndex >= 0) {
            const pos = positions[this.selectedAtomIndex];
            if (pos) {
                this.highlightMesh.position.set(pos[0], pos[1], pos[2]);
            }
        }

        this._updateBondPositions(positions);
        this._updateBVH();
    }

    updateAtomPositionsInterpolated(frameA, frameB, t) {
        const positions = [];
        for (let i = 0; i < frameA.length; i++) {
            const posA = frameA[i];
            const posB = frameB[i];
            positions.push([
                posA[0] + (posB[0] - posA[0]) * t,
                posA[1] + (posB[1] - posA[1]) * t,
                posA[2] + (posB[2] - posA[2]) * t
            ]);
        }
        this.updateAtomPositions(positions);
    }

    _updateBondPositions(positions) {
        if (!this.currentBonds || this.currentBonds.length === 0) return;

        if (this.bondInstancedMeshes) {
            let bondIndex = 0;
            for (const [lengthKey, instancedMesh] of this.bondInstancedMeshes) {
                const bondList = this.bondsByLength.get(lengthKey);
                if (!bondList) continue;

                for (let i = 0; i < bondList.length; i++) {
                    const bond = bondList[i];
                    const atom1 = positions[bond.atom1];
                    const atom2 = positions[bond.atom2];

                    if (!atom1 || !atom2) continue;

                    const start = new THREE.Vector3(atom1[0], atom1[1], atom1[2]);
                    const end = new THREE.Vector3(atom2[0], atom2[1], atom2[2]);
                    const direction = end.clone().sub(start).normalize();
                    const length = end.distanceTo(start);

                    const matrix = new THREE.Matrix4();
                    const position = start.clone().add(end).multiplyScalar(0.5);
                    const quaternion = new THREE.Quaternion();
                    quaternion.setFromUnitVectors(
                        new THREE.Vector3(0, 1, 0),
                        direction
                    );
                    const scale = new THREE.Vector3(1, length / this.bondBaseLengths.get(lengthKey), 1);

                    matrix.compose(position, quaternion, scale);
                    instancedMesh.setMatrixAt(i, matrix);
                }
                instancedMesh.instanceMatrix.needsUpdate = true;
            }
        } else {
            for (let i = 0; i < this.currentBonds.length; i++) {
                const bond = this.currentBonds[i];
                const bondMesh = this.bondMeshes[i];

                if (!bondMesh) continue;

                const atom1 = positions[bond.atom1];
                const atom2 = positions[bond.atom2];

                if (!atom1 || !atom2) continue;

                const start = new THREE.Vector3(atom1[0], atom1[1], atom1[2]);
                const end = new THREE.Vector3(atom2[0], atom2[1], atom2[2]);
                const direction = end.clone().sub(start);
                const length = direction.length();

                bondMesh.position.copy(start.clone().add(end).multiplyScalar(0.5));

                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    direction.clone().normalize()
                );
                bondMesh.rotation.setFromQuaternion(quaternion);

                bondMesh.scale.y = length / this.bondOriginalLengths[i];
            }
        }
    }

    _updateBVH() {
        if (!this.bvh || !this.bvh.atoms) return;

        for (let i = 0; i < this.bvh.atoms.length; i++) {
            const atom = this.bvh.atoms[i];
            const pos = this.atomPositions[i];
            if (atom && pos) {
                atom.x = pos.x;
                atom.y = pos.y;
                atom.z = pos.z;
            }
        }
    }

    setupForTrajectory(bonds, atoms) {
        this.currentBonds = bonds;
        this.bondOriginalLengths = [];
        this.bondInstancedMeshes = null;
        this.bondsByLength = null;
        this.bondBaseLengths = null;

        if (atoms.length >= this.largeMoleculeThreshold) {
            this._setupInstancedBonds(bonds, atoms);
        } else {
            this.bondMeshes.forEach((mesh, i) => {
                const bond = bonds[i];
                const atom1 = atoms[bond.atom1];
                const atom2 = atoms[bond.atom2];
                if (atom1 && atom2) {
                    const dx = atom2.x - atom1.x;
                    const dy = atom2.y - atom1.y;
                    const dz = atom2.z - atom1.z;
                    this.bondOriginalLengths[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
                }
            });
        }
    }

    _setupInstancedBonds(bonds, atoms) {
        this.bondInstancedMeshes = new Map();
        this.bondsByLength = new Map();
        this.bondBaseLengths = new Map();

        bonds.forEach((bond, index) => {
            const atom1 = atoms[bond.atom1];
            const atom2 = atoms[bond.atom2];

            if (!atom1 || !atom2) return;

            const dx = atom2.x - atom1.x;
            const dy = atom2.y - atom1.y;
            const dz = atom2.z - atom1.z;
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const lengthKey = length.toFixed(2);

            if (!this.bondsByLength.has(lengthKey)) {
                this.bondsByLength.set(lengthKey, []);
                this.bondBaseLengths.set(lengthKey, length);
            }
            this.bondsByLength.get(lengthKey).push(bond);
        });

        const dummy = new THREE.Object3D();
        for (const [lengthKey, bondList] of this.bondsByLength) {
            const baseLength = this.bondBaseLengths.get(lengthKey);
            const geometry = new THREE.CylinderGeometry(
                this.bondRadius,
                this.bondRadius,
                baseLength,
                6
            );

            const instancedMesh = new THREE.InstancedMesh(
                geometry,
                this.bondMaterial,
                bondList.length
            );

            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

            bondList.forEach((bond, i) => {
                const atom1 = atoms[bond.atom1];
                const atom2 = atoms[bond.atom2];
                const start = new THREE.Vector3(atom1.x, atom1.y, atom1.z);
                const end = new THREE.Vector3(atom2.x, atom2.y, atom2.z);
                const direction = end.clone().sub(start).normalize();

                dummy.position.copy(start.clone().add(end).multiplyScalar(0.5));

                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    direction
                );
                dummy.rotation.setFromQuaternion(quaternion);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();

                instancedMesh.setMatrixAt(i, dummy.matrix);
            });

            instancedMesh.instanceMatrix.needsUpdate = true;
            this.bondInstancedMeshes.set(lengthKey, instancedMesh);
        }
    }

    setSelectedAtomIndex(index) {
        this.selectedAtomIndex = index;
    }
}
