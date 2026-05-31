const CRYPTO_WORKER_CODE = `
let derivedKey = null;

self.onmessage = async function(e) {
  const { type, id, payload } = e.data;

  try {
    switch (type) {
      case 'deriveKey': {
        const { password, saltBase64 } = payload;
        const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
        );
        derivedKey = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        self.postMessage({ type: 'deriveKeyResult', id, payload: { success: true } });
        break;
      }

      case 'encryptChunk': {
        if (!derivedKey) throw new Error('Key not derived');
        const { chunkData, ivBase64 } = payload;
        const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
        const encryptedData = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv }, derivedKey, chunkData
        );
        self.postMessage(
          { type: 'encryptChunkResult', id, payload: { encryptedData } },
          [encryptedData]
        );
        break;
      }

      case 'decryptChunk': {
        if (!derivedKey) throw new Error('Key not derived');
        const { encryptedData, ivBase64 } = payload;
        const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
        const decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv }, derivedKey, encryptedData
        );
        self.postMessage(
          { type: 'decryptChunkResult', id, payload: { decryptedData } },
          [decryptedData]
        );
        break;
      }

      case 'clearKey': {
        derivedKey = null;
        self.postMessage({ type: 'clearKeyResult', id, payload: { success: true } });
        break;
      }
    }
  } catch (error) {
    self.postMessage({ type: 'error', id, payload: { message: error.message || 'Unknown error' } });
  }
};
`;

let workerInstance: Worker | null = null;
let messageId = 0;
const pendingMessages = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();

function getWorker(): Worker {
  if (!workerInstance) {
    const blob = new Blob([CRYPTO_WORKER_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    workerInstance = new Worker(url);
    URL.revokeObjectURL(url);
    workerInstance.onmessage = (e: MessageEvent) => {
      const { id, type, payload } = e.data;
      const pending = pendingMessages.get(id);
      if (!pending) return;
      pendingMessages.delete(id);
      if (type === 'error') {
        pending.reject(new Error(payload.message || 'Worker error'));
      } else {
        pending.resolve(payload);
      }
    };
    workerInstance.onerror = (e: ErrorEvent) => {
      console.error('Crypto worker error:', e.message);
    };
  }
  return workerInstance;
}

function sendWorkerMessage<T>(
  type: string,
  payload: Record<string, unknown>,
  transfer?: Transferable[]
): Promise<T> {
  const id = ++messageId;
  return new Promise((resolve, reject) => {
    pendingMessages.set(id, { resolve, reject });
    const worker = getWorker();
    const message = { type, id, payload };
    if (transfer && transfer.length > 0) {
      worker.postMessage(message, transfer);
    } else {
      worker.postMessage(message);
    }
  });
}

export const cryptoWorker = {
  async deriveKey(password: string, saltBase64: string): Promise<void> {
    await sendWorkerMessage<void>('deriveKey', { password, saltBase64 });
  },

  async encryptChunk(chunkData: ArrayBuffer, ivBase64: string): Promise<ArrayBuffer> {
    const result = await sendWorkerMessage<{ encryptedData: ArrayBuffer }>(
      'encryptChunk',
      { chunkData, ivBase64 },
      [chunkData]
    );
    return result.encryptedData;
  },

  async decryptChunk(encryptedData: ArrayBuffer, ivBase64: string): Promise<ArrayBuffer> {
    const result = await sendWorkerMessage<{ decryptedData: ArrayBuffer }>(
      'decryptChunk',
      { encryptedData, ivBase64 },
      [encryptedData]
    );
    return result.decryptedData;
  },

  async clearKey(): Promise<void> {
    await sendWorkerMessage<void>('clearKey', {});
  },

  terminate(): void {
    if (workerInstance) {
      workerInstance.terminate();
      workerInstance = null;
      pendingMessages.clear();
    }
  },
};
