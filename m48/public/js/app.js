import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class WiFiHeatmapSimulator {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.floor = null;
        this.walls = [];
        this.userWalls = [];
        this.routers = [];
        this.heatmapMesh = null;
        this.heatmapData = null;
        this.heatmapCanvas = null;
        this.textureScale = 8;
        this.roomModel = null;
        this.isPlacingRouter = false;
        this.isDrawingWall = false;
        this.wallStartPoint = null;
        this.wallPreviewLine = null;
        this.wallIdCounter = 100;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.routerIdCounter = 1;
        
        this.wallMaterials = {
            concrete: { name: '混凝土', color: 0x6b6b6b, attenuation: '12dB/18dB' },
            wood: { name: '木板', color: 0x8b4513, attenuation: '4dB/6dB' },
            brick: { name: '砖墙', color: 0xb22222, attenuation: '8dB/12dB' },
            glass: { name: '玻璃', color: 0x87ceeb, attenuation: '2dB/3dB' },
            metal: { name: '金属', color: 0x708090, attenuation: '25dB/35dB' }
        };
        
        this.init();
        this.loadRoomModel();
        this.setupEventListeners();
        this.animate();
    }
    
    dBmToMW(dBm) {
        return Math.pow(10, dBm / 10);
    }
    
    mWToDBm(mW) {
        if (mW <= 0) return -100;
        return 10 * Math.log10(mW);
    }
    
    calculateCombinedRSSIFrontend(gridPoint, routers) {
        const channelGroups = {};
        
        for (const router of routers) {
            const channel = router.channel || 1;
            if (!channelGroups[channel]) {
                channelGroups[channel] = [];
            }
            channelGroups[channel].push(gridPoint.rssi);
        }
        
        let maxChannelRSSI = -100;
        for (const channel in channelGroups) {
            const rssiList = channelGroups[channel];
            let totalMW = 0;
            for (const rssi of rssiList) {
                totalMW += this.dBmToMW(rssi);
            }
            const combinedRSSI = this.mWToDBm(totalMW);
            maxChannelRSSI = Math.max(maxChannelRSSI, combinedRSSI);
        }
        
        return maxChannelRSSI;
    }
    
    init() {
        const container = document.getElementById('scene-container');
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        
        this.camera = new THREE.PerspectiveCamera(
            60,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(10, 10, 10);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        
        const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
        this.scene.add(gridHelper);
        
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    async loadRoomModel() {
        try {
            this.updateStatus('加载房间模型中...');
            const response = await fetch('/api/room-model');
            this.roomModel = await response.json();
            this.createRoom();
            this.updateStatus('房间模型加载完成');
        } catch (error) {
            console.error('Failed to load room model:', error);
            this.updateStatus('使用默认房间设置');
            this.createDefaultRoom();
        }
    }
    
    createRoom() {
        const size = this.roomModel.size;
        
        const floorGeometry = new THREE.PlaneGeometry(size.width, size.depth);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a4a,
            side: THREE.DoubleSide
        });
        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);
        
        for (const wall of this.roomModel.walls) {
            this.createWall(wall);
        }
    }
    
    createWall(wall, isUserWall = false) {
        const height = wall.height || 2.8;
        const thickness = 0.15;
        const materialName = wall.material || 'concrete';
        const materialInfo = this.wallMaterials[materialName] || this.wallMaterials.concrete;
        
        let geometry, position, rotation;
        
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        geometry = new THREE.BoxGeometry(length, height, thickness);
        position = new THREE.Vector3(
            (wall.x1 + wall.x2) / 2,
            height / 2,
            (wall.y1 + wall.y2) / 2
        );
        rotation = new THREE.Euler(0, -angle, 0);
        
        let wallColor;
        if (isUserWall) {
            wallColor = materialInfo.color;
        } else {
            wallColor = wall.type === 'outer' ? 0x4a4a6a : materialInfo.color;
        }
        
        const opacity = materialName === 'glass' ? 0.4 : 0.8;
        
        const material = new THREE.MeshStandardMaterial({
            color: wallColor,
            transparent: true,
            opacity: opacity
        });
        
        const wallMesh = new THREE.Mesh(geometry, material);
        wallMesh.position.copy(position);
        wallMesh.rotation.copy(rotation);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        wallMesh.userData.wallId = wall.id;
        wallMesh.userData.isUserWall = isUserWall;
        
        if (isUserWall) {
            this.userWalls.push({ ...wall, mesh: wallMesh });
        }
        
        this.walls.push(wallMesh);
        this.scene.add(wallMesh);
        
        return wallMesh;
    }
    
    createDefaultRoom() {
        const size = { width: 10, depth: 8, height: 2.8 };
        
        const floorGeometry = new THREE.PlaneGeometry(size.width, size.depth);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a4a,
            side: THREE.DoubleSide
        });
        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);
    }
    
    setupEventListeners() {
        const powerSlider = document.getElementById('power');
        const powerValue = document.getElementById('powerValue');
        powerSlider.addEventListener('input', (e) => {
            powerValue.textContent = e.target.value;
        });
        
        const wallHeightSlider = document.getElementById('wallHeight');
        const wallHeightValue = document.getElementById('wallHeightValue');
        wallHeightSlider.addEventListener('input', (e) => {
            wallHeightValue.textContent = e.target.value;
        });
        
        document.getElementById('addRouter').addEventListener('click', () => {
            this.cancelWallDrawing();
            this.isPlacingRouter = true;
            this.updateStatus('点击地板放置路由器...');
        });
        
        document.getElementById('clearRouters').addEventListener('click', () => {
            this.clearRouters();
        });
        
        document.getElementById('startDrawWall').addEventListener('click', () => {
            this.startWallDrawing();
        });
        
        document.getElementById('cancelDrawWall').addEventListener('click', () => {
            this.cancelWallDrawing();
        });
        
        document.getElementById('clearUserWalls').addEventListener('click', () => {
            this.clearUserWalls();
        });
        
        document.getElementById('calculateHeatmap').addEventListener('click', () => {
            this.calculateHeatmap();
        });
        
        document.getElementById('clearHeatmap').addEventListener('click', () => {
            this.clearHeatmap();
        });
        
        document.getElementById('topView').addEventListener('click', () => {
            this.setTopView();
        });
        
        document.getElementById('perspectiveView').addEventListener('click', () => {
            this.setPerspectiveView();
        });
        
        document.getElementById('resetCamera').addEventListener('click', () => {
            this.resetCamera();
        });
        
        this.renderer.domElement.addEventListener('click', (e) => {
            if (this.isPlacingRouter) {
                this.onCanvasClick(e);
            } else if (this.isDrawingWall) {
                this.onWallDrawClick(e);
            }
        });
        
        this.renderer.domElement.addEventListener('mousemove', (e) => {
            this.onMouseMove(e);
            if (this.isDrawingWall && this.wallStartPoint) {
                this.updateWallPreview();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.isDrawingWall) {
                    this.cancelWallDrawing();
                } else if (this.isPlacingRouter) {
                    this.isPlacingRouter = false;
                    this.updateStatus('已取消放置路由器');
                }
            }
        });
    }
    
    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }
    
    onCanvasClick(event) {
        if (!this.floor) return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.floor);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            this.addRouter(point.x, point.z);
            this.isPlacingRouter = false;
            this.updateStatus('路由器已放置');
        }
    }
    
    startWallDrawing() {
        this.isPlacingRouter = false;
        this.isDrawingWall = true;
        this.wallStartPoint = null;
        document.getElementById('startDrawWall').style.display = 'none';
        document.getElementById('cancelDrawWall').style.display = 'block';
        document.getElementById('drawHint').style.display = 'block';
        this.updateStatus('点击地板设置墙体起点...');
    }
    
    cancelWallDrawing() {
        this.isDrawingWall = false;
        this.wallStartPoint = null;
        this.removeWallPreview();
        document.getElementById('startDrawWall').style.display = 'block';
        document.getElementById('cancelDrawWall').style.display = 'none';
        document.getElementById('drawHint').style.display = 'none';
        this.updateStatus('已取消墙体绘制');
    }
    
    onWallDrawClick(event) {
        if (!this.floor) return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.floor);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            
            if (!this.wallStartPoint) {
                this.wallStartPoint = { x: point.x, y: point.z };
                this.createWallPreview();
                this.updateStatus('点击地板设置墙体终点...');
            } else {
                const endPoint = { x: point.x, y: point.z };
                const distance = Math.sqrt(
                    Math.pow(endPoint.x - this.wallStartPoint.x, 2) +
                    Math.pow(endPoint.y - this.wallStartPoint.y, 2)
                );
                
                if (distance < 0.3) {
                    this.updateStatus('墙体太短，请重新设置终点');
                    return;
                }
                
                this.addUserWall(this.wallStartPoint, endPoint);
                this.removeWallPreview();
                this.wallStartPoint = null;
                this.isDrawingWall = false;
                document.getElementById('startDrawWall').style.display = 'block';
                document.getElementById('cancelDrawWall').style.display = 'none';
                document.getElementById('drawHint').style.display = 'none';
                this.updateStatus('墙体已创建');
            }
        }
    }
    
    addUserWall(startPoint, endPoint) {
        const material = document.getElementById('wallMaterial').value;
        const height = parseFloat(document.getElementById('wallHeight').value);
        
        const wall = {
            id: this.wallIdCounter++,
            type: 'user',
            material: material,
            x1: startPoint.x,
            y1: startPoint.y,
            x2: endPoint.x,
            y2: endPoint.y,
            height: height
        };
        
        this.createWall(wall, true);
        this.updateWallList();
    }
    
    createWallPreview() {
        if (!this.wallStartPoint) return;
        
        const material = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            linewidth: 2
        });
        
        const points = [
            new THREE.Vector3(this.wallStartPoint.x, 0.05, this.wallStartPoint.y),
            new THREE.Vector3(this.wallStartPoint.x, 0.05, this.wallStartPoint.y)
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.wallPreviewLine = new THREE.Line(geometry, material);
        this.scene.add(this.wallPreviewLine);
    }
    
    updateWallPreview() {
        if (!this.wallPreviewLine || !this.wallStartPoint) return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.floor);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            const positions = this.wallPreviewLine.geometry.attributes.position;
            positions.setXYZ(1, point.x, 0.05, point.z);
            positions.needsUpdate = true;
        }
    }
    
    removeWallPreview() {
        if (this.wallPreviewLine) {
            this.scene.remove(this.wallPreviewLine);
            if (this.wallPreviewLine.geometry) {
                this.wallPreviewLine.geometry.dispose();
            }
            if (this.wallPreviewLine.material) {
                this.wallPreviewLine.material.dispose();
            }
            this.wallPreviewLine = null;
        }
    }
    
    updateWallList() {
        const listElement = document.getElementById('wallList');
        listElement.innerHTML = '';
        
        for (const wall of this.userWalls) {
            const materialInfo = this.wallMaterials[wall.material] || this.wallMaterials.concrete;
            const item = document.createElement('div');
            item.className = 'router-item';
            item.innerHTML = `
                <div class="router-info">
                    <div class="router-name" style="color: #${materialInfo.color.toString(16).padStart(6, '0')};">
                        ${materialInfo.name}墙 #${wall.id}
                    </div>
                    <div class="router-details">衰减: ${materialInfo.attenuation}</div>
                    <div class="router-details">
                        位置: (${wall.x1.toFixed(1)}, ${wall.y1.toFixed(1)}) → (${wall.x2.toFixed(1)}, ${wall.y2.toFixed(1)})
                    </div>
                </div>
                <button onclick="simulator.removeUserWall(${wall.id})">删除</button>
            `;
            listElement.appendChild(item);
        }
    }
    
    removeUserWall(id) {
        const index = this.userWalls.findIndex(w => w.id === id);
        if (index !== -1) {
            const wall = this.userWalls[index];
            if (wall.mesh) {
                this.scene.remove(wall.mesh);
                if (wall.mesh.geometry) wall.mesh.geometry.dispose();
                if (wall.mesh.material) wall.mesh.material.dispose();
                
                const wallIndex = this.walls.indexOf(wall.mesh);
                if (wallIndex !== -1) {
                    this.walls.splice(wallIndex, 1);
                }
            }
            this.userWalls.splice(index, 1);
            this.updateWallList();
        }
    }
    
    clearUserWalls() {
        for (const wall of this.userWalls) {
            if (wall.mesh) {
                this.scene.remove(wall.mesh);
                if (wall.mesh.geometry) wall.mesh.geometry.dispose();
                if (wall.mesh.material) wall.mesh.material.dispose();
                
                const wallIndex = this.walls.indexOf(wall.mesh);
                if (wallIndex !== -1) {
                    this.walls.splice(wallIndex, 1);
                }
            }
        }
        this.userWalls = [];
        this.updateWallList();
        this.updateStatus('用户墙体已清除');
    }
    
    addRouter(x, y) {
        const power = parseInt(document.getElementById('power').value);
        const channel = parseInt(document.getElementById('channel').value);
        
        const router = {
            id: this.routerIdCounter++,
            x: x,
            y: y,
            z: 1.5,
            power: power,
            channel: channel
        };
        
        this.routers.push(router);
        this.createRouterMesh(router);
        this.updateRouterList();
    }
    
    createRouterMesh(router) {
        const group = new THREE.Group();
        
        const bodyGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.2);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe94560 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.05;
        group.add(body);
        
        const antennaGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
        const antennaMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        
        const antenna1 = new THREE.Mesh(antennaGeometry, antennaMaterial);
        antenna1.position.set(-0.1, 0.3, 0);
        group.add(antenna1);
        
        const antenna2 = new THREE.Mesh(antennaGeometry, antennaMaterial);
        antenna2.position.set(0.1, 0.3, 0);
        group.add(antenna2);
        
        const ringGeometry = new THREE.RingGeometry(0.5, 0.52, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff88, 
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.01;
        group.add(ring);
        
        group.position.set(router.x, router.z, router.y);
        group.userData.routerId = router.id;
        
        this.scene.add(group);
        router.mesh = group;
    }
    
    updateRouterList() {
        const listElement = document.getElementById('routerList');
        listElement.innerHTML = '';
        
        for (const router of this.routers) {
            const item = document.createElement('div');
            item.className = 'router-item';
            item.innerHTML = `
                <div class="router-info">
                    <div class="router-name">路由器 #${router.id}</div>
                    <div class="router-details">功率: ${router.power} dBm | 信道: ${router.channel}</div>
                    <div class="router-details">位置: (${router.x.toFixed(1)}, ${router.y.toFixed(1)})</div>
                </div>
                <button onclick="simulator.removeRouter(${router.id})">删除</button>
            `;
            listElement.appendChild(item);
        }
    }
    
    removeRouter(id) {
        const index = this.routers.findIndex(r => r.id === id);
        if (index !== -1) {
            const router = this.routers[index];
            if (router.mesh) {
                this.scene.remove(router.mesh);
            }
            this.routers.splice(index, 1);
            this.updateRouterList();
        }
    }
    
    clearRouters() {
        for (const router of this.routers) {
            if (router.mesh) {
                this.scene.remove(router.mesh);
            }
        }
        this.routers = [];
        this.routerIdCounter = 1;
        this.updateRouterList();
        this.updateStatus('所有路由器已清除');
    }
    
    async calculateHeatmap() {
        if (this.routers.length === 0) {
            this.updateStatus('请先放置至少一个路由器');
            return;
        }
        
        this.updateStatus('计算信号强度中...');
        
        const gridResolution = parseInt(document.getElementById('gridResolution').value);
        const roomSize = this.roomModel ? this.roomModel.size : { width: 10, depth: 8 };
        
        const wallsForCalculation = [];
        
        if (this.roomModel && this.roomModel.walls) {
            for (const w of this.roomModel.walls) {
                wallsForCalculation.push({
                    id: w.id,
                    type: Math.abs(w.x1 - w.x2) > Math.abs(w.y1 - w.y2) ? 'horizontal' : 'vertical',
                    material: w.material || 'concrete',
                    x: (w.x1 + w.x2) / 2,
                    y: (w.y1 + w.y2) / 2,
                    x1: w.x1,
                    x2: w.x2,
                    y1: w.y1,
                    y2: w.y2
                });
            }
        }
        
        for (const w of this.userWalls) {
            wallsForCalculation.push({
                id: w.id,
                type: Math.abs(w.x1 - w.x2) > Math.abs(w.y1 - w.y2) ? 'horizontal' : 'vertical',
                material: w.material || 'concrete',
                x: (w.x1 + w.x2) / 2,
                y: (w.y1 + w.y2) / 2,
                x1: w.x1,
                x2: w.x2,
                y1: w.y1,
                y2: w.y2
            });
        }
        
        try {
            const response = await fetch('/api/calculate-rssi', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    routers: this.routers.map(r => ({
                        id: r.id,
                        x: r.x,
                        y: r.y,
                        z: r.z,
                        power: r.power,
                        channel: r.channel
                    })),
                    gridSize: { x: gridResolution, y: Math.round(gridResolution * roomSize.depth / roomSize.width) },
                    roomSize: roomSize,
                    walls: wallsForCalculation
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                if (this.routers.length > 1) {
                    for (const point of result.gridPoints) {
                        const channelGroups = {};
                        
                        for (const routerRSSI of point.routerRSSIs) {
                            const channel = routerRSSI.channel;
                            if (!channelGroups[channel]) {
                                channelGroups[channel] = [];
                            }
                            channelGroups[channel].push(routerRSSI.rssi);
                        }
                        
                        let maxChannelRSSI = -100;
                        for (const channel in channelGroups) {
                            const rssiList = channelGroups[channel];
                            let totalMW = 0;
                            for (const rssi of rssiList) {
                                totalMW += this.dBmToMW(rssi);
                            }
                            const combinedRSSI = this.mWToDBm(totalMW);
                            maxChannelRSSI = Math.max(maxChannelRSSI, combinedRSSI);
                        }
                        
                        point.rssi = maxChannelRSSI;
                    }
                }
                
                this.createHeatmap(result);
                this.updateStatus('热力图生成完成');
            } else {
                this.updateStatus('计算失败: ' + result.error);
            }
        } catch (error) {
            console.error('Heatmap calculation error:', error);
            this.updateStatus('计算失败，请重试');
        }
    }
    
    createHeatmap(data) {
        this.clearHeatmap();
        this.heatmapData = data;
        
        this.heatmapCanvas = document.createElement('canvas');
        const gridWidth = data.gridSize.x;
        const gridHeight = data.gridSize.y;
        const canvasWidth = gridWidth * this.textureScale;
        const canvasHeight = gridHeight * this.textureScale;
        this.heatmapCanvas.width = canvasWidth;
        this.heatmapCanvas.height = canvasHeight;
        
        const ctx = this.heatmapCanvas.getContext('2d');
        const imageData = ctx.createImageData(canvasWidth, canvasHeight);
        
        for (let py = 0; py < canvasHeight; py++) {
            for (let px = 0; px < canvasWidth; px++) {
                const gx = Math.floor(px / this.textureScale);
                const gy = Math.floor(py / this.textureScale);
                const gx1 = Math.min(gx + 1, gridWidth - 1);
                const gy1 = Math.min(gy + 1, gridHeight - 1);
                const fx = (px % this.textureScale) / this.textureScale;
                const fy = (py % this.textureScale) / this.textureScale;
                
                const idx00 = gy * gridWidth + gx;
                const idx10 = gy * gridWidth + gx1;
                const idx01 = gy1 * gridWidth + gx;
                const idx11 = gy1 * gridWidth + gx1;
                
                const rssi00 = data.gridPoints[idx00].rssi;
                const rssi10 = data.gridPoints[idx10].rssi;
                const rssi01 = data.gridPoints[idx01].rssi;
                const rssi11 = data.gridPoints[idx11].rssi;
                
                const rssiTop = rssi00 * (1 - fx) + rssi10 * fx;
                const rssiBottom = rssi01 * (1 - fx) + rssi11 * fx;
                const rssi = rssiTop * (1 - fy) + rssiBottom * fy;
                
                const color = this.getColorForRSSI(rssi);
                const pixelIndex = (py * canvasWidth + px) * 4;
                
                imageData.data[pixelIndex] = color.r;
                imageData.data[pixelIndex + 1] = color.g;
                imageData.data[pixelIndex + 2] = color.b;
                imageData.data[pixelIndex + 3] = 200;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        const texture = new THREE.CanvasTexture(this.heatmapCanvas);
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        
        const roomSize = data.roomSize;
        const geometry = new THREE.PlaneGeometry(roomSize.width, roomSize.depth);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        this.heatmapMesh = new THREE.Mesh(geometry, material);
        this.heatmapMesh.rotation.x = -Math.PI / 2;
        this.heatmapMesh.position.y = 0.02;
        this.scene.add(this.heatmapMesh);
    }
    
    regenerateHeatmapTexture() {
        if (!this.heatmapData || !this.heatmapMesh) return;
        
        const data = this.heatmapData;
        const gridWidth = data.gridSize.x;
        const gridHeight = data.gridSize.y;
        const canvasWidth = gridWidth * this.textureScale;
        const canvasHeight = gridHeight * this.textureScale;
        
        this.heatmapCanvas.width = canvasWidth;
        this.heatmapCanvas.height = canvasHeight;
        
        const ctx = this.heatmapCanvas.getContext('2d');
        const imageData = ctx.createImageData(canvasWidth, canvasHeight);
        
        for (let py = 0; py < canvasHeight; py++) {
            for (let px = 0; px < canvasWidth; px++) {
                const gx = Math.floor(px / this.textureScale);
                const gy = Math.floor(py / this.textureScale);
                const gx1 = Math.min(gx + 1, gridWidth - 1);
                const gy1 = Math.min(gy + 1, gridHeight - 1);
                const fx = (px % this.textureScale) / this.textureScale;
                const fy = (py % this.textureScale) / this.textureScale;
                
                const idx00 = gy * gridWidth + gx;
                const idx10 = gy * gridWidth + gx1;
                const idx01 = gy1 * gridWidth + gx;
                const idx11 = gy1 * gridWidth + gx1;
                
                const rssi00 = data.gridPoints[idx00].rssi;
                const rssi10 = data.gridPoints[idx10].rssi;
                const rssi01 = data.gridPoints[idx01].rssi;
                const rssi11 = data.gridPoints[idx11].rssi;
                
                const rssiTop = rssi00 * (1 - fx) + rssi10 * fx;
                const rssiBottom = rssi01 * (1 - fx) + rssi11 * fx;
                const rssi = rssiTop * (1 - fy) + rssiBottom * fy;
                
                const color = this.getColorForRSSI(rssi);
                const pixelIndex = (py * canvasWidth + px) * 4;
                
                imageData.data[pixelIndex] = color.r;
                imageData.data[pixelIndex + 1] = color.g;
                imageData.data[pixelIndex + 2] = color.b;
                imageData.data[pixelIndex + 3] = 200;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        this.heatmapMesh.material.map.needsUpdate = true;
    }
    
    getColorForRSSI(rssi) {
        const normalized = (rssi + 100) / 80;
        const clamped = Math.max(0, Math.min(1, normalized));
        
        let r, g, b;
        
        if (clamped < 0.25) {
            r = 128;
            g = 0;
            b = 128;
        } else if (clamped < 0.5) {
            r = 255;
            g = 0;
            b = 0;
        } else if (clamped < 0.75) {
            r = 255;
            g = 255;
            b = 0;
        } else {
            r = 0;
            g = 255;
            b = 0;
        }
        
        return { r, g, b };
    }
    
    clearHeatmap() {
        if (this.heatmapMesh) {
            if (this.heatmapMesh.material) {
                if (this.heatmapMesh.material.map) {
                    this.heatmapMesh.material.map.dispose();
                }
                this.heatmapMesh.material.dispose();
            }
            if (this.heatmapMesh.geometry) {
                this.heatmapMesh.geometry.dispose();
            }
            this.scene.remove(this.heatmapMesh);
            this.heatmapMesh = null;
        }
        this.heatmapData = null;
        this.heatmapCanvas = null;
    }
    
    setTopView() {
        this.camera.position.set(0, 15, 0.1);
        this.camera.lookAt(0, 0, 0);
    }
    
    setPerspectiveView() {
        this.camera.position.set(10, 10, 10);
        this.camera.lookAt(0, 0, 0);
    }
    
    resetCamera() {
        this.camera.position.set(10, 10, 10);
        this.camera.lookAt(0, 0, 0);
        this.controls.reset();
    }
    
    updateStatus(message) {
        document.getElementById('status-bar').textContent = message;
    }
    
    onWindowResize() {
        const container = document.getElementById('scene-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        
        if (this.heatmapMesh && this.heatmapData) {
            this.regenerateHeatmapTexture();
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

let simulator;
window.addEventListener('DOMContentLoaded', () => {
    simulator = new WiFiHeatmapSimulator();
    window.simulator = simulator;
});
