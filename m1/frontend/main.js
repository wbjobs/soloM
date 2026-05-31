import init, * as dicomWasm from './pkg/dicom_wasm.js';
import { VolumeRenderer } from './volume-renderer.js';

const state = {
  wasm: null,
  files: [],
  currentFileId: null,
  currentMetadata: null,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragStartWC: 0,
  dragStartWW: 0,
  viewMode: '2d',
  volumeRenderer: null,
  volumeBuilt: false,
};

const elements = {
  uploadArea: document.getElementById('uploadArea'),
  fileInput: document.getElementById('fileInput'),
  fileList: document.getElementById('fileList'),
  controlsPanel: document.getElementById('controlsPanel'),
  infoPanel: document.getElementById('infoPanel'),
  actionsPanel: document.getElementById('actionsPanel'),
  volumePanel: document.getElementById('volumePanel'),
  wcSlider: document.getElementById('wcSlider'),
  wwSlider: document.getElementById('wwSlider'),
  wcInput: document.getElementById('wcInput'),
  wwInput: document.getElementById('wwInput'),
  wcValue: document.getElementById('wcValue'),
  wwValue: document.getElementById('wwValue'),
  metadata: document.getElementById('metadata'),
  uploadBtn: document.getElementById('uploadBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  uploadStatus: document.getElementById('uploadStatus'),
  canvas: document.getElementById('dicomCanvas'),
  volumeCanvas: document.getElementById('volumeCanvas'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  dropHint: document.getElementById('dropHint'),
  volumeOverlay: document.getElementById('volumeOverlay'),
  mouseInfo: document.getElementById('mouseInfo'),
  viewModeInfo: document.getElementById('viewModeInfo'),
  cacheInfo: document.getElementById('cacheInfo'),
  toast: document.getElementById('toast'),
  btn2D: document.getElementById('btn2D'),
  btn3D: document.getElementById('btn3D'),
  viewer2D: document.getElementById('viewer2D'),
  viewer3D: document.getElementById('viewer3D'),
  buildVolumeBtn: document.getElementById('buildVolumeBtn'),
  volumeStatus: document.getElementById('volumeStatus'),
  volumeControls: document.getElementById('volumeControls'),
  renderMode: document.getElementById('renderMode'),
  tfPreset: document.getElementById('tfPreset'),
  stepSlider: document.getElementById('stepSlider'),
  stepValue: document.getElementById('stepValue'),
  opacitySlider: document.getElementById('opacitySlider'),
  opacityValue: document.getElementById('opacityValue'),
  thresholdSlider: document.getElementById('thresholdSlider'),
  thresholdValue: document.getElementById('thresholdValue'),
  ambientSlider: document.getElementById('ambientSlider'),
  ambientValue: document.getElementById('ambientValue'),
  diffuseSlider: document.getElementById('diffuseSlider'),
  diffuseValue: document.getElementById('diffuseValue'),
  specularSlider: document.getElementById('specularSlider'),
  specularValue: document.getElementById('specularValue'),
  volWCSlider: document.getElementById('volWCSlider'),
  volWCValue: document.getElementById('volWCValue'),
  volWWSlider: document.getElementById('volWWSlider'),
  volWWValue: document.getElementById('volWWValue'),
  resetViewBtn: document.getElementById('resetViewBtn'),
};

const ctx = elements.canvas.getContext('2d');

const windowPresets = {
  lung: { center: -600, width: 1500 },
  mediastinum: { center: 40, width: 400 },
  bone: { center: 400, width: 1800 },
  brain: { center: 40, width: 80 },
  abdomen: { center: 60, width: 400 },
};

async function initApp() {
  try {
    showLoading(true);
    state.wasm = await init();
    console.log('Wasm module initialized');
    setupEventListeners();
    setupCanvas();
  } catch (error) {
    console.error('Failed to initialize Wasm:', error);
    showToast('初始化失败: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function setupEventListeners() {
  elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
  elements.uploadArea.addEventListener('dragover', handleDragOver);
  elements.uploadArea.addEventListener('dragleave', handleDragLeave);
  elements.uploadArea.addEventListener('drop', handleDrop);

  elements.fileInput.addEventListener('change', handleFileSelect);

  elements.wcSlider.addEventListener('input', handleWindowChange);
  elements.wwSlider.addEventListener('input', handleWindowChange);
  elements.wcInput.addEventListener('change', handleWindowInputChange);
  elements.wwInput.addEventListener('change', handleWindowInputChange);

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', handlePresetClick);
  });

  elements.uploadBtn.addEventListener('click', handleUpload);
  elements.downloadBtn.addEventListener('click', handleDownload);

  elements.canvas.addEventListener('mousedown', handleCanvasMouseDown);
  elements.canvas.addEventListener('mousemove', handleCanvasMouseMove);
  elements.canvas.addEventListener('mouseup', handleCanvasMouseUp);
  elements.canvas.addEventListener('mouseleave', handleCanvasMouseUp);
  elements.canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });

  elements.btn2D.addEventListener('click', () => switchViewMode('2d'));
  elements.btn3D.addEventListener('click', () => switchViewMode('3d'));

  elements.buildVolumeBtn.addEventListener('click', handleBuildVolume);
  elements.renderMode.addEventListener('change', handleVolumeParamChange);
  elements.tfPreset.addEventListener('change', handleTFPresetChange);
  elements.stepSlider.addEventListener('input', handleVolumeParamChange);
  elements.opacitySlider.addEventListener('input', handleVolumeParamChange);
  elements.thresholdSlider.addEventListener('input', handleVolumeParamChange);
  elements.ambientSlider.addEventListener('input', handleVolumeParamChange);
  elements.diffuseSlider.addEventListener('input', handleVolumeParamChange);
  elements.specularSlider.addEventListener('input', handleVolumeParamChange);
  elements.volWCSlider.addEventListener('input', handleVolumeParamChange);
  elements.volWWSlider.addEventListener('input', handleVolumeParamChange);
  elements.resetViewBtn.addEventListener('click', handleResetView);

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('dragover');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('dragover');
  });

  window.addEventListener('resize', setupCanvas);
}

