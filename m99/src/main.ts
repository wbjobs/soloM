import { SPHSimulator } from './SPHSimulator';
import { WebGLRenderer } from './WebGLRenderer';
import { 
    getParams, 
    setParams, 
    exportPLY, 
    downloadBlob,
    listSnapshots,
    createSnapshot,
    getSnapshot,
    deleteSnapshot,
    SnapshotInfo
} from './api';
import { SimParams } from './types';
import './style.css';

interface StatsCallback {
    (stats: { fps: number; particles: number; computeTime: number }): void;
}

interface SimulatorInterface {
    init(): Promise<void>;
    setOnStatsUpdate(callback: StatsCallback): void;
    updateParams(params: any): void;
    getParams(): any;
    start(): void;
    stop(): void;
    reset(): void;
    getParticleData(): Promise<{ positions: number[][]; colors: number[][] }>;
}

let simulator: SimulatorInterface | null = null;
let isRunning = false;
let renderMode: 'webgpu' | 'webgl' | 'none' = 'none';

const canvas = document.getElementById('webgpu-canvas') as HTMLCanvasElement;
const errorMessage = document.getElementById('error-message');
const fallbackMessage = document.getElementById('fallback-message');
const renderModeIndicator = document.getElementById('render-mode');

const particleCountInput = document.getElementById('particleCount') as HTMLInputElement;
const gravityInput = document.getElementById('gravity') as HTMLInputElement;
const viscosityInput = document.getElementById('viscosity') as HTMLInputElement;
const radiusInput = document.getElementById('radius') as HTMLInputElement;
const restDensityInput = document.getElementById('restDensity') as HTMLInputElement;

const particleCountValue = document.getElementById('particleCountValue');
const gravityValue = document.getElementById('gravityValue');
const viscosityValue = document.getElementById('viscosityValue');
const radiusValue = document.getElementById('radiusValue');
const restDensityValue = document.getElementById('restDensityValue');

const fpsDisplay = document.getElementById('fps');
const currentParticlesDisplay = document.getElementById('currentParticles');
const computeTimeDisplay = document.getElementById('computeTime');

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const applyParamsBtn = document.getElementById('applyParamsBtn') as HTMLButtonElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const fetchParamsBtn = document.getElementById('fetchParamsBtn') as HTMLButtonElement;
const switchModeBtn = document.getElementById('switchModeBtn') as HTMLButtonElement;
const saveSnapshotBtn = document.getElementById('saveSnapshotBtn') as HTMLButtonElement;
const refreshSnapshotsBtn = document.getElementById('refreshSnapshotsBtn') as HTMLButtonElement;
const snapshotList = document.getElementById('snapshotList') as HTMLDivElement;

let snapshots: SnapshotInfo[] = [];

function updateValueDisplays() {
    particleCountValue!.textContent = particleCountInput.value;
    gravityValue!.textContent = gravityInput.value;
    viscosityValue!.textContent = viscosityInput.value;
    radiusValue!.textContent = radiusInput.value;
    restDensityValue!.textContent = restDensityInput.value;
}

function getInputParams() {
    return {
        numParticles: parseInt(particleCountInput.value),
        gravity: parseFloat(gravityInput.value),
        viscosity: parseFloat(viscosityInput.value),
        particleRadius: parseFloat(radiusInput.value),
        restDensity: parseFloat(restDensityInput.value),
    };
}

function setInputParams(params: {
    numParticles?: number;
    gravity?: number;
    viscosity?: number;
    particleRadius?: number;
    restDensity?: number;
}) {
    if (params.numParticles !== undefined) particleCountInput.value = params.numParticles.toString();
    if (params.gravity !== undefined) gravityInput.value = params.gravity.toString();
    if (params.viscosity !== undefined) viscosityInput.value = params.viscosity.toString();
    if (params.particleRadius !== undefined) radiusInput.value = params.particleRadius.toString();
    if (params.restDensity !== undefined) restDensityInput.value = params.restDensity.toString();
    updateValueDisplays();
}

function updateRenderModeIndicator() {
    if (renderModeIndicator) {
        if (renderMode === 'webgpu') {
            renderModeIndicator.textContent = 'WebGPU 加速';
            renderModeIndicator.className = 'badge badge-webgpu';
        } else if (renderMode === 'webgl') {
            renderModeIndicator.textContent = 'WebGL 兼容模式';
            renderModeIndicator.className = 'badge badge-webgl';
        } else {
            renderModeIndicator.textContent = '未初始化';
            renderModeIndicator.className = 'badge badge-error';
        }
    }
    
    if (switchModeBtn) {
        if (renderMode === 'webgpu') {
            switchModeBtn.textContent = '切换到 WebGL 模式';
        } else if (renderMode === 'webgl') {
            switchModeBtn.textContent = '尝试 WebGPU 模式';
        }
    }
}

