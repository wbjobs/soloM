from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime


class DocumentInfo(BaseModel):
    id: int
    file_name: str
    page: Optional[int] = None
    content: str
    source: str
    highlighted_content: Optional[str] = None


class QueryRequest(BaseModel):
    question: str = Field(..., description="用户的问题")
    index_name: str = Field(default="default", description="要查询的索引名称")
    k: Optional[int] = Field(default=None, description="检索的文档数量")


class QueryResponse(BaseModel):
    answer: str
    sources: List[DocumentInfo]
    question: str


class UploadResponse(BaseModel):
    success: bool
    message: str
    file_name: str
    chunks_count: int
    index_name: str


class IndexInfo(BaseModel):
    name: str
    document_count: Optional[int] = None


class IndexListResponse(BaseModel):
    indexes: List[str]


class DeleteIndexRequest(BaseModel):
    index_name: str


class DeleteIndexResponse(BaseModel):
    success: bool
    message: str


class HealthResponse(BaseModel):
    status: str
    indexes: List[str]


class QAPair(BaseModel):
    question: str = Field(..., description="问题")
    answer: str = Field(..., description="回答")
    context: Optional[str] = Field(None, description="上下文")


class DatasetInfo(BaseModel):
    id: str
    name: str
    file_name: str
    total_samples: int
    created_at: datetime
    format: str = Field(description="数据集格式: jsonl, csv")
    size_bytes: int


class DatasetListResponse(BaseModel):
    datasets: List[DatasetInfo]


class DatasetUploadResponse(BaseModel):
    success: bool
    message: str
    dataset_id: str
    total_samples: int
    file_name: str


class FinetuneConfig(BaseModel):
    dataset_id: str = Field(..., description="数据集ID")
    base_model: Optional[str] = Field(None, description="基础模型名称")
    num_epochs: Optional[int] = Field(None, ge=1, le=20, description="训练轮数")
    batch_size: Optional[int] = Field(None, ge=1, le=32, description="批次大小")
    learning_rate: Optional[float] = Field(None, gt=0, description="学习率")
    lora_r: Optional[int] = Field(None, ge=1, le=64, description="LoRA rank")
    lora_alpha: Optional[int] = Field(None, description="LoRA alpha")
    lora_dropout: Optional[float] = Field(None, ge=0, lt=1, description="LoRA dropout")
    max_seq_length: Optional[int] = Field(None, ge=64, le=4096, description="最大序列长度")


class LossPoint(BaseModel):
    step: int
    loss: float
    epoch: Optional[int] = None


class FinetuneTask(BaseModel):
    task_id: str
    dataset_id: str
    dataset_name: str
    base_model: str
    status: str = Field(description="pending, running, completed, failed, cancelled")
    config: Dict[str, Any]
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    current_epoch: int = 0
    total_epochs: int = 0
    current_step: int = 0
    total_steps: int = 0
    loss_history: List[LossPoint] = []
    error_message: Optional[str] = None
    output_path: Optional[str] = None


class FinetuneTaskListResponse(BaseModel):
    tasks: List[FinetuneTask]


class StartFinetuneResponse(BaseModel):
    success: bool
    message: str
    task_id: str


class FinetuneStatusResponse(BaseModel):
    task_id: str
    status: str
    current_epoch: int
    total_epochs: int
    current_step: int
    total_steps: int
    loss_history: List[LossPoint]
    error_message: Optional[str] = None


class DeleteDatasetRequest(BaseModel):
    dataset_id: str


class DeleteDatasetResponse(BaseModel):
    success: bool
    message: str


class CancelFinetuneResponse(BaseModel):
    success: bool
    message: str

