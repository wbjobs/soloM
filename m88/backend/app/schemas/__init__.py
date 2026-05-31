from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class DocumentInfo(BaseModel):
    doc_id: str
    doc_name: str
    upload_time: datetime
    file_size: int
    chunk_count: int
    status: str


class DocumentUploadResponse(BaseModel):
    success: bool
    message: str
    doc_id: Optional[str] = None
    doc_name: Optional[str] = None
    chunk_count: Optional[int] = None


class DocumentDeleteResponse(BaseModel):
    success: bool
    message: str
    deleted_count: int = 0


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    doc_ids: Optional[List[str]] = None
    stream: bool = True
    search_mode: str = Field(default="hybrid", pattern="^(vector|bm25|hybrid)$")


class RetrievedChunk(BaseModel):
    doc_id: str
    doc_name: str
    chunk_index: int
    content: str
    score: float
    metadata: Dict[str, Any] = {}
    page: Optional[int] = None
    bbox: Optional[List[float]] = None
    search_type: str = "vector"
    vector_score: float = 0.0
    bm25_score: float = 0.0


class QueryResponse(BaseModel):
    answer: str
    sources: List[RetrievedChunk]
    total_tokens: int = 0
    latency: float = 0.0


class HealthResponse(BaseModel):
    status: str
    milvus_connected: bool
    embedding_model_loaded: bool
    llm_model_loaded: bool
    bm25_indexed: bool
    total_documents: int
    total_vectors: int


class DocumentListResponse(BaseModel):
    documents: List[DocumentInfo]
    total: int
