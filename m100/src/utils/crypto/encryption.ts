export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

export async function encryptChunk(
  key: CryptoKey,
  chunkData: ArrayBuffer,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    chunkData
  );

  return encryptedBuffer;
}

export async function decryptChunk(
  key: CryptoKey,
  encryptedData: ArrayBuffer,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encryptedData
  );

  return decryptedBuffer;
}
