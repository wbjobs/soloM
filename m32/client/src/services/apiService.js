import { compressKeyframes, estimatePayloadSize } from './ffmpegService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const CHUNK_SIZE = 50;
const COMPRESSION_THRESHOLD = 10 * 1024 * 1024;
const CHUNK_UPLOAD_THRESHOLD = 20 * 1024 * 1024;

export async function saveKeyframes(payload, options = {}) {
  const { onProgress, onStatus } = options;
  const { keyframes } = payload;

  const estimatedSize = estimatePayloadSize(keyframes);
  console.log(`[API] Estimated payload size: ${formatBytes(estimatedSize)}`);

  const shouldCompress = estimatedSize > COMPRESSION_THRESHOLD;
  const shouldChunk = estimatedSize > CHUNK_UPLOAD_THRESHOLD || keyframes.length > 200;

  if (shouldChunk) {
    console.log('[API] Using chunked upload');
    return saveKeyframesChunked(payload, { shouldCompress, onProgress, onStatus });
  }

  return saveKeyframesSingle(payload, { shouldCompress, onProgress, onStatus });
}

async function saveKeyframesSingle(payload, options) {
  const { shouldCompress, onProgress, onStatus } = options;
  let finalPayload = { ...payload };

  if (shouldCompress) {
    if (onStatus) onStatus('正在压缩数据...');
    const compressed = await compressKeyframes(payload.keyframes);
    finalPayload = {
      videoName: payload.videoName,
      videoSize: payload.videoSize,
      duration: payload.duration,
      keyframes: compressed,
      compressed: true
    };
    console.log('[API] Data compressed');
  }

  if (onStatus) onStatus('正在上传到服务器...');
  if (onProgress) onProgress(10);

  const response = await fetch(`${API_BASE_URL}/keyframes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(finalPayload),
  });

  if (onProgress) onProgress(100);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

async function saveKeyframesChunked(payload, options) {
  const { shouldCompress, onProgress, onStatus } = options;
  const { videoName, videoSize, duration, keyframes } = payload;
  const totalKeyframes = keyframes.length;

  const chunks = [];
  for (let i = 0; i < keyframes.length; i += CHUNK_SIZE) {
    chunks.push(keyframes.slice(i, i + CHUNK_SIZE));
  }

  console.log(`[API] Splitting into ${chunks.length} chunks`);

  if (onStatus) onStatus('正在初始化上传会话...');
  const startResponse = await fetch(`${API_BASE_URL}/keyframes/chunk/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoName,
      videoSize,
      duration,
      totalChunks: chunks.length,
      totalKeyframes
    })
  });

  if (!startResponse.ok) {
    const error = await startResponse.json().catch(() => ({ error: 'Failed to start upload' }));
    throw new Error(error.error || `HTTP ${startResponse.status}`);
  }

  const { uploadId } = await startResponse.json();
  console.log(`[API] Upload session started: ${uploadId}`);

  for (let i = 0; i < chunks.length; i++) {
    if (onStatus) onStatus(`正在上传分片 ${i + 1}/${chunks.length}...`);

    let chunkPayload = {
      chunkIndex: i,
      keyframes: chunks[i]
    };

    if (shouldCompress) {
      const compressed = await compressKeyframes(chunks[i]);
      chunkPayload = {
        chunkIndex: i,
        keyframes: compressed,
        compressed: true
      };
    }

    const response = await fetch(`${API_BASE_URL}/keyframes/chunk/${uploadId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunkPayload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(`Chunk ${i + 1} failed: ${error.error || `HTTP ${response.status}`}`);
    }

    if (onProgress) {
      onProgress(((i + 1) / chunks.length) * 90);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  if (onStatus) onStatus('正在完成上传...');
  const completeResponse = await fetch(`${API_BASE_URL}/keyframes/chunk/${uploadId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (onProgress) onProgress(100);

  if (!completeResponse.ok) {
    const error = await completeResponse.json().catch(() => ({ error: 'Complete failed' }));
    throw new Error(error.error || `HTTP ${completeResponse.status}`);
  }

  return completeResponse.json();
}

export async function getKeyframes(id) {
  const response = await fetch(`${API_BASE_URL}/keyframes/${id}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function listKeyframes() {
  const response = await fetch(`${API_BASE_URL}/keyframes`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function checkFFmpegStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/server/ffmpeg-status`);
    return response.json();
  } catch (error) {
    return { available: false, message: 'Cannot connect to server' };
  }
}

export async function uploadVideoToServer(file, onProgress) {
  const formData = new FormData();
  formData.append('video', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 100);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.message || error.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.open('POST', `${API_BASE_URL}/server/upload`);
    xhr.send(formData);
  });
}

export function processVideoOnServer(uploadId, options, clientKeyframes, callbacks) {
  const { onProgress, onTranscode, onValidation, onComplete, onError } = callbacks;

  const payload = {
    uploadId,
    options,
    clientKeyframes: clientKeyframes?.map(kf => ({
      timestamp: kf.timestamp,
      index: kf.index
    }))
  };

  const source = new EventSource(`${API_BASE_URL}/server/process`);
  
  source.onopen = () => {
    fetch(`${API_BASE_URL}/server/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => {
      console.error('Process request failed:', err);
      source.close();
      if (onError) onError(err);
    });
  };

  source.addEventListener('start', (event) => {
    const data = JSON.parse(event.data);
    console.log('[Server] Processing started:', data);
  });

  source.addEventListener('progress', (event) => {
    const data = JSON.parse(event.data);
    if (onProgress) onProgress(data);
  });

  source.addEventListener('transcode', (event) => {
    const data = JSON.parse(event.data);
    if (onTranscode) onTranscode(data);
  });

  source.addEventListener('validation', (event) => {
    const data = JSON.parse(event.data);
    if (onValidation) onValidation(data);
  });

  source.addEventListener('complete', (event) => {
    const data = JSON.parse(event.data);
    source.close();
    if (onComplete) onComplete(data);
  });

  source.addEventListener('error', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error) {
        source.close();
        if (onError) onError(new Error(data.error));
      }
    } catch (e) {
      console.error('SSE error:', e);
    }
  });

  source.onerror = () => {
    console.log('SSE connection closed');
    source.close();
  };

  return source;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
