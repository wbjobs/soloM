import * as THREE from 'three';
import { MoleculeRenderer } from './src/renderer.js';
import { parseFile } from './src/parsers.js';
import { getSampleMoleculeData } from './src/samples.js';
import { CATEGORY_NAMES } from './src/elements.js';
import { generateTestMolecule, downloadTestFile } from './src/testDataGenerator.js';
import { parseTrajectory, TrajectoryData, TrajectoryFrame } from './src/trajectoryParser.js';
import { getElementData } from './src/elements.js';
import { TrajectoryPlayer, TrajectoryUIController } from './src/trajectoryPlayer.js';

class MoleculeEditor {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.moleculeRenderer = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.rotationVelocity = { x: 0, y: 0 };
        
        this.currentMolecule = null;
        this.selectedAtomIndex = -1;
        
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;
        
        this.trajectoryPlayer = null;
        this.trajectoryUI = null;
        this.currentTrajectory = null;
        
        this.init();
        this.bindEvents();
        this.animate();
    }
    
    init() {
        const canvas = document.getElementById('threeCanvas');
        const container = document.getElementById('canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);
        
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        this.camera.position.set(0, 0, 15);
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        this.setupLighting();
        this.addGridHelper();
        
        this.moleculeRenderer = new MoleculeRenderer(this.scene);
        
        this.loadSampleMolecule('water');
    }
    
    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);
        
        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(10, 10, 10);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        this.scene.add(mainLight);
        
        const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
        fillLight.position.set(-10, 5, -10);
        this.scene.add(fillLight);
        
        const backLight = new THREE.DirectionalLight(0xff8888, 0.2);
        backLight.position.set(0, -10, -5);
        this.scene.add(backLight);
    }
    
    addGridHelper() {
        const gridHelper = new THREE.GridHelper(30, 30, 0x333355, 0x222244);
        gridHelper.position.y = -8;
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);
        
        this.addFPSDisplay();
    }
    
    addFPSDisplay() {
        const fpsDiv = document.createElement('div');
        fpsDiv.id = 'fpsDisplay';
        fpsDiv.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #00ff88;
            padding: 8px 12px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 14px;
            font-weight: bold;
            z-index: 100;
            border: 1px solid #00ff88;
        `;
        document.getElementById('canvas-container').appendChild(fpsDiv);
        
        const atomCountDiv = document.createElement('div');
        atomCountDiv.id = 'atomCountDisplay';
        atomCountDiv.style.cssText = `
            position: absolute;
            top: 50px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #ffcc00;
            padding: 8px 12px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 14px;
            font-weight: bold;
            z-index: 100;
            border: 1px solid #ffcc00;
        `;
        document.getElementById('canvas-container').appendChild(atomCountDiv);
    }
    
    updateFPSDisplay() {
        this.frameCount++;
        const now = performance.now();
        const delta = now - this.lastTime;
        
        if (delta >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / delta);
            this.frameCount = 0;
            this.lastTime = now;
            
            const fpsDiv = document.getElementById('fpsDisplay');
            if (fpsDiv) {
                let color = '#00ff88';
                if (this.fps < 30) color = '#ffcc00';
                if (this.fps < 15) color = '#ff4444';
                
                fpsDiv.style.color = color;
                fpsDiv.style.borderColor = color;
                fpsDiv.textContent = `FPS: ${this.fps}`;
            }
            
            const atomCountDiv = document.getElementById('atomCountDisplay');
            if (atomCountDiv) {
                const atomCount = this.moleculeRenderer.getAtomCount();
                atomCountDiv.textContent = `原子数: ${atomCount.toLocaleString()}`;
            }
        }
    }
    
    bindEvents() {
        const canvas = this.renderer.domElement;
        const container = document.getElementById('canvas-container');
        
        canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
        canvas.addEventListener('wheel', this.onWheel.bind(this));
        canvas.addEventListener('click', this.onClick.bind(this));
        
        window.addEventListener('resize', this.onResize.bind(this));
        
        document.getElementById('fileInput').addEventListener('change', this.onFileSelect.bind(this));
        document.getElementById('resetBtn').addEventListener('click', this.onResetView.bind(this));
        document.getElementById('clearBtn').addEventListener('click', this.onClear.bind(this));
        
        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const moleculeName = btn.dataset.molecule;
                this.loadSampleMolecule(moleculeName);
            });
        });
        
        document.querySelectorAll('.test-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const count = parseInt(btn.dataset.count);
                this.loadTestMolecule(count);
            });
        });
        
        document.querySelectorAll('.trajectory-demo-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const demoType = btn.dataset.demo;
                this.loadTrajectoryDemo(demoType);
            });
        });
    }
    
    onMouseDown(event) {
        this.isDragging = true;
        this.previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
        this.rotationVelocity = { x: 0, y: 0 };
        
        this.updateMousePosition(event);
        this.checkHover();
    }
    
    onMouseMove(event) {
        this.updateMousePosition(event);
        
        if (this.isDragging) {
            const deltaX = (event.clientX - this.previousMousePosition.x) * 0.01;
            const deltaY = (event.clientY - this.previousMousePosition.y) * 0.01;
            
            this.moleculeRenderer.rotate(deltaX, deltaY);
            
            this.rotationVelocity = { x: deltaX, y: deltaY };
            this.previousMousePosition = { x: event.clientX, y: event.clientY };
        } else {
            this.checkHover();
        }
    }
    
    onMouseUp(event) {
        this.isDragging = false;
    }
    
    onMouseLeave(event) {
        this.isDragging = false;
        this.moleculeRenderer.resetAllHighlights();
    }
    
    onWheel(event) {
        event.preventDefault();
        
        const zoomFactor = event.deltaY > 0 ? 0.95 : 1.05;
        this.moleculeRenderer.zoom(zoomFactor);
    }
    
    onClick(event) {
        if (Math.abs(this.rotationVelocity.x) > 0.005 || 
            Math.abs(this.rotationVelocity.y) > 0.005) {
            return;
        }
        
        this.updateMousePosition(event);
        const hits = this.getIntersects();
        
        if (hits.length > 0) {
            const hit = hits[0];
            this.selectAtomByIndex(hit.atomIndex);
        } else {
            this.deselectAtom();
        }
    }
    
    updateMousePosition(event) {
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }
    
    getIntersects() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        return this.moleculeRenderer.intersectAtoms(this.raycaster.ray);
    }
    
    checkHover() {
        const hits = this.getIntersects();
        
        if (hits.length > 0) {
            const hit = hits[0];
            const atomData = this.moleculeRenderer.getAtomDataByIndex(hit.atomIndex);
            if (atomData) {
                this.showHoverTooltip(atomData, hit.point);
                document.body.style.cursor = 'pointer';
            }
        } else {
            this.hideHoverTooltip();
            if (!this.isDragging) {
                document.body.style.cursor = 'grab';
            }
        }
    }
    
    showHoverTooltip(atomData, worldPoint) {
        let tooltip = document.getElementById('atomTooltip');
        
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'atomTooltip';
            tooltip.className = 'atom-tooltip';
            document.body.appendChild(tooltip);
        }
        
        tooltip.innerHTML = `<strong>${atomData.symbol}</strong> - ${atomData.nameCN} (${atomData.name})`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${event.clientX + 15}px`;
        tooltip.style.top = `${event.clientY + 15}px`;
    }
    
    hideHoverTooltip() {
        const tooltip = document.getElementById('atomTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }
    
    selectAtomByIndex(atomIndex) {
        this.selectedAtomIndex = atomIndex;
        this.moleculeRenderer.setSelectedAtomIndex(atomIndex);
        this.moleculeRenderer.highlightAtomByIndex(atomIndex);
        
        const atomInfo = this.moleculeRenderer.getAtomDataByIndex(atomIndex);
        if (atomInfo) {
            this.updateElementInfoPanel(atomInfo);
        }
        
        document.body.style.cursor = 'default';
    }
    
    deselectAtom() {
        this.selectedAtomIndex = -1;
        this.moleculeRenderer.setSelectedAtomIndex(-1);
        this.moleculeRenderer.resetAllHighlights();
        
        document.getElementById('elementInfo').innerHTML = 
            '<p class="placeholder">点击原子查看详细信息</p>';
    }
    
    updateElementInfoPanel(atomData) {
        const panel = document.getElementById('elementInfo');
        const element = atomData.elementData;
        
        const categoryCN = CATEGORY_NAMES[element.category] || element.category;
        const colorHex = '#' + element.color.toString(16).padStart(6, '0');
        
        panel.innerHTML = `
            <div class="element-header">
                <div class="element-symbol" style="background-color: ${colorHex}">
                    ${atomData.symbol}
                </div>
                <div>
                    <div class="element-name">${element.nameCN}</div>
                    <div style="color: #888; font-size: 0.85rem;">${element.name}</div>
                </div>
            </div>
            <div class="info-row">
                <span class="info-label">原子序数</span>
                <span class="info-value">${element.atomicNumber}</span>
            </div>
            <div class="info-row">
                <span class="info-label">原子量</span>
                <span class="info-value">${element.atomicMass.toFixed(3)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">分类</span>
                <span class="info-value">${categoryCN}</span>
            </div>
            <div class="info-row">
                <span class="info-label">电负性</span>
                <span class="info-value">${element.electronegativity || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">共价半径</span>
                <span class="info-value">${element.covalentRadius} Å</span>
            </div>
            <div class="info-row">
                <span class="info-label">电子构型</span>
                <span class="info-value">${element.electronConfig || '-'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">坐标</span>
                <span class="info-value">(${atomData.x.toFixed(2)}, ${atomData.y.toFixed(2)}, ${atomData.z.toFixed(2)})</span>
            </div>
        `;
    }
    
    updateMoleculeInfoPanel() {
        const panel = document.getElementById('moleculeInfo');
        
        if (!this.currentMolecule) {
            panel.innerHTML = '<p class="placeholder">请导入 .pdb 或 .xyz 文件</p>';
            return;
        }
        
        const mol = this.currentMolecule;
        const elementCounts = {};
        mol.atoms.forEach(atom => {
            elementCounts[atom.symbol] = (elementCounts[atom.symbol] || 0) + 1;
        });
        
        const elementsList = Object.entries(elementCounts)
            .map(([sym, count]) => `${sym}×${count}`)
            .join(', ');
        
        panel.innerHTML = `
            <div class="info-row">
                <span class="info-label">名称</span>
                <span class="info-value">${mol.title}</span>
            </div>
            <div class="info-row">
                <span class="info-label">文件</span>
                <span class="info-value">${mol.filename}</span>
            </div>
            <div class="info-row">
                <span class="info-label">格式</span>
                <span class="info-value">${mol.format.toUpperCase()}</span>
            </div>
            <div class="info-row">
                <span class="info-label">原子数</span>
                <span class="info-value">${mol.atomCount}</span>
            </div>
            <div class="info-row">
                <span class="info-label">化学键</span>
                <span class="info-value">${mol.bondCount}</span>
            </div>
            <div class="info-row" style="flex-direction: column; align-items: flex-start;">
                <span class="info-label" style="margin-bottom: 4px;">元素组成</span>
                <span class="info-value" style="word-break: break-all;">${elementsList}</span>
            </div>
        `;
    }
    
    async onFileSelect(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        this.showLoading(true);
        
        try {
            for (const file of files) {
                const ext = file.name.split('.').pop().toLowerCase();
                const isTrajectory = ['xyz', 'xtc', 'trr', 'bin'].includes(ext);
                
                if (isTrajectory && ext !== 'pdb') {
                    const content = await this.readFile(file, ext === 'trr' || ext === 'bin');
                    const trajectoryData = parseTrajectory(content, file.name);
                    
                    if (trajectoryData.getFrameCount() > 1) {
                        this.loadTrajectory(trajectoryData);
                    } else {
                        const firstFrame = trajectoryData.getFrame(0);
                        const moleculeData = {
                            title: trajectoryData.filename,
                            filename: trajectoryData.filename,
                            format: 'xyz',
                            atoms: firstFrame.atoms,
                            bonds: trajectoryData.topology.bonds,
                            atomCount: firstFrame.getAtomCount(),
                            bondCount: trajectoryData.topology.bonds.length
                        };
                        
                        this.currentMolecule = moleculeData;
                        this.moleculeRenderer.renderMolecule(moleculeData);
                        this.updateMoleculeInfoPanel();
                        this.deselectAtom();
                        this.hideTrajectoryControls();
                    }
                } else {
                    const content = await this.readFile(file);
                    const moleculeData = parseFile(content, file.name);
                    
                    this.currentMolecule = moleculeData;
                    this.moleculeRenderer.renderMolecule(moleculeData);
                    this.updateMoleculeInfoPanel();
                    this.deselectAtom();
                    this.hideTrajectoryControls();
                }
                
                break;
            }
        } catch (error) {
            console.error('文件解析错误:', error);
            alert('文件解析失败: ' + error.message);
        } finally {
            this.showLoading(false);
            event.target.value = '';
        }
    }
    
    readFile(file, asBinary = false) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            
            if (asBinary) {
                reader.readAsArrayBuffer(file);
            } else {
                reader.readAsText(file);
            }
        });
    }
    
    loadTrajectory(trajectoryData) {
        this.currentTrajectory = trajectoryData;
        
        const firstFrame = trajectoryData.getFrame(0);
        const moleculeData = {
            title: trajectoryData.filename,
            filename: trajectoryData.filename,
            format: trajectoryData.format,
            atoms: firstFrame.atoms,
            bonds: trajectoryData.topology.bonds,
            atomCount: firstFrame.getAtomCount(),
            bondCount: trajectoryData.topology.bonds.length
        };
        
        this.currentMolecule = moleculeData;
        this.moleculeRenderer.renderMolecule(moleculeData);
        this.moleculeRenderer.setupForTrajectory(trajectoryData.topology.bonds, firstFrame.atoms);
        
        this.updateMoleculeInfoPanel();
        this.deselectAtom();
        
        if (this.trajectoryPlayer) {
            this.trajectoryPlayer.destroy();
        }
        
        this.trajectoryPlayer = new TrajectoryPlayer(this.moleculeRenderer, trajectoryData);
        this.moleculeRenderer.setSelectedAtomIndex = this.moleculeRenderer.setSelectedAtomIndex.bind(this.moleculeRenderer);
        
        const panel = document.getElementById('trajectoryPanel');
        const container = document.getElementById('trajectoryContainer');
        
        if (this.trajectoryUI) {
            this.trajectoryUI.destroy();
        }
        
        this.trajectoryUI = new TrajectoryUIController(container, this.trajectoryPlayer);
        panel.style.display = 'block';
        
        this.trajectoryPlayer.play();
    }
    
    hideTrajectoryControls() {
        if (this.trajectoryPlayer) {
            this.trajectoryPlayer.destroy();
            this.trajectoryPlayer = null;
        }
        
        if (this.trajectoryUI) {
            this.trajectoryUI.destroy();
            this.trajectoryUI = null;
        }
        
        const panel = document.getElementById('trajectoryPanel');
        if (panel) {
            panel.style.display = 'none';
        }
        
        this.currentTrajectory = null;
    }
    
    loadTrajectoryDemo(demoType) {
        this.showLoading(true);
        
        setTimeout(() => {
            try {
                const trajectory = this.generateDemoTrajectory(demoType);
                this.loadTrajectory(trajectory);
            } catch (error) {
                console.error('生成演示轨迹失败:', error);
                alert('生成演示轨迹失败: ' + error.message);
            } finally {
                this.showLoading(false);
            }
        }, 100);
    }
    
    generateDemoTrajectory(demoType) {
        const trajectory = new TrajectoryData();
        trajectory.filename = `${demoType}_demo.xyz`;
        trajectory.format = 'xyz';
        
        let baseAtoms;
        const frameCount = 100;
        const timeStep = 0.01;
        
        if (demoType === 'vibration') {
            baseAtoms = [
                { symbol: 'O', x: 0, y: 0, z: 0 },
                { symbol: 'H', x: 0.958, y: 0, z: 0 },
                { symbol: 'H', x: -0.239, y: 0.927, z: 0 }
            ];
        } else if (demoType === 'rotation') {
            baseAtoms = [
                { symbol: 'C', x: 0, y: 0, z: 0 },
                { symbol: 'H', x: 1.087, y: 0, z: 0 },
                { symbol: 'H', x: -0.362, y: 1.025, z: 0 },
                { symbol: 'H', x: -0.362, y: -0.513, z: 0.889 },
                { symbol: 'H', x: -0.362, y: -0.513, z: -0.889 }
            ];
        } else {
            baseAtoms = this.generateProteinChain(30);
        }
        
        trajectory.atomSymbols = baseAtoms.map(a => a.symbol);
        
        for (let f = 0; f < frameCount; f++) {
            const time = f * timeStep;
            const atoms = [];
            
            for (let i = 0; i < baseAtoms.length; i++) {
                const base = baseAtoms[i];
                let x = base.x, y = base.y, z = base.z;
                
                if (demoType === 'vibration') {
                    const freq = 10 + i * 2;
                    const amp = 0.1;
                    x += Math.sin(time * freq * Math.PI * 2) * amp;
                    y += Math.cos(time * freq * Math.PI * 2) * amp * 0.5;
                } else if (demoType === 'rotation') {
                    const angle = time * 4 * Math.PI;
                    const axis = new THREE.Vector3(0.5, 1, 0.3).normalize();
                    const pos = new THREE.Vector3(base.x, base.y, base.z);
                    pos.applyAxisAngle(axis, angle);
                    x = pos.x;
                    y = pos.y;
                    z = pos.z;
                } else {
                    const progress = f / frameCount;
                    const unfoldFactor = progress * 2;
                    const atomProgress = i / baseAtoms.length;
                    
                    const wave = Math.sin(atomProgress * Math.PI * 4 + time * Math.PI * 2) * 0.3;
                    const stretch = atomProgress * unfoldFactor * 3;
                    
                    x += stretch;
                    y += wave;
                    z += Math.sin(atomProgress * Math.PI * 2 + time * Math.PI) * 0.5;
                }
                
                const elementData = getElementData(base.symbol);
                atoms.push({
                    id: i,
                    symbol: base.symbol,
                    name: elementData.name,
                    nameCN: elementData.nameCN,
                    x, y, z,
                    elementData
                });
            }
            
            const frame = new TrajectoryFrame(atoms, time, f);
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
                bonds: this.calculateBondsForDemo(firstFrame.atoms)
            };
        }
        
        return trajectory;
    }
    
    generateProteinChain(length) {
        const atoms = [];
        const residues = ['ALA', 'GLY', 'SER', 'VAL', 'LEU'];
        const atomTypes = ['N', 'CA', 'C', 'O', 'CB'];
        
        for (let i = 0; i < length; i++) {
            const resType = residues[i % residues.length];
            const atomCount = resType === 'GLY' ? 4 : 5;
            
            for (let j = 0; j < atomCount; j++) {
                const atomType = atomTypes[j];
                const symbol = atomType === 'CA' || atomType === 'CB' ? 'C' : 
                              atomType === 'N' ? 'N' : 'O';
                
                const z = i * 3.8;
                const angle = (i % 4) * Math.PI / 2;
                const radius = j === 0 ? 0 : (j === 1 ? 0 : (j === 2 ? 1.2 : (j === 3 ? 2.0 : 1.5)));
                
                atoms.push({
                    symbol,
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius,
                    z: z + (j - 2) * 0.5
                });
            }
        }
        
        return atoms;
    }
    
    calculateBondsForDemo(atoms) {
        const bonds = [];
        const maxBondLength = 1.8;
        
        for (let i = 0; i < atoms.length; i++) {
            for (let j = i + 1; j < Math.min(i + 6, atoms.length); j++) {
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
    
    loadSampleMolecule(name) {
        const moleculeData = getSampleMoleculeData(name);
        if (!moleculeData) return;
        
        this.currentMolecule = moleculeData;
        this.moleculeRenderer.renderMolecule(moleculeData);
        this.updateMoleculeInfoPanel();
        this.deselectAtom();
    }
    
    loadTestMolecule(atomCount) {
        this.showLoading(true);
        
        setTimeout(() => {
            try {
                const startTime = performance.now();
                const moleculeData = generateTestMolecule(atomCount);
                const parseTime = performance.now() - startTime;
                
                this.currentMolecule = moleculeData;
                
                const renderStartTime = performance.now();
                this.moleculeRenderer.renderMolecule(moleculeData);
                const renderTime = performance.now() - renderStartTime;
                
                this.updateMoleculeInfoPanel();
                this.deselectAtom();
                
                console.log(`✅ 加载 ${atomCount.toLocaleString()} 个原子完成:`);
                console.log(`   数据生成: ${parseTime.toFixed(2)}ms`);
                console.log(`   渲染耗时: ${renderTime.toFixed(2)}ms`);
            } catch (error) {
                console.error('生成测试分子失败:', error);
                alert('生成测试分子失败: ' + error.message);
            } finally {
                this.showLoading(false);
            }
        }, 100);
    }
    
    onResetView() {
        this.moleculeRenderer.resetView();
        this.rotationVelocity = { x: 0, y: 0 };
    }
    
    onClear() {
        this.currentMolecule = null;
        this.moleculeRenderer.clear();
        this.updateMoleculeInfoPanel();
        this.deselectAtom();
    }
    
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }
    
    onResize() {
        const container = document.getElementById('canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
    
    applyInertia() {
        if (!this.isDragging) {
            const friction = 0.95;
            const minVelocity = 0.001;
            
            if (Math.abs(this.rotationVelocity.x) > minVelocity || 
                Math.abs(this.rotationVelocity.y) > minVelocity) {
                this.moleculeRenderer.rotate(
                    this.rotationVelocity.x,
                    this.rotationVelocity.y
                );
                
                this.rotationVelocity.x *= friction;
                this.rotationVelocity.y *= friction;
            }
        }
    }
    
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        const currentTime = performance.now();
        
        this.applyInertia();
        this.updateFPSDisplay();
        
        if (this.trajectoryPlayer) {
            this.trajectoryPlayer.update(currentTime);
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MoleculeEditor();
});
