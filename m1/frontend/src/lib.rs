use dicom::object::from_reader;
use dicom::core::Tag;
use dicom_pixeldata::PixelDecoder;
use image::ImageEncoder;
use js_sys::{Uint8Array, Uint8ClampedArray};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::VecDeque;
use wasm_bindgen::prelude::*;


const MAX_CACHE_ENTRIES: usize = 8;
const MAX_IMAGE_DIMENSION: u32 = 4096;
const MAX_PIXEL_COUNT: usize = 4096 * 4096;
const MAX_VOLUME_VOXELS: usize = 512 * 512 * 512;

thread_local! {
    static DICOM_CACHE: RefCell<OrderedCache> = RefCell::new(OrderedCache::new(MAX_CACHE_ENTRIES));
    static RENDER_BUFFER: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    static VOLUME_CACHE: RefCell<Option<VolumeData>> = RefCell::new(None);
}

struct OrderedCache {
    entries: VecDeque<(String, DicomImage)>,
    max_entries: usize,
}

impl OrderedCache {
    fn new(max_entries: usize) -> Self {
        Self {
            entries: VecDeque::with_capacity(max_entries),
            max_entries,
        }
    }

    fn insert(&mut self, key: String, value: DicomImage) {
        if let Some(pos) = self.entries.iter().position(|(k, _)| k == &key) {
            self.entries.remove(pos);
        }

        while self.entries.len() >= self.max_entries {
            if let Some((evicted_key, evicted_img)) = self.entries.pop_front() {
                let freed_bytes = evicted_img.pixel_data.len() * std::mem::size_of::<i16>();
                console_log(&format!(
                    "LRU evicted: {} (freed ~{} KB)",
                    evicted_key,
                    freed_bytes / 1024
                ));
            }
        }

        self.entries.push_back((key, value));
    }

