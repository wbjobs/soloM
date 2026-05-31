const viewerElement = document.getElementById('dicomViewer');
const viewerPlaceholder = document.getElementById('viewerPlaceholder');
const fileInput = document.getElementById('dicomFile');
const fileInfo = document.getElementById('fileInfo');
const imageInfo = document.getElementById('imageInfo');
const windowWidthSlider = document.getElementById('windowWidth');
const windowLevelSlider = document.getElementById('windowLevel');
const windowWidthValue = document.getElementById('windowWidthValue');
const windowLevelValue = document.getElementById('windowLevelValue');
const memoryStatus = document.getElementById('memoryStatus');
const mode2DBtn = document.getElementById('mode2D');
const modeMPRBtn = document.getElementById('modeMPR');
const viewerContainer2D = document.getElementById('viewerContainer2D');
const viewerContainerMPR = document.getElementById('viewerContainerMPR');
const mprControls = document.getElementById('mprControls');
const mprPlaceholder = document.getElementById('mprPlaceholder');

const axialSlider = document.getElementById('axialSlider');
const coronalSlider = document.getElementById('coronalSlider');
const sagittalSlider = document.getElementById('sagittalSlider');
const axialSliceInfo = document.getElementById('axialSliceInfo');
const coronalSliceInfo = document.getElementById('coronalSliceInfo');
const sagittalSliceInfo = document.getElementById('sagittalSliceInfo');
const axialInfo = document.getElementById('axialInfo');
const coronalInfo = document.getElementById('coronalInfo');
const sagittalInfo = document.getElementById('sagittalInfo');

let currentImage = null;
let currentImageId = null;
let isWadoInitialized = false;
let isMouseDown = false;
let lastX = 0;
let lastY = 0;
let isDraggingRight = false;
let panStartX = 0;
let panStartY = 0;
let defaultViewport = null;
let currentViewport = null;
let currentMode = '2D';

const MAX_CACHE_SIZE_MB = 2048;
const LARGE_FILE_THRESHOLD_MB = 30;
const CHUNK_SIZE = 8 * 1024 * 1024;

const windowPresets = {
  lung: { width: 1500, level: -600 },
  mediastinum: { width: 350, level: 50 },
  bone: { width: 1500, level: 300 },
  brain: { width: 80, level: 40 }
};

let mprState = {
  volumeData: null,
  scalarData: null,
  dimensions: [0, 0, 0],
  spacing: [1, 1, 1],
  sliceIndex: { axial: 0, coronal: 0, sagittal: 0 },
  windowWidth: 2000,
  windowLevel: 500,
  renderingViews: [],
  isPlaying: { axial: false, coronal: false, sagittal: false },
  playIntervals: {}
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateMemoryStatus() {
  if (!memoryStatus) return;
  try {
    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize;
      const total = performance.memory.totalJSHeapSize;
      const limit = performance.memory.jsHeapSizeLimit;
      const pct = ((used / limit) * 100).toFixed(1);
      memoryStatus.innerHTML = `JS堆: ${formatBytes(used)} / ${formatBytes(limit)} (${pct}%)`;
      memoryStatus.className = 'memory-status' + (parseFloat(pct) > 80 ? ' warning' : '');
    } else {
      let cacheInfo = '';
      if (cornerstone && cornerstone.imageCache && cornerstone.imageCache.getCacheInfo) {
        const info = cornerstone.imageCache.getCacheInfo();
        cacheInfo = ` | 缓存: ${formatBytes(info.cacheSizeInBytes)} (${info.numberOfImagesCached}张)`;
      }
      if (mprState.scalarData) {
        const volSize = mprState.scalarData.length * 2;
        cacheInfo += ` | 体数据: ${formatBytes(volSize)}`;
      }
      memoryStatus.innerHTML = `缓存信息${cacheInfo}`;
    }
  } catch (e) {
    memoryStatus.innerHTML = '';
  }
}

function purgeImageCache() {
  try {
    if (currentImageId && cornerstone && cornerstone.imageCache) {
      cornerstone.imageCache.removeImageLoadObject(currentImageId);
    }
    if (cornerstone && cornerstone.imageCache && cornerstone.imageCache.purgeCache) {
      cornerstone.imageCache.purgeCache();
    }
  } catch (e) {
    console.warn('Cache purge warning:', e);
  }
}

function freeCurrentImage() {
  try {
    if (currentImageId && cornerstone && cornerstone.imageCache) {
      cornerstone.imageCache.removeImageLoadObject(currentImageId);
    }
  } catch (e) {
    console.warn('Free image warning:', e);
  }
  currentImage = null;
  currentImageId = null;
  defaultViewport = null;
  currentViewport = null;
}

function freeMPRVolume() {
  try {
    mprState.renderingViews.forEach(view => {
      if (view.openglRenderWindow) {
        view.openglRenderWindow.delete();
      }
      if (view.renderer) {
        view.renderer.delete();
      }
      if (view.imageMapper) {
        view.imageMapper.delete();
      }
      if (view.imageSlice) {
        view.imageSlice.delete();
      }
      if (view.imageActor) {
        view.imageActor.delete();
      }
    });
    mprState.renderingViews = [];
  } catch (e) {
    console.warn('Free MPR views warning:', e);
  }

  mprState.volumeData = null;
  mprState.scalarData = null;
  mprState.dimensions = [0, 0, 0];
  mprState.sliceIndex = { axial: 0, coronal: 0, sagittal: 0 };

  Object.keys(mprState.isPlaying).forEach(key => {
    mprState.isPlaying[key] = false;
    if (mprState.playIntervals[key]) {
      clearInterval(mprState.playIntervals[key]);
      mprState.playIntervals[key] = null;
    }
  });

  mprPlaceholder.style.display = 'flex';
}

