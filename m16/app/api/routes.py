import asyncio
import datetime
import json

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.ocr_schemas import (
    FinetuneTaskResponse,
    OcrCorrectionRequest,
    OcrQueryParams,
    OcrResultListResponse,
    OcrResultResponse,
    OcrUploadResponse,
    TextBoxData,
)
from app.services import ocr_service
from app.services.finetune_service import create_finetune_task, run_finetune_simulation

router = APIRouter(prefix="/api/v1/ocr", tags=["OCR"])


def _record_to_response(r) -> OcrResultResponse:
    boxes_raw = json.loads(r.boxes) if r.boxes else []
    boxes = [TextBoxData(text=b.get("text", ""), box=b.get("box", [])) for b in boxes_raw]
    return OcrResultResponse(
        id=r.id,
        image_url=r.image_url,
        raw_text=r.raw_text,
        kv_data=json.loads(r.kv_data),
        boxes=boxes,
        invoice_date=r.invoice_date,
        amount=r.amount,
        corrected=r.corrected,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


@router.post("/upload", response_model=OcrUploadResponse, summary="上传票据图片并识别")
async def upload_invoice(
    file: UploadFile = File(..., description="票据图片文件"),
    db: Session = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持图片文件上传")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="上传文件为空")

    try:
        record = ocr_service.process_ocr(file_bytes, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR 处理失败: {e}")

    boxes_raw = json.loads(record.boxes) if record.boxes else []
    boxes = [TextBoxData(text=b.get("text", ""), box=b.get("box", [])) for b in boxes_raw]

    return OcrUploadResponse(
        id=record.id,
        image_url=record.image_url,
        raw_text=record.raw_text,
        kv_data=json.loads(record.kv_data),
        boxes=boxes,
        invoice_date=record.invoice_date,
        amount=record.amount,
    )


@router.get("/results", response_model=OcrResultListResponse, summary="查询识别结果")
async def list_results(
    start_date: datetime.date | None = Query(None, description="起始日期"),
    end_date: datetime.date | None = Query(None, description="结束日期"),
    min_amount: float | None = Query(None, description="最小金额"),
    max_amount: float | None = Query(None, description="最大金额"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total = ocr_service.query_results(
        db,
        start_date=start_date,
        end_date=end_date,
        min_amount=min_amount,
        max_amount=max_amount,
        offset=offset,
        limit=limit,
    )
    return OcrResultListResponse(
        total=total,
        items=[_record_to_response(r) for r in items],
    )


@router.get("/results/{result_id}", response_model=OcrResultResponse, summary="获取单条识别结果")
async def get_result(result_id: int, db: Session = Depends(get_db)):
    record = ocr_service.get_result(db, result_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return _record_to_response(record)


@router.put("/results/{result_id}", response_model=OcrResultResponse, summary="修正识别结果")
async def correct_result(
    result_id: int,
    correction: OcrCorrectionRequest,
    db: Session = Depends(get_db),
):
    try:
        record = ocr_service.apply_correction(db, result_id, correction)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _record_to_response(record)


@router.delete("/results/{result_id}", summary="删除识别结果")
async def delete_result(result_id: int, db: Session = Depends(get_db)):
    record = ocr_service.get_result(db, result_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    db.delete(record)
    db.commit()
    return {"detail": "删除成功"}


@router.post("/finetune", response_model=FinetuneTaskResponse, summary="触发增量微调任务")
async def trigger_finetune(
    background_tasks: BackgroundTasks,
    trigger_source: str = Query("manual_correction", description="触发来源"),
    db: Session = Depends(get_db),
):
    task = create_finetune_task(db, trigger_source)
    background_tasks.add_task(_run_finetune_bg, task.id, db)
    return FinetuneTaskResponse.model_validate(task)


@router.get("/finetune", response_model=list[FinetuneTaskResponse], summary="查询微调任务列表")
async def list_finetune_tasks(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    tasks = ocr_service.list_finetune_tasks(db, limit)
    return [FinetuneTaskResponse.model_validate(t) for t in tasks]


@router.get("/finetune/{task_id}", response_model=FinetuneTaskResponse, summary="查询微调任务详情")
async def get_finetune_task(task_id: int, db: Session = Depends(get_db)):
    task = ocr_service.get_finetune_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="微调任务不存在")
    return FinetuneTaskResponse.model_validate(task)


async def _run_finetune_bg(task_id: int, db: Session):
    from app.db.database import SessionLocal
    bg_db = SessionLocal()
    try:
        await run_finetune_simulation(bg_db, task_id)
    finally:
        bg_db.close()