function switchViewMode(mode) {
  state.viewMode = mode;

  elements.btn2D.classList.toggle('active', mode === '2d');
  elements.btn3D.classList.toggle('active', mode === '3d');

  elements.viewer2D.style.display = mode === '2d' ? '' : 'none';
  elements.viewer3D.style.display = mode === '3d' ? '' : 'none';

  elements.controlsPanel.style.display = mode === '2d' && state.currentFileId ? 'block' : 'none';
  elements.volumePanel.style.display = mode === '3d' && state.files.length > 0 ? 'block' : 'none';

  elements.viewModeInfo.textContent = mode === '2d' ? '模式: 2D 切片' : '模式: 3D 容积渲染';

  if (mode === '3d') {
    setupVolumeCanvas();
  }
}

function setupCanvas() {
  const container = elements.canvas.parentElement;
  if (container.style.display === 'none') return;
  const rect = container.getBoundingClientRect();
  elements.canvas.width = Math.floor(rect.width);
  elements.canvas.height = Math.floor(rect.height);

  if (state.currentFileId) {
    render();
  }
}

function setupVolumeCanvas() {
  const container = elements.viewer3D;
  const rect = container.getBoundingClientRect();
  elements.volumeCanvas.width = Math.floor(rect.width);
  elements.volumeCanvas.height = Math.floor(rect.height);

  if (!state.volumeRenderer) {
    try {
      state.volumeRenderer = new VolumeRenderer(elements.volumeCanvas);
      console.log('Volume renderer initialized');
    } catch (error) {
      console.error('Failed to init volume renderer:', error);
      showToast('WebGL 初始化失败: ' + error.message, 'error');
    }
  }

  if (state.volumeBuilt && state.volumeRenderer) {
    state.volumeRenderer.needsRender = true;
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');

  const files = Array.from(e.dataTransfer.files).filter((f) =>
    f.name.toLowerCase().endsWith('.dcm')
  );
  loadFiles(files);
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files).filter((f) =>
    f.name.toLowerCase().endsWith('.dcm')
  );
  loadFiles(files);
}

