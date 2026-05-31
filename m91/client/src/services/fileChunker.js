const CHUNK_SIZE = 1024 * 1024;

export async function chunkFile(file, onProgress) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const chunkHashes = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    chunkHashes.push(hashHex);

    if (onProgress) {
      onProgress(i + 1, totalChunks);
    }
  }

  const fileHashInput = chunkHashes.join('');
  const fileHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fileHashInput));
  const fileHashArray = Array.from(new Uint8Array(fileHashBuffer));
  const fileHash = fileHashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const metadata = {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    totalChunks,
    chunkSize: CHUNK_SIZE,
    fileHash,
    chunkHashes,
  };

  const chunkReader = createChunkReader(file, totalChunks);

  return { metadata, chunkReader };
}

export function createChunkReader(file, totalChunks) {
  const cache = new Map();
  const MAX_CACHE_SIZE = 8;

  async function readChunk(index) {
    if (index < 0 || index >= totalChunks) {
      throw new Error(`Chunk index ${index} out of range [0, ${totalChunks})`);
    }

    if (cache.has(index)) {
      return cache.get(index);
    }

    const start = index * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);
    const buffer = await blob.arrayBuffer();

    if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    cache.set(index, buffer);

    return buffer;
  }

  return { readChunk, totalChunks };
}

export function reassembleFile(chunks, metadata) {
  const sortedChunks = [...chunks]
    .filter((c) => c !== null && c.data !== null)
    .sort((a, b) => a.index - b.index);
  const blob = new Blob(sortedChunks.map((c) => c.data), {
    type: metadata.fileType || 'application/octet-stream',
  });
  return blob;
}

export async function verifyChunk(buffer, expectedHash) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex === expectedHash;
}

export async function verifyFileHash(receivedChunks, metadata) {
  const sortedChunks = [...receivedChunks]
    .filter((c) => c !== null && c.data !== null)
    .sort((a, b) => a.index - b.index);

  for (let i = 0; i < metadata.totalChunks; i++) {
    if (!sortedChunks[i] || sortedChunks[i].index !== i) {
      return { valid: false, missingChunk: i };
    }
    const isValid = await verifyChunk(sortedChunks[i].data, metadata.chunkHashes[i]);
    if (!isValid) {
      return { valid: false, corruptChunk: i };
    }
  }

  const fileHashInput = metadata.chunkHashes.join('');
  const fileHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fileHashInput));
  const fileHashArray = Array.from(new Uint8Array(fileHashBuffer));
  const fileHash = fileHashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return { valid: fileHash === metadata.fileHash, fileHash };
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}
