use num_complex::Complex;
use wasm_bindgen::prelude::*;

#[inline]
fn reverse_bits(mut n: usize, bits: usize) -> usize {
    let mut result = 0;
    for _ in 0..bits {
        result = (result << 1) | (n & 1);
        n >>= 1;
    }
    result
}

fn fft_internal(data: &mut [Complex<f32>], invert: bool) {
    let n = data.len();
    let bits = n.trailing_zeros() as usize;

    for i in 0..n {
        let j = reverse_bits(i, bits);
        if i < j {
            data.swap(i, j);
        }
    }

    let mut len = 2;
    while len <= n {
        let half_len = len / 2;
        let angle = 2.0 * std::f32::consts::PI / len as f32 * if invert { -1.0 } else { 1.0 };
        let wlen = Complex::new(angle.cos(), angle.sin());

        for i in (0..n).step_by(len) {
            let mut w = Complex::new(1.0, 0.0);
            for j in 0..half_len {
                let u = data[i + j];
                let v = data[i + j + half_len] * w;
                data[i + j] = u + v;
                data[i + j + half_len] = u - v;
                w = w * wlen;
            }
        }
        len <<= 1;
    }

    if invert {
        let n_inv = 1.0 / n as f32;
        for x in data.iter_mut() {
            *x = *x * n_inv;
        }
    }
}

fn next_power_of_two(n: usize) -> usize {
    if n == 0 {
        return 1;
    }
    let mut result = 1;
    while result < n {
        result <<= 1;
    }
    result
}

fn fft_2d(
    pixels: &[u8],
    width: usize,
    height: usize,
    padded_width: usize,
    padded_height: usize,
) -> Vec<Complex<f32>> {
    let mut data = vec![Complex::new(0.0, 0.0); padded_width * padded_height];

    for y in 0..height {
        for x in 0..width {
            let idx = (y * width + x) * 4;
            let gray = (pixels[idx] as f32 * 0.299
                + pixels[idx + 1] as f32 * 0.587
                + pixels[idx + 2] as f32 * 0.114)
                / 255.0;
            data[y * padded_width + x] = Complex::new(gray, 0.0);
        }
    }

    for y in 0..padded_height {
        let row = &mut data[y * padded_width..(y + 1) * padded_width];
        fft_internal(row, false);
    }

    let mut col = vec![Complex::new(0.0, 0.0); padded_height];
    for x in 0..padded_width {
        for y in 0..padded_height {
            col[y] = data[y * padded_width + x];
        }
        fft_internal(&mut col, false);
        for y in 0..padded_height {
            data[y * padded_width + x] = col[y];
        }
    }

    data
}

fn ifft_2d(
    freq_data: &[Complex<f32>],
    padded_width: usize,
    padded_height: usize,
) -> Vec<Complex<f32>> {
    let mut data = freq_data.to_vec();

    for y in 0..padded_height {
        let row = &mut data[y * padded_width..(y + 1) * padded_width];
        fft_internal(row, true);
    }

    let mut col = vec![Complex::new(0.0, 0.0); padded_height];
    for x in 0..padded_width {
        for y in 0..padded_height {
            col[y] = data[y * padded_width + x];
        }
        fft_internal(&mut col, true);
        for y in 0..padded_height {
            data[y * padded_width + x] = col[y];
        }
    }

    data
}

fn apply_low_pass_filter(
    freq_data: &mut [Complex<f32>],
    padded_width: usize,
    padded_height: usize,
    cutoff: f32,
) {
    let center_x = padded_width / 2;
    let center_y = padded_height / 2;
    let max_radius = (center_x.min(center_y) as f32) * cutoff;

    for y in 0..padded_height {
        for x in 0..padded_width {
            let dx = if x <= center_x { x } else { padded_width - x };
            let dy = if y <= center_y { y } else { padded_height - y };
            let distance = ((dx * dx + dy * dy) as f32).sqrt();

            if distance > max_radius {
                freq_data[y * padded_width + x] = Complex::new(0.0, 0.0);
            }
        }
    }
}

fn fft_shift(data: &mut [Complex<f32>], width: usize, height: usize) {
    let half_w = width / 2;
    let half_h = height / 2;

    for y in 0..half_h {
        for x in 0..half_w {
            let idx1 = y * width + x;
            let idx2 = (y + half_h) * width + (x + half_w);
            data.swap(idx1, idx2);
        }
    }

    for y in 0..half_h {
        for x in half_w..width {
            let idx1 = y * width + x;
            let idx2 = (y + half_h) * width + (x - half_w);
            data.swap(idx1, idx2);
        }
    }
}

#[wasm_bindgen]
pub struct ImageBuffer {
    ptr: *mut u8,
    len: usize,
}

#[wasm_bindgen]
impl ImageBuffer {
    #[wasm_bindgen(getter)]
    pub fn ptr(&self) -> *mut u8 {
        self.ptr
    }

