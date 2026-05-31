import json
import os
from typing import List, Dict, Any, AsyncGenerator
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse
import aiofiles

from app.core.config import UPLOAD_PATH
from app.models.schemas import (
    FinetuneConfig,
    FinetuneTask,
    FinetuneTaskListResponse,
    FinetuneStatusResponse,
    StartFinetuneResponse,
    DatasetInfo,
    DatasetListResponse,
    DatasetUploadResponse,
    DeleteDatasetResponse,
    CancelFinetuneResponse,
    LossPoint,
)
from app.services.dataset_manager import dataset_manager
from app.services.lora_finetune import finetune_engine

router = APIRouter(prefix="/finetune", tags=["finetune"])


@router.get("/datasets", response_model=DatasetListResponse)
async def list_datasets():
    datasets = dataset_manager.list_datasets()
    return DatasetListResponse(datasets=datasets)


@router.get("/datasets/{dataset_id}", response_model=DatasetInfo)
async def get_dataset(dataset_id: str):
    dataset = dataset_manager.get_dataset_info(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("/datasets/{dataset_id}/stats")
async def get_dataset_stats(dataset_id: str):
    try:
        stats = dataset_manager.validate_dataset(dataset_id)
        return stats
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/datasets/upload", response_model=DatasetUploadResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    dataset_name: str = Query(None, description="数据集名称"),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    allowed_extensions = {".jsonl", ".csv"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    temp_file_path = UPLOAD_PATH / f"temp_{file.filename}"
    
    try:
        async with aiofiles.open(temp_file_path, "wb") as f:
            content = await file.read()
            await f.write(content)
        
        dataset_id, total_samples = dataset_manager.upload_dataset(
            str(temp_file_path),
            file.filename,
            dataset_name
        )
        
        return DatasetUploadResponse(
            success=True,
            message=f"Dataset '{file.filename}' uploaded successfully",
            dataset_id=dataset_id,
            total_samples=total_samples,
            file_name=file.filename,
        )
    except ValueError as e:
        if temp_file_path.exists():
            os.remove(temp_file_path)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if temp_file_path.exists():
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=f"Error processing dataset: {str(e)}")


@router.delete("/datasets/{dataset_id}", response_model=DeleteDatasetResponse)
async def delete_dataset(dataset_id: str):
    success = dataset_manager.delete_dataset(dataset_id)
    if not success:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return DeleteDatasetResponse(
        success=True,
        message=f"Dataset '{dataset_id}' deleted successfully"
    )


@router.get("/tasks", response_model=FinetuneTaskListResponse)
async def list_finetune_tasks():
    tasks_data = finetune_engine.list_tasks()
    
    tasks = []
    for task_data in tasks_data:
        loss_history = []
        if "loss_history" in task_data and task_data["loss_history"]:
            if isinstance(task_data["loss_history"][0], dict):
                loss_history = [LossPoint(**lp) for lp in task_data["loss_history"]]
            else:
                loss_history = task_data["loss_history"]
        
        task = FinetuneTask(
            task_id=task_data["task_id"],
            dataset_id=task_data["dataset_id"],
            dataset_name=task_data["dataset_name"],
            base_model=task_data["base_model"],
            status=task_data["status"],
            config=task_data["config"],
            created_at=task_data["created_at"],
            started_at=task_data.get("started_at"),
            completed_at=task_data.get("completed_at"),
            current_epoch=task_data.get("current_epoch", 0),
            total_epochs=task_data.get("total_epochs", 0),
            current_step=task_data.get("current_step", 0),
            total_steps=task_data.get("total_steps", 0),
            loss_history=loss_history,
            error_message=task_data.get("error_message"),
            output_path=task_data.get("output_path"),
        )
        tasks.append(task)
    
    return FinetuneTaskListResponse(tasks=tasks)


@router.get("/tasks/{task_id}", response_model=FinetuneStatusResponse)
async def get_task_status(task_id: str):
    task_status = finetune_engine.get_task_status(task_id)
    if not task_status:
        raise HTTPException(status_code=404, detail="Task not found")
    
    loss_history = []
    if "loss_history" in task_status and task_status["loss_history"]:
        if isinstance(task_status["loss_history"][0], dict):
            loss_history = [LossPoint(**lp) for lp in task_status["loss_history"]]
        else:
            loss_history = task_status["loss_history"]
    
    return FinetuneStatusResponse(
        task_id=task_status["task_id"],
        status=task_status["status"],
        current_epoch=task_status.get("current_epoch", 0),
        total_epochs=task_status.get("total_epochs", 0),
        current_step=task_status.get("current_step", 0),
        total_steps=task_status.get("total_steps", 0),
        loss_history=loss_history,
        error_message=task_status.get("error_message"),
    )


@router.get("/tasks/{task_id}/stream")
async def stream_task_status(task_id: str):
    task_status = finetune_engine.get_task_status(task_id)
    if not task_status:
        raise HTTPException(status_code=404, detail="Task not found")
    
    async def event_generator() -> AsyncGenerator[str, None]:
        last_step = -1
        
        while True:
            status = finetune_engine.get_task_status(task_id)
            if not status:
                break
            
            current_step = status.get("current_step", 0)
            
            if current_step != last_step:
                last_step = current_step
                
                loss_history = []
                if "loss_history" in status and status["loss_history"]:
                    if isinstance(status["loss_history"][0], dict):
                        loss_history = [
                            {"step": lp["step"], "loss": lp["loss"], "epoch": lp.get("epoch")}
                            for lp in status["loss_history"]
                        ]
                    else:
                        loss_history = [
                            {"step": lp.step, "loss": lp.loss, "epoch": getattr(lp, "epoch", None)}
                            for lp in status["loss_history"]
                        ]
                
                data = {
                    "type": "status",
                    "data": {
                        "task_id": status["task_id"],
                        "status": status["status"],
                        "current_epoch": status.get("current_epoch", 0),
                        "total_epochs": status.get("total_epochs", 0),
                        "current_step": status.get("current_step", 0),
                        "total_steps": status.get("total_steps", 0),
                        "loss_history": loss_history,
                        "error_message": status.get("error_message"),
                    }
                }
                
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                
                if status["status"] in ["completed", "failed", "cancelled"]:
                    break
            
            import asyncio
            await asyncio.sleep(0.5)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/tasks/start", response_model=StartFinetuneResponse)
async def start_finetuning(config: FinetuneConfig):
    try:
        task_id, dataset_name = await finetune_engine.start_finetuning(config)
        return StartFinetuneResponse(
            success=True,
            message=f"Finetuning task started for dataset '{dataset_name}'",
            task_id=task_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error starting finetuning: {str(e)}")


@router.post("/tasks/{task_id}/cancel", response_model=CancelFinetuneResponse)
async def cancel_finetuning(task_id: str):
    success = finetune_engine.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found or cannot be cancelled")
    return CancelFinetuneResponse(
        success=True,
        message=f"Task '{task_id}' cancelled successfully"
    )


@router.get("/config/defaults")
async def get_default_config():
    from app.core.config import settings
    return {
        "base_model": settings.FINETUNE_BASE_MODEL,
        "num_epochs": settings.FINETUNE_NUM_EPOCHS,
        "batch_size": settings.FINETUNE_BATCH_SIZE,
        "learning_rate": settings.FINETUNE_LEARNING_RATE,
        "lora_r": settings.FINETUNE_LORA_R,
        "lora_alpha": settings.FINETUNE_LORA_ALPHA,
        "lora_dropout": settings.FINETUNE_LORA_DROPOUT,
        "max_seq_length": settings.FINETUNE_MAX_SEQ_LENGTH,
    }
