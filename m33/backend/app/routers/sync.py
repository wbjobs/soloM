import uuid
import yaml
import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.models import Drift, SyncJob, AuditLog
from app.schemas import (
    SyncRequest, SyncBatchRequest, SyncResponse, SyncJobResponse,
    SyncJobPickRequest, SyncJobUpdateRequest, AuditLogResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["sync"])


def _write_audit_log(db: Session, action: str, request: Request = None, **kwargs):
    try:
        audit = AuditLog(
            action=action,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
            **kwargs
        )
        db.add(audit)
        db.flush()
    except Exception as e:
        logger.error("Failed to write audit log: %s", e)


def _generate_kubectl_command(spec: dict, force: bool = True, dry_run: bool = False) -> str:
    cmd_parts = ["kubectl apply -f -"]
    if force:
        cmd_parts.append("--force")
    if dry_run:
        cmd_parts.append("--dry-run=client")
    return " ".join(cmd_parts)


def _clean_spec_for_apply(spec: dict) -> dict:
    if not isinstance(spec, dict):
        return spec
    cleaned = {}
    for k, v in spec.items():
        if k == "status":
            continue
        if k == "metadata" and isinstance(v, dict):
            meta = {}
            for mk, mv in v.items():
                if mk in ["uid", "resourceVersion", "selfLink", "creationTimestamp",
                                "managedFields", "generation"]:
                    continue
                if mk == "annotations" and isinstance(mv, dict):
                    anns = {k: v for k, v in mv.items() if not k.startswith("kubectl.kubernetes.io/")}
                    if anns:
                        meta[mk] = anns
                    continue
                meta[mk] = mv
            cleaned[k] = meta
        else:
            cleaned[k] = v
    return cleaned


@router.post("/sync", response_model=SyncResponse)
def create_sync_job(payload: SyncRequest, request: Request, db: Session = Depends(get_db)):
    drift = db.query(Drift).filter(Drift.id == payload.drift_id).first()
    if not drift:
        raise HTTPException(status_code=404, detail="Drift not found")

    if drift.resolved == 1:
        raise HTTPException(status_code=400, detail="Drift already resolved")

    if not drift.git_spec or not isinstance(drift.git_spec, dict):
        raise HTTPException(status_code=400, detail="Git spec not available for sync")

    job_id = f"sync-{uuid.uuid4().hex[:12]}"

    kubectl_cmd = _generate_kubectl_command(drift.git_spec, force=payload.force, dry_run=payload.dry_run)

    sync_job = SyncJob(
        job_id=job_id,
        cluster_name=drift.cluster_name,
        drift_id=str(drift.id),
        kind=drift.kind,
        name=drift.name,
        namespace=drift.namespace,
        file=drift.file,
        git_spec=drift.git_spec,
        dry_run=1 if payload.dry_run else 0,
        force=1 if payload.force else 0,
        status="pending",
        kubectl_command=kubectl_cmd,
        created_by=payload.user,
        status_message="Waiting for CLI agent to pick up",
    )
    db.add(sync_job)

    _write_audit_log(
        db, "sync.create", request,
        user=payload.user,
        cluster_name=drift.cluster_name,
        drift_id=str(drift.id),
        resource_kind=drift.kind,
        resource_name=drift.name,
        resource_namespace=drift.namespace,
        details={
            "job_id": job_id,
            "dry_run": payload.dry_run,
            "force": payload.force,
            "kubectl_command": kubectl_cmd,
        }
    )

    db.commit()
    db.refresh(sync_job)

    return SyncResponse(
        job_id=job_id,
        status="pending",
        cluster_name=drift.cluster_name,
        kind=drift.kind,
        name=drift.name,
        namespace=drift.namespace,
        kubectl_command=kubectl_cmd,
        message="Sync job created successfully. Waiting for CLI agent to execute.",
        created_at=sync_job.created_at,
    )


@router.post("/sync/batch", response_model=List[SyncResponse])
def create_batch_sync(payload: SyncBatchRequest, request: Request, db: Session = Depends(get_db)):
    responses = []
    for drift_id in payload.drift_ids:
        try:
            single_payload = SyncRequest(
                drift_id=drift_id,
                dry_run=payload.dry_run,
                force=payload.force,
                user=payload.user,
            )
            resp = create_sync_job(single_payload, request, db)
            responses.append(resp)
        except HTTPException:
            continue
    return responses


