import SparkMD5 from 'spark-md5';

export const CHUNK_SIZE = 1024 * 256;
export const HASH_CHUNK_SIZE = 1024 * 1024 * 2;
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

export function crc32(data) {
  let crc = 0xFFFFFFFF;
  const bytes = (data instanceof ArrayBuffer) ? new Uint8Array(data) : data;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function readChunkAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

export function readChunkFromFile(file, chunkIndex, chunkSize = CHUNK_SIZE) {
  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, file.size);
  if (start >= file.size) return null;
  const blob = file.slice(start, end);
  return readChunkAsArrayBuffer(blob);
}

export async function calculateFileHash(file, onProgress = null) {
  return new Promise((resolve, reject) => {
    const blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
    const chunks = Math.ceil(file.size / HASH_CHUNK_SIZE);
    let currentChunk = 0;
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      spark.append(e.target.result);
      currentChunk++;

      if (onProgress) {
        onProgress(Math.round((currentChunk / chunks) * 100));
      }

      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onerror = () => {
      reject(new Error('File reading error'));
    };

    function loadNext() {
      const start = currentChunk * HASH_CHUNK_SIZE;
      const end = Math.min(start + HASH_CHUNK_SIZE, file.size);
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
    }

    loadNext();
  });
}

export function computeTotalChunks(fileSize, chunkSize = CHUNK_SIZE) {
  return Math.ceil(fileSize / chunkSize);
}

export async function processFile(file, onProgress = null) {
  const hash = await calculateFileHash(file, (hashProgress) => {
    if (onProgress) {
      onProgress({ type: 'hash', progress: hashProgress });
    }
  });

  const totalChunks = computeTotalChunks(file.size);

  const chunkHashes = [];
  for (let i = 0; i < totalChunks; i++) {
    const data = await readChunkFromFile(file, i);
    chunkHashes.push(crc32(data));
    if (onProgress) {
      onProgress({ type: 'chunkHash', progress: Math.round(((i + 1) / totalChunks) * 100) });
    }
  }

  return {
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    hash,
    totalChunks,
    chunkHashes
  };
}

export function chunksToBlob(chunks, type = '') {
  const sortedChunks = [...chunks].sort((a, b) => a.index - b.index);
  const buffers = sortedChunks.map(c => c.data);
  return new Blob(buffers, { type });
}

export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
