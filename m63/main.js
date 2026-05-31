let wasm;

const MAX_IMAGE_SIZE = 512;
const DEBOUNCE_DELAY = 150;

const PRESET_KERNELS = {
    identity: {
        size: 3,
        values: [
            0, 0, 0,
            0, 1, 0,
            0, 0, 0
        ]
    },
    box_blur: {
        size: 3,
        values: [
            1, 1, 1,
            1, 1, 1,
            1, 1, 1
        ]
    },
    gaussian_blur_3: {
        size: 3,
        values: [
            1, 2, 1,
            2, 4, 2,
            1, 2, 1
        ]
    },
    gaussian_blur_5: {
        size: 5,
        values: [
            1, 4, 6, 4, 1,
            4, 16, 24, 16, 4,
            6, 24, 36, 24, 6,
            4, 16, 24, 16, 4,
            1, 4, 6, 4, 1
        ]
    },
    sharpen: {
        size: 3,
        values: [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ]
    },
    edge_detect: {
        size: 3,
        values: [
            -1, -1, -1,
            -1, 8, -1,
            -1, -1, -1
        ]
    },
    edge_detect_2: {
        size: 3,
        values: [
            0, -1, 0,
            -1, 4, -1,
            0, -1, 0
        ]
    },
    outline: {
        size: 3,
        values: [
            -1, -1, -1,
            -1, 9, -1,
            -1, -1, -1
        ]
    },
    emboss: {
        size: 3,
        values: [
            -2, -1, 0,
            -1, 1, 1,
            0, 1, 2
        ]
    },
    sobel_x: {
        size: 3,
        values: [
            -1, 0, 1,
            -2, 0, 2,
            -1, 0, 1
        ]
    },
    sobel_y: {
        size: 3,
        values: [
            -1, -2, -1,
            0, 0, 0,
            1, 2, 1
        ]
    }
};

const elements = {
    imageUpload: document.getElementById('imageUpload'),
    cutoffSlider: document.getElementById('cutoffSlider'),
    cutoffValue: document.getElementById('cutoffValue'),
    processBtn: document.getElementById('processBtn'),
    originalCanvas: document.getElementById('originalCanvas'),
    spectrumCanvas: document.getElementById('spectrumCanvas'),
    filteredCanvas: document.getElementById('filteredCanvas'),
    filteredSpectrumCanvas: document.getElementById('filteredSpectrumCanvas'),
    originalPlaceholder: document.getElementById('originalPlaceholder'),
    spectrumPlaceholder: document.getElementById('spectrumPlaceholder'),
    filteredPlaceholder: document.getElementById('filteredPlaceholder'),
    filteredSpectrumPlaceholder: document.getElementById('filteredSpectrumPlaceholder'),
    originalInfo: document.getElementById('originalInfo'),
    statusBar: document.getElementById('statusBar'),
    modeTabs: document.querySelectorAll('.mode-tab'),
    fftControls: document.getElementById('fftControls'),
    convControls: document.getElementById('convControls'),
    kernelSizeBtns: document.querySelectorAll('.kernel-size-btn'),
    kernelGrid: document.getElementById('kernelGrid'),
    presetSelect: document.getElementById('presetSelect'),
    realtimePreview: document.getElementById('realtimePreview'),
    canvasGrid: document.getElementById('canvasGrid'),
    spectrumCard: document.getElementById('spectrumCard'),
    filteredSpectrumCard: document.getElementById('filteredSpectrumCard'),
    resultTitle: document.getElementById('resultTitle'),
    resultBadge: document.getElementById('resultBadge')
};

let originalImageData = null;
let imageWidth = 0;
let imageHeight = 0;
let currentMode = 'fft';
let currentKernelSize = 3;
let debounceTimer = null;
let isProcessing = false;

async function initWasm() {
    try {
        updateStatus('正在加载 WebAssembly 模块...', false);

        wasm = await import('./pkg/image_filter_wasm.js');
        await wasm.default('./pkg/image_filter_wasm_bg.wasm');

        updateStatus('✅ WebAssembly 模块加载成功！请上传图片开始使用', true, 'success');
        elements.processBtn.disabled = false;

        generateKernelGrid();
    } catch (error) {
        console.error('Wasm 加载失败:', error);
        updateStatus('❌ WebAssembly 模块加载失败，请先运行 build.ps1 编译', false, 'error');
    }
}

function copyAndFreeImageBuffer(imageBuffer) {
    const ptr = imageBuffer.ptr();
    const len = imageBuffer.len();
    const wasmMemory = new Uint8Array(wasm.memory.buffer, ptr, len);
    const jsCopy = new Uint8Array(wasmMemory);
    imageBuffer.free();
    return jsCopy;
}

function updateStatus(message, success = false, type = '') {
    elements.statusBar.textContent = message;
    elements.statusBar.className = 'status-bar';
    if (type) {
        elements.statusBar.classList.add(type);
    }
}