async function loadFiles(files) {
  if (files.length === 0) {
    showToast('请选择 .dcm 文件', 'error');
    return;
  }

  for (const file of files) {
    const fileId = generateId();
    const fileInfo = {
      id: fileId,
      name: file.name,
      size: file.size,
      metadata: null,
    };

    state.files.push(fileInfo);
    updateFileList();

    try {
      showLoading(true);
      elements.dropHint.classList.add('hidden');

      const data = await file.arrayBuffer();
      const metadata = state.wasm.load_dicom(new Uint8Array(data), fileId);
      fileInfo.metadata = metadata;

      selectFile(fileId);
      showToast(`已加载: ${file.name}`, 'success');
    } catch (error) {
      console.error('Failed to load DICOM:', error);
      showToast(`加载失败: ${file.name} - ${error.message}`, 'error');
      state.files = state.files.filter((f) => f.id !== fileId);
      updateFileList();
    } finally {
      showLoading(false);
    }
  }

  if (state.files.length > 0) {
    elements.volumePanel.style.display = state.viewMode === '3d' ? 'block' : 'none';
  }

  updateCacheInfo();
}

function updateFileList() {
  elements.fileList.innerHTML = '';

  state.files.forEach((file) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    if (file.id === state.currentFileId) {
      item.classList.add('active');
    }

    const size = formatFileSize(file.size);
    const sliceInfo = file.metadata
      ? ` | ${file.metadata.width}x${file.metadata.height} | SL: ${file.metadata.slice_location?.toFixed(1) || 'N/A'}`
      : '';
    item.innerHTML = `
      <div class="file-item-info">
        <div class="file-item-name">${escapeHtml(file.name)}</div>
        <div class="file-item-size">${size}${sliceInfo}</div>
      </div>
    `;

    item.addEventListener('click', () => selectFile(file.id));
    elements.fileList.appendChild(item);
  });
}

function selectFile(fileId) {
  state.currentFileId = fileId;
  const file = state.files.find((f) => f.id === fileId);
  if (!file) return;

  state.currentMetadata = file.metadata;
  updateFileList();
  updateUIWithMetadata();
  render();
}

function updateUIWithMetadata() {
  const meta = state.currentMetadata;
  if (!meta) return;

  if (state.viewMode === '2d') {
    elements.controlsPanel.style.display = 'block';
  }
  elements.infoPanel.style.display = 'block';
  elements.actionsPanel.style.display = 'block';

  elements.wcSlider.min = Math.min(-1000, meta.window_center - 2000);
  elements.wcSlider.max = Math.max(3000, meta.window_center + 2000);
  elements.wwSlider.min = 1;
  elements.wwSlider.max = Math.max(4000, meta.window_width * 2);

  elements.wcSlider.value = meta.window_center;
  elements.wwSlider.value = meta.window_width;
  elements.wcInput.value = meta.window_center;
  elements.wwInput.value = meta.window_width;
  elements.wcValue.textContent = meta.window_center;
  elements.wwValue.textContent = meta.window_width;

  elements.metadata.innerHTML = `
    <div class="metadata-item">
      <span class="metadata-label">患者ID</span>
      <span class="metadata-value">${escapeHtml(meta.patient_id)}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">患者姓名</span>
      <span class="metadata-value">${escapeHtml(meta.patient_name)}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">检查日期</span>
      <span class="metadata-value">${escapeHtml(meta.study_date)}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">检查类型</span>
      <span class="metadata-value">${escapeHtml(meta.modality)}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">检查部位</span>
      <span class="metadata-value">${escapeHtml(meta.body_part_examined)}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">图像尺寸</span>
      <span class="metadata-value">${meta.width} x ${meta.height}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">位深</span>
      <span class="metadata-value">${meta.bits_allocated} 位</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">窗位/窗宽</span>
      <span class="metadata-value">${meta.window_center} / ${meta.window_width}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">切片位置</span>
      <span class="metadata-value">${meta.slice_location?.toFixed(2) || 'N/A'}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">切片厚度</span>
      <span class="metadata-value">${meta.slice_thickness?.toFixed(2) || 'N/A'}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">像素间距</span>
      <span class="metadata-value">${meta.pixel_spacing?.join(' x ') || 'N/A'}</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">序列 UID</span>
      <span class="metadata-value" title="${escapeHtml(meta.series_uid)}">${escapeHtml(meta.series_uid?.substring(0, 20) || 'N/A')}...</span>
    </div>
  `;
}

