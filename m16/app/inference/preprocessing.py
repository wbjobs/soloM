import cv2
import numpy as np
from numpy.typing import NDArray


def preprocess_for_dbnet(
    img: NDArray[np.uint8],
    short_side: int = 736,
) -> tuple[NDArray[np.float32], tuple[int, int], tuple[float, float]]:
    h, w = img.shape[:2]
    scale = short_side / min(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    new_w = new_w + (32 - new_w % 32) if new_w % 32 else new_w
    new_h = new_h + (32 - new_h % 32) if new_h % 32 else new_h
    resized = cv2.resize(img, (new_w, new_h))
    blob = resized.astype(np.float32)
    blob = (blob - [123.675, 116.28, 103.53]) / [58.395, 57.12, 57.375]
    blob = blob.transpose(2, 0, 1)[np.newaxis].astype(np.float32)
    return blob, (h, w), (scale, scale)


def postprocess_dbnet(
    prob_map: NDArray[np.float32],
    orig_size: tuple[int, int],
    scale: tuple[float, float],
    bin_thresh: float = 0.3,
    box_thresh: float = 0.5,
    max_candidates: int = 1000,
    min_box_size: int = 5,
) -> list[NDArray[np.float32]]:
    src_h, src_w = orig_size
    pred = (prob_map > bin_thresh).astype(np.uint8)
    contours, _ = cv2.findContours(pred, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for contour in contours[:max_candidates]:
        if len(contour) < 4:
            continue
        rect = cv2.minAreaRect(contour)
        box = cv2.boxPoints(rect)
        box = np.array(box, dtype=np.float32)
        area = cv2.contourArea(contour)
        if area < min_box_size:
            continue
        score = _box_score(prob_map, contour)
        if score < box_thresh:
            continue
        box[:, 0] = np.clip(box[:, 0] / scale[1], 0, src_w)
        box[:, 1] = np.clip(box[:, 1] / scale[0], 0, src_h)
        boxes.append(box)
    return boxes


def _box_score(
    prob_map: NDArray[np.float32],
    contour: NDArray[np.int32],
) -> float:
    h, w = prob_map.shape
    x_min = max(int(np.min(contour[:, 0, 0])), 0)
    x_max = min(int(np.max(contour[:, 0, 0])) + 1, w)
    y_min = max(int(np.min(contour[:, 0, 1])), 0)
    y_max = min(int(np.max(contour[:, 0, 1])) + 1, h)
    if x_max <= x_min or y_max <= y_min:
        return 0.0
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [contour.reshape(-1, 2)], 1)
    region = prob_map[y_min:y_max, x_min:x_max]
    mask_region = mask[y_min:y_max, x_min:x_max]
    if mask_region.sum() == 0:
        return 0.0
    return float((region * mask_region).sum() / mask_region.sum())


def order_box_points(box: NDArray[np.float32]) -> NDArray[np.float32]:
    rect = np.zeros((4, 2), dtype=np.float32)
    s = box.sum(axis=1)
    rect[0] = box[np.argmin(s)]
    rect[2] = box[np.argmax(s)]
    diff = np.diff(box, axis=1)
    rect[1] = box[np.argmin(diff)]
    rect[3] = box[np.argmax(diff)]
    return rect


def crop_text_region(
    img: NDArray[np.uint8],
    box: NDArray[np.float32],
    target_height: int = 32,
) -> NDArray[np.float32]:
    rect = order_box_points(box)
    w_top = np.linalg.norm(rect[0] - rect[1])
    w_bottom = np.linalg.norm(rect[3] - rect[2])
    max_w = int(max(w_top, w_bottom))
    h_left = np.linalg.norm(rect[0] - rect[3])
    h_right = np.linalg.norm(rect[1] - rect[2])
    max_h = int(max(h_left, h_right))
    if max_w < 1 or max_h < 1:
        return np.zeros((target_height, target_height), dtype=np.float32)
    dst = np.array(
        [
            [0, 0],
            [max_w - 1, 0],
            [max_w - 1, max_h - 1],
            [0, max_h - 1],
        ],
        dtype=np.float32,
    )
    M = cv2.getPerspectiveTransform(rect, dst)
    cropped = cv2.warpPerspective(img, M, (max_w, max_h))
    scale = target_height / max_h
    resized_w = max(int(max_w * scale), 1)
    resized = cv2.resize(cropped, (resized_w, target_height))
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if len(resized.shape) == 3 else resized
    normalized = (gray.astype(np.float32) / 255.0 - 0.5) / 0.5
    return normalized[np.newaxis, :, :].astype(np.float32)
