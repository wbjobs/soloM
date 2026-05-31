let wasmInstance = null;
let wasmMemory = null;

const CHUNK_SIZE = 256 * 1024;
const SALT_LEN = 32;
const NONCE_LEN = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let chunkBufPtr = 0;
let chunkBufSize = 0;

function getChunkBuf(size) {
  if (chunkBufSize < size) {
    if (chunkBufPtr !== 0) {
      wasmInstance.exports.dealloc(chunkBufPtr, chunkBufSize);
    }
    chunkBufPtr = wasmInstance.exports.alloc(size);
    chunkBufSize = size;
  }
  return chunkBufPtr;
}

function wasmView(ptr, len) {
  return new Uint8Array(wasmMemory.buffer, ptr, len);
}

export async function initWasm() {
  if (wasmInstance) return wasmInstance;

  const response = await fetch(new URL('./steganography_wasm.wasm', import.meta.url));
  const bytes = await response.arrayBuffer();
  const wasm = await WebAssembly.instantiate(bytes, { env: {} });

  wasmInstance = wasm.instance;
  wasmMemory = wasmInstance.exports.memory;

  getChunkBuf(CHUNK_SIZE);

  return wasmInstance;
}

export function getMaxCapacity(pixelsLen) {
  if (!wasmInstance) throw new Error('WASM not initialized');
  const rawCapacity = wasmInstance.exports.get_max_capacity(pixelsLen);
  const overhead = wasmInstance.exports.get_encryption_overhead();
  return rawCapacity > overhead ? rawCapacity - overhead : 0;
}

