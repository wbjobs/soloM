from __future__ import annotations

import datetime

from pydantic import BaseModel, Field


class TextBoxData(BaseModel):
    text: str
    box: list[list[float]]


class OcrResultResponse(BaseModel):
    id: int
    image_url: str
    raw_text: str
    kv_data: dict[str, str]
    boxes: list[TextBoxData] = []
    invoice_date: datetime.date | None = None
    amount: float | None = None
    corrected: bool = False
    created_at: datetime.datetime
    updated_at: datetime.datetime | None = None

    model_config = {"from_attributes": True}


class OcrResultListResponse(BaseModel):
    total: int
    items: list[OcrResultResponse]


class OcrUploadResponse(BaseModel):
    id: int
    image_url: str
    raw_text: str
    kv_data: dict[str, str]
    boxes: list[TextBoxData] = []
    invoice_date: datetime.date | None = None
    amount: float | None = None


class OcrCorrectionRequest(BaseModel):
    kv_data: dict[str, str] | None = None
    boxes: list[TextBoxData] | None = None


class FinetuneTaskResponse(BaseModel):
    id: int
    status: str
    trigger_source: str
    sample_count: int
    log: str
    started_at: datetime.datetime | None = None
    finished_at: datetime.datetime | None = None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class OcrQueryParams(BaseModel):
    start_date: datetime.date | None = Field(None, description="筛选起始日期")
    end_date: datetime.date | None = Field(None, description="筛选结束日期")
    min_amount: float | None = Field(None, description="最小金额")
    max_amount: float | None = Field(None, description="最大金额")
    offset: int = Field(0, ge=0)
    limit: int = Field(20, ge=1, le=100)