function resizeImage(img) {
    let width = img.width;
    let height = img.height;

    const maxDim = Math.max(width, height);
    if (maxDim > MAX_IMAGE_SIZE) {
        const ratio = MAX_IMAGE_SIZE / maxDim;
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    width = nextPowerOfTwo(width);
    height = nextPowerOfTwo(height);

    return { width, height };
}

function nextPowerOfTwo(n) {
    if (n === 0) return 1;
    n--;
    n |= n >> 1;
    n |= n >> 2;
    n |= n >> 4;
    n |= n >> 8;
    n |= n >> 16;
    return n + 1;
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const { width, height } = resizeImage(img);
            imageWidth = width;
            imageHeight = height;

            const ctx = elements.originalCanvas.getContext('2d', { willReadFrequently: true });
            elements.originalCanvas.width = width;
            elements.originalCanvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            if (originalImageData) {
                originalImageData.data = null;
            }
            originalImageData = ctx.getImageData(0, 0, width, height);

            elements.originalPlaceholder.style.display = 'none';
            elements.originalCanvas.style.display = 'block';

            elements.originalInfo.textContent = `${width} x ${height}`;

            updateStatus(`图片已加载 (${width} x ${height})`, true, 'success');

            img.src = '';

            if (elements.realtimePreview.checked && currentMode === 'conv') {
                debounceProcess();
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function generateKernelGrid() {
    elements.kernelGrid.innerHTML = '';
    elements.kernelGrid.className = `kernel-grid size-${currentKernelSize}`;

    const size = currentKernelSize;
    const total = size * size;

    for (let i = 0; i < total; i++) {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.className = 'kernel-input';
        input.dataset.index = i;
        input.value = i === Math.floor(total / 2) ? '1' : '0';

        input.addEventListener('input', onKernelInputChange);

        elements.kernelGrid.appendChild(input);
    }
}

function getKernelValues() {
    const inputs = elements.kernelGrid.querySelectorAll('.kernel-input');
    const values = [];
    inputs.forEach(input => {
        const val = parseFloat(input.value);
        values.push(isNaN(val) ? 0 : val);
    });
    return values;
}

function setKernelValues(values) {
    const inputs = elements.kernelGrid.querySelectorAll('.kernel-input');
    inputs.forEach((input, i) => {
        if (i < values.length) {
            input.value = values[i];
        }
    });
}

function onKernelInputChange() {
    elements.presetSelect.value = '';

    if (elements.realtimePreview.checked && originalImageData) {
        debounceProcess();
    }
}

function debounceProcess() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
        processImage();
    }, DEBOUNCE_DELAY);
}

function processFFT() {
    let spectrumBuffer = null;
    let filteredBuffer = null;
    let filteredSpectrumBuffer = null;

    try {
        const cutoffRatio = parseFloat(elements.cutoffSlider.value) / 100;

        spectrumBuffer = wasm.get_frequency_spectrum(
            originalImageData.data,
            imageWidth,
            imageHeight
        );
        const spectrumData = copyAndFreeImageBuffer(spectrumBuffer);
        spectrumBuffer = null;

        filteredBuffer = wasm.apply_filter(
            originalImageData.data,
            imageWidth,
            imageHeight,
            cutoffRatio
        );
        const filteredData = copyAndFreeImageBuffer(filteredBuffer);
        filteredBuffer = null;

        filteredSpectrumBuffer = wasm.get_frequency_spectrum(
            filteredData,
            imageWidth,
            imageHeight
        );
        const filteredSpectrumData = copyAndFreeImageBuffer(filteredSpectrumBuffer);
        filteredSpectrumBuffer = null;

        drawImageData(elements.spectrumCanvas, spectrumData, imageWidth, imageHeight);
        drawImageData(elements.filteredCanvas, filteredData, imageWidth, imageHeight);
        drawImageData(elements.filteredSpectrumCanvas, filteredSpectrumData, imageWidth, imageHeight);

        elements.spectrumPlaceholder.style.display = 'none';
        elements.filteredPlaceholder.style.display = 'none';
        elements.filteredSpectrumPlaceholder.style.display = 'none';
        elements.spectrumCanvas.style.display = 'block';
        elements.filteredCanvas.style.display = 'block';
        elements.filteredSpectrumCanvas.style.display = 'block';

        return { success: true, cutoffRatio };

    } catch (error) {
        console.error('FFT 处理失败:', error);
        throw error;
    } finally {
        if (spectrumBuffer) spectrumBuffer.free();
        if (filteredBuffer) filteredBuffer.free();
        if (filteredSpectrumBuffer) filteredSpectrumBuffer.free();
    }
}

