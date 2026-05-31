use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngCore;
use rsa::pkcs8::{DecodePublicKey, EncodePublicKey, LineEnding};
use rsa::{Oaep, RsaPrivateKey, RsaPublicKey};
use sha2::Sha256;

pub struct CryptoKeys {
    private_key: RsaPrivateKey,
    public_key: RsaPublicKey,
    pub peer_keys: std::collections::HashMap<String, RsaPublicKey>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PairingInfo {
    pub device_name: String,
    pub ip: String,
    pub port: u16,
    pub public_key_pem: String,
    pub fingerprint: String,
}

impl CryptoKeys {
    pub fn new() -> Self {
        let mut rng = rand::thread_rng();
        let bits = 2048;
        let private_key = RsaPrivateKey::new(&mut rng, bits).expect("failed to generate RSA key");
        let public_key = RsaPublicKey::from(&private_key);
        
        CryptoKeys {
            private_key,
            public_key,
            peer_keys: std::collections::HashMap::new(),
        }
    }

    pub fn public_key_pem(&self) -> String {
        self.public_key
            .to_public_key_pem(LineEnding::LF)
            .expect("failed to encode public key")
    }

    pub fn fingerprint(&self) -> String {
        use sha2::Digest;
        let pem = self.public_key_pem();
        let mut hasher = sha2::Sha256::new();
        hasher.update(pem.as_bytes());
        let hash = hasher.finalize();
        hex::encode(hash)
    }

    pub fn add_peer_key(&mut self, device_id: String, public_key_pem: String) -> Result<(), String> {
        let public_key = RsaPublicKey::from_public_key_pem(&public_key_pem)
            .map_err(|e| format!("Invalid peer public key: {}", e))?;
        self.peer_keys.insert(device_id, public_key);
        Ok(())
    }

    pub fn has_peer(&self, device_id: &str) -> bool {
        self.peer_keys.contains_key(device_id)
    }

    pub fn encrypt_for_peer(&self, device_id: &str, data: &[u8]) -> Result<EncryptedPayload, String> {
        let peer_key = self.peer_keys.get(device_id)
            .ok_or_else(|| format!("No public key for device: {}", device_id))?;
        
        let mut aes_key = [0u8; 32];
        OsRng.fill_bytes(&mut aes_key);
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        
        let cipher = Aes256Gcm::new_from_slice(&aes_key)
            .map_err(|e| format!("AES init error: {}", e))?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher.encrypt(nonce, data)
            .map_err(|e| format!("AES encrypt error: {}", e))?;
        
        let padding_scheme = Oaep::new::<Sha256>();
        let encrypted_aes_key = peer_key.encrypt(&mut rand::thread_rng(), padding_scheme, &aes_key)
            .map_err(|e| format!("RSA encrypt error: {}", e))?;
        
        Ok(EncryptedPayload {
            encrypted_key: BASE64.encode(&encrypted_aes_key),
            nonce: BASE64.encode(&nonce_bytes),
            ciphertext: BASE64.encode(&ciphertext),
        })
    }

    pub fn decrypt(&self, payload: &EncryptedPayload) -> Result<Vec<u8>, String> {
        let encrypted_aes_key = BASE64.decode(&payload.encrypted_key)
            .map_err(|e| format!("Base64 decode key error: {}", e))?;
        let nonce_bytes = BASE64.decode(&payload.nonce)
            .map_err(|e| format!("Base64 decode nonce error: {}", e))?;
        let ciphertext = BASE64.decode(&payload.ciphertext)
            .map_err(|e| format!("Base64 decode ciphertext error: {}", e))?;
        
        let padding_scheme = Oaep::new::<Sha256>();
        let aes_key = self.private_key.decrypt(padding_scheme, &encrypted_aes_key)
            .map_err(|e| format!("RSA decrypt error: {}", e))?;
        
        let cipher = Aes256Gcm::new_from_slice(&aes_key)
            .map_err(|e| format!("AES init error: {}", e))?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        cipher.decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| format!("AES decrypt error: {}", e))
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EncryptedPayload {
    pub encrypted_key: String,
    pub nonce: String,
    pub ciphertext: String,
}

impl EncryptedPayload {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }

    pub fn from_json(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| e.to_string())
    }
}
