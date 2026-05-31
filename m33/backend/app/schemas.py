from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional
from datetime import datetime


class DriftItem(BaseModel):
    kind: str
    name: str
    namespace: str
    file: Optional[str] = None
    drift_type: str
    diff: Optional[Dict[str, Any]] = None
    git_spec: Optional[Dict[str, Any]] = None
    live_spec: Optional[Dict[str, Any]] = None


class DriftReportRequest(BaseModel):
    cluster_name: str
    scan_id: str
    timestamp: str
    drift_count: int
    drifts: List[DriftItem]


class ScanReportRequest(BaseModel):
    cluster_name: str
    scan_id: str
    timestamp: str
    total_resources: int
    drift_count: int
    checked_keys: List[str]


class DriftResponse(BaseModel):
    id: str
    scan_id: str
    cluster_name: str
    kind: str
    name: str
    namespace: str
    file: Optional[str] = None
    drift_type: str
    diff: Optional[Dict[str, Any]] = None
    git_spec: Optional[Dict[str, Any]] = None
    live_spec: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    resolved: int = 0

    class Config:
        from_attributes = True


class ScanResponse(BaseModel):
    id: str
    scan_id: str
    cluster_name: str
    timestamp: Optional[datetime] = None
    total_resources: int = 0
    drift_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClusterResponse(BaseModel):
    name: str
    last_scan_at: Optional[datetime] = None
    last_drift_count: int = 0
    total_scans: int = 0
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DashboardSummary(BaseModel):
    total_clusters: int
    total_drifts: int
    unresolved_drifts: int
    latest_scans: List[ScanResponse]
    drifts_by_kind: Dict[str, int]
    drifts_by_cluster: Dict[str, int]


class SyncRequest(BaseModel):
    drift_id: str
    dry_run: Optional[bool] = False
    force: Optional[bool] = True
    user: Optional[str] = "dashboard"


class SyncBatchRequest(BaseModel):
    drift_ids: List[str]
    dry_run: Optional[bool] = False
    force: Optional[bool] = True
    user: Optional[str] = "dashboard"


class SyncResponse(BaseModel):
    job_id: str
    status: str
    cluster_name: str
    kind: str
    name: str
    namespace: str
    kubectl_command: str
    message: str
    created_at: Optional[datetime] = None


class SyncJobResponse(BaseModel):
    id: str
    job_id: str
    cluster_name: str
    drift_id: Optional[str] = None
    kind: str
    name: str
    namespace: str
    file: Optional[str] = None
    dry_run: int = 0
    force: int = 1
    status: str
    status_message: Optional[str] = None
    kubectl_command: Optional[str] = None
    apply_output: Optional[str] = None
    apply_error: Optional[str] = None
    picked_by: Optional[str] = None
    picked_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SyncJobPickRequest(BaseModel):
    cluster_name: str
    client_id: str
    max_jobs: Optional[int] = 5


class SyncJobUpdateRequest(BaseModel):
    status: str
    status_message: Optional[str] = None
    apply_output: Optional[str] = None
    apply_error: Optional[str] = None


class AuditLogResponse(BaseModel):
    id: str
    timestamp: Optional[datetime] = None
    action: str
    user: Optional[str] = None
    cluster_name: Optional[str] = None
    drift_id: Optional[str] = None
    sync_job_id: Optional[str] = None
    resource_kind: Optional[str] = None
    resource_name: Optional[str] = None
    resource_namespace: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True
