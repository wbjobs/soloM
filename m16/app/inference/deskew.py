import cv2
import numpy as np
from numpy.typing import NDArray


def detect_skew_angle(
    img: NDArray[np.uint8],
    angle_range: float = 45.0,
    angle_step: float = 0.5,
) -> float:
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 50, 150, apertureSize=3)

    rho = 1
    theta = np.pi / 180 * angle_step
    threshold = 50
    min_line_length = min(gray.shape) * 0.1
    max_line_gap = 10

    lines = cv2.HoughLinesP(
        edges,
        rho,
        theta,
        threshold,
        minLineLength=min_line_length,
        maxLineGap=max_line_gap,
    )

    if lines is None:
        return 0.0

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
        angle = np.round(angle / angle_step) * angle_step
        if -angle_range <= angle <= angle_range and abs(angle) > 0.1:
            angles.append(angle)

    if not angles:
        return 0.0

    hist, bins = np.histogram(angles, bins=50)
    best_idx = np.argmax(hist)
    best_angle = (bins[best_idx] + bins[best_idx + 1]) / 2

    if abs(best_angle) < 0.3:
        return 0.0

    return float(best_angle)


def rotate_image(
    img: NDArray[np.uint8],
    angle: float,
) -> tuple[NDArray[np.uint8], NDArray[np.float64], tuple[int, int]]:
    h, w = img.shape[:2]
    center = (w / 2, h / 2)

    radians = np.radians(angle)
    sin = abs(np.sin(radians))
    cos = abs(np.cos(radians))
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)

    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    M[0, 2] += (new_w - w) / 2
    M[1, 2] += (new_h - h) / 2

    rotated = cv2.warpAffine(
        img, M, (new_w, new_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )

    return rotated, M, (new_w, new_h)


def invert_rotation_matrix(
    M: NDArray[np.float64],
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> NDArray[np.float64]:
    M_inv = cv2.invertAffineTransform(M)
    M_inv[0, 2] -= offset_x
    M_inv[1, 2] -= offset_y
    return M_inv


def transform_box(
    box: NDArray[np.float32],
    M: NDArray[np.float64],
) -> NDArray[np.float32]:
    pts = box.reshape(-1, 2)
    ones = np.ones((len(pts), 1), dtype=np.float64)
    pts_h = np.hstack([pts, ones])
    transformed = pts_h @ M.T
    return transformed.reshape(4, 2).astype(np.float32)


def deskew_image(
    img: NDArray[np.uint8],
    max_angle: float = 45.0,
    threshold_deg: float = 0.5,
) -> tuple[NDArray[np.uint8], dict]:
    angle = detect_skew_angle(img, angle_range=max_angle)

    info = {
        "detected_angle": angle,
        "applied_angle": 0.0,
        "rotated": False,
        "M": np.eye(2, 3, dtype=np.float64),
        "M_inv": np.eye(2, 3, dtype=np.float64),
        "orig_size": img.shape[:2],
        "new_size": img.shape[:2],
    }

    if abs(angle) <= threshold_deg:
        return img, info

    rotated, M, new_size = rotate_image(img, angle)
    M_inv = cv2.invertAffineTransform(M)

    info["applied_angle"] = angle
    info["rotated"] = True
    info["M"] = M
    info["M_inv"] = M_inv
    info["new_size"] = (new_size[1], new_size[0])

    return rotated, info


def deskew_box_to_original(
    box: NDArray[np.float32],
    deskew_info: dict,
) -> NDArray[np.float32]:
    if not deskew_info.get("rotated", False):
        return box
    return transform_box(box, deskew_info["M_inv"])
