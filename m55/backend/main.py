from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db, KeyRecord
from task_queue import task_queue
from datetime import datetime
import subprocess
import tempfile
import os
import uuid

app = FastAPI(title="图像隐写平台 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class KeyCreate(BaseModel):
    key_name: str
    key_value: str
    description: str | None = None


class KeyResponse(BaseModel):
    id: int
    key_name: str
    key_value: str
    description: str | None
    created_at: datetime
    last_used: datetime | None

    class Config:
        from_attributes = True


@app.post("/api/compress", response_class=FileResponse)
async def compress_image(file: UploadFile = File(...), quality: int = 70):
    if quality < 1 or quality > 100:
        raise HTTPException(status_code=400, detail="质量参数需在 1-100 之间")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")

    input_data = await file.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as f_in:
        f_in.write(input_data)
        input_path = f_in.name

    output_filename = f"compressed_{uuid.uuid4().hex}.png"
    output_path = os.path.join(tempfile.gettempdir(), output_filename)

    try:
        result = subprocess.run(
            ["magick", input_path, "-quality", str(quality), output_path],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"ImageMagick 处理失败: {result.stderr}",
            )

        if not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="压缩失败")

        return FileResponse(
            output_path,
            media_type="image/png",
            filename=output_filename,
        )

    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="未找到 ImageMagick，请确保已安装并添加到 PATH",
        )
    finally:
        if os.path.exists(input_path):
            os.unlink(input_path)


@app.post("/api/batch/compress")
async def batch_compress(
    files: list[UploadFile] = File(...),
    quality: int = Form(70),
):
    if quality < 1 or quality > 100:
        raise HTTPException(status_code=400, detail="质量参数需在 1-100 之间")

    valid_files = []
    for file in files:
        if file.content_type and file.content_type.startswith("image/"):
            file_data = await file.read()
            valid_files.append({
                'name': file.filename,
                'data': file_data,
            })

    if not valid_files:
        raise HTTPException(status_code=400, detail="请上传有效的图片文件")

    task_id = task_queue.create_task(
        'batch_compress',
        {'files': valid_files, 'quality': quality}
    )

    return {"task_id": task_id, "total_files": len(valid_files)}


@app.get("/api/batch/{task_id}/status")
async def get_batch_status(task_id: str):
    status = task_queue.get_task_status(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="任务不存在")
    return status


@app.get("/api/batch/{task_id}/download")
async def download_batch_result(task_id: str):
    result = task_queue.get_task_result(task_id)
    if not result:
        raise HTTPException(status_code=404, detail="结果不存在或任务未完成")

    if not os.path.exists(result['zip_path']):
        raise HTTPException(status_code=404, detail="文件已过期或不存在")

    return FileResponse(
        result['zip_path'],
        media_type="application/zip",
        filename=result['zip_filename'],
    )


@app.post("/api/keys", response_model=KeyResponse)
def create_key(key: KeyCreate, db: Session = Depends(get_db)):
    db_key = db.query(KeyRecord).filter(KeyRecord.key_name == key.key_name).first()
    if db_key:
        raise HTTPException(status_code=400, detail="密钥名称已存在")

    db_key = KeyRecord(
        key_name=key.key_name,
        key_value=key.key_value,
        description=key.description,
    )
    db.add(db_key)
    db.commit()
    db.refresh(db_key)
    return db_key


@app.get("/api/keys", response_model=list[KeyResponse])
def list_keys(db: Session = Depends(get_db)):
    keys = db.query(KeyRecord).order_by(KeyRecord.created_at.desc()).all()
    return keys


@app.get("/api/keys/{key_id}", response_model=KeyResponse)
def get_key(key_id: int, db: Session = Depends(get_db)):
    db_key = db.query(KeyRecord).filter(KeyRecord.id == key_id).first()
    if not db_key:
        raise HTTPException(status_code=404, detail="密钥不存在")

    db_key.last_used = datetime.utcnow()
    db.commit()
    db.refresh(db_key)
    return db_key


@app.delete("/api/keys/{key_id}")
def delete_key(key_id: int, db: Session = Depends(get_db)):
    db_key = db.query(KeyRecord).filter(KeyRecord.id == key_id).first()
    if not db_key:
        raise HTTPException(status_code=404, detail="密钥不存在")

    db.delete(db_key)
    db.commit()
    return {"message": "删除成功"}


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
