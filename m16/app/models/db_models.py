import datetime
from sqlalchemy import Boolean, DateTime, Integer, String, Float, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class OcrResult(Base):
    __tablename__ = "ocr_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_url: Mapped[str] = mapped_column(String(512), nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    kv_data: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    boxes: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    invoice_date: Mapped[datetime.date | None] = mapped_column(DateTime, nullable=True)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    corrected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    original_kv_data: Mapped[str] = mapped_column(Text, nullable=True)
    original_boxes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime, onupdate=func.now(), nullable=True
    )


class FinetuneTask(Base):
    __tablename__ = "finetune_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    trigger_source: Mapped[str] = mapped_column(String(64), nullable=False, default="manual_correction")
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    log: Mapped[str] = mapped_column(Text, nullable=False, default="")
    started_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