function processConvolution() {
    let filteredBuffer = null;

    try {
        const kernelValues = getKernelValues();
        const kernel = new Float32Array(kernelValues);

        filteredBuffer = wasm.apply_convolution(
            originalImageData.data,
            imageWidth,
            imageHeight,
            kernel,
            currentKernelSize
        );
        const filteredData = copyAndFreeImageBuffer(filteredBuffer);
        filteredBuffer = null;

        drawImageData(elements.filteredCanvas, filteredData, imageWidth, imageHeight);

        elements.filteredPlaceholder.style.display = 'none';
        elements.filteredCanvas.style.display = 'block';

        return { success: true };

    } catch (error) {
        console.error('卷积处理失败:', error);
        throw error;
    } finally {
        if (filteredBuffer) filteredBuffer.free();
    }
}

function processImage() {
    if (!wasm || !originalImageData || isProcessing) return;

    const startTime = performance.now();
    isProcessing = true;

    let statusMsg = currentMode === 'fft'
        ? '⏳ 正在进行 FFT 变换和滤波处理...'
        : '⏳ 正在进行卷积运算...';
    updateStatus(statusMsg, false);

    setTimeout(() => {
        try {
            let result;
            if (currentMode === 'fft') {
                result = processFFT();
                const elapsed = (performance.now() - startTime).toFixed(2);
                updateStatus(
                    `✅ 处理完成！耗时: ${elapsed}ms | 截止频率: ${(result.cutoffRatio * 100).toFixed(0)}%`,
                    true,
                    'success'
                );
            } else {
                result = processConvolution();
                const elapsed = (performance.now() - startTime).toFixed(2);
                updateStatus(
                    `✅ 处理完成！耗时: ${elapsed}ms | ${currentKernelSize}x${currentKernelSize} 卷积`,
                    true,
                    'success'
                );
            }

        } catch (error) {
            updateStatus('❌ 处理失败: ' + error.message, false, 'error');
        } finally {
            isProcessing = false;

            if (typeof gc === 'function') {
                setTimeout(() => gc(), 100);
            }
        }
    }, 10);
}

function drawImageData(canvas, data, width, height) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
    ctx.putImageData(imageData, 0, 0);
}

function updateCutoffValue() {
    elements.cutoffValue.textContent = elements.cutoffSlider.value + '%';

    if (elements.realtimePreview.checked && currentMode === 'fft' && originalImageData) {
        debounceProcess();
    }
}

function switchMode(mode) {
    currentMode = mode;

    elements.modeTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    if (mode === 'fft') {
        elements.fftControls.style.display = 'block';
        elements.convControls.classList.remove('active');
        elements.canvasGrid.classList.remove('conv-mode');
        elements.spectrumCard.classList.remove('hidden');
        elements.filteredSpectrumCard.classList.remove('hidden');
        elements.resultTitle.childNodes[0].textContent = '滤波结果';
        elements.resultBadge.textContent = '低通';
        elements.processBtn.textContent = '应用滤波';
    } else {
        elements.fftControls.style.display = 'none';
        elements.convControls.classList.add('active');
        elements.canvasGrid.classList.add('conv-mode');
        elements.spectrumCard.classList.add('hidden');
        elements.filteredSpectrumCard.classList.add('hidden');
        elements.resultTitle.childNodes[0].textContent = '卷积结果';
        elements.resultBadge.textContent = '卷积';
        elements.processBtn.textContent = '应用卷积';
    }

    if (originalImageData && elements.realtimePreview.checked) {
        debounceProcess();
    }
}

function switchKernelSize(size) {
    currentKernelSize = size;

    elements.kernelSizeBtns.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.size) === size);
    });

    generateKernelGrid();
    elements.presetSelect.value = '';

    if (originalImageData && elements.realtimePreview.checked) {
        debounceProcess();
    }
}

function applyPreset(presetName) {
    if (!presetName) return;

    const preset = PRESET_KERNELS[presetName];
    if (!preset) return;

    if (preset.size !== currentKernelSize) {
        switchKernelSize(preset.size);
    }

    setKernelValues(preset.values);

    if (originalImageData && elements.realtimePreview.checked) {
        debounceProcess();
    }
}

elements.imageUpload.addEventListener('change', handleImageUpload);
elements.cutoffSlider.addEventListener('input', updateCutoffValue);
elements.processBtn.addEventListener('click', () => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    processImage();
});

elements.modeTabs.forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

elements.kernelSizeBtns.forEach(btn => {
    btn.addEventListener('click', () => switchKernelSize(parseInt(btn.dataset.size)));
});

elements.presetSelect.addEventListener('change', (e) => applyPreset(e.target.value));

elements.realtimePreview.addEventListener('change', (e) => {
    if (e.target.checked && originalImageData) {
        processImage();
    }
});

window.addEventListener('beforeunload', () => {
    if (originalImageData) {
        originalImageData.data = null;
        originalImageData = null;
    }

    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    if (typeof gc === 'function') {
        gc();
    }
});

initWasm();
