from __future__ import annotations

import datetime
import json
import logging
import re
import uuid
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.inference.pipeline import OCRPipeline, TextBox
from app.models.db_models import OcrResult, FinetuneTask
from app.services.kv_clustering import cluster_key_value_pairs, pairs_to_dict
from app.schemas.ocr_schemas import TextBoxData, OcrCorrectionRequest

logger = logging.getLogger(__name__)

_pipeline: OCRPipeline | None = None

_AMOUNT_RE = re.compile(r"[\d,]+\.\d{2}")
_DATE_RE = re.compile(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})")


def get_pipeline() -> OCRPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = OCRPipeline()
    return _pipeline


def preprocess_image(img: NDArray[np.uint8]) -> NDArray[np.uint8]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def save_upload(file_bytes: bytes, suffix: str = ".png") -> str:
    filename = f"{uuid.uuid4().hex}{suffix}"
    filepath = Path(settings.UPLOAD_DIR) / filename
    filepath.write_bytes(file_bytes)
    return f"/uploads/{filename}"


def extract_amount(kv: dict[str, str]) -> float | None:
    for key in ("金额", "合计", "总计", "价税合计", "金额_2", "金额_3"):
        if key in kv:
            m = _AMOUNT_RE.search(kv[key].replace(",", ""))
            if m:
                try:
                    return float(m.group().replace(",", ""))
                except ValueError:
                    continue
    for val in kv.values():
        m = _AMOUNT_RE.search(val.replace(",", ""))
        if m:
            try:
                return float(m.group().replace(",", ""))
            except ValueError:
                continue
    return None


def extract_date(kv: dict[str, str]) -> datetime.date | None:
    for key in ("日期", "开票日期", "日期_2"):
        if key in kv:
            m = _DATE_RE.search(kv[key])
            if m:
                try:
                    return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                except ValueError:
                    continue
    for val in kv.values():
        m = _DATE_RE.search(val)
        if m:
            try:
                return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except ValueError:
                continue
    return None


def process_ocr(file_bytes: bytes, db: Session) -> OcrResult:
    nparr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("无法解码上传的图片")

    preprocessed = preprocess_image(img)

    pipeline = get_pipeline()
    text_boxes: list[TextBox] = pipeline.run(preprocessed)

    if not text_boxes:
        text_boxes_raw = pipeline.run(img)
        text_boxes = text_boxes_raw

    raw_text = "\n".join(tb.text for tb in text_boxes)
    kv_pairs = cluster_key_value_pairs(text_boxes)
    kv_dict = pairs_to_dict(kv_pairs)

    boxes_data = [
        {"text": tb.text, "box": tb.box.tolist()}
        for tb in text_boxes
    ]

    image_url = save_upload(file_bytes)
    amount = extract_amount(kv_dict)
    invoice_date = extract_date(kv_dict)

    record = OcrResult(
        image_url=image_url,
        raw_text=raw_text,
        kv_data=json.dumps(kv_dict, ensure_ascii=False),
        boxes=json.dumps(boxes_data, ensure_ascii=False),
        invoice_date=invoice_date,
        amount=amount,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def query_results(
    db: Session,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    offset: int = 0,
    limit: int = 20,
) -> tuple[list[OcrResult], int]:
    q = db.query(OcrResult)
    if start_date:
        q = q.filter(OcrResult.invoice_date >= start_date)
    if end_date:
        q = q.filter(OcrResult.invoice_date <= end_date)
    if min_amount is not None:
        q = q.filter(OcrResult.amount >= min_amount)
    if max_amount is not None:
        q = q.filter(OcrResult.amount <= max_amount)

    total = q.count()
    items = q.order_by(OcrResult.created_at.desc()).offset(offset).limit(limit).all()
    return items, total


def get_result(db: Session, result_id: int) -> OcrResult | None:
    return db.query(OcrResult).filter(OcrResult.id == result_id).first()


def apply_correction(
    db: Session,
    result_id: int,
    correction: OcrCorrectionRequest,
) -> OcrResult:
    record = get_result(db, result_id)
    if not record:
        raise ValueError("记录不存在")

    if not record.corrected:
        record.original_kv_data = record.kv_data
        record.original_boxes = record.boxes

    if correction.kv_data is not None:
        record.kv_data = json.dumps(correction.kv_data, ensure_ascii=False)
        record.raw_text = "\n".join(f"{k}: {v}" for k, v in correction.kv_data.items())
        amount = extract_amount(correction.kv_data)
        invoice_date = extract_date(correction.kv_data)
        if amount is not None:
            record.amount = amount
        if invoice_date is not None:
            record.invoice_date = invoice_date

    if correction.boxes is not None:
        boxes_data = [
            {"text": tb.text, "box": tb.box}
            for tb in correction.boxes
        ]
        record.boxes = json.dumps(boxes_data, ensure_ascii=False)

    record.corrected = True
    db.commit()
    db.refresh(record)
    return record


def get_corrected_count(db: Session) -> int:
    return db.query(OcrResult).filter(OcrResult.corrected == True).count()


def get_finetune_task(db: Session, task_id: int) -> FinetuneTask | None:
    return db.query(FinetuneTask).filter(FinetuneTask.id == task_id).first()


def list_finetune_tasks(db: Session, limit: int = 20) -> list[FinetuneTask]:
    return db.query(FinetuneTask).order_by(FinetuneTask.created_at.desc()).limit(limit).all()