function handleWindowChange() {
  const wc = parseInt(elements.wcSlider.value);
  const ww = parseInt(elements.wwSlider.value);

  elements.wcInput.value = wc;
  elements.wwInput.value = ww;
  elements.wcValue.textContent = wc;
  elements.wwValue.textContent = ww;

  if (state.currentFileId) {
    state.wasm.set_window(state.currentFileId, wc, ww);
    render();
  }
}

function handleWindowInputChange() {
  let wc = parseInt(elements.wcInput.value) || 0;
  let ww = parseInt(elements.wwInput.value) || 1;

  wc = Math.max(parseInt(elements.wcSlider.min), Math.min(parseInt(elements.wcSlider.max), wc));
  ww = Math.max(1, Math.min(parseInt(elements.wwSlider.max), ww));

  elements.wcSlider.value = wc;
  elements.wwSlider.value = ww;
  elements.wcValue.textContent = wc;
  elements.wwValue.textContent = ww;

  if (state.currentFileId) {
    state.wasm.set_window(state.currentFileId, wc, ww);
    render();
  }
}

function handlePresetClick(e) {
  const preset = e.currentTarget.dataset.preset;

  if (preset === 'reset') {
    if (state.currentFileId && state.currentMetadata) {
      state.wasm.reset_window(state.currentFileId);
      elements.wcSlider.value = state.currentMetadata.window_center;
      elements.wwSlider.value = state.currentMetadata.window_width;
      elements.wcInput.value = state.currentMetadata.window_center;
      elements.wwInput.value = state.currentMetadata.window_width;
      elements.wcValue.textContent = state.currentMetadata.window_center;
      elements.wwValue.textContent = state.currentMetadata.window_width;
      render();
      showToast('已重置为原始窗宽窗位', 'success');
    }
    return;
  }

  const settings = windowPresets[preset];
  if (settings && state.currentFileId) {
    state.wasm.set_window(state.currentFileId, settings.center, settings.width);
    elements.wcSlider.value = settings.center;
    elements.wwSlider.value = settings.width;
    elements.wcInput.value = settings.center;
    elements.wwInput.value = settings.width;
    elements.wcValue.textContent = settings.center;
    elements.wwValue.textContent = settings.width;
    render();
    showToast(`已应用预设: ${e.currentTarget.textContent}`, 'success');
  }
}

function handleCanvasMouseDown(e) {
  if (!state.currentFileId) return;
  const rect = elements.canvas.getBoundingClientRect();
  state.isDragging = true;
  state.dragStartX = e.clientX - rect.left;
  state.dragStartY = e.clientY - rect.top;
  state.dragStartWC = parseInt(elements.wcSlider.value);
  state.dragStartWW = parseInt(elements.wwSlider.value);
}