function initCornerstone() {
  if (!window.cornerstone) {
    console.error('cornerstone.js not loaded');
    return false;
  }

  if (!window.cornerstoneWADOImageLoader) {
    console.error('cornerstoneWADOImageLoader not loaded');
    return false;
  }

  if (!window.cornerstoneTools) {
    console.error('cornerstoneTools not loaded');
    return false;
  }

  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

  const maxCacheSizeBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;
  if (cornerstone.imageCache && cornerstone.imageCache.setMaximumSizeBytes) {
    cornerstone.imageCache.setMaximumSizeBytes(maxCacheSizeBytes);
  }

  cornerstoneWADOImageLoader.configure({
    useWebWorkers: true,
    webWorkerPath: 'https://cdn.jsdelivr.net/npm/cornerstone-wado-image-loader@4.12.0/dist/cornerstoneWADOImageLoaderWebWorker.min.js',
    maxWebWorkers: Math.min(navigator.hardwareConcurrency || 4, 4),
    startWebWorkersOnDemand: true,
    taskConfiguration: {
      'decodeTask': {
        codecsPath: 'https://cdn.jsdelivr.net/npm/cornerstone-wado-image-loader@4.12.0/dist/cornerstoneWADOImageLoaderCodecs.min.js',
        initializeCodecsOnStartup: false
      }
    }
  });

  cornerstoneTools.init({
    showSVGCursors: true
  });

  try {
    cornerstone.enable(viewerElement);
  } catch (e) {
    console.log('Cornerstone already enabled');
  }

  return true;
}

function showLoading(progress, message) {
  let loading = document.getElementById('loadingOverlay');
  if (!loading) {
    loading = document.createElement('div');
    loading.className = 'loading-overlay';
    loading.id = 'loadingOverlay';
    const container = currentMode === '2D' ? viewerElement : viewerContainerMPR;
    container.appendChild(loading);
  }
  const msg = message || '正在解析 DICOM 文件';
  const pct = progress ? ` (${Math.round(progress)}%)` : '';
  loading.innerHTML = `
    <div class="spinner"></div>
    <p>${msg}${pct}</p>
    <div class="progress-bar-container">
      <div class="progress-bar" id="loadingProgressBar" style="width: ${progress || 0}%"></div>
    </div>
  `;
}

function updateLoadingProgress(progress, message) {
  const bar = document.getElementById('loadingProgressBar');
  const p = document.querySelector('.loading-overlay p');
  if (bar) {
    bar.style.width = Math.round(progress) + '%';
  }
  if (p && message) {
    p.textContent = `${message} (${Math.round(progress)}%)`;
  }
}

function hideLoading() {
  const loading = document.getElementById('loadingOverlay');
  if (loading) {
    loading.remove();
  }
}

function readFileAsArrayBuffer(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (file.size <= LARGE_FILE_THRESHOLD_MB * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const chunks = [];
    let offset = 0;
    const totalSize = file.size;

    const readChunk = () => {
      const end = Math.min(offset + CHUNK_SIZE, totalSize);
      const blob = file.slice(offset, end);
      const reader = new FileReader();

      reader.onload = (e) => {
        chunks.push(e.target.result);
        offset = end;

        const progress = (offset / totalSize) * 100;
        if (onProgress) onProgress(progress);

        if (offset < totalSize) {
          setTimeout(readChunk, 0);
        } else {
          try {
            const result = new Uint8Array(totalSize);
            let pos = 0;
            for (const chunk of chunks) {
              result.set(new Uint8Array(chunk), pos);
              pos += chunk.byteLength;
            }
            chunks.length = 0;
            resolve(result.buffer);
          } catch (e) {
            reject(new Error('文件过大，无法在浏览器中分配连续内存: ' + e.message));
          }
        }
      };

      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(blob);
    };

    readChunk();
  });
}

function parseDicomTags(arrayBuffer) {
  try {
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray, {
      untilTag: 'x7fe00010'
    });

    const tags = {};

    const tagMappings = {
      'x00100010': '患者姓名',
      'x00100020': '患者ID',
      'x00100030': '出生日期',
      'x00100040': '性别',
      'x0020000D': '检查实例UID',
      'x00200010': '检查ID',
      'x00080020': '检查日期',
      'x00080030': '检查时间',
      'x00080060': '检查模态',
      'x00080070': '设备制造商',
      'x00081090': '设备型号',
      'x00280010': '图像行数',
      'x00280011': '图像列数',
      'x00280030': '像素间距',
      'x00280100': '分配位数',
      'x00280101': '存储位数',
      'x00280102': '高位',
      'x00281050': '窗位',
      'x00281051': '窗宽',
      'x00281052': '拦截',
      'x00281053': '斜率',
      'x00280008': '帧数',
      'x00200032': '图像位置',
      'x00200037': '图像方向',
      'x00180050': '层厚',
      'x00201041': '层间距'
    };

    for (const [tag, name] of Object.entries(tagMappings)) {
      const element = dataSet.elements[tag];
      if (element) {
        try {
          let value;
          if (element.length > 0) {
            if (element.vr === 'PN') {
              value = dataSet.string(tag);
            } else if (element.vr === 'DS' || element.vr === 'FD') {
              value = dataSet.floatString(tag);
            } else if (element.vr === 'IS' || element.vr === 'UL' || element.vr === 'US') {
              value = dataSet.intString(tag);
            } else {
              value = dataSet.string(tag);
            }
          }
          if (value !== undefined && value !== null && value !== '') {
            tags[name] = value;
          }
        } catch (e) {
          console.log(`Error reading tag ${tag}:`, e);
        }
      }
    }

    return tags;
  } catch (e) {
    console.error('Error parsing DICOM tags:', e);
    return null;
  }
}

