import logging
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

try:
    import onnxruntime as ort
    _ORT_AVAILABLE = True
except ImportError:
    ort = None
    _ORT_AVAILABLE = False

from app.config import settings
from app.inference.preprocessing import (
    crop_text_region,
    postprocess_dbnet,
    preprocess_for_dbnet,
)

logger = logging.getLogger(__name__)


class DBNetDetector:
    def __init__(self, model_path: str | None = None):
        self._session = None
        if not _ORT_AVAILABLE:
            logger.warning("onnxruntime not available, DBNet using dummy mode")
            return
        path = model_path or settings.DBNET_ONNX_PATH
        if not Path(path).exists():
            logger.warning("DBNet model not found at %s, using dummy mode", path)
            return
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        opts.inter_op_num_threads = 1
        self._session = ort.InferenceSession(
            path,
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        self._input_name = self._session.get_inputs()[0].name
        logger.info("DBNet loaded from %s", path)

    @property
    def available(self) -> bool:
        return self._session is not None

    def detect(
        self,
        img: NDArray[np.uint8],
        bin_thresh: float = 0.3,
        box_thresh: float = 0.5,
    ) -> list[NDArray[np.float32]]:
        if not self.available:
            return self._dummy_detect(img)
        blob, orig_size, scale = preprocess_for_dbnet(img)
        outputs = self._session.run(None, {self._input_name: blob})
        prob_map = outputs[0][0, 0]
        boxes = postprocess_dbnet(prob_map, orig_size, scale, bin_thresh, box_thresh)
        return boxes

    def _dummy_detect(self, img: NDArray[np.uint8]) -> list[NDArray[np.float32]]:
        h, w = img.shape[:2]
        box = np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.float32)
        return [box]