@router.get("/sync/jobs", response_model=List[SyncJobResponse])
def list_sync_jobs(
    cluster_name: Optional[str] = None,
    status: Optional[str] = None,
    drift_id: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(SyncJob)
    if cluster_name:
        query = query.filter(SyncJob.cluster_name == cluster_name)
    if status:
        query = query.filter(SyncJob.status == status)
    if drift_id:
        query = query.filter(SyncJob.drift_id == drift_id)
    query = query.order_by(desc(SyncJob.created_at))
    jobs = query.offset(offset).limit(limit).all()
    return [_sync_job_to_response(j) for j in jobs]


@router.get("/sync/jobs/{job_id}", response_model=SyncJobResponse)
def get_sync_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(SyncJob).filter(SyncJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Sync job not found")
    return _sync_job_to_response(job)


@router.post("/sync/jobs/pick", response_model=List[SyncJobResponse])
def pick_sync_jobs(payload: SyncJobPickRequest, db: Session = Depends(get_db)):
    jobs = (
        db.query(SyncJob)
        .filter(
            SyncJob.cluster_name == payload.cluster_name,
            SyncJob.status == "pending",
        )
        .order_by(SyncJob.created_at)
        .limit(payload.max_jobs or 5)
        .with_for_update(skip_locked=True)
        .all()
    )

    now = datetime.now(timezone.utc)
    for job in jobs:
        job.status = "picked"
        job.picked_by = payload.client_id
        job.picked_at = now

    db.commit()

    for job in jobs:
        db.refresh(job)

    return [_sync_job_to_response(j) for j in jobs]


@router.patch("/sync/jobs/{job_id}/update", response_model=SyncJobResponse)
def update_sync_job(job_id: str, payload: SyncJobUpdateRequest, request: Request, db: Session = Depends(get_db)):
    job = db.query(SyncJob).filter(SyncJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Sync job not found")

    old_status = job.status
    job.status = payload.status
    job.status_message = payload.status_message

    if payload.status == "running" and job.started_at is None:
        job.started_at = datetime.now(timezone.utc)

    if payload.apply_output:
        job.apply_output = payload.apply_output

    if payload.apply_error:
        job.apply_error = payload.apply_error

    if payload.status in ["completed", "failed", "success", "error"]:
        job.completed_at = datetime.now(timezone.utc)

        if payload.status in ["completed", "success"]:
            drift = db.query(Drift).filter(Drift.id == job.drift_id).first()
            if drift:
                drift.resolved = 1

        audit_action = "sync.completed" if payload.status in ["completed", "success"] else "sync.failed"
        _write_audit_log(
            db, audit_action, request,
            user=job.created_by,
            cluster_name=job.cluster_name,
            drift_id=job.drift_id,
            sync_job_id=job.job_id,
            resource_kind=job.kind,
            resource_name=job.name,
            resource_namespace=job.namespace,
            details={
                "old_status": old_status,
                "new_status": payload.status,
                "status_message": payload.status_message,
                "has_output": bool(payload.apply_output),
                "has_error": bool(payload.apply_error),
            }
        )

    db.commit()
    db.refresh(job)

    return _sync_job_to_response(job)


@router.get("/audit", response_model=List[AuditLogResponse])
def list_audit_logs(
    cluster_name: Optional[str] = None,
    action: Optional[str] = None,
    user: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if cluster_name:
        query = query.filter(AuditLog.cluster_name == cluster_name)
    if action:
        query = query.filter(AuditLog.action == action)
    if user:
        query = query.filter(AuditLog.user == user)
    query = query.order_by(desc(AuditLog.timestamp))
    logs = query.offset(offset).limit(limit).all()
    return [_audit_to_response(log) for log in logs]


@router.get("/sync/jobs/{job_id}/command", response_model=dict)
def get_sync_job_command(job_id: str, db: Session = Depends(get_db)):
    job = db.query(SyncJob).filter(SyncJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Sync job not found")

    clean_spec = _clean_spec_for_apply(job.git_spec)
    yaml_content = yaml.safe_dump(clean_spec, sort_keys=False)

    return {
        "job_id": job_id,
        "kind": job.kind,
        "namespace": job.namespace,
        "name": job.name,
        "dry_run": bool(job.dry_run),
        "force": bool(job.force),
        "kubectl_command": job.kubectl_command,
        "yaml_content": yaml_content,
    }


def _sync_job_to_response(j: SyncJob) -> SyncJobResponse:
    return SyncJobResponse(
        id=str(j.id),
        job_id=j.job_id,
        cluster_name=j.cluster_name,
        drift_id=j.drift_id,
        kind=j.kind,
        name=j.name,
        namespace=j.namespace,
        file=j.file,
        dry_run=j.dry_run,
        force=j.force,
        status=j.status,
        status_message=j.status_message,
        kubectl_command=j.kubectl_command,
        apply_output=j.apply_output,
        apply_error=j.apply_error,
        picked_by=j.picked_by,
        picked_at=j.picked_at,
        started_at=j.started_at,
        completed_at=j.completed_at,
        created_by=j.created_by,
        created_at=j.created_at,
        updated_at=j.updated_at,
    )


def _audit_to_response(log: AuditLog) -> AuditLogResponse:
    return AuditLogResponse(
        id=str(log.id),
        timestamp=log.timestamp,
        action=log.action,
        user=log.user,
        cluster_name=log.cluster_name,
        drift_id=log.drift_id,
        sync_job_id=log.sync_job_id,
        resource_kind=log.resource_kind,
        resource_name=log.resource_name,
        resource_namespace=log.resource_namespace,
        details=log.details,
        ip_address=log.ip_address,
    )
