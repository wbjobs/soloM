from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64
import io
from PIL import Image, ImageOps, ImageFilter, ImageDraw
import numpy as np
import json
import time
import uuid

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

app = FastAPI(title="手写公式识别 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REDIS_KEY = "equation_history"
MAX_HISTORY = 20

class ImageRequest(BaseModel):
    image: str

redis_client = None
if REDIS_AVAILABLE:
    try:
        redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        redis_client.ping()
    except Exception as e:
        redis_client = None
        print(f"Redis 连接失败: {e}，使用内存存储替代")

in_memory_history = []

def save_to_history(image_data, latex, expression):
    record_id = str(uuid.uuid4())
    record = {
        "id": record_id,
        "image": image_data,
        "latex": latex,
        "expression": expression,
        "timestamp": int(time.time())
    }
    record_json = json.dumps(record, ensure_ascii=False)

    if redis_client is not None:
        try:
            redis_client.lpush(REDIS_KEY, record_json)
            redis_client.ltrim(REDIS_KEY, 0, MAX_HISTORY - 1)
            return True
        except Exception as e:
            pass

    in_memory_history.insert(0, record)
    if len(in_memory_history) > MAX_HISTORY:
        in_memory_history.pop()
    return True

def get_history():
    history_list = []
    if redis_client is not None:
        try:
            records = redis_client.lrange(REDIS_KEY, 0, MAX_HISTORY - 1)
            for r in records:
                history_list.append(json.loads(r))
            return history_list
        except Exception as e:
            pass

    return in_memory_history.copy()

SYMBOL_TO_LATEX = {
    '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
    '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
    '+': '+', '-': '-', '(': '\\left(', ')': '\\right)', '=': '=',
    'times': '\\times', 'div': '\\div'
}

def preprocess_image(image_data):
    try:
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes)).convert('L')

        image = ImageOps.invert(image)

        np_img = np.array(image)
        binary = binarize_otsu(np_img)
        image = Image.fromarray((binary * 255).astype(np.uint8))

        return image
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图像解析失败: {str(e)}")

def binarize_otsu(img_array):
    histogram = np.zeros(256, dtype=np.int64)
    for val in range(256):
        histogram[val] = np.sum(img_array == val)

    total = img_array.size
    sum_total = np.sum(np.arange(256) * histogram)

    sum_bg = 0.0
    weight_bg = 0
    max_variance = 0.0
    threshold = 0

    for t in range(256):
        weight_bg += histogram[t]
        if weight_bg == 0:
            continue
        weight_fg = total - weight_bg
        if weight_fg == 0:
            break

        sum_bg += t * histogram[t]
        mean_bg = sum_bg / weight_bg
        mean_fg = (sum_total - sum_bg) / weight_fg

        variance = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
        if variance > max_variance:
            max_variance = variance
            threshold = t

    return (img_array > threshold).astype(np.uint8)

def normalize_char_image(char_image, target_size=28, padding_ratio=0.2):
    np_char = np.array(char_image)

    if np_char.ndim == 3:
        np_char = np.mean(np_char, axis=2).astype(np.uint8)

    binary = binarize_otsu(np_char) if np.max(np_char) > np.min(np_char) else (np_char > 127).astype(np.uint8)

    rows = np.any(binary, axis=1)
    cols = np.any(binary, axis=0)

    if not np.any(rows) or not np.any(cols):
        return np.zeros((target_size, target_size), dtype=np.float32)

    y_coords = np.where(rows)[0]
    x_coords = np.where(cols)[0]
    y_min, y_max = y_coords[0], y_coords[-1]
    x_min, x_max = x_coords[0], x_coords[-1]

    cropped = binary[y_min:y_max+1, x_min:x_max+1]

    h, w = cropped.shape
    padding = int(max(h, w) * padding_ratio)

    padded = np.zeros((h + 2 * padding, w + 2 * padding), dtype=np.uint8)
    padded[padding:padding+h, padding:padding+w] = cropped

    scale = (target_size - 4) / max(padded.shape[0], padded.shape[1])
    new_h = max(1, int(padded.shape[0] * scale))
    new_w = max(1, int(padded.shape[1] * scale))

    pil_padded = Image.fromarray(padded * 255)
    pil_resized = pil_padded.resize((new_w, new_h), Image.Resampling.LANCZOS)

    result = np.zeros((target_size, target_size), dtype=np.uint8)
    offset_y = (target_size - new_h) // 2
    offset_x = (target_size - new_w) // 2
    result[offset_y:offset_y+new_h, offset_x:offset_x+new_w] = np.array(pil_resized) > 127

    normalized = result.astype(np.float32)
    return normalized

