from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class DocumentBase(BaseModel):
    name: str
    type: str
    size: int


class DocumentCreate(DocumentBase):
    file_path: str


class DocumentResponse(DocumentBase):
    id: str
    status: str
    chunk_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class DocumentUploadResponse(BaseModel):
    success: bool
    document: DocumentResponse


class ChunkResponse(BaseModel):
    id: str
    document_id: str
    page_number: Optional[int] = None
    content: str
    created_at: datetime

    class Config:
        orm_mode = True


class ProcessProgress(BaseModel):
    document_id: str
    stage: str
    progress: int
    total: int
