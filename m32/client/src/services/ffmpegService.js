import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
const LARGE_FILE_THRESHOLD = 200 * 1024 * 1024;
const CHUNK_DURATION = 60;
const MAX_FRAMES_PER_BATCH = 50;
const MEMORY_WARNING_THRESHOLD = 1024 * 1024 * 1024;

let ffmpeg = null;
let ffmpegLoaded = false;
let isCancelled = false;

export function cancelExtraction() {
  isCancelled = true;
}

export function resetCancellation() {
  isCancelled = false;
}

export async function loadFFmpeg(onProgress) {
  if (ffmpegLoaded && ffmpeg) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) {
      onProgress(progress * 100);
    }
  });

  const coreURL = await toBlobURL(
    `${BASE_URL}/ffmpeg-core.js`,
    'text/javascript'
  );
  const wasmURL = await toBlobURL(
    `${BASE_URL}/ffmpeg-core.wasm`,
    'application/wasm'
  );

  await ffmpeg.load({
    coreURL,
    wasmURL,
  });

  ffmpegLoaded = true;
  return ffmpeg;
}

export function isFFmpegLoaded() {
  return ffmpegLoaded;
}

export function getMemoryInfo() {
  if (performance && performance.memory) {
    return {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      isNearLimit: performance.memory.usedJSHeapSize > MEMORY_WARNING_THRESHOLD
    };
  }
  return null;
}

export async function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.src = URL.createObjectURL(file);
  });
}

export async function extractKeyframes(file, options = {}) {
  if (!ffmpegLoaded || !ffmpeg) {
    throw new Error('FFmpeg not loaded');
  }

  resetCancellation();

  const { 
    thumbnailWidth = 320, 
    onProgress, 
    onFrameExtracted,
    onMemoryWarning 
  } = options;

  const duration = await getVideoDuration(file);
  const isLargeFile = file.size > LARGE_FILE_THRESHOLD;

  if (isLargeFile || duration > 300) {
    console.log('[Extractor] Large file detected, using chunked processing');
    return extractKeyframesChunked(file, {
      thumbnailWidth,
      duration,
      onProgress,
      onFrameExtracted,
      onMemoryWarning
    });
  }

  return extractKeyframesSinglePass(file, {
    thumbnailWidth,
    onProgress,
    onFrameExtracted,
    onMemoryWarning
  });
}

async function extractKeyframesSinglePass(file, options) {
  const { thumbnailWidth, onProgress, onFrameExtracted, onMemoryWarning } = options;
  const inputFileName = 'input.mp4';
  const outputPattern = 'frame_%06d.jpg';

  try {
    console.log('[Extractor] Writing input file to FFmpeg memory...');
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));

    console.log('[Extractor] Extracting keyframes...');
    await ffmpeg.exec([
      '-i', inputFileName,
      '-vf', `select='eq(pict_type,PICT_TYPE_I)',scale=${thumbnailWidth}:-1`,
      '-vsync', 'vfr',
      '-frame_pts', '1',
      '-q:v', '5',
      '-f', 'image2',
      outputPattern
    ]);

    const fileList = await ffmpeg.listDir('/');
    const frameFiles = fileList
      .filter(f => f.name.startsWith('frame_') && f.name.endsWith('.jpg'))
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`[Extractor] Found ${frameFiles.length} keyframes`);
    return processFramesInBatches(frameFiles, {
      onProgress,
      onFrameExtracted,
      onMemoryWarning,
      totalFrames: frameFiles.length
    });
  } finally {
    await cleanupFFmpegFiles([inputFileName]);
  }
}

