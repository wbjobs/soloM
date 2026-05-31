use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;

const PBKDF2_ROUNDS: u32 = 100_000;
const SALT_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;
const KEY_LEN: usize = 32;
const AES_OVERHEAD: usize = SALT_LEN + NONCE_LEN + TAG_LEN;
const CRYPTO_HEADER_LEN: usize = SALT_LEN + NONCE_LEN;

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}

#[no_mangle]
pub extern "C" fn get_max_capacity(pixels_len: usize) -> usize {
    if pixels_len < 32 {
        0
    } else {
        (pixels_len / 8) - 4
    }
}

#[no_mangle]
pub extern "C" fn get_encrypted_len(plaintext_len: usize) -> usize {
    plaintext_len + AES_OVERHEAD
}

#[no_mangle]
pub extern "C" fn get_encryption_overhead() -> usize {
    AES_OVERHEAD
}

#[no_mangle]
pub extern "C" fn aes_encrypt(
    plaintext_ptr: *const u8,
    plaintext_len: usize,
    password_ptr: *const u8,
    password_len: usize,
    salt_ptr: *const u8,
    nonce_ptr: *const u8,
    output_ptr: *mut u8,
) -> usize {
    let plaintext = unsafe { std::slice::from_raw_parts(plaintext_ptr, plaintext_len) };
    let password = unsafe { std::slice::from_raw_parts(password_ptr, password_len) };
    let salt = unsafe { std::slice::from_raw_parts(salt_ptr, SALT_LEN) };
    let nonce_bytes = unsafe { std::slice::from_raw_parts(nonce_ptr, NONCE_LEN) };
    let output_len = plaintext_len + AES_OVERHEAD;
    let output = unsafe { std::slice::from_raw_parts_mut(output_ptr, output_len) };

    let mut key = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(password, salt, PBKDF2_ROUNDS, &mut key);

    let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
    let nonce = Nonce::from_slice(nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext).unwrap();

    output[..SALT_LEN].copy_from_slice(salt);
    output[SALT_LEN..CRYPTO_HEADER_LEN].copy_from_slice(nonce_bytes);
    output[CRYPTO_HEADER_LEN..CRYPTO_HEADER_LEN + ciphertext.len()].copy_from_slice(&ciphertext);

    CRYPTO_HEADER_LEN + ciphertext.len()
}

#[no_mangle]
pub extern "C" fn aes_decrypt(
    ciphertext_ptr: *const u8,
    ciphertext_len: usize,
    password_ptr: *const u8,
    password_len: usize,
    output_ptr: *mut u8,
) -> i32 {
    let ciphertext = unsafe { std::slice::from_raw_parts(ciphertext_ptr, ciphertext_len) };
    let password = unsafe { std::slice::from_raw_parts(password_ptr, password_len) };

    if ciphertext_len < CRYPTO_HEADER_LEN + TAG_LEN {
        return -1;
    }

    let salt = &ciphertext[..SALT_LEN];
    let nonce_bytes = &ciphertext[SALT_LEN..CRYPTO_HEADER_LEN];
    let encrypted_data = &ciphertext[CRYPTO_HEADER_LEN..];

    let mut key = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(password, salt, PBKDF2_ROUNDS, &mut key);

    let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
    let nonce = Nonce::from_slice(nonce_bytes);

    match cipher.decrypt(nonce, encrypted_data) {
        Ok(plaintext) => {
            let output = unsafe { std::slice::from_raw_parts_mut(output_ptr, plaintext.len()) };
            output.copy_from_slice(&plaintext);
            plaintext.len() as i32
        }
        Err(_) => -2,
    }
}

#[no_mangle]
pub extern "C" fn encode_lsb_chunk(
    chunk_ptr: *mut u8,
    chunk_len: usize,
    message_ptr: *const u8,
    message_len: usize,
    bit_offset: usize,
) -> usize {
    let chunk = unsafe { std::slice::from_raw_parts_mut(chunk_ptr, chunk_len) };
    let message = unsafe { std::slice::from_raw_parts(message_ptr, message_len) };

    let total_bits = 32 + message_len * 8;
    let len_bytes = (message_len as u32).to_be_bytes();
    let mut current_bit = bit_offset;

    for pixel in chunk.iter_mut() {
        if current_bit >= total_bits {
            break;
        }

        let (byte_val, bit_pos) = if current_bit < 32 {
            let byte_idx = current_bit / 8;
            let bit_in_byte = 7 - (current_bit % 8);
            (len_bytes[byte_idx], bit_in_byte)
        } else {
            let msg_bit = current_bit - 32;
            let byte_idx = msg_bit / 8;
            let bit_in_byte = 7 - (msg_bit % 8);
            (message[byte_idx], bit_in_byte)
        };

        let bit_val = (byte_val >> bit_pos) & 1;
        *pixel = (*pixel & 0xFE) | bit_val;
        current_bit += 1;
    }

    current_bit
}

#[no_mangle]
pub extern "C" fn decode_lsb_header(
    chunk_ptr: *const u8,
    chunk_len: usize,
) -> i32 {
    if chunk_len < 32 {
        return -1;
    }
    let chunk = unsafe { std::slice::from_raw_parts(chunk_ptr, chunk_len) };
    let mut len_bytes = [0u8; 4];
    for (byte_idx, byte) in len_bytes.iter_mut().enumerate() {
        for bit in 0..8u32 {
            let pixel_idx = byte_idx * 8 + bit as usize;
            *byte = (*byte << 1) | (chunk[pixel_idx] & 1);
        }
    }
    let msg_len = u32::from_be_bytes(len_bytes) as i32;
    if msg_len <= 0 {
        return -2;
    }
    msg_len
}

#[no_mangle]
pub extern "C" fn decode_lsb_chunk(
    chunk_ptr: *const u8,
    chunk_len: usize,
    output_ptr: *mut u8,
    output_len: usize,
    global_pixel_offset: usize,
) -> i32 {
    let chunk = unsafe { std::slice::from_raw_parts(chunk_ptr, chunk_len) };
    let output = unsafe { std::slice::from_raw_parts_mut(output_ptr, output_len) };

    for (i, &pixel) in chunk.iter().enumerate() {
        let global_pixel = global_pixel_offset + i;
        if global_pixel < 32 {
            continue;
        }
        let message_bit = global_pixel - 32;
        let byte_idx = message_bit / 8;
        let bit_in_byte = 7 - (message_bit % 8);

        if byte_idx >= output_len {
            break;
        }

        if pixel & 1 == 1 {
            output[byte_idx] |= 1 << bit_in_byte;
        } else {
            output[byte_idx] &= !(1u8 << bit_in_byte);
        }
    }

    0
}