async function initWebGPU(): Promise<boolean> {
    try {
        if (!navigator.gpu) {
            console.warn('WebGPU is not supported by this browser');
            return false;
        }
        
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.warn('No GPU adapter found for WebGPU');
            return false;
        }
        
        const device = await adapter.requestDevice();
        if (!device) {
            console.warn('Failed to create WebGPU device');
            return false;
        }
        
        simulator = new SPHSimulator(canvas);
        await simulator.init();
        renderMode = 'webgpu';
        
        return true;
    } catch (error) {
        console.warn('WebGPU initialization failed:', error);
        return false;
    }
}

async function initWebGL(): Promise<boolean> {
    try {
        const gl = canvas.getContext('webgl2');
        if (!gl) {
            console.warn('WebGL 2.0 is not supported');
            return false;
        }
        
        simulator = new WebGLRenderer(canvas);
        renderMode = 'webgl';
        
        return true;
    } catch (error) {
        console.warn('WebGL initialization failed:', error);
        return false;
    }
}

async function init(): Promise<void> {
    console.log('Checking browser capabilities...');
    
    const webgpuSupported = await initWebGPU();
    
    if (!webgpuSupported) {
        console.log('Falling back to WebGL...');
        fallbackMessage!.classList.remove('hidden');
        fallbackMessage!.querySelector('span')!.textContent = 'WebGPU 不可用，已自动切换到 WebGL 兼容模式';
        
        const webglSupported = await initWebGL();
        
        if (!webglSupported) {
            console.error('Neither WebGPU nor WebGL 2.0 is supported');
            errorMessage!.classList.remove('hidden');
            errorMessage!.textContent = '您的浏览器不支持 WebGPU 或 WebGL 2.0，请使用最新版本的 Chrome、Edge 或 Firefox 浏览器。';
            renderMode = 'none';
            return;
        }
    }
    
    if (simulator) {
        simulator.setOnStatsUpdate(({ fps, particles, computeTime }) => {
            fpsDisplay!.textContent = fps.toString();
            currentParticlesDisplay!.textContent = particles.toString();
            computeTimeDisplay!.textContent = computeTime.toFixed(2);
        });
        
        setupEventListeners();
        updateValueDisplays();
        updateRenderModeIndicator();
        
        console.log(`Simulator initialized successfully using ${renderMode.toUpperCase()}`);
    }
}

async function switchRenderMode(): Promise<void> {
    const wasRunning = isRunning;
    
    if (simulator && isRunning) {
        simulator.stop();
        isRunning = false;
    }
    
    startBtn.textContent = '切换中...';
    startBtn.disabled = true;
    
    let newSimulator: SimulatorInterface | null = null;
    
    if (renderMode === 'webgpu') {
        const webglRenderer = new WebGLRenderer(canvas);
        try {
            await webglRenderer.init();
            newSimulator = webglRenderer;
            renderMode = 'webgl';
            fallbackMessage!.classList.remove('hidden');
            fallbackMessage!.querySelector('span')!.textContent = '已切换到 WebGL 兼容模式';
        } catch {
            console.error('Failed to switch to WebGL');
        }
    } else {
        try {
            if (!navigator.gpu) {
                throw new Error('WebGPU not supported');
            }
            const webgpuSimulator = new SPHSimulator(canvas);
            await webgpuSimulator.init();
            newSimulator = webgpuSimulator;
            renderMode = 'webgpu';
            fallbackMessage!.classList.add('hidden');
        } catch {
            console.warn('WebGPU not available, falling back to WebGL');
            const webglRenderer = new WebGLRenderer(canvas);
            try {
                await webglRenderer.init();
                newSimulator = webglRenderer;
                renderMode = 'webgl';
            } catch {
                console.error('Failed to initialize any renderer');
            }
        }
    }
    
    if (newSimulator) {
        simulator = newSimulator;
        simulator.setOnStatsUpdate(({ fps, particles, computeTime }) => {
            fpsDisplay!.textContent = fps.toString();
            currentParticlesDisplay!.textContent = particles.toString();
            computeTimeDisplay!.textContent = computeTime.toFixed(2);
        });
        updateRenderModeIndicator();
        
        if (wasRunning) {
            simulator.start();
            isRunning = true;
            startBtn.textContent = '运行中...';
        } else {
            startBtn.textContent = '开始模拟';
        }
    } else {
        startBtn.textContent = '切换失败';
    }
    
    startBtn.disabled = false;
}