function getDicomPositionInfo(arrayBuffer) {
  try {
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray, {
      untilTag: 'x7fe00010'
    });

    const info = {
      rows: 0,
      cols: 0,
      position: [0, 0, 0],
      sliceThickness: 1,
      pixelSpacing: [1, 1],
      intercept: 0,
      slope: 1
    };

    const rows = dataSet.uint16('x00280010');
    const cols = dataSet.uint16('x00280011');
    if (rows) info.rows = rows;
    if (cols) info.cols = cols;

    const posStr = dataSet.string('x00200032');
    if (posStr) {
      const pos = posStr.split('\\').map(Number);
      if (pos.length === 3) {
        info.position = pos;
      }
    }

    const spacingStr = dataSet.string('x00280030');
    if (spacingStr) {
      const spacing = spacingStr.split('\\').map(Number);
      if (spacing.length === 2) {
        info.pixelSpacing = spacing;
      }
    }

    const thickness = dataSet.floatString('x00180050');
    if (thickness) info.sliceThickness = parseFloat(thickness);

    const intercept = dataSet.floatString('x00281052');
    const slope = dataSet.floatString('x00281053');
    if (intercept) info.intercept = parseFloat(intercept);
    if (slope) info.slope = parseFloat(slope);

    return info;
  } catch (e) {
    console.error('Error getting position info:', e);
    return null;
  }
}

function displayImageInfo(tags, image, volumeInfo) {
  if (!tags && !image && !volumeInfo) {
    imageInfo.innerHTML = '<p class="placeholder">加载 DICOM 文件后显示信息</p>';
    return;
  }

  let html = '<table>';

  if (tags) {
    for (const [name, value] of Object.entries(tags)) {
      html += `<tr><td>${name}</td><td>${value}</td></tr>`;
    }
  }

  if (volumeInfo) {
    html += `<tr><td colspan="2" style="color: #00d4ff; font-weight: bold; padding-top: 0.5rem;">3D 体数据</td></tr>`;
    html += `<tr><td>体数据尺寸</td><td>${volumeInfo.dimensions[0]} × ${volumeInfo.dimensions[1]} × ${volumeInfo.dimensions[2]}</td></tr>`;
    html += `<tr><td>像素间距</td><td>${volumeInfo.spacing[0].toFixed(3)}, ${volumeInfo.spacing[1].toFixed(3)}, ${volumeInfo.spacing[2].toFixed(3)} mm</td></tr>`;
    html += `<tr><td>体素总数</td><td>${(volumeInfo.dimensions[0] * volumeInfo.dimensions[1] * volumeInfo.dimensions[2]).toLocaleString()}</td></tr>`;
    html += `<tr><td>数据大小</td><td>${formatBytes(volumeInfo.dimensions[0] * volumeInfo.dimensions[1] * volumeInfo.dimensions[2] * 2)}</td></tr>`;
  } else if (image) {
    html += `<tr><td>图像尺寸</td><td>${image.width} × ${image.height}</td></tr>`;
    if (image.sizeInBytes) {
      const sizeKB = (image.sizeInBytes / 1024).toFixed(2);
      html += `<tr><td>数据大小</td><td>${sizeKB} KB</td></tr>`;
    }
    if (image.minPixelValue !== undefined) {
      html += `<tr><td>最小像素值</td><td>${image.minPixelValue}</td></tr>`;
    }
    if (image.maxPixelValue !== undefined) {
      html += `<tr><td>最大像素值</td><td>${image.maxPixelValue}</td></tr>`;
    }
  }

  html += '</table>';
  imageInfo.innerHTML = html;
}

