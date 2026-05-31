use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use keyring::Entry;
use rand::Rng;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Keyring error: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("Encryption error: {0}")]
    Encryption(String),
    #[error("Decryption error: {0}")]
    Decryption(String),
    #[error("Invalid key format")]
    InvalidKey,
    #[error("Encoding error: {0}")]
    Encoding(#[from] base64::DecodeError),
}

const SERVICE_NAME: &str = "EncryptedNotes";
const KEY_NAME: &str = "database_encryption_key";

pub struct KeyManager;

impl KeyManager {
    pub fn get_or_create_encryption_key() -> Result<Vec<u8>, CryptoError> {
        let entry = Entry::new(SERVICE_NAME, KEY_NAME)?;

        match entry.get_password() {
            Ok(key_b64) => {
                let key = general_purpose::STANDARD.decode(&key_b64)?;
                if key.len() != 32 {
                    return Err(CryptoError::InvalidKey);
                }
                Ok(key)
            }
            Err(keyring::Error::NoEntry) => {
                let key = Self::generate_encryption_key();
                let key_b64 = general_purpose::STANDARD.encode(&key);
                entry.set_password(&key_b64)?;
                Ok(key)
            }
            Err(e) => Err(CryptoError::Keyring(e)),
        }
    }

    fn generate_encryption_key() -> Vec<u8> {
        let mut rng = rand::thread_rng();
        let mut key = [0u8; 32];
        rng.fill(&mut key);
        key.to_vec()
    }

    pub fn generate_nonce() -> [u8; 12] {
        let mut rng = rand::thread_rng();
        let mut nonce = [0u8; 12];
        rng.fill(&mut nonce);
        nonce
    }
}

pub struct EncryptionService {
    cipher: Aes256Gcm,
}

impl EncryptionService {
    pub fn new(key: &[u8]) -> Result<Self, CryptoError> {
        Ok(Self {
            cipher: Aes256Gcm::new(key.into()),
        })
    }

    pub fn encrypt(&self, plaintext: &str) -> Result<String, CryptoError> {
        let nonce_bytes = KeyManager::generate_nonce();
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| CryptoError::Encryption(e.to_string()))?;

        let mut result = nonce_bytes.to_vec();
        result.extend(ciphertext);

        Ok(general_purpose::STANDARD.encode(&result))
    }

    pub fn decrypt(&self, ciphertext_b64: &str) -> Result<String, CryptoError> {
        let data = general_purpose::STANDARD.decode(ciphertext_b64)?;

        if data.len() < 12 {
            return Err(CryptoError::Decryption("Invalid ciphertext".into()));
        }

        let nonce_bytes = &data[..12];
        let ciphertext = &data[12..];
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = self
            .cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| CryptoError::Decryption(e.to_string()))?;

        String::from_utf8(plaintext).map_err(|e| CryptoError::Decryption(e.to_string()))
    }
}

pub fn generate_id() -> String {
    Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encryption_decryption() {
        let key = KeyManager::generate_encryption_key();
        let service = EncryptionService::new(&key).unwrap();
        let plaintext = "Hello, World!";
        let encrypted = service.encrypt(plaintext).unwrap();
        let decrypted = service.decrypt(&encrypted).unwrap();
        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_key_generation() {
        let key = KeyManager::generate_encryption_key();
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn test_nonce_generation() {
        let nonce = KeyManager::generate_nonce();
        assert_eq!(nonce.len(), 12);
    }
}