function setupEventListeners() {
    particleCountInput.addEventListener('input', updateValueDisplays);
    gravityInput.addEventListener('input', updateValueDisplays);
    viscosityInput.addEventListener('input', updateValueDisplays);
    radiusInput.addEventListener('input', updateValueDisplays);
    restDensityInput.addEventListener('input', updateValueDisplays);
    
    startBtn.addEventListener('click', () => {
        if (!simulator) return;
        if (!isRunning) {
            simulator.start();
            isRunning = true;
            startBtn.textContent = '运行中...';
        }
    });
    
    pauseBtn.addEventListener('click', () => {
        if (!simulator) return;
        simulator.stop();
        isRunning = false;
        startBtn.textContent = '继续模拟';
    });
    
    resetBtn.addEventListener('click', () => {
        if (!simulator) return;
        const wasRunning = isRunning;
        if (isRunning) {
            simulator.stop();
            isRunning = false;
        }
        simulator.reset();
        startBtn.textContent = '开始模拟';
        if (wasRunning) {
            setTimeout(() => {
                simulator!.start();
                isRunning = true;
                startBtn.textContent = '运行中...';
            }, 100);
        }
    });
    
    applyParamsBtn.addEventListener('click', async () => {
        if (!simulator) return;
        const params = getInputParams();
        const wasRunning = isRunning;
        
        if (isRunning) {
            simulator.stop();
            isRunning = false;
        }
        
        simulator.updateParams(params);
        
        if (wasRunning) {
            simulator.start();
            isRunning = true;
            startBtn.textContent = '运行中...';
        } else {
            startBtn.textContent = '开始模拟';
        }
        
        try {
            await setParams(params);
            console.log('Params synced to server');
        } catch (error) {
            console.warn('Could not sync params to server:', error);
        }
    });
    
    exportBtn.addEventListener('click', async () => {
        if (!simulator) return;
        try {
            exportBtn.disabled = true;
            exportBtn.textContent = '导出中...';
            
            const { positions, colors } = await simulator.getParticleData();
            const blob = await exportPLY(positions, colors, false);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            downloadBlob(blob, `fluid_simulation_${timestamp}.ply`);
            
            exportBtn.textContent = '导出成功!';
            setTimeout(() => {
                exportBtn.textContent = '导出 PLY 点云';
                exportBtn.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Export failed:', error);
            exportBtn.textContent = '导出失败';
            setTimeout(() => {
                exportBtn.textContent = '导出 PLY 点云';
                exportBtn.disabled = false;
            }, 2000);
        }
    });
    
    fetchParamsBtn.addEventListener('click', async () => {
        try {
            fetchParamsBtn.disabled = true;
            fetchParamsBtn.textContent = '获取中...';
            
            const params = await getParams();
            setInputParams({
                numParticles: params.numParticles,
                gravity: params.gravity,
                viscosity: params.viscosity,
                particleRadius: params.particleRadius,
                restDensity: params.restDensity,
            });
            
            if (simulator) {
                simulator.updateParams(params);
            }
            
            fetchParamsBtn.textContent = '获取成功!';
            setTimeout(() => {
                fetchParamsBtn.textContent = '从服务器获取参数';
                fetchParamsBtn.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Failed to fetch params:', error);
            fetchParamsBtn.textContent = '获取失败';
            setTimeout(() => {
                fetchParamsBtn.textContent = '从服务器获取参数';
                fetchParamsBtn.disabled = false;
            }, 2000);
        }
    });
    
    switchModeBtn?.addEventListener('click', switchRenderMode);
    
    saveSnapshotBtn.addEventListener('click', openSaveSnapshotDialog);
    refreshSnapshotsBtn.addEventListener('click', loadSnapshots);
}

function openSaveSnapshotDialog() {
    if (!simulator) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <h2>保存快照</h2>
            <div class="form-group">
                <label>快照名称</label>
                <input type="text" id="snapshotNameInput" placeholder="输入快照名称" value="快照 ${new Date().toLocaleString()}">
            </div>
            <div class="form-group">
                <label>描述（可选）</label>
                <textarea id="snapshotDescInput" placeholder="输入快照描述..."></textarea>
            </div>
            <div class="modal-actions">
                <button class="btn-cancel" id="cancelSnapshotBtn">取消</button>
                <button class="btn-confirm" id="confirmSnapshotBtn">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    const nameInput = document.getElementById('snapshotNameInput') as HTMLInputElement;
    const descInput = document.getElementById('snapshotDescInput') as HTMLTextAreaElement;
    const cancelBtn = document.getElementById('cancelSnapshotBtn') as HTMLButtonElement;
    const confirmBtn = document.getElementById('confirmSnapshotBtn') as HTMLButtonElement;
    
    const closeModal = () => document.body.removeChild(overlay);
    
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    
    confirmBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) {
            alert('请输入快照名称');
            return;
        }
        
        try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '保存中...';
            
            const params = simulator!.getParams();
            const { positions, colors } = await simulator!.getParticleData();
            
            await createSnapshot(name, descInput.value.trim() || undefined, params, positions, colors);
            closeModal();
            await loadSnapshots();
            
        } catch (error) {
            console.error('Failed to save snapshot:', error);
            alert('保存快照失败，请确保 MongoDB 服务已启动');
            confirmBtn.disabled = false;
            confirmBtn.textContent = '保存';
        }
    });
}