async function loadSingleDicomFile(file) {
  if (!isWadoInitialized) {
    const initialized = initCornerstone();
    if (!initialized) {
      alert('cornerstone 库加载失败，请刷新页面重试');
      return;
    }
    isWadoInitialized = true;
  }

  const fileSizeMB = file.size / (1024 * 1024);

  if (fileSizeMB > 200) {
    const confirmed = confirm(
      `文件大小为 ${fileSizeMB.toFixed(1)} MB，可能导致浏览器内存不足。\n\n建议：\n1. 使用较小的文件测试\n2. 关闭其他标签页释放内存\n\n是否继续加载？`
    );
    if (!confirmed) return;
  }

  freeCurrentImage();
  purgeImageCache();
  freeMPRVolume();

  if (window.gc) {
    try { window.gc(); } catch (e) { /* ignore */ }
  }

  updateMemoryStatus();
  showLoading(0);

  let arrayBuffer = null;
  let dicomTags = null;

  try {
    fileInfo.innerHTML = `<p>正在加载: ${file.name} (${fileSizeMB.toFixed(2)} MB)</p>`;

    arrayBuffer = await readFileAsArrayBuffer(file, (progress) => {
      updateLoadingProgress(progress * 0.6, '正在读取文件');
    });

    dicomTags = parseDicomTags(arrayBuffer);

    updateLoadingProgress(65, '正在解析像素数据');

    const blob = new Blob([arrayBuffer], { type: 'application/dicom' });

    if (arrayBuffer.byteLength > 100 * 1024 * 1024) {
      arrayBuffer = null;
    }

    updateLoadingProgress(75, '正在解码图像');

    const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(blob);
    currentImageId = imageId;

    const image = await cornerstone.loadImage(imageId);

    currentImage = image;

    defaultViewport = cornerstone.getDefaultViewportForImage(viewerElement, image);
    currentViewport = { ...defaultViewport };

    if (image.windowWidth && image.windowCenter) {
      currentViewport.voi.windowWidth = Array.isArray(image.windowWidth) ? image.windowWidth[0] : image.windowWidth;
      currentViewport.voi.windowCenter = Array.isArray(image.windowCenter) ? image.windowCenter[0] : image.windowCenter;
    }

    if (dicomTags && dicomTags['窗宽'] && dicomTags['窗位']) {
      const ww = parseFloat(dicomTags['窗宽']);
      const wl = parseFloat(dicomTags['窗位']);
      if (!isNaN(ww) && !isNaN(wl) && ww > 0) {
        currentViewport.voi.windowWidth = ww;
        currentViewport.voi.windowCenter = wl;
      }
    }

    mprState.windowWidth = currentViewport.voi.windowWidth;
    mprState.windowLevel = currentViewport.voi.windowCenter;
    updateSliderValues(mprState.windowWidth, mprState.windowLevel);

    updateLoadingProgress(95, '正在渲染');

    await cornerstone.displayImage(viewerElement, image, currentViewport);

    viewerPlaceholder.classList.add('hidden');
    viewerElement.classList.add('active');

    displayImageInfo(dicomTags, image, null);

    updateLoadingProgress(100);

    fileInfo.innerHTML = `
      <p><strong>${file.name}</strong></p>
      <p>大小: ${fileSizeMB.toFixed(2)} MB</p>
      <p>状态: 加载成功 ✓</p>
      <p style="color: #888; font-size: 0.75rem; margin-top: 0.5rem;">选择多个文件可启用 MPR 三视图</p>
    `;

    updateMemoryStatus();

  } catch (error) {
    console.error('Error loading DICOM file:', error);
    handleLoadError(error, file, fileSizeMB);
  } finally {
    hideLoading();
  }
}

