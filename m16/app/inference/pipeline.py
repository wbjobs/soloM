from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

from app.inference.dbnet import DBNetDetector
from app.inference.crnn import CRNNRecognizer
from app.inference.preprocessing import crop_text_region
from app.inference.deskew import deskew_image, deskew_box_to_original

logger = logging.getLogger(__name__)


@dataclass
class TextBox:
    box: NDArray[np.float32]
    text: str
    confidence: float = 1.0

    @property
    def center(self) -> tuple[float, float]:
        cx = float(self.box[:, 0].mean())
        cy = float(self.box[:, 1].mean())
        return cx, cy

    @property
    def left(self) -> float:
        return float(self.box[:, 0].min())

    @property
    def right(self) -> float:
        return float(self.box[:, 0].max())

    @property
    def top(self) -> float:
        return float(self.box[:, 1].min())

    @property
    def bottom(self) -> float:
        return float(self.box[:, 1].max())

    @property
    def angle(self) -> float:
        vec = self.box[1] - self.box[0]
        return float(np.arctan2(vec[1], vec[0]) * 180 / np.pi)


class OCRPipeline:
    def __init__(self):
        self.detector = DBNetDetector()
        self.recognizer = CRNNRecognizer()
        logger.info(
            "OCR Pipeline initialized — detector: %s, recognizer: %s",
            "ready" if self.detector.available else "dummy",
            "ready" if self.recognizer.available else "dummy",
        )

    def run(self, img: NDArray[np.uint8]) -> list[TextBox]:
        deskewed, deskew_info = deskew_image(img, max_angle=45.0, threshold_deg=1.0)
        detected_angle = deskew_info.get("detected_angle", 0.0)
        if abs(detected_angle) > 1.0:
            logger.info("Deskew applied: %.2f degrees", detected_angle)

        boxes = self.detector.detect(deskewed)
        if not boxes:
            return []

        if deskew_info.get("rotated", False):
            boxes = [deskew_box_to_original(box, deskew_info) for box in boxes]

        crops = []
        for box in boxes:
            crop = crop_text_region(img, box)
            crops.append(crop)

        texts = self.recognizer.recognize_batch(crops)

        results = []
        for box, text in zip(boxes, texts):
            if text.strip():
                results.append(TextBox(box=box, text=text.strip()))

        results.sort(key=lambda t: (t.top, t.left))
        return results