    fn get(&self, key: &str) -> Option<&DicomImage> {
        self.entries.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    fn get_mut(&mut self, key: &str) -> Option<&mut DicomImage> {
        self.entries.iter_mut().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    fn remove(&mut self, key: &str) {
        if let Some(pos) = self.entries.iter().position(|(k, _)| k == key) {
            self.entries.remove(pos);
        }
    }

    fn len(&self) -> usize {
        self.entries.len()
    }

    fn total_memory_kb(&self) -> usize {
        self.entries
            .iter()
            .map(|(_, img)| img.pixel_data.len() * std::mem::size_of::<i16>())
            .sum::<usize>()
            / 1024
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DicomMetadata {
    pub patient_id: String,
    pub patient_name: String,
    pub study_uid: String,
    pub series_uid: String,
    pub sop_instance_uid: String,
    pub modality: String,
    pub body_part_examined: String,
    pub study_date: String,
    pub width: u32,
    pub height: u32,
    pub bits_allocated: u16,
    pub bits_stored: u16,
    pub window_center: i32,
    pub window_width: i32,
    pub rescale_slope: f64,
    pub rescale_intercept: f64,
    pub photometric_interpretation: String,
    pub slice_location: f64,
    pub slice_thickness: f64,
    pub image_position: [f64; 3],
    pub image_orientation: [f64; 6],
    pub pixel_spacing: [f64; 2],
}

#[derive(Serialize, Deserialize, Clone)]
pub struct VolumeInfo {
    pub width: u32,
    pub height: u32,
    pub depth: u32,
    pub voxel_size: [f32; 3],
    pub data_min: f32,
    pub data_max: f32,
    pub slope: f32,
    pub intercept: f32,
}

struct VolumeData {
    data: Vec<u8>,
    info: VolumeInfo,
}

struct DicomImage {
    pixel_data: Vec<i16>,
    metadata: DicomMetadata,
    current_window_center: i32,
    current_window_width: i32,
}

#[wasm_bindgen]
pub fn init() {
    console_error_panic_hook::set_once();
}

fn console_log(s: &str) {
    let _ = js_sys::eval(&format!("console.log({:?})", s));
}

#[wasm_bindgen]
pub fn load_dicom(data: &[u8], id: &str) -> Result<JsValue, JsValue> {
    console_log(&format!("Loading DICOM file with ID: {}, size: {} KB", id, data.len() / 1024));

    let mut cursor = std::io::Cursor::new(data);
    let obj = from_reader(&mut cursor)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse DICOM: {}", e)))?;

    let metadata = extract_metadata(&obj);

    if metadata.width == 0 || metadata.height == 0 {
        drop(obj);
        return Err(JsValue::from_str("Invalid image dimensions (0x0)"));
    }
    if metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION {
        drop(obj);
        return Err(JsValue::from_str(&format!(
            "Image too large: {}x{} (max {}x{})",
            metadata.width, metadata.height, MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION
        )));
    }
    let pixel_count = metadata.width as usize * metadata.height as usize;
    if pixel_count > MAX_PIXEL_COUNT {
        drop(obj);
        return Err(JsValue::from_str(&format!(
            "Pixel count too large: {} (max {})",
            pixel_count, MAX_PIXEL_COUNT
        )));
    }

    let pixel_data = obj
        .decode_pixel_data()
        .map_err(|e| JsValue::from_str(&format!("Failed to decode pixel data: {}", e)))?;

    let (rows, cols) = (pixel_data.rows(), pixel_data.columns());

    let raw_samples: Vec<i32> = pixel_data
        .to_vec()
        .map_err(|e| JsValue::from_str(&format!("Failed to get raw samples: {}", e)))?;

    drop(pixel_data);
    drop(obj);

    let pixel_values: Vec<i16> = raw_samples
        .into_iter()
        .map(|x: i32| {
            x.clamp(-32768, 32767) as i16
        })
        .collect();

    let dicom_img = DicomImage {
        pixel_data: pixel_values,
        current_window_center: metadata.window_center,
        current_window_width: metadata.window_width,
        metadata: metadata.clone(),
    };

    DICOM_CACHE.with(|cache| {
        cache.borrow_mut().insert(id.to_string(), dicom_img);
    });

    DICOM_CACHE.with(|cache| {
        let c = cache.borrow();
        console_log(&format!(
            "Cache: {} entries, ~{} KB | Loaded: {}x{}, window: {}/{}",
            c.len(),
            c.total_memory_kb(),
            cols, rows,
            metadata.window_center, metadata.window_width
        ));
    });

    Ok(serde_wasm_bindgen::to_value(&metadata).unwrap())
}

fn extract_metadata(obj: &dicom::object::DefaultDicomObject) -> DicomMetadata {
    let get_str = |tag: Tag, default: &str| -> String {
        obj.element(tag)
            .ok()
            .and_then(|e| e.to_str().ok())
            .map(|s| s.into_owned())
            .unwrap_or_else(|| default.to_string())
    };

    let get_int = |tag: Tag, default: i32| -> i32 {
        obj.element(tag)
            .ok()
            .and_then(|e| e.to_int::<i32>().ok())
            .unwrap_or(default)
    };

    let get_uint = |tag: Tag, default: u16| -> u16 {
        obj.element(tag)
            .ok()
            .and_then(|e| e.to_int::<i32>().ok())
            .map(|v| v.max(0) as u16)
            .unwrap_or(default)
    };

    let get_double = |tag: Tag, default: f64| -> f64 {
        obj.element(tag)
            .ok()
            .and_then(|e| e.to_str().ok())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(default)
    };

    let width = get_uint(Tag(0x0028, 0x0011), 0) as u32;
    let height = get_uint(Tag(0x0028, 0x0010), 0) as u32;

    let bits_allocated = get_uint(Tag(0x0028, 0x0100), 8);
    let bits_stored = get_uint(Tag(0x0028, 0x0101), 8);

    let wc = get_int(Tag(0x0028, 0x1050), 0);
    let ww = get_int(Tag(0x0028, 0x1051), 255);
    let (window_center, window_width) = if ww <= 0 {
        let max_val = (1 << bits_stored) - 1;
        (max_val / 2, max_val as i32)
    } else {
        (wc, ww)
    };

    let pixel_spacing_x = get_double(Tag(0x0028, 0x0030), 1.0);
    let pixel_spacing_str = get_str(Tag(0x0018, 0x0050), "1.0");
    let slice_thickness: f64 = pixel_spacing_str.parse().unwrap_or(1.0);

    let slice_location = get_double(Tag(0x0020, 0x1041), 0.0);

    let image_position_str = get_str(Tag(0x0020, 0x0032), "0\\0\\0");
    let image_position = parse_double_array_3(&image_position_str, [0.0, 0.0, 0.0]);

    let image_orientation_str = get_str(Tag(0x0020, 0x0037), "1\\0\\0\\0\\1\\0");
    let image_orientation = parse_double_array_6(&image_orientation_str, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0]);

    let spacing_str = get_str(Tag(0x0028, 0x0030), "1.0\\1.0");
    let spacing_parts: Vec<&str> = spacing_str.split('\\').collect();
    let pixel_spacing = [
        spacing_parts.get(0).and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(pixel_spacing_x),
        spacing_parts.get(1).and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(pixel_spacing_x),
    ];

    DicomMetadata {
        patient_id: get_str(Tag(0x0010, 0x0020), "UNKNOWN"),
        patient_name: get_str(Tag(0x0010, 0x0010), "UNKNOWN"),
        study_uid: get_str(Tag(0x0020, 0x000D), ""),
        series_uid: get_str(Tag(0x0020, 0x000E), ""),
        sop_instance_uid: get_str(Tag(0x0008, 0x0018), ""),
        modality: get_str(Tag(0x0008, 0x0060), ""),
        body_part_examined: get_str(Tag(0x0018, 0x0015), ""),
        study_date: get_str(Tag(0x0008, 0x0020), ""),
        width,
        height,
        bits_allocated,
        bits_stored,
        window_center,
        window_width,
        rescale_slope: get_double(Tag(0x0028, 0x1053), 1.0),
        rescale_intercept: get_double(Tag(0x0028, 0x1052), 0.0),
        photometric_interpretation: get_str(Tag(0x0028, 0x0004), "MONOCHROME2"),
        slice_location,
        slice_thickness,
        image_position,
        image_orientation,
        pixel_spacing,
    }
}

fn parse_double_array_3(s: &str, default: [f64; 3]) -> [f64; 3] {
    let parts: Vec<f64> = s.split('\\')
        .filter_map(|p| p.trim().parse::<f64>().ok())
        .collect();
    let mut result = default;
    for i in 0..3.min(parts.len()) {
        result[i] = parts[i];
    }
    result
}

fn parse_double_array_6(s: &str, default: [f64; 6]) -> [f64; 6] {
    let parts: Vec<f64> = s.split('\\')
        .filter_map(|p| p.trim().parse::<f64>().ok())
        .collect();
    let mut result = default;
    for i in 0..6.min(parts.len()) {
        result[i] = parts[i];
    }
    result
}

#[wasm_bindgen]
pub fn build_volume(slice_ids: Vec<JsValue>) -> Result<JsValue, JsValue> {
    let ids: Vec<String> = slice_ids
        .iter()
        .filter_map(|v| v.as_string())
        .collect();

    if ids.is_empty() {
        return Err(JsValue::from_str("No slices provided"));
    }

    console_log(&format!("Building volume from {} slices", ids.len()));

    let mut slices: Vec<(f64, Vec<i16>, DicomMetadata)> = Vec::new();

    DICOM_CACHE.with(|cache| {
        let cache = cache.borrow();
        for id in &ids {
            if let Some(img) = cache.get(id) {
                slices.push((
                    img.metadata.slice_location,
                    img.pixel_data.clone(),
                    img.metadata.clone(),
                ));
            }
        }
    });

    if slices.is_empty() {
        return Err(JsValue::from_str("No valid slices found in cache"));
    }

    slices.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let ref_meta = &slices[0].2;
    let width = ref_meta.width;
    let height = ref_meta.height;
    let depth = slices.len() as u32;

    let total_voxels = (width * height * depth) as usize;
    if total_voxels > MAX_VOLUME_VOXELS {
        return Err(JsValue::from_str(&format!(
            "Volume too large: {}x{}x{} = {} voxels (max {})",
            width, height, depth, total_voxels, MAX_VOLUME_VOXELS
        )));
    }

    let slope = ref_meta.rescale_slope as f32;
    let intercept = ref_meta.rescale_intercept as f32;

    let mut raw_data: Vec<f32> = Vec::with_capacity(total_voxels);
    let mut data_min = f32::MAX;
    let mut data_max = f32::MIN;

    for (_, pixels, _) in &slices {
        for &px in pixels {
            let hu = px as f32 * slope + intercept;
            raw_data.push(hu);
            if hu < data_min { data_min = hu; }
            if hu > data_max { data_max = hu; }
        }
    }

    console_log(&format!("Volume HU range: [{:.1}, {:.1}]", data_min, data_max));

    let range = (data_max - data_min).max(1.0);
    let mut normalized: Vec<u8> = Vec::with_capacity(total_voxels);
    for &v in &raw_data {
        let norm = ((v - data_min) / range * 255.0).clamp(0.0, 255.0);
        normalized.push(norm as u8);
    }

    drop(raw_data);

    let spacing_x = ref_meta.pixel_spacing[0] as f32;
    let spacing_y = ref_meta.pixel_spacing[1] as f32;
    let mut spacing_z = if slices.len() > 1 {
        (slices.last().unwrap().0 - slices[0].0).abs() as f32 / (slices.len() - 1) as f32
    } else {
        ref_meta.slice_thickness as f32
    };
    if spacing_z <= 0.0 {
        spacing_z = ref_meta.slice_thickness as f32;
    }

    let voxel_size = [spacing_x, spacing_y, spacing_z.max(spacing_x.max(spacing_y))];

    let info = VolumeInfo {
        width,
        height,
        depth,
        voxel_size,
        data_min,
        data_max,
        slope,
        intercept,
    };

    console_log(&format!(
        "Volume built: {}x{}x{}, voxel: [{:.2}, {:.2}, {:.2}], ~{} MB",
        width, height, depth,
        voxel_size[0], voxel_size[1], voxel_size[2],
        normalized.len() / 1024 / 1024
    ));

    let volume = VolumeData {
        data: normalized,
        info: info.clone(),
    };

    VOLUME_CACHE.with(|vc| {
        *vc.borrow_mut() = Some(volume);
    });

    Ok(serde_wasm_bindgen::to_value(&info).unwrap())
}

#[wasm_bindgen]
pub fn get_volume_data() -> Result<Uint8Array, JsValue> {
    VOLUME_CACHE.with(|vc| {
        let vc = vc.borrow();
        let vol = vc.as_ref().ok_or_else(|| JsValue::from_str("No volume data available"))?;
        Ok(Uint8Array::from(&vol.data[..]))
    })
}

#[wasm_bindgen]
pub fn get_volume_info() -> Result<JsValue, JsValue> {
    VOLUME_CACHE.with(|vc| {
        let vc = vc.borrow();
        let vol = vc.as_ref().ok_or_else(|| JsValue::from_str("No volume data available"))?;
        Ok(serde_wasm_bindgen::to_value(&vol.info).unwrap())
    })
}

#[wasm_bindgen]
pub fn get_volume_dimensions() -> Result<JsValue, JsValue> {
    VOLUME_CACHE.with(|vc| {
        let vc = vc.borrow();
        let vol = vc.as_ref().ok_or_else(|| JsValue::from_str("No volume data available"))?;
        let dims = serde_json::json!({
            "width": vol.info.width,
            "height": vol.info.height,
            "depth": vol.info.depth,
        });
        Ok(serde_wasm_bindgen::to_value(&dims).unwrap())
    })
}

#[wasm_bindgen]
pub fn free_volume() {
    VOLUME_CACHE.with(|vc| {
        let mut vc = vc.borrow_mut();
        if vc.is_some() {
            vc.take();
            console_log("Volume data freed");
        }
    });
}

#[wasm_bindgen]
pub fn get_slice_ids_for_series(series_uid: &str) -> Result<JsValue, JsValue> {
    DICOM_CACHE.with(|cache| {
        let cache = cache.borrow();
        let ids: Vec<String> = cache.entries
            .iter()
            .filter(|(_, img)| img.metadata.series_uid == series_uid)
            .map(|(id, _)| id.clone())
            .collect();
        Ok(serde_wasm_bindgen::to_value(&ids).unwrap())
    })
}

#[wasm_bindgen]
pub fn set_window(id: &str, center: i32, width: i32) -> Result<(), JsValue> {
    DICOM_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let img = cache
            .get_mut(id)
            .ok_or_else(|| JsValue::from_str("DICOM image not found"))?;
        img.current_window_center = center;
        img.current_window_width = width.max(1);
        Ok(())
    })
}

#[wasm_bindgen]
pub fn reset_window(id: &str) -> Result<(), JsValue> {
    DICOM_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let img = cache
            .get_mut(id)
            .ok_or_else(|| JsValue::from_str("DICOM image not found"))?;
        img.current_window_center = img.metadata.window_center;
        img.current_window_width = img.metadata.window_width;
        Ok(())
    })
}