async function loadDicomSequence(files) {
  const totalSize = Array.from(files).reduce((sum, f) => sum + f.size, 0);
  const totalSizeMB = totalSize / (1024 * 1024);

  if (totalSizeMB > 500) {
    const confirmed = confirm(
      `序列总大小为 ${totalSizeMB.toFixed(1)} MB，可能需要较长加载时间。\n\n建议：\n1. 关闭其他标签页\n2. 耐心等待加载完成\n\n是否继续？`
    );
    if (!confirmed) return;
  }

  freeCurrentImage();
  purgeImageCache();
  freeMPRVolume();

  if (window.gc) {
    try { window.gc(); } catch (e) { /* ignore */ }
  }

  showLoading(0, '正在加载 DICOM 序列');
  updateMemoryStatus();

  try {
    fileInfo.innerHTML = `
      <p>正在加载序列: ${files.length} 个文件</p>
      <p>总大小: ${totalSizeMB.toFixed(2)} MB</p>
    `;

    const fileList = Array.from(files);
    const slices = [];
    let commonTags = null;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const progress = 5 + (i / fileList.length) * 40;
      updateLoadingProgress(progress, `正在读取文件 ${i + 1}/${fileList.length}`);

      const arrayBuffer = await readFileAsArrayBuffer(file);
      const posInfo = getDicomPositionInfo(arrayBuffer);

      if (!posInfo) {
        console.warn(`Skipping file ${file.name}: unable to parse position info`);
        continue;
      }

      if (!commonTags) {
        commonTags = parseDicomTags(arrayBuffer);
      }

      const blob = new Blob([arrayBuffer], { type: 'application/dicom' });
      const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(blob);
      const image = await cornerstone.loadImage(imageId);

      slices.push({
        file,
        arrayBuffer,
        posInfo,
        imageId,
        image,
        zPosition: posInfo.position[2]
      });

      cornerstone.imageCache.removeImageLoadObject(imageId);
    }

    if (slices.length < 2) {
      alert('有效切片数量不足，无法构建 3D 体数据。请选择同一序列的多个 DICOM 文件。');
      hideLoading();
      if (slices.length === 1) {
        loadSingleDicomFile(slices[0].file);
      }
      return;
    }

    updateLoadingProgress(50, '正在排序切片');

    slices.sort((a, b) => a.zPosition - b.zPosition);

    const firstSlice = slices[0];
    const rows = firstSlice.posInfo.rows;
    const cols = firstSlice.posInfo.cols;
    const numSlices = slices.length;

    const pixelSpacingX = firstSlice.posInfo.pixelSpacing[0];
    const pixelSpacingY = firstSlice.posInfo.pixelSpacing[1];
    let sliceSpacing = firstSlice.posInfo.sliceThickness;
    if (slices.length > 1) {
      const calculatedSpacing = Math.abs(slices[1].zPosition - slices[0].zPosition);
      if (calculatedSpacing > 0) {
        sliceSpacing = calculatedSpacing;
      }
    }

    mprState.dimensions = [cols, rows, numSlices];
    mprState.spacing = [pixelSpacingX, pixelSpacingY, sliceSpacing];

    updateLoadingProgress(55, '正在构建 3D 体数据');

    const totalVoxels = cols * rows * numSlices;
    const scalarData = new Int16Array(totalVoxels);

    for (let z = 0; z < numSlices; z++) {
      const progress = 55 + (z / numSlices) * 35;
      updateLoadingProgress(progress, `正在构建体数据 ${z + 1}/${numSlices}`);

      const slice = slices[z];
      const pixels = slice.image.getPixelData();
      const intercept = slice.posInfo.intercept;
      const slope = slice.posInfo.slope;

      const sliceOffset = z * rows * cols;

      for (let y = 0; y < rows; y++) {
        const rowOffset = y * cols;
        for (let x = 0; x < cols; x++) {
          const idx = rowOffset + x;
          let val = pixels[idx];
          if (slope !== 1) val = val * slope;
          if (intercept !== 0) val = val + intercept;
          scalarData[sliceOffset + idx] = val;
        }
      }

      slices[z].arrayBuffer = null;
      slices[z].image = null;
    }

    slices.length = 0;

    mprState.scalarData = scalarData;
    mprState.sliceIndex = {
      axial: Math.floor(numSlices / 2),
      coronal: Math.floor(rows / 2),
      sagittal: Math.floor(cols / 2)
    };

    updateLoadingProgress(92, '正在初始化 WebGL 渲染');

    await initMPRRendering();

    updateLoadingProgress(100, '加载完成');

    mprPlaceholder.style.display = 'none';
    mprControls.style.display = 'block';

    updateSliceSliders();
    updateSliceDisplay();

    if (commonTags && commonTags['窗宽'] && commonTags['窗位']) {
      const ww = parseFloat(commonTags['窗宽']);
      const wl = parseFloat(commonTags['窗位']);
      if (!isNaN(ww) && !isNaN(wl) && ww > 0) {
        mprState.windowWidth = ww;
        mprState.windowLevel = wl;
        updateSliderValues(ww, wl);
        updateAllMPRWindows();
      }
    }

    displayImageInfo(commonTags, null, {
      dimensions: mprState.dimensions,
      spacing: mprState.spacing
    });

    fileInfo.innerHTML = `
      <p><strong>序列加载成功 ✓</strong></p>
      <p>文件数: ${numSlices} 张</p>
      <p>总大小: ${totalSizeMB.toFixed(2)} MB</p>
      <p>体数据: ${cols} × ${rows} × ${numSlices}</p>
    `;

    switchToMode('MPR');

    updateMemoryStatus();

  } catch (error) {
    console.error('Error loading DICOM sequence:', error);
    handleLoadError(error, { name: 'DICOM 序列' }, totalSizeMB);
  } finally {
    hideLoading();
  }
}

function handleLoadError(error, file, fileSizeMB) {
  if (error.message && (
    error.message.includes('memory') ||
    error.message.includes('Memory') ||
    error.message.includes('OOM') ||
    error.message.includes('RangeError') ||
    error.message.includes('out of memory') ||
    error.message.includes('Invalid array length')
  )) {
    fileInfo.innerHTML = `
      <p style="color: #ff6b6b;"><strong>内存不足</strong></p>
      <p>${file.name} (${fileSizeMB.toFixed(1)} MB)</p>
      <p>文件过大导致浏览器内存溢出</p>
      <p style="color: #ffaa44; margin-top: 0.5rem;">建议:</p>
      <ul style="color: #aaa; font-size: 0.75rem; padding-left: 1rem;">
        <li>关闭其他浏览器标签页</li>
        <li>使用更小的 DICOM 文件</li>
        <li>刷新页面后重试</li>
      </ul>
    `;

    freeCurrentImage();
    freeMPRVolume();
    purgeImageCache();
    updateMemoryStatus();
  } else {
    fileInfo.innerHTML = `
      <p style="color: #ff6b6b;"><strong>加载失败</strong></p>
      <p>${file.name}</p>
      <p>错误: ${error.message || '未知错误'}</p>
    `;
  }
}

async function initMPRRendering() {
  if (!window.vtk) {
    throw new Error('vtk.js not loaded');
  }

  const { vtkGenericRenderWindow, vtkImageMapper, vtkImageSlice, vtkImageProperty } = window.vtk;

  const viewConfigs = [
    { id: 'axialView', orientation: 'axial', plane: 'Z' },
    { id: 'coronalView', orientation: 'coronal', plane: 'Y' },
    { id: 'sagittalView', orientation: 'sagittal', plane: 'X' }
  ];

  mprState.renderingViews = [];

  for (const config of viewConfigs) {
    const container = document.getElementById(config.id);
    if (!container) continue;

    container.innerHTML = '';

    const renderWindow = vtkGenericRenderWindow.newInstance({
      background: [0.04, 0.04, 0.06]
    });
    renderWindow.setContainer(container);
    renderWindow.resize();

    const renderer = renderWindow.getRenderer();
    const glRenderWindow = renderWindow.getOpenGLRenderWindow();

    const imageMapper = vtkImageMapper.newInstance();
    const imageProperty = vtkImageProperty.newInstance();
    const imageSlice = vtkImageSlice.newInstance();

    imageSlice.setMapper(imageMapper);
    imageSlice.setProperty(imageProperty);

    imageProperty.setColorWindow(mprState.windowWidth);
    imageProperty.setColorLevel(mprState.windowLevel);

    renderer.addActor(imageSlice);

    mprState.renderingViews.push({
      orientation: config.orientation,
      plane: config.plane,
      container,
      renderWindow,
      renderer,
      openglRenderWindow: glRenderWindow,
      imageMapper,
      imageProperty,
      imageSlice
    });
  }

  updateAllMPRWindows();
  renderAllMPR();
}

