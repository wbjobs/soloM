from __future__ import annotations

import asyncio
import datetime
import logging
import random

from sqlalchemy.orm import Session

from app.models.db_models import FinetuneTask
from app.services.ocr_service import get_corrected_count

logger = logging.getLogger(__name__)


def create_finetune_task(db: Session, trigger_source: str = "manual_correction") -> FinetuneTask:
    sample_count = get_corrected_count(db)
    task = FinetuneTask(
        status="pending",
        trigger_source=trigger_source,
        sample_count=sample_count,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    logger.info("Finetune task #%d created, %d corrected samples", task.id, sample_count)
    return task


async def run_finetune_simulation(db: Session, task_id: int) -> None:
    task = db.query(FinetuneTask).filter(FinetuneTask.id == task_id).first()
    if not task:
        return

    task.status = "running"
    task.started_at = datetime.datetime.now()
    db.commit()

    logs = []
    steps = [
        ("加载校正数据集...", 1.0),
        ("数据增强 (旋转/缩放/噪声)...", 1.5),
        ("构建训练 DataLoader...", 0.8),
        ("初始化 CRNN 模型权重...", 1.2),
        ("Epoch 1/3 — loss: 0.4523, lr: 1e-4", 2.0),
        ("Epoch 2/3 — loss: 0.2891, lr: 5e-5", 2.0),
        ("Epoch 3/3 — loss: 0.1537, lr: 1e-5", 2.0),
        ("评估验证集 — CER: 0.0312, ACC: 96.88%", 1.5),
        ("导出 ONNX 模型...", 1.0),
        ("模型校验通过，准备替换", 0.8),
    ]

    for msg, delay in steps:
        await asyncio.sleep(delay)
        logs.append(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}")
        task.log = "\n".join(logs)
        task.sample_count = get_corrected_count(db)
        db.commit()
        logger.info("Finetune #%d: %s", task_id, msg)

    task.status = "completed"
    task.finished_at = datetime.datetime.now()
    final_acc = round(0.95 + random.random() * 0.04, 4)
    logs.append(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] 微调完成 — 最终准确率: {final_acc*100:.2f}%")
    task.log = "\n".join(logs)
    db.commit()
    logger.info("Finetune task #%d completed, accuracy=%.2f%%", task_id, final_acc * 100)