async function extractKeyframesChunked(file, options) {
  const { 
    thumbnailWidth, 
    duration, 
    onProgress, 
    onFrameExtracted,
    onMemoryWarning 
  } = options;

  const allKeyframes = [];
  const chunks = calculateChunks(duration, CHUNK_DURATION);
  const fileData = await fetchFile(file);

  console.log(`[Extractor] Processing ${chunks.length} chunks, total duration: ${duration}s`);

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    if (isCancelled) {
      throw new Error('Extraction cancelled by user');
    }

    const chunk = chunks[chunkIndex];
    const chunkStartTime = chunk.start;
    const chunkDuration = chunk.end - chunk.start;

    console.log(`[Extractor] Processing chunk ${chunkIndex + 1}/${chunks.length}: ${formatTime(chunkStartTime)} - ${formatTime(chunk.end)}`);

    const inputFileName = `chunk_${chunkIndex}.mp4`;
    const outputPattern = `chunk_${chunkIndex}_frame_%06d.jpg`;

    try {
      await ffmpeg.writeFile(inputFileName, fileData);

      await ffmpeg.exec([
        '-ss', String(chunkStartTime),
        '-t', String(chunkDuration),
        '-i', inputFileName,
        '-vf', `select='eq(pict_type,PICT_TYPE_I)',scale=${thumbnailWidth}:-1`,
        '-vsync', 'vfr',
        '-frame_pts', '1',
        '-q:v', '5',
        '-f', 'image2',
        outputPattern
      ]);

      const fileList = await ffmpeg.listDir('/');
      const frameFiles = fileList
        .filter(f => f.name.startsWith(`chunk_${chunkIndex}_frame_`) && f.name.endsWith('.jpg'))
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log(`[Extractor] Chunk ${chunkIndex + 1}: extracted ${frameFiles.length} frames`);

      const chunkKeyframes = await processFramesInBatches(frameFiles, {
        onProgress: (p) => {
          if (onProgress) {
            const overallProgress = ((chunkIndex + p / 100) / chunks.length) * 100;
            onProgress(overallProgress);
          }
        },
        onFrameExtracted: (frame, idx, total) => {
          if (onFrameExtracted) {
            const globalIndex = allKeyframes.length + idx;
            onFrameExtracted(frame, globalIndex, -1);
          }
        },
        onMemoryWarning,
        totalFrames: frameFiles.length,
        timeOffset: chunkStartTime
      });

      allKeyframes.push(...chunkKeyframes);

      if (onProgress) {
        const overallProgress = ((chunkIndex + 1) / chunks.length) * 100;
        onProgress(overallProgress);
      }

      checkMemoryAndGC(onMemoryWarning);

    } finally {
      await cleanupFFmpegFiles([inputFileName]);
      const fileList = await ffmpeg.listDir('/');
      const chunkFrames = fileList.filter(f => f.name.startsWith(`chunk_${chunkIndex}_frame_`));
      for (const f of chunkFrames) {
        try { await ffmpeg.deleteFile(f.name); } catch (e) {}
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  allKeyframes.sort((a, b) => a.timestamp - b.timestamp);
  allKeyframes.forEach((kf, idx) => {
    kf.index = idx;
  });

  return allKeyframes;
}

async function processFramesInBatches(frameFiles, options) {
  const { onProgress, onFrameExtracted, onMemoryWarning, totalFrames, timeOffset = 0 } = options;
  const keyframes = [];

  for (let batchStart = 0; batchStart < frameFiles.length; batchStart += MAX_FRAMES_PER_BATCH) {
    if (isCancelled) {
      throw new Error('Extraction cancelled by user');
    }

    const batchEnd = Math.min(batchStart + MAX_FRAMES_PER_BATCH, frameFiles.length);
    const batch = frameFiles.slice(batchStart, batchEnd);

    console.log(`[Extractor] Processing batch ${Math.floor(batchStart / MAX_FRAMES_PER_BATCH) + 1}: frames ${batchStart + 1}-${batchEnd}`);

    for (let i = 0; i < batch.length; i++) {
      if (isCancelled) {
        throw new Error('Extraction cancelled by user');
      }

      const frameFile = batch[i];
      const globalIndex = batchStart + i;

      try {
        const data = await ffmpeg.readFile(frameFile.name);
        
        const blob = new Blob([data], { type: 'image/jpeg' });
        const dataUrl = await blobToDataURL(blob);
        
        let timestamp = parseTimestampFromFilename(frameFile.name);
        timestamp += timeOffset;
        
        const img = await loadImage(dataUrl);
        
        const keyframe = {
          index: keyframes.length,
          timestamp: timestamp,
          timestampFormatted: formatTime(timestamp),
          dataUrl: dataUrl,
          width: img.width,
          height: img.height,
          size: data.length,
          fileName: frameFile.name
        };

        keyframes.push(keyframe);

        if (onFrameExtracted) {
          onFrameExtracted(keyframe, globalIndex, totalFrames);
        }

        if (onProgress && totalFrames > 0) {
          onProgress(((globalIndex + 1) / totalFrames) * 100);
        }
      } catch (e) {
        console.error(`Error processing frame ${frameFile.name}:`, e);
      } finally {
        try {
          await ffmpeg.deleteFile(frameFile.name);
        } catch (e) {
          console.log(`Failed to delete ${frameFile.name}:`, e);
        }
      }
    }

    checkMemoryAndGC(onMemoryWarning);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return keyframes;
}

function calculateChunks(duration, chunkDuration) {
  const chunks = [];
  let start = 0;

  while (start < duration) {
    const end = Math.min(start + chunkDuration, duration);
    chunks.push({ start, end });
    start = end;
  }

  if (chunks.length > 1 && chunks[chunks.length - 1].end - chunks[chunks.length - 1].start < 10) {
    chunks[chunks.length - 2].end = chunks[chunks.length - 1].end;
    chunks.pop();
  }

  return chunks;
}

async function cleanupFFmpegFiles(fileNames) {
  for (const fileName of fileNames) {
    try {
      await ffmpeg.deleteFile(fileName);
    } catch (e) {
      console.log(`Cleanup failed for ${fileName}:`, e);
    }
  }
}

function checkMemoryAndGC(onMemoryWarning) {
  const memInfo = getMemoryInfo();
  if (memInfo && memInfo.isNearLimit) {
    console.warn('[Memory] High memory usage detected:', formatBytes(memInfo.usedJSHeapSize));
    if (onMemoryWarning) {
      onMemoryWarning(memInfo);
    }
    if (window.gc) {
      window.gc();
    }
  }
}

function parseTimestampFromFilename(filename) {
  const match = filename.match(/frame_(\d+)\.jpg/);
  if (match) {
    const pts = parseInt(match[1], 10);
    return pts / 1000;
  }
  return 0;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export async function compressKeyframes(keyframes) {
  const jsonStr = JSON.stringify(keyframes);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonStr);
  
  const compressed = await new Promise((resolve, reject) => {
    const reader = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip')).getReader();
    const chunks = [];
    
    reader.read().then(function processChunk({ done, value }) {
      if (done) {
        resolve(new Blob(chunks));
        return;
      }
      chunks.push(value);
      return reader.read().then(processChunk);
    }).catch(reject);
  });

  const buffer = await compressed.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return btoa(binary);
}

export async function decompressKeyframes(compressedData) {
  const binary = atob(compressedData);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const decompressed = await new Promise((resolve, reject) => {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks = [];
    
    reader.read().then(function processChunk({ done, value }) {
      if (done) {
        resolve(new Blob(chunks));
        return;
      }
      chunks.push(value);
      return reader.read().then(processChunk);
    }).catch(reject);
  });

  const text = await decompressed.text();
  return JSON.parse(text);
}

export function estimatePayloadSize(keyframes) {
  let totalSize = 0;
  for (const kf of keyframes) {
    totalSize += kf.dataUrl ? kf.dataUrl.length * 0.75 : kf.size;
    totalSize += 100;
  }
  return totalSize;
}