function handleCanvasMouseMove(e) {
  const rect = elements.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  elements.mouseInfo.textContent = `位置: (${Math.round(x)}, ${Math.round(y)})`;

  if (!state.isDragging || !state.currentFileId) return;

  const dx = x - state.dragStartX;
  const dy = y - state.dragStartY;

  const newWC = state.dragStartWC + Math.round(dx * 2);
  const newWW = state.dragStartWW + Math.round(dy * 2);

  const clampedWC = Math.max(parseInt(elements.wcSlider.min), Math.min(parseInt(elements.wcSlider.max), newWC));
  const clampedWW = Math.max(1, Math.min(parseInt(elements.wwSlider.max), newWW));

  elements.wcSlider.value = clampedWC;
  elements.wwSlider.value = clampedWW;
  elements.wcInput.value = clampedWC;
  elements.wwInput.value = clampedWW;
  elements.wcValue.textContent = clampedWC;
  elements.wwValue.textContent = clampedWW;

  state.wasm.set_window(state.currentFileId, clampedWC, clampedWW);
  render();
}

function handleCanvasMouseUp() {
  state.isDragging = false;
}

function handleCanvasWheel(e) {
  if (!state.currentFileId) return;
  e.preventDefault();

  const delta = e.deltaY > 0 ? -10 : 10;
  const currentWW = parseInt(elements.wwSlider.value);
  const newWW = Math.max(1, currentWW + delta);

  elements.wwSlider.value = newWW;
  elements.wwInput.value = newWW;
  elements.wwValue.textContent = newWW;

  state.wasm.set_window(state.currentFileId, parseInt(elements.wcSlider.value), newWW);
  render();
}

async function handleBuildVolume() {
  if (state.files.length === 0) {
    showToast('请先加载 DICOM 切片文件', 'error');
    return;
  }

  try {
    elements.buildVolumeBtn.disabled = true;
    elements.volumeStatus.className = 'status info';
    elements.volumeStatus.textContent = `正在构建 3D 体积 (${state.files.length} 切片)...`;

    const sliceIds = state.files.map((f) => f.id);

    const volumeInfo = state.wasm.build_volume(sliceIds);

    const volumeData = state.wasm.get_volume_data();

    elements.volumeStatus.className = 'status info';
    elements.volumeStatus.textContent = `体积: ${volumeInfo.width}x${volumeInfo.height}x${volumeInfo.depth} | HU: [${volumeInfo.data_min.toFixed(0)}, ${volumeInfo.data_max.toFixed(0)}]`;

    switchViewMode('3d');

    setupVolumeCanvas();

    if (state.volumeRenderer) {
      state.volumeRenderer.loadVolume(volumeData, volumeInfo);
      state.volumeBuilt = true;
      elements.volumeOverlay.classList.add('hidden');
      elements.volumeControls.style.display = 'block';

      showToast(`3D 体积构建完成: ${volumeInfo.width}x${volumeInfo.height}x${volumeInfo.depth}`, 'success');
    }
  } catch (error) {
    console.error('Volume build error:', error);
    elements.volumeStatus.className = 'status error';
    elements.volumeStatus.textContent = `构建失败: ${error.message}`;
    showToast(`3D 体积构建失败: ${error.message}`, 'error');
  } finally {
    elements.buildVolumeBtn.disabled = false;
  }
}

function handleVolumeParamChange() {
  if (!state.volumeRenderer) return;

  const step = parseFloat(elements.stepSlider.value);
  const opacity = parseFloat(elements.opacitySlider.value);
  const threshold = parseFloat(elements.thresholdSlider.value);
  const ambient = parseFloat(elements.ambientSlider.value);
  const diffuse = parseFloat(elements.diffuseSlider.value);
  const specular = parseFloat(elements.specularSlider.value);
  const renderMode = parseInt(elements.renderMode.value);
  const volWC = parseInt(elements.volWCSlider.value);
  const volWW = parseInt(elements.volWWSlider.value);

  elements.stepValue.textContent = step.toFixed(3);
  elements.opacityValue.textContent = opacity.toFixed(1);
  elements.thresholdValue.textContent = threshold.toFixed(2);
  elements.ambientValue.textContent = ambient.toFixed(2);
  elements.diffuseValue.textContent = diffuse.toFixed(2);
  elements.specularValue.textContent = specular.toFixed(2);
  elements.volWCValue.textContent = volWC;
  elements.volWWValue.textContent = volWW;

  state.volumeRenderer.setStepSize(step);
  state.volumeRenderer.setOpacityScale(opacity);
  state.volumeRenderer.setThreshold(threshold);
  state.volumeRenderer.setLighting(ambient, diffuse, specular, 16.0);
  state.volumeRenderer.setRenderMode(renderMode);
  state.volumeRenderer.setWindow(volWC, volWW);
}