function getSliceData(orientation, sliceIdx) {
  const [cols, rows, numSlices] = mprState.dimensions;
  const scalarData = mprState.scalarData;

  if (orientation === 'axial') {
    const z = Math.max(0, Math.min(numSlices - 1, sliceIdx));
    const sliceData = new Int16Array(cols * rows);
    const offset = z * rows * cols;
    for (let i = 0; i < rows * cols; i++) {
      sliceData[i] = scalarData[offset + i];
    }
    return {
      data: sliceData,
      dimensions: [cols, rows],
      spacing: [mprState.spacing[0], mprState.spacing[1]]
    };
  } else if (orientation === 'coronal') {
    const y = Math.max(0, Math.min(rows - 1, sliceIdx));
    const sliceData = new Int16Array(cols * numSlices);
    for (let z = 0; z < numSlices; z++) {
      const zOffset = z * rows * cols;
      const outOffset = z * cols;
      for (let x = 0; x < cols; x++) {
        sliceData[outOffset + x] = scalarData[zOffset + y * cols + x];
      }
    }
    return {
      data: sliceData,
      dimensions: [cols, numSlices],
      spacing: [mprState.spacing[0], mprState.spacing[2]]
    };
  } else {
    const x = Math.max(0, Math.min(cols - 1, sliceIdx));
    const sliceData = new Int16Array(rows * numSlices);
    for (let z = 0; z < numSlices; z++) {
      const zOffset = z * rows * cols;
      const outOffset = z * rows;
      for (let y = 0; y < rows; y++) {
        sliceData[outOffset + y] = scalarData[zOffset + y * cols + x];
      }
    }
    return {
      data: sliceData,
      dimensions: [rows, numSlices],
      spacing: [mprState.spacing[1], mprState.spacing[2]]
    };
  }
}

function createVTKImageData(sliceData) {
  const { vtkImageData } = window.vtk;

  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(sliceData.dimensions[0], sliceData.dimensions[1], 1);
  imageData.setSpacing(sliceData.spacing[0], sliceData.spacing[1], 1);
  imageData.setOrigin(0, 0, 0);

  const scalars = new Int16Array(sliceData.data);
  imageData.getPointData().setScalars(scalars);
  imageData.modified();

  return imageData;
}

function updateMPRSlice(orientation) {
  const view = mprState.renderingViews.find(v => v.orientation === orientation);
  if (!view || !mprState.scalarData) return;

  const sliceIdx = mprState.sliceIndex[orientation];
  const sliceData = getSliceData(orientation, sliceIdx);
  const imageData = createVTKImageData(sliceData);

  view.imageMapper.setInputData(imageData);
  view.imageMapper.setZSlice(0);

  const [width, height] = sliceData.dimensions;
  const aspect = width / height;

  const camera = view.renderer.getActiveCamera();
  if (orientation === 'axial') {
    camera.setPosition(width / 2, height / 2, 1000);
    camera.setFocalPoint(width / 2, height / 2, 0);
    camera.setViewUp(0, -1, 0);
  } else if (orientation === 'coronal') {
    camera.setPosition(width / 2, height / 2, 1000);
    camera.setFocalPoint(width / 2, height / 2, 0);
    camera.setViewUp(0, -1, 0);
  } else {
    camera.setPosition(width / 2, height / 2, 1000);
    camera.setFocalPoint(width / 2, height / 2, 0);
    camera.setViewUp(0, -1, 0);
  }

  camera.setParallelProjection(true);
  camera.setParallelScale(Math.max(width, height) / 2);

  view.renderer.resetCamera();
  view.renderWindow.render();
}

function renderAllMPR() {
  updateMPRSlice('axial');
  updateMPRSlice('coronal');
  updateMPRSlice('sagittal');
}

function updateAllMPRWindows() {
  for (const view of mprState.renderingViews) {
    if (view.imageProperty) {
      view.imageProperty.setColorWindow(mprState.windowWidth);
      view.imageProperty.setColorLevel(mprState.windowLevel);
    }
    if (view.renderWindow) {
      view.renderWindow.render();
    }
  }
}

function updateSliceSliders() {
  const [cols, rows, numSlices] = mprState.dimensions;

  axialSlider.max = numSlices - 1;
  axialSlider.value = mprState.sliceIndex.axial;

  coronalSlider.max = rows - 1;
  coronalSlider.value = mprState.sliceIndex.coronal;

  sagittalSlider.max = cols - 1;
  sagittalSlider.value = mprState.sliceIndex.sagittal;

  updateSliceInfoDisplay();
}

