from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl


class SubmitTaskRequest(BaseModel):
    url: HttpUrl
    spider_name: str = Field(default="generic", description="Spider name to use")
    method: str = Field(default="GET", pattern="^(GET|POST|PUT|DELETE)$")
    body: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    priority: int = Field(default=0, ge=0)


class SubmitBatchRequest(BaseModel):
    urls: List[HttpUrl] = Field(min_length=1, max_length=10000)
    spider_name: str = Field(default="generic")
    method: str = Field(default="GET", pattern="^(GET|POST|PUT|DELETE)$")
    meta: Optional[Dict[str, Any]] = None


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    task: Optional[Dict[str, Any]] = None


class TaskSubmitResponse(BaseModel):
    task_id: Optional[str] = None
    message: str


class BatchSubmitResponse(BaseModel):
    task_ids: List[str]
    submitted_count: int
    message: str


class DataQueryRequest(BaseModel):
    collection: str = Field(default="cleaned", pattern="^(raw|cleaned)$")
    filter: Optional[Dict[str, Any]] = None
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=1000)
    sort_by: str = Field(default="cleaned_at")
    sort_order: int = Field(default=-1, ge=-1, le=1)


class DataQueryResponse(BaseModel):
    items: List[Dict[str, Any]]
    total: int
    skip: int
    limit: int


class QueueStatsResponse(BaseModel):
    pending_tasks: int
    result_queue_size: int
    dedup_count: int
    dead_task_count: int
    proxy_pool_size: int
    proxy_blacklist_size: int
    redis_alive: bool


class HealthResponse(BaseModel):
    status: str
    redis: bool
    mongodb: bool


class DeadTaskStatsResponse(BaseModel):
    dead_task_count: int
    task_timeout_seconds: int
    max_retries: int


class DeadTaskProcessResponse(BaseModel):
    requeued: int
    dead: int
    expired: int


class ProxyAddRequest(BaseModel):
    proxy_url: str = Field(description="Proxy URL, e.g. http://user:pass@host:port")
    weight: int = Field(default=1, ge=1)


class ProxyAddBatchRequest(BaseModel):
    proxy_urls: List[str] = Field(min_length=1)
    weight: int = Field(default=1, ge=1)


class ProxyUnbanRequest(BaseModel):
    proxy_url: str


class ProxyStatsResponse(BaseModel):
    proxy: str
    success_count: int
    fail_count: int
    ban_count: int
    last_success_at: float
    last_fail_at: float
    last_ban_at: float


class ProxyPoolStatusResponse(BaseModel):
    available_count: int
    blacklisted_count: int
    proxies: List[str]
    blacklisted: List[str]
