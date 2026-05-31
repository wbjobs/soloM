import logging
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

try:
    import onnxruntime as ort
    _ORT_AVAILABLE = True
except ImportError:
    ort = None
    _ORT_AVAILABLE = False

from app.config import settings

logger = logging.getLogger(__name__)

_CHARSET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .!@#$%^&*()_+-=[]{}|;':\",./<>?\u4e00\u4e01\u4e03\u4e07\u4e0a\u4e0b\u4e0d\u4e16\u4e1c\u4e24\u4e2a\u4e2d\u4e30\u4e3a\u4e3b\u4e49\u4e4b\u4e66\u4e8b\u4e8c\u4e94\u4ea7\u4eba\u4ec5\u4ece\u4ed6\u4eec\u4f1a\u4f17\u4f55\u5176\u4f5c\u5230\u5408\u540c\u5411\u547d\u540d\u548c\u56fd\u5730\u591a\u5927\u5929\u5b50\u5b66\u5b9a\u5b9e\u5bb6\u5bf9\u5c0f\u5c11\u5c31\u5f00\u65b0\u65e5\u660e\u6708\u6709\u672c\u6765\u6b63\u6c11\u51fa\u7684\u77e5\u65e0\u957f\u770b\u7ecf\u7edf\u800c\u8981\u5728\u4e2d\u5c31\u5408\u540c\u8d2d\u4e70\u9500\u552e\u4ef7\u683c\u91d1\u989d\u5355\u4f4d\u7a0e\u7387\u7f16\u53f7\u65e5\u671f\u5e10\u53f7\u5f00\u6237\u884c\u6b3e\u5f85\u9047\u6536\u6b3e\u4eba\u4ed8\u6b3e\u4eba\u5927\u5199\u5c0f\u5199\u5408\u8ba1\u4eba\u6c11\u5e01\u5143\u89d2\u5206\u6574"

_BLANK_IDX = len(_CHARSET)


class CRNNRecognizer:
    def __init__(self, model_path: str | None = None):
        self._session = None
        if not _ORT_AVAILABLE:
            logger.warning("onnxruntime not available, CRNN using dummy mode")
            return
        path = model_path or settings.CRNN_ONNX_PATH
        if not Path(path).exists():
            logger.warning("CRNN model not found at %s, using dummy mode", path)
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
        logger.info("CRNN loaded from %s", path)

    @property
    def available(self) -> bool:
        return self._session is not None

    def recognize(
        self,
        crop: NDArray[np.float32],
    ) -> str:
        if not self.available:
            return ""
        if crop.ndim == 2:
            crop = crop[np.newaxis, :, :]
        if crop.ndim == 3:
            crop = crop[np.newaxis, :, :, :]
        outputs = self._session.run(None, {self._input_name: crop.astype(np.float32)})
        logits = outputs[0][0]
        return self._ctc_decode(logits)

    def recognize_batch(
        self,
        crops: list[NDArray[np.float32]],
    ) -> list[str]:
        if not crops:
            return []
        if not self.available:
            return [""] * len(crops)
        max_w = max(c.shape[2] for c in crops)
        padded = np.zeros(
            (len(crops), 1, crops[0].shape[1], max_w),
            dtype=np.float32,
        )
        for i, c in enumerate(crops):
            padded[i, :, :, : c.shape[2]] = c
        outputs = self._session.run(None, {self._input_name: padded})
        results = []
        for i in range(len(crops)):
            logits = outputs[0][i]
            results.append(self._ctc_decode(logits))
        return results

    def _ctc_decode(self, logits: NDArray[np.float32]) -> str:
        pred = np.argmax(logits, axis=-1)
        chars = []
        prev = _BLANK_IDX
        for idx in pred:
            if idx != _BLANK_IDX and idx != prev:
                if idx < len(_CHARSET):
                    chars.append(_CHARSET[idx])
            prev = idx
        return "".join(chars)