#[wasm_bindgen]
pub fn get_current_window(id: &str) -> Result<JsValue, JsValue> {
    DICOM_CACHE.with(|cache| {
        let cache = cache.borrow();
        let img = cache
            .get(id)
            .ok_or_else(|| JsValue::from_str("DICOM image not found"))?;
        let result = serde_json::json!({
            "center": img.current_window_center,
            "width": img.current_window_width
        });
        Ok(serde_wasm_bindgen::to_value(&result).unwrap())
    })
}

fn apply_window_level(pixel: i32, wc: i32, ww: i32, is_monochrome1: bool) -> u8 {
    let ww = ww.max(1);
    let min_val = wc as f64 - ww as f64 / 2.0;
    let max_val = wc as f64 + ww as f64 / 2.0;

    let mut normalized = if pixel as f64 <= min_val {
        0.0
    } else if pixel as f64 >= max_val {
        255.0
    } else {
        ((pixel as f64 - min_val) / (max_val - min_val)) * 255.0
    };

    if is_monochrome1 {
        normalized = 255.0 - normalized;
    }

    normalized.clamp(0.0, 255.0) as u8
}

#[wasm_bindgen]
pub fn render_image(
    id: &str,
) -> Result<Uint8ClampedArray, JsValue> {
    DICOM_CACHE.with(|cache| {
        let cache = cache.borrow();
        let img = cache
            .get(id)
            .ok_or_else(|| JsValue::from_str("DICOM image not found"))?;

        let (width, height) = (img.metadata.width, img.metadata.height);
        if width == 0 || height == 0 {
            return Err(JsValue::from_str("Invalid image dimensions"));
        }

        let is_monochrome1 = img.metadata.photometric_interpretation == "MONOCHROME1";
        let wc = img.current_window_center;
        let ww = img.current_window_width;
        let slope = img.metadata.rescale_slope;
        let intercept = img.metadata.rescale_intercept;

        let rgba_size = (width * height * 4) as usize;

        RENDER_BUFFER.with(|buf| {
            let mut rgba_data = buf.borrow_mut();
            rgba_data.clear();
            rgba_data.resize(rgba_size, 0);

            for (i, &pixel) in img.pixel_data.iter().enumerate() {
                let hu = (pixel as f64 * slope + intercept) as i32;
                let gray = apply_window_level(hu, wc, ww, is_monochrome1);
                let idx = i * 4;
                rgba_data[idx] = gray;
                rgba_data[idx + 1] = gray;
                rgba_data[idx + 2] = gray;
                rgba_data[idx + 3] = 255;
            }

            Ok(Uint8ClampedArray::from(rgba_data.as_slice()))
        })
    })
}

