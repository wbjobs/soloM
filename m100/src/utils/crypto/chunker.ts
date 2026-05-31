export const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

export interface FileChunk {
  index: number;
  data: ArrayBuffer;
  size: number;
}

export async function* createChunkIterator(
  file: File,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): AsyncGenerator<FileChunk> {
  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);

    const data = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });

    yield {
      index: i,
      data,
      size: end - start,
    };
  }
}

export async function getFileChunk(
  file: File,
  index: number,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<FileChunk> {
  const start = index * chunkSize;
  const end = Math.min(start + chunkSize, file.size);
  const blob = file.slice(start, end);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        index,
        data: reader.result as ArrayBuffer,
        size: end - start,
      });
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

export function calculateTotalChunks(fileSize: number, chunkSize: number = DEFAULT_CHUNK_SIZE): number {
  return Math.ceil(fileSize / chunkSize);
}