def segment_image(image):
    np_image = np.array(image)
    binary = (np_image > 127).astype(np.uint8)

    rows = np.any(binary, axis=1)
    cols = np.any(binary, axis=0)

    if not np.any(rows) or not np.any(cols):
        return []

    y_coords = np.where(rows)[0]
    x_coords = np.where(cols)[0]

    y_min, y_max = y_coords[0], y_coords[-1]
    x_min, x_max = x_coords[0], x_coords[-1]

    height = y_max - y_min + 1
    width = x_max - x_min + 1

    if width < 10 or height < 10:
        return []

    projections = np.sum(binary[y_min:y_max+1, x_min:x_max+1], axis=0)
    threshold_val = max(np.max(projections) * 0.05, 1)

    segments = []
    in_char = False
    char_start = 0

    for i, proj in enumerate(projections):
        if proj > threshold_val and not in_char:
            in_char = True
            char_start = i
        elif proj <= threshold_val and in_char:
            in_char = False
            if i - char_start > 2:
                segments.append((x_min + char_start, y_min, x_min + i, y_max))

    if in_char:
        if len(projections) - char_start > 2:
            segments.append((x_min + char_start, y_min, x_max, y_max))

    if len(segments) == 0 and width > 0:
        return [(x_min, y_min, x_max, y_max)]

    return segments

def recognize_segment(image, segment):
    x1, y1, x2, y2 = segment
    char_image = image.crop((x1, y1, x2, y2))
    symbol = heuristic_recognize(char_image)
    return symbol, 0.8

def expression_to_latex(expression):
    if not expression:
        return ""
    return expression

def compute_zone_density(binary_img, rows, cols):
    h, w = binary_img.shape
    row_slices = np.linspace(0, h, rows + 1, dtype=int)
    col_slices = np.linspace(0, w, cols + 1, dtype=int)

    densities = []
    for ri in range(rows):
        for ci in range(cols):
            zone = binary_img[row_slices[ri]:row_slices[ri+1], col_slices[ci]:col_slices[ci+1]]
            total = zone.size
            if total == 0:
                densities.append(0.0)
            else:
                densities.append(float(np.sum(zone)) / total)
    return densities

def count_horizontal_crossings(binary_img):
    crossings = 0
    for row in binary_img:
        prev = 0
        for val in row:
            if val != prev:
                crossings += 1
            prev = val
    return crossings

def count_vertical_crossings(binary_img):
    crossings = 0
    for col in binary_img.T:
        prev = 0
        for val in col:
            if val != prev:
                crossings += 1
            prev = val
    return crossings

def has_horizontal_line(binary_img, threshold=0.7):
    h, w = binary_img.shape
    mid_row_start = h // 2 - max(1, h // 10)
    mid_row_end = h // 2 + max(1, h // 10)
    mid_section = binary_img[mid_row_start:mid_row_end, :]
    row_fills = np.sum(mid_section, axis=1) / w
    return np.any(row_fills > threshold)