async function loadSnapshots() {
    try {
        refreshSnapshotsBtn.disabled = true;
        refreshSnapshotsBtn.textContent = '刷新中...';
        
        snapshots = await listSnapshots(50);
        renderSnapshotList();
        
        refreshSnapshotsBtn.textContent = '刷新成功!';
        setTimeout(() => {
            refreshSnapshotsBtn.textContent = '刷新快照列表';
            refreshSnapshotsBtn.disabled = false;
        }, 1500);
    } catch (error) {
        console.error('Failed to load snapshots:', error);
        snapshotList.innerHTML = '<div class="empty-message">加载失败，请确保后端服务已启动</div>';
        refreshSnapshotsBtn.textContent = '刷新失败';
        setTimeout(() => {
            refreshSnapshotsBtn.textContent = '刷新快照列表';
            refreshSnapshotsBtn.disabled = false;
        }, 2000);
    }
}

function renderSnapshotList() {
    if (snapshots.length === 0) {
        snapshotList.innerHTML = '<div class="empty-message">暂无快照</div>';
        return;
    }
    
    snapshotList.innerHTML = snapshots.map(snap => `
        <div class="snapshot-item" data-id="${snap.id}">
            <div class="snapshot-name">${escapeHtml(snap.name)}</div>
            <div class="snapshot-info">
                ${snap.num_particles} 粒子 · ${formatDate(snap.created_at)}
            </div>
            ${snap.description ? `<div class="snapshot-info">${escapeHtml(snap.description)}</div>` : ''}
            <div class="snapshot-actions">
                <button class="btn-load" data-id="${snap.id}">加载</button>
                <button class="btn-delete" data-id="${snap.id}">删除</button>
            </div>
        </div>
    `).join('');
    
    snapshotList.querySelectorAll('.btn-load').forEach(btn => {
        btn.addEventListener('click', () => loadSnapshot(btn.getAttribute('data-id')!));
    });
    
    snapshotList.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteSnapshotItem(btn.getAttribute('data-id')!));
    });
}

async function loadSnapshot(id: string) {
    if (!simulator) return;
    
    try {
        const wasRunning = isRunning;
        if (isRunning) {
            simulator.stop();
            isRunning = false;
        }
        
        const snapshot = await getSnapshot(id);
        
        const params: Partial<SimParams> = {
            numParticles: snapshot.params.numParticles,
            gravity: snapshot.params.gravity,
            viscosity: snapshot.params.viscosity,
            particleRadius: snapshot.params.particleRadius,
            restDensity: snapshot.params.restDensity,
            smoothingLength: snapshot.params.smoothingLength,
            stiffness: snapshot.params.stiffness,
            dt: snapshot.params.dt
        };
        
        setInputParams(params);
        simulator.updateParams(params);
        
        const loadBtn = snapshotList.querySelector(`.btn-load[data-id="${id}"]`) as HTMLButtonElement;
        if (loadBtn) {
            loadBtn.textContent = '加载中...';
            loadBtn.disabled = true;
        }
        
        setTimeout(() => {
            if (wasRunning) {
                simulator!.start();
                isRunning = true;
                startBtn.textContent = '运行中...';
            }
            
            if (loadBtn) {
                loadBtn.textContent = '加载';
                loadBtn.disabled = false;
            }
            
            alert(`快照 "${snapshot.name}" 加载成功！`);
        }, 100);
        
    } catch (error) {
        console.error('Failed to load snapshot:', error);
        alert('加载快照失败');
    }
}

async function deleteSnapshotItem(id: string) {
    if (!confirm('确定要删除这个快照吗？')) return;
    
    try {
        await deleteSnapshot(id);
        await loadSnapshots();
    } catch (error) {
        console.error('Failed to delete snapshot:', error);
        alert('删除快照失败');
    }
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

init();
loadSnapshots();
