export interface EncryptedPayload {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
}

export async function generateSalt(): Promise<Uint8Array> {
  return window.crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 600000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(data: Uint8Array, key: CryptoKey): Promise<EncryptedPayload> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const salt = await generateSalt();
  const ciphertext = new Uint8Array(
    await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data)
  );
  return { ciphertext, iv, salt };
}

export async function decrypt(payload: EncryptedPayload, key: CryptoKey): Promise<Uint8Array> {
  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: payload.iv },
    key,
    payload.ciphertext
  );
  return new Uint8Array(plaintext);
}

export async function exportKey(key: CryptoKey): Promise<JsonWebKey> {
  return window.crypto.subtle.exportKey("jwk", key);
}

export async function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function getKeyFingerprint(key: CryptoKey): Promise<string> {
  const jwk = await exportKey(key);
  const data = new TextEncoder().encode(JSON.stringify(jwk));
  const hash = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hash);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