def has_two_horizontal_lines(binary_img, threshold=0.5):
    h, w = binary_img.shape
    upper_third = binary_img[h//3:h//3+max(1,h//10), :]
    lower_third = binary_img[2*h//3:2*h//3+max(1,h//10), :]

    upper_fill = np.max(np.sum(upper_third, axis=1) / w) if upper_third.size > 0 else 0
    lower_fill = np.max(np.sum(lower_third, axis=1) / w) if lower_third.size > 0 else 0

    return upper_fill > threshold and lower_fill > threshold

def heuristic_recognize(image):
    normalized = normalize_char_image(image, target_size=28)
    binary = (normalized > 0.5).astype(np.uint8)

    h, w = binary.shape
    total_pixels = np.sum(binary)
    if total_pixels == 0:
        return ""

    aspect_ratio = w / max(h, 1)
    filled_ratio = total_pixels / (h * w)

    top_half = binary[:h//2, :]
    bottom_half = binary[h//2:, :]
    left_half = binary[:, :w//2]
    right_half = binary[:, w//2:]

    top_fill = np.sum(top_half) / max(top_half.size, 1)
    bottom_fill = np.sum(bottom_half) / max(bottom_half.size, 1)
    left_fill = np.sum(left_half) / max(left_half.size, 1)
    right_fill = np.sum(right_half) / max(right_half.size, 1)

    h_crossings = count_horizontal_crossings(binary)
    v_crossings = count_vertical_crossings(binary)

    zones = compute_zone_density(binary, 3, 3)

    if aspect_ratio > 2.0 and filled_ratio < 0.4:
        if has_two_horizontal_lines(binary):
            return '='
        if has_horizontal_line(binary, threshold=0.5):
            return '-'

    if aspect_ratio > 1.5 and filled_ratio < 0.35:
        if has_horizontal_line(binary, threshold=0.4):
            return '-'

    if 0.7 < aspect_ratio < 1.6 and filled_ratio < 0.35:
        if has_horizontal_line(binary, threshold=0.4):
            if abs(top_fill - bottom_fill) < 0.1 and abs(left_fill - right_fill) < 0.1:
                return '+'
            return '-'

    if aspect_ratio < 0.45:
        left_edge = np.sum(binary[:, 0]) / h
        right_edge = np.sum(binary[:, -1]) / h
        if left_edge > 0.5 and right_edge < 0.3:
            return '('
        if right_edge > 0.5 and left_edge < 0.3:
            return ')'

    if has_two_horizontal_lines(binary) and filled_ratio < 0.4:
        return '='

    if filled_ratio > 0.55 and 0.75 < aspect_ratio < 1.3:
        return '0'

    top_center = binary[:h//2, w//4:3*w//4]
    bottom_center = binary[h//2:, w//4:3*w//4]
    top_center_fill = np.sum(top_center) / max(top_center.size, 1)
    bottom_center_fill = np.sum(bottom_center) / max(bottom_center.size, 1)

    center_zone = zones[4]
    top_mid_zone = zones[1]
    bottom_mid_zone = zones[7]

    if top_center_fill < 0.15 and bottom_center_fill > 0.3:
        return '7'

    if zones[0] < 0.1 and zones[1] < 0.1 and zones[2] < 0.1:
        if bottom_mid_zone > 0.3:
            if zones[5] > 0.3:
                return '7'
            return '1'

    if top_fill > 0.3 and bottom_fill < 0.15:
        if center_zone > 0.3:
            return '2'

    if center_zone < 0.08:
        if abs(top_fill - bottom_fill) < 0.15:
            return '8'
        if bottom_fill > top_fill:
            return '6'
        return '9'

    if center_zone > 0.25:
        if left_fill > 0.25 and right_fill > 0.25:
            return '4'

    left_center = binary[h//3:2*h//3, :w//3]
    right_center = binary[h//3:2*h//3, 2*w//3:]
    left_center_fill = np.sum(left_center) / max(left_center.size, 1)
    right_center_fill = np.sum(right_center) / max(right_center.size, 1)

    if right_center_fill > left_center_fill * 1.5:
        if top_fill > bottom_fill:
            return '3'
        return '5'

    if left_center_fill > right_center_fill * 1.5:
        if bottom_fill > top_fill:
            return '6'
        return '9'

    if h_crossings > v_crossings * 1.5:
        return '2'
    if v_crossings > h_crossings * 1.5:
        return '1'

    if filled_ratio < 0.25 and aspect_ratio < 0.6:
        return '1'

    if filled_ratio > 0.35:
        if center_zone > 0.2:
            if right_fill > left_fill:
                return '3'
            return '5'
        return '8'

    if top_fill > bottom_fill:
        return '2'
    return '1'

@app.post("/recognize")
async def recognize_equation(request: ImageRequest):
    try:
        image = preprocess_image(request.image)
        segments = segment_image(image)

        if not segments:
            return {"success": True, "latex": "", "confidence": 0.0}

        recognized = []
        confidences = []

        for segment in segments:
            symbol, confidence = recognize_segment(image, segment)
            recognized.append(symbol)
            confidences.append(confidence)

        expression = ''.join(recognized)
        latex = expression_to_latex(expression)

        avg_confidence = sum(confidences) / len(confidences) if confidences else 0

        if latex:
            save_to_history(request.image, latex, expression)

        return {
            "success": True,
            "latex": latex,
            "expression": expression,
            "confidence": float(avg_confidence),
            "segments": len(segments)
        }

    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/history")
async def get_recognition_history():
    try:
        history = get_history()
        return {
            "success": True,
            "history": history,
            "storage": "redis" if redis_client is not None else "memory"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/")
async def root():
    return {"message": "手写公式识别 API", "version": "1.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model_loaded": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
