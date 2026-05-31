use image::{ImageBuffer, Rgba};
use wasm_bindgen::prelude::*;

fn xor_bytes(data: &mut [u8], key: &[u8]) {
    if key.is_empty() {
        return;
    }
    for (i, byte) in data.iter_mut().enumerate() {
        *byte ^= key[i % key.len()];
    }
}

fn encode_message(message: &str, key: &str) -> Vec<u8> {
    let mut bytes = message.as_bytes().to_vec();
    xor_bytes(&mut bytes, key.as_bytes());
    
    let len = bytes.len() as u32;
    let mut result = Vec::with_capacity(4 + bytes.len());
    result.extend_from_slice(&len.to_be_bytes());
    result.extend_from_slice(&bytes);
    result
}

fn decode_message(data: &[u8], key: &str) -> Result<String, String> {
    if data.len() < 4 {
        return Err("数据太短".into());
    }
    
    let len = u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;
    if len == 0 || len > data.len() - 4 {
        return Err("未找到隐藏信息".into());
    }
    
    let mut bytes = data[4..4 + len].to_vec();
    xor_bytes(&mut bytes, key.as_bytes());
    
    String::from_utf8(bytes).map_err(|_| "信息解码失败".into())
}

#[wasm_bindgen]
pub fn hide_message_in_image(
    image_data: &[u8],
    message: &str,
    key: &str,
) -> Result<Vec<u8>, JsValue> {
    let img = image::load_from_memory(image_data)
        .map_err(|e| JsValue::from_str(&format!("图片加载失败: {}", e)))?;
    
    let rgba_img = img.to_rgba8();
    let (width, height) = rgba_img.dimensions();
    
    let encoded = encode_message(message, key);
    let bits_needed = encoded.len() * 8;
    let pixels_available = (width * height) as usize * 3;
    
    if bits_needed > pixels_available {
        return Err(JsValue::from_str(&format!(
            "信息太长！需要 {} 像素，图片仅提供 {} 像素",
            bits_needed, pixels_available
        )));
    }
    
    let mut bit_index = 0;
    let mut out_img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(width, height);
    
    for (x, y, pixel) in rgba_img.enumerate_pixels() {
        let mut new_pixel = *pixel;
        
        for channel in 0..3 {
            if bit_index < bits_needed {
                let byte_idx = bit_index / 8;
                let bit_offset = 7 - (bit_index % 8);
                let bit = (encoded[byte_idx] >> bit_offset) & 1;
                
                new_pixel.0[channel] = (new_pixel.0[channel] & 0xFE) | bit;
                bit_index += 1;
            }
        }
        
        out_img.put_pixel(x, y, new_pixel);
    }
    
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    out_img
        .write_to(&mut cursor, image::ImageOutputFormat::Png)
        .map_err(|e| JsValue::from_str(&format!("图片保存失败: {}", e)))?;
    
    Ok(buf)
}

#[wasm_bindgen]
pub fn extract_message_from_image(
    image_data: &[u8],
    key: &str,
) -> Result<String, JsValue> {
    let img = image::load_from_memory(image_data)
        .map_err(|e| JsValue::from_str(&format!("图片加载失败: {}", e)))?;
    
    let rgba_img = img.to_rgba8();
    let (width, height) = rgba_img.dimensions();
    
    let total_pixels = (width * height) as usize;
    let mut extracted = Vec::with_capacity(total_pixels * 3 / 8);
    let mut current_byte = 0u8;
    let mut bit_count = 0;
    
    for pixel in rgba_img.pixels() {
        for channel in 0..3 {
            let bit = pixel.0[channel] & 1;
            current_byte = (current_byte << 1) | bit;
            bit_count += 1;
            
            if bit_count == 8 {
                extracted.push(current_byte);
                current_byte = 0;
                bit_count = 0;
            }
        }
    }
    
    decode_message(&extracted, key).map_err(|e| JsValue::from_str(&e))
}