#[wasm_bindgen]
pub fn get_anonymized_metadata(id: &str) -> Result<JsValue, JsValue> {
    DICOM_CACHE.with(|cache| {
        let cache = cache.borrow();
        let img = cache
            .get(id)
            .ok_or_else(|| JsValue::from_str("DICOM image not found"))?;

        let anonymized = serde_json::json!({
            "patient_id": img.metadata.patient_id,
            "study_uid": img.metadata.study_uid,
            "series_uid": img.metadata.series_uid,
            "sop_instance_uid": img.metadata.sop_instance_uid,
            "modality": img.metadata.modality,
            "body_part_examined": img.metadata.body_part_examined,
            "study_date": img.metadata.study_date,
            "width": img.metadata.width,
            "height": img.metadata.height,
            "bits_allocated": img.metadata.bits_allocated,
            "window_center": img.current_window_center,
            "window_width": img.current_window_width
        });

        Ok(serde_wasm_bindgen::to_value(&anonymized).unwrap())
    })
}

#[wasm_bindgen]
pub fn get_processed_pixels(id: &str) -> Result<Uint8ClampedArray, JsValue> {
    DICOM_CACHE.with(|cache| {
        let cache = cache.borrow();
        let img = cache
            .get(id)
            .ok_or_else(|| JsValue::from_str("DICOM image not found"))?;

        let (width, height) = (img.metadata.width, img.metadata.height);
        let is_monochrome1 = img.metadata.photometric_interpretation == "MONOCHROME1";
        let wc = img.current_window_center;
        let ww = img.current_window_width;

        let mut rgba_data = vec![0u8; (width * height * 4) as usize];

        for (i, &pixel) in img.pixel_data.iter().enumerate() {
            let hu = (pixel as f64 * img.metadata.rescale_slope + img.metadata.rescale_intercept) as i32;
            let gray = apply_window_level(hu, wc, ww, is_monochrome1);
            let idx = i * 4;
            rgba_data[idx] = gray;
            rgba_data[idx + 1] = gray;
            rgba_data[idx + 2] = gray;
            rgba_data[idx + 3] = 255;
        }

        Ok(Uint8ClampedArray::from(&rgba_data[..]))
    })
}