export function encodeMessage(pixels, message, password) {
  if (!wasmInstance) throw new Error('WASM not initialized');

  const messageBytes = encoder.encode(message);
  const passwordBytes = encoder.encode(password);
  const messageLen = messageBytes.length;
  const passwordLen = passwordBytes.length;
  const pixelsLen = pixels.length;

  const overhead = wasmInstance.exports.get_encryption_overhead();
  const encryptedLen = wasmInstance.exports.get_encrypted_len(messageLen);
  const maxCap = wasmInstance.exports.get_max_capacity(pixelsLen);

  if (encryptedLen > maxCap) {
    const effectiveCap = maxCap > overhead ? maxCap - overhead : 0;
    return { success: false, error: `Message too long after encryption! Max capacity: ${effectiveCap} bytes (raw ${messageLen} + encryption overhead ${overhead})` };
  }

  const salt = new Uint8Array(SALT_LEN);
  const nonce = new Uint8Array(NONCE_LEN);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(nonce);

  const msgBufPtr = wasmInstance.exports.alloc(messageLen);
  const pwdBufPtr = wasmInstance.exports.alloc(passwordLen);
  const saltBufPtr = wasmInstance.exports.alloc(SALT_LEN);
  const nonceBufPtr = wasmInstance.exports.alloc(NONCE_LEN);
  const encBufPtr = wasmInstance.exports.alloc(encryptedLen);

  try {
    wasmView(msgBufPtr, messageLen).set(messageBytes);
    wasmView(pwdBufPtr, passwordLen).set(passwordBytes);
    wasmView(saltBufPtr, SALT_LEN).set(salt);
    wasmView(nonceBufPtr, NONCE_LEN).set(nonce);

    const actualEncLen = wasmInstance.exports.aes_encrypt(
      msgBufPtr, messageLen,
      pwdBufPtr, passwordLen,
      saltBufPtr,
      nonceBufPtr,
      encBufPtr
    );

    let bitOffset = 0;
    let pixelOffset = 0;

    while (bitOffset < 32 + actualEncLen * 8 && pixelOffset < pixelsLen) {
      const remaining = pixelsLen - pixelOffset;
      const chunkLen = Math.min(remaining, CHUNK_SIZE);
      const bufPtr = getChunkBuf(chunkLen);

      wasmView(bufPtr, chunkLen).set(pixels.subarray(pixelOffset, pixelOffset + chunkLen));

      bitOffset = wasmInstance.exports.encode_lsb_chunk(
        bufPtr, chunkLen, encBufPtr, actualEncLen, bitOffset
      );

      pixels.set(wasmView(bufPtr, chunkLen), pixelOffset);
      pixelOffset += chunkLen;
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  } finally {
    wasmInstance.exports.dealloc(msgBufPtr, messageLen);
    wasmInstance.exports.dealloc(pwdBufPtr, passwordLen);
    wasmInstance.exports.dealloc(saltBufPtr, SALT_LEN);
    wasmInstance.exports.dealloc(nonceBufPtr, NONCE_LEN);
    wasmInstance.exports.dealloc(encBufPtr, encryptedLen);
  }
}

export function decodeMessage(pixels, password) {
  if (!wasmInstance) throw new Error('WASM not initialized');

  const pixelsLen = pixels.length;
  if (pixelsLen < 32) {
    return { success: false, error: 'Image too small to contain a message' };
  }

  const headerBufPtr = getChunkBuf(Math.min(32, CHUNK_SIZE));
  wasmView(headerBufPtr, 32).set(pixels.subarray(0, 32));

  const msgLenResult = wasmInstance.exports.decode_lsb_header(headerBufPtr, 32);
  if (msgLenResult <= 0) {
    return { success: false, error: 'No hidden message found or message corrupted' };
  }

  const messageLen = msgLenResult;
  const maxPossible = (pixelsLen - 32) / 8;
  if (messageLen > maxPossible) {
    return { success: false, error: 'No hidden message found or message corrupted' };
  }

  const encBufPtr = wasmInstance.exports.alloc(messageLen);
  try {
    wasmView(encBufPtr, messageLen).fill(0);

    let pixelOffset = 0;
    while (pixelOffset < pixelsLen) {
      const remaining = pixelsLen - pixelOffset;
      const chunkLen = Math.min(remaining, CHUNK_SIZE);
      const bufPtr = getChunkBuf(chunkLen);

      wasmView(bufPtr, chunkLen).set(pixels.subarray(pixelOffset, pixelOffset + chunkLen));

      wasmInstance.exports.decode_lsb_chunk(
        bufPtr, chunkLen, encBufPtr, messageLen, pixelOffset
      );

      pixelOffset += chunkLen;
    }

    const passwordBytes = encoder.encode(password);
    const pwdBufPtr = wasmInstance.exports.alloc(passwordBytes.length);
    const overhead = wasmInstance.exports.get_encryption_overhead();
    const maxDecLen = messageLen > overhead ? messageLen - overhead : 0;
    const decBufPtr = wasmInstance.exports.alloc(maxDecLen > 0 ? maxDecLen : 1);

    try {
      wasmView(pwdBufPtr, passwordBytes.length).set(passwordBytes);

      const decResult = wasmInstance.exports.aes_decrypt(
        encBufPtr, messageLen,
        pwdBufPtr, passwordBytes.length,
        decBufPtr
      );

      if (decResult > 0) {
        const outputView = wasmView(decBufPtr, decResult);
        const message = decoder.decode(outputView);
        return { success: true, message };
      } else if (decResult === -2) {
        return { success: false, error: 'Decryption failed — wrong password or corrupted data' };
      } else {
        return { success: false, error: 'Decryption failed — data format error' };
      }
    } finally {
      wasmInstance.exports.dealloc(pwdBufPtr, passwordBytes.length);
      wasmInstance.exports.dealloc(decBufPtr, maxDecLen > 0 ? maxDecLen : 1);
    }
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  } finally {
    wasmInstance.exports.dealloc(encBufPtr, messageLen);
  }
}

export function destroy() {
  if (chunkBufPtr !== 0 && wasmInstance) {
    wasmInstance.exports.dealloc(chunkBufPtr, chunkBufSize);
    chunkBufPtr = 0;
    chunkBufSize = 0;
  }
  wasmInstance = null;
  wasmMemory = null;
}