function updateSliceInfoDisplay() {
  const [cols, rows, numSlices] = mprState.dimensions;

  axialSliceInfo.textContent = `${mprState.sliceIndex.axial + 1}/${numSlices}`;
  coronalSliceInfo.textContent = `${mprState.sliceIndex.coronal + 1}/${rows}`;
  sagittalSliceInfo.textContent = `${mprState.sliceIndex.sagittal + 1}/${cols}`;

  axialInfo.textContent = `切片 ${mprState.sliceIndex.axial + 1}/${numSlices}`;
  coronalInfo.textContent = `切片 ${mprState.sliceIndex.coronal + 1}/${rows}`;
  sagittalInfo.textContent = `切片 ${mprState.sliceIndex.sagittal + 1}/${cols}`;
}

function updateSliceDisplay() {
  updateMPRSlice('axial');
  updateMPRSlice('coronal');
  updateMPRSlice('sagittal');
  updateSliceInfoDisplay();
}

function togglePlay(orientation) {
  const btn = document.getElementById(`play${orientation.charAt(0).toUpperCase() + orientation.slice(1)}`);

  if (mprState.isPlaying[orientation]) {
    clearInterval(mprState.playIntervals[orientation]);
    mprState.playIntervals[orientation] = null;
    mprState.isPlaying[orientation] = false;
    btn.textContent = `▶ ${orientation === 'axial' ? '轴状位' : orientation === 'coronal' ? '冠状位' : '矢状位'}`;
  } else {
    const maxIdx = orientation === 'axial' ? mprState.dimensions[2] - 1 :
                  orientation === 'coronal' ? mprState.dimensions[1] - 1 :
                  mprState.dimensions[0] - 1;

    mprState.isPlaying[orientation] = true;
    btn.textContent = `⏸ ${orientation === 'axial' ? '轴状位' : orientation === 'coronal' ? '冠状位' : '矢状位'}`;

    mprState.playIntervals[orientation] = setInterval(() => {
      mprState.sliceIndex[orientation]++;
      if (mprState.sliceIndex[orientation] > maxIdx) {
        mprState.sliceIndex[orientation] = 0;
      }

      if (orientation === 'axial') {
        axialSlider.value = mprState.sliceIndex.axial;
      } else if (orientation === 'coronal') {
        coronalSlider.value = mprState.sliceIndex.coronal;
      } else {
        sagittalSlider.value = mprState.sliceIndex.sagittal;
      }

      updateMPRSlice(orientation);
      updateSliceInfoDisplay();
    }, 100);
  }
}

function updateSliderValues(width, level) {
  windowWidthSlider.value = Math.round(width);
  windowLevelSlider.value = Math.round(level);
  windowWidthValue.textContent = Math.round(width);
  windowLevelValue.textContent = Math.round(level);
}

function updateWindow(width, level) {
  mprState.windowWidth = width;
  mprState.windowLevel = level;

  if (currentMode === '2D' && currentImage && viewerElement.classList.contains('active')) {
    const viewport = cornerstone.getViewport(viewerElement);
    viewport.voi.windowWidth = width;
    viewport.voi.windowCenter = level;
    cornerstone.setViewport(viewerElement, viewport);
    currentViewport = { ...viewport };
  }

  if (currentMode === 'MPR' && mprState.renderingViews.length > 0) {
    updateAllMPRWindows();
  }
}

function resetViewport() {
  if (currentMode === '2D') {
    if (!currentImage || !defaultViewport) return;
    currentViewport = { ...defaultViewport };
    cornerstone.setViewport(viewerElement, currentViewport);
    updateSliderValues(currentViewport.voi.windowWidth, currentViewport.voi.windowCenter);
  } else {
    mprState.sliceIndex = {
      axial: Math.floor(mprState.dimensions[2] / 2),
      coronal: Math.floor(mprState.dimensions[1] / 2),
      sagittal: Math.floor(mprState.dimensions[0] / 2)
    };
    updateSliceSliders();
    renderAllMPR();
  }
}

function applyPreset(preset) {
  if (preset === 'reset') {
    resetViewport();
    return;
  }

  const settings = windowPresets[preset];
  if (settings) {
    updateWindow(settings.width, settings.level);
    updateSliderValues(settings.width, settings.level);
  }
}

function switchToMode(mode) {
  currentMode = mode;

  if (mode === '2D') {
    viewerContainer2D.classList.add('active');
    viewerContainerMPR.classList.remove('active');
    mode2DBtn.classList.add('active');
    modeMPRBtn.classList.remove('active');
    mprControls.style.display = 'none';
  } else {
    if (!mprState.scalarData) {
      alert('请先加载多个 DICOM 文件序列以启用 MPR 功能');
      return;
    }
    viewerContainer2D.classList.remove('active');
    viewerContainerMPR.classList.add('active');
    mode2DBtn.classList.remove('active');
    modeMPRBtn.classList.add('active');
    mprControls.style.display = 'block';

    setTimeout(() => {
      for (const view of mprState.renderingViews) {
        if (view.renderWindow) {
          view.renderWindow.resize();
        }
      }
      renderAllMPR();
    }, 100);
  }
}

fileInput.addEventListener('change', (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  if (files.length === 1) {
    loadSingleDicomFile(files[0]);
  } else {
    const confirmed = confirm(
      `已选择 ${files.length} 个文件。\n\n点击"确定"将构建 3D 体数据并启用 MPR 三视图。\n点击"取消"将仅加载第一个文件。`
    );
    if (confirmed) {
      loadDicomSequence(files);
    } else {
      loadSingleDicomFile(files[0]);
    }
  }
});