    #[wasm_bindgen(getter)]
    pub fn len(&self) -> usize {
        self.len
    }

    #[wasm_bindgen]
    pub fn free(self) {
        unsafe {
            let _ = Vec::from_raw_parts(self.ptr, self.len, self.len);
        }
    }
}

unsafe impl Send for ImageBuffer {}
unsafe impl Sync for ImageBuffer {}

fn into_image_buffer(vec: Vec<u8>) -> ImageBuffer {
    let mut vec = std::mem::ManuallyDrop::new(vec);
    ImageBuffer {
        ptr: vec.as_mut_ptr(),
        len: vec.len(),
    }
}

#[wasm_bindgen]
pub fn apply_filter(
    pixels: &[u8],
    width: usize,
    height: usize,
    cutoff_ratio: f32,
) -> ImageBuffer {
    let padded_width = next_power_of_two(width);
    let padded_height = next_power_of_two(height);

    let mut freq_data = fft_2d(pixels, width, height, padded_width, padded_height);

    fft_shift(&mut freq_data, padded_width, padded_height);

    apply_low_pass_filter(&mut freq_data, padded_width, padded_height, cutoff_ratio);

    fft_shift(&mut freq_data, padded_width, padded_height);

    let spatial_data = ifft_2d(&freq_data, padded_width, padded_height);

    let mut result = vec![0u8; width * height * 4];
    for y in 0..height {
        for x in 0..width {
            let src_idx = y * padded_width + x;
            let dst_idx = (y * width + x) * 4;

            let val = spatial_data[src_idx].re.clamp(0.0, 1.0);
            let gray = (val * 255.0) as u8;

            result[dst_idx] = gray;
            result[dst_idx + 1] = gray;
            result[dst_idx + 2] = gray;
            result[dst_idx + 3] = 255;
        }
    }

    into_image_buffer(result)
}

#[wasm_bindgen]
pub fn get_frequency_spectrum(
    pixels: &[u8],
    width: usize,
    height: usize,
) -> ImageBuffer {
    let padded_width = next_power_of_two(width);
    let padded_height = next_power_of_two(height);

    let mut freq_data = fft_2d(pixels, width, height, padded_width, padded_height);

    fft_shift(&mut freq_data, padded_width, padded_height);

    let mut max_mag = 0.0f32;
    let mut magnitudes = vec![0.0f32; padded_width * padded_height];

    for y in 0..padded_height {
        for x in 0..padded_width {
            let idx = y * padded_width + x;
            let mag = freq_data[idx].norm().log10() + 1.0;
            magnitudes[idx] = mag;
            if mag > max_mag {
                max_mag = mag;
            }
        }
    }

    let mut result = vec![0u8; padded_width * padded_height * 4];
    for y in 0..padded_height {
        for x in 0..padded_width {
            let src_idx = y * padded_width + x;
            let dst_idx = src_idx * 4;

            let normalized = if max_mag > 0.0 {
                magnitudes[src_idx] / max_mag
            } else {
                0.0
            };
            let gray = (normalized * 255.0) as u8;

            result[dst_idx] = gray;
            result[dst_idx + 1] = gray;
            result[dst_idx + 2] = gray;
            result[dst_idx + 3] = 255;
        }
    }

    into_image_buffer(result)
}

#[wasm_bindgen]
pub fn apply_convolution(
    pixels: &[u8],
    width: usize,
    height: usize,
    kernel: &[f32],
    kernel_size: usize,
) -> ImageBuffer {
    let half = kernel_size / 2;
    let mut result = vec![0u8; width * height * 4];

    for y in 0..height {
        for x in 0..width {
            let dst_idx = (y * width + x) * 4;

            let mut r = 0.0f32;
            let mut g = 0.0f32;
            let mut b = 0.0f32;
            let mut kernel_sum = 0.0f32;

            for ky in 0..kernel_size {
                for kx in 0..kernel_size {
                    let px = (x as isize + kx as isize - half as isize).clamp(0, width as isize - 1) as usize;
                    let py = (y as isize + ky as isize - half as isize).clamp(0, height as isize - 1) as usize;

                    let src_idx = (py * width + px) * 4;
                    let k = kernel[ky * kernel_size + kx];

                    r += pixels[src_idx] as f32 * k;
                    g += pixels[src_idx + 1] as f32 * k;
                    b += pixels[src_idx + 2] as f32 * k;
                    kernel_sum += k;
                }
            }

            if kernel_sum.abs() > 0.0001 {
                r /= kernel_sum;
                g /= kernel_sum;
                b /= kernel_sum;
            }

            result[dst_idx] = r.clamp(0.0, 255.0) as u8;
            result[dst_idx + 1] = g.clamp(0.0, 255.0) as u8;
            result[dst_idx + 2] = b.clamp(0.0, 255.0) as u8;
            result[dst_idx + 3] = 255;
        }
    }

    into_image_buffer(result)
}

#[wasm_bindgen]
pub fn memory_usage() -> usize {
    0
}