function handleTFPresetChange() {
  if (!state.volumeRenderer) return;
  state.volumeRenderer.applyPreset(elements.tfPreset.value);
  showToast(`传输函数已切换: ${elements.tfPreset.options[elements.tfPreset.selectedIndex].text}`, 'success');
}

function handleResetView() {
  if (!state.volumeRenderer) return;
  state.volumeRenderer.resetView();
  showToast('视角已重置', 'success');
}

function render() {
  if (!state.currentFileId || state.viewMode !== '2d' || !state.currentMetadata) return;

  try {
    const { width, height } = state.currentMetadata;
    const imageDataArray = state.wasm.render_image(state.currentFileId);
    
    const imageData = new ImageData(
      new Uint8ClampedArray(imageDataArray),
      width,
      height
    );

    const canvasWidth = elements.canvas.width;
    const canvasHeight = elements.canvas.height;
    const scaleX = canvasWidth / width;
    const scaleY = canvasHeight / height;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (canvasWidth - width * scale) / 2;
    const offsetY = (canvasHeight - height * scale) / 2;

    ctx.save();
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
  } catch (error) {
    console.error('Render error:', error);
  }
}

async function handleUpload() {
  if (!state.currentFileId || !state.currentMetadata) {
    showToast('请先加载 DICOM 文件', 'error');
    return;
  }

  try {
    elements.uploadStatus.className = 'status info';
    elements.uploadStatus.textContent = '正在处理并上传...';
    elements.uploadBtn.disabled = true;

    const anonMeta = state.wasm.get_anonymized_metadata(state.currentFileId);
    const pngData = state.wasm.export_as_png(state.currentFileId);

    const formData = new FormData();
    formData.append('file', new Blob([pngData], { type: 'image/png' }), 'image.png');
    formData.append('metadata', JSON.stringify(anonMeta));

    const response = await fetch('/api/images', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (response.ok) {
      elements.uploadStatus.className = 'status success';
      elements.uploadStatus.textContent = `上传成功！ID: ${result.id}`;
      showToast('影像已成功上传到服务器', 'success');
    } else {
      throw new Error(result.error || '上传失败');
    }
  } catch (error) {
    console.error('Upload error:', error);
    elements.uploadStatus.className = 'status error';
    elements.uploadStatus.textContent = `上传失败: ${error.message}`;
    showToast(`上传失败: ${error.message}`, 'error');
  } finally {
    elements.uploadBtn.disabled = false;
  }
}

function handleDownload() {
  if (!state.currentFileId) {
    showToast('请先加载 DICOM 文件', 'error');
    return;
  }

  try {
    const pngData = state.wasm.export_as_png(state.currentFileId);
    const blob = new Blob([pngData], { type: 'image/png' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.currentMetadata?.sop_instance_uid || 'dicom'}.png`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('PNG 已下载', 'success');
  } catch (error) {
    console.error('Download error:', error);
    showToast(`下载失败: ${error.message}`, 'error');
  }
}

function updateCacheInfo() {
  try {
    const info = state.wasm.get_cache_info();
    elements.cacheInfo.textContent = `缓存: ${info.entries}/${info.max_entries} | ${info.total_memory_kb} KB`;
  } catch (e) {}
}

function showLoading(show) {
  if (show) {
    elements.loadingOverlay.classList.remove('hidden');
  } else {
    elements.loadingOverlay.classList.add('hidden');
  }
}

function showToast(message, type = 'info') {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type}`;
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

initApp();