mode2DBtn.addEventListener('click', () => switchToMode('2D'));
modeMPRBtn.addEventListener('click', () => switchToMode('MPR'));

axialSlider.addEventListener('input', (e) => {
  mprState.sliceIndex.axial = parseInt(e.target.value);
  updateMPRSlice('axial');
  updateSliceInfoDisplay();
});

coronalSlider.addEventListener('input', (e) => {
  mprState.sliceIndex.coronal = parseInt(e.target.value);
  updateMPRSlice('coronal');
  updateSliceInfoDisplay();
});

sagittalSlider.addEventListener('input', (e) => {
  mprState.sliceIndex.sagittal = parseInt(e.target.value);
  updateMPRSlice('sagittal');
  updateSliceInfoDisplay();
});

document.getElementById('playAxial').addEventListener('click', () => togglePlay('axial'));
document.getElementById('playCoronal').addEventListener('click', () => togglePlay('coronal'));
document.getElementById('playSagittal').addEventListener('click', () => togglePlay('sagittal'));

windowWidthSlider.addEventListener('input', (e) => {
  const width = parseInt(e.target.value);
  windowWidthValue.textContent = width;
  updateWindow(width, parseInt(windowLevelSlider.value));
});

windowLevelSlider.addEventListener('input', (e) => {
  const level = parseInt(e.target.value);
  windowLevelValue.textContent = level;
  updateWindow(parseInt(windowWidthSlider.value), level);
});

document.querySelectorAll('.preset-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.preset;
    applyPreset(preset);
  });
});

viewerElement.addEventListener('mousedown', (e) => {
  if (!currentImage || currentMode !== '2D') return;

  if (e.button === 0) {
    isMouseDown = true;
    lastX = e.clientX;
    lastY = e.clientY;
  } else if (e.button === 2) {
    isDraggingRight = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    e.preventDefault();
  }
});

viewerElement.addEventListener('mousemove', (e) => {
  if (!currentImage || currentMode !== '2D') return;

  if (isMouseDown) {
    const deltaX = e.clientX - lastX;
    const deltaY = e.clientY - lastY;

    const viewport = cornerstone.getViewport(viewerElement);
    const windowWidth = viewport.voi.windowWidth + deltaX * 5;
    const windowLevel = viewport.voi.windowCenter - deltaY * 5;

    viewport.voi.windowWidth = Math.max(1, Math.min(4000, windowWidth));
    viewport.voi.windowCenter = Math.max(-1000, Math.min(3000, windowLevel));

    cornerstone.setViewport(viewerElement, viewport);
    updateSliderValues(viewport.voi.windowWidth, viewport.voi.windowCenter);
    mprState.windowWidth = viewport.voi.windowWidth;
    mprState.windowLevel = viewport.voi.windowCenter;
    currentViewport = { ...viewport };

    lastX = e.clientX;
    lastY = e.clientY;
  }

  if (isDraggingRight) {
    const deltaX = e.clientX - panStartX;
    const deltaY = e.clientY - panStartY;

    const viewport = cornerstone.getViewport(viewerElement);
    viewport.translation.x += deltaX / viewport.scale;
    viewport.translation.y += deltaY / viewport.scale;

    cornerstone.setViewport(viewerElement, viewport);
    currentViewport = { ...viewport };

    panStartX = e.clientX;
    panStartY = e.clientY;
  }
});

viewerElement.addEventListener('mouseup', (e) => {
  isMouseDown = false;
  isDraggingRight = false;
});

viewerElement.addEventListener('mouseleave', () => {
  isMouseDown = false;
  isDraggingRight = false;
});

viewerElement.addEventListener('wheel', (e) => {
  if (currentMode !== '2D') return;
  if (!currentImage) return;
  e.preventDefault();

  if (e.ctrlKey || e.shiftKey) {
    if (mprState.scalarData && mprState.dimensions[2] > 1) {
      const delta = e.deltaY > 0 ? 1 : -1;
      mprState.sliceIndex.axial = Math.max(0, Math.min(mprState.dimensions[2] - 1, mprState.sliceIndex.axial + delta));
      if (axialSlider) {
        axialSlider.value = mprState.sliceIndex.axial;
        updateSliceInfoDisplay();
      }
    }
  } else {
    const viewport = cornerstone.getViewport(viewerElement);
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    viewport.scale *= zoomFactor;
    viewport.scale = Math.max(0.1, Math.min(20, viewport.scale));

    cornerstone.setViewport(viewerElement, viewport);
    currentViewport = { ...viewport };
  }
}, { passive: false });

viewerElement.addEventListener('dblclick', () => {
  resetViewport();
});

viewerElement.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

window.addEventListener('resize', () => {
  if (currentMode === '2D' && currentImage) {
    cornerstone.resize(viewerElement, true);
  } else if (currentMode === 'MPR') {
    for (const view of mprState.renderingViews) {
      if (view.renderWindow) {
        view.renderWindow.resize();
      }
    }
  }
});

setInterval(updateMemoryStatus, 5000);

document.addEventListener('DOMContentLoaded', () => {
  console.log('DICOM Viewer initialized with MPR support');
  updateMemoryStatus();
});