#[wasm_bindgen]
pub fn export_as_png(id: &str) -> Result<Uint8ClampedArray, JsValue> {
    DICOM_CACHE.with(|cache| {
        let cache = cache.borrow();
        let img = cache
            .get(id)
            .ok_or_else(|| JsValue::from_str("DICOM image not found"))?;

        let (width, height) = (img.metadata.width, img.metadata.height);
        let is_monochrome1 = img.metadata.photometric_interpretation == "MONOCHROME1";
        let wc = img.current_window_center;
        let ww = img.current_window_width;

        let mut rgba_data = vec![0u8; (width * height * 4) as usize];

        for (i, &pixel) in img.pixel_data.iter().enumerate() {
            let hu = (pixel as f64 * img.metadata.rescale_slope + img.metadata.rescale_intercept) as i32;
            let gray = apply_window_level(hu, wc, ww, is_monochrome1);
            let idx = i * 4;
            rgba_data[idx] = gray;
            rgba_data[idx + 1] = gray;
            rgba_data[idx + 2] = gray;
            rgba_data[idx + 3] = 255;
        }

        let mut png_data = Vec::new();
        {
            let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
            encoder
                .write_image(
                    &rgba_data,
                    width,
                    height,
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|e| JsValue::from_str(&format!("Failed to encode PNG: {}", e)))?;
        }

        drop(rgba_data);

        Ok(Uint8ClampedArray::from(&png_data[..]))
    })
}

#[wasm_bindgen]
pub fn unload_dicom(id: &str) {
    DICOM_CACHE.with(|cache| {
        cache.borrow_mut().remove(id);
    });
    console_log(&format!("Unloaded DICOM with ID: {}", id));
}

#[wasm_bindgen]
pub fn free_render_buffer() {
    RENDER_BUFFER.with(|buf| {
        let mut b = buf.borrow_mut();
        b.clear();
        b.shrink_to_fit();
    });
}

#[wasm_bindgen]
pub fn clear_cache() {
    DICOM_CACHE.with(|cache| {
        cache.borrow_mut().entries.clear();
    });
    free_render_buffer();
    console_log("All caches cleared, render buffer freed");
}

#[wasm_bindgen]
pub fn get_cache_info() -> Result<JsValue, JsValue> {
    DICOM_CACHE.with(|cache| {
        let c = cache.borrow();
        let result = serde_json::json!({
            "entries": c.len(),
            "max_entries": c.max_entries,
            "total_memory_kb": c.total_memory_kb()
        });
        Ok(serde_wasm_bindgen::to_value(&result).unwrap())
    })
}

#[wasm_bindgen(start)]
pub fn start() {
    init();
    console_log("DICOM Wasm module initialized (with 3D volume support)");
}
