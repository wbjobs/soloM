import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from collections import Counter

from app.database import get_db
from app.models import Drift, Scan, Cluster
from app.schemas import (
    DriftReportRequest, ScanReportRequest, DriftResponse,
    ScanResponse, ClusterResponse, DashboardSummary,
)

router = APIRouter(prefix="/api/v1", tags=["drift"])

MAX_SPEC_SIZE = 200 * 1024
MAX_DIFF_SIZE = 50 * 1024


def _truncate_large_value(value: Optional[dict], max_bytes: int, label: str) -> Optional[dict]:
    if value is None:
        return None
    try:
        encoded = json.dumps(value).encode("utf-8")
        if len(encoded) <= max_bytes:
            return value
        truncated = _truncate_recursive(value, max_bytes)
        truncated["_truncated"] = True
        truncated["_original_size_bytes"] = len(encoded)
        truncated["_note"] = f"Data truncated to ~{max_bytes/1024:.1f}KB. Use CLI for full inspection."
        return truncated
    except Exception as e:
        return {"_truncated": True, "_error": f"Serialization failed: {str(e)}"}


def _truncate_recursive(obj, max_bytes: int, current_depth: int = 0):
    if current_depth > 10:
        return {"_truncated": "_deep_nesting", "_msg": "Truncated at depth 10"}
    if isinstance(obj, dict):
        result = {}
        current_size = 0
        for k, v in obj.items():
            if current_size >= max_bytes * 0.9:
                result["_truncated"] = f"... ({len(obj) - len(result)} fields omitted)"
                break
            if isinstance(v, dict) and len(v) > 100:
                result[k] = {"_truncated": f"large object ({len(v)} fields)", "_keys_sample": list(v.keys())[:10]}
            elif isinstance(v, list) and len(v) > 100:
                result[k] = [v[0], v[1], f"... ({len(v)} items total)"]
            elif isinstance(v, (dict, list)):
                result[k] = _truncate_recursive(v, max_bytes // 2, current_depth + 1)
            else:
                result[k] = v
            current_size += len(json.dumps({k: result[k]}).encode("utf-8"))
        return result
    elif isinstance(obj, list):
        if len(obj) > 50:
            return [obj[0], obj[1], f"... ({len(obj)} items total)"]
        return [
            _truncate_recursive(item, max_bytes // len(obj), current_depth + 1)
            for item in obj[:50]
        ]
    else:
        return obj


@router.post("/drifts/report", response_model=dict)
def report_drifts(payload: DriftReportRequest, db: Session = Depends(get_db)):
    cluster = db.query(Cluster).filter(Cluster.name == payload.cluster_name).first()
    if not cluster:
        cluster = Cluster(name=payload.cluster_name)
        db.add(cluster)

    cluster.last_drift_count = payload.drift_count
    cluster.total_scans += 1
    cluster.last_scan_at = datetime.now(timezone.utc)
    cluster.updated_at = datetime.now(timezone.utc)

    for drift_item in payload.drifts:
        try:
            truncated_git = _truncate_large_value(drift_item.git_spec, MAX_SPEC_SIZE, "git_spec")
            truncated_live = _truncate_large_value(drift_item.live_spec, MAX_SPEC_SIZE, "live_spec")
            truncated_diff = _truncate_large_value(drift_item.diff, MAX_DIFF_SIZE, "diff")

            drift = Drift(
                scan_id=payload.scan_id,
                cluster_name=payload.cluster_name,
                kind=drift_item.kind,
                name=drift_item.name,
                namespace=drift_item.namespace,
                file=drift_item.file,
                drift_type=drift_item.drift_type,
                diff=truncated_diff,
                git_spec=truncated_git,
                live_spec=truncated_live,
            )
            db.add(drift)
        except Exception as e:
            logger = __import__("logging").getLogger(__name__)
            logger.error("Failed to store drift %s/%s: %s", drift_item.namespace, drift_item.name, e)
            try:
                drift = Drift(
                    scan_id=payload.scan_id,
                    cluster_name=payload.cluster_name,
                    kind=drift_item.kind,
                    name=drift_item.name,
                    namespace=drift_item.namespace,
                    file=drift_item.file,
                    drift_type=drift_item.drift_type,
                    diff={"_storage_error": str(e)},
                    git_spec=None,
                    live_spec=None,
                )
                db.add(drift)
            except Exception as e2:
                logger.error("Even fallback storage failed: %s", e2)
                continue

    db.commit()
    return {"status": "ok", "drift_count": payload.drift_count}


@router.post("/scans", response_model=dict)
def report_scan(payload: ScanReportRequest, db: Session = Depends(get_db)):
    scan = Scan(
        scan_id=payload.scan_id,
        cluster_name=payload.cluster_name,
        timestamp=datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00")),
        total_resources=payload.total_resources,
        drift_count=payload.drift_count,
        checked_keys=payload.checked_keys,
    )
    db.add(scan)
    db.commit()
    return {"status": "ok", "scan_id": payload.scan_id}


@router.get("/drifts", response_model=List[DriftResponse])
def list_drifts(
    cluster_name: Optional[str] = None,
    kind: Optional[str] = None,
    namespace: Optional[str] = None,
    drift_type: Optional[str] = None,
    resolved: Optional[int] = None,
    scan_id: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Drift)
    if cluster_name:
        query = query.filter(Drift.cluster_name == cluster_name)
    if kind:
        query = query.filter(Drift.kind == kind)
    if namespace:
        query = query.filter(Drift.namespace == namespace)
    if drift_type:
        query = query.filter(Drift.drift_type == drift_type)
    if resolved is not None:
        query = query.filter(Drift.resolved == resolved)
    if scan_id:
        query = query.filter(Drift.scan_id == scan_id)

    query = query.order_by(desc(Drift.created_at))
    drifts = query.offset(offset).limit(limit).all()
    return [_drift_to_response(d) for d in drifts]


@router.get("/drifts/{drift_id}", response_model=DriftResponse)
def get_drift(drift_id: str, db: Session = Depends(get_db)):
    drift = db.query(Drift).filter(Drift.id == drift_id).first()
    if not drift:
        raise HTTPException(status_code=404, detail="Drift not found")
    return _drift_to_response(drift)


@router.patch("/drifts/{drift_id}/resolve", response_model=DriftResponse)
def resolve_drift(drift_id: str, db: Session = Depends(get_db)):
    drift = db.query(Drift).filter(Drift.id == drift_id).first()
    if not drift:
        raise HTTPException(status_code=404, detail="Drift not found")
    drift.resolved = 1
    db.commit()
    db.refresh(drift)
    return _drift_to_response(drift)


@router.get("/scans", response_model=List[ScanResponse])
def list_scans(
    cluster_name: Optional[str] = None,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Scan)
    if cluster_name:
        query = query.filter(Scan.cluster_name == cluster_name)
    query = query.order_by(desc(Scan.created_at))
    scans = query.offset(offset).limit(limit).all()
    return [_scan_to_response(s) for s in scans]


@router.get("/clusters", response_model=List[ClusterResponse])
def list_clusters(db: Session = Depends(get_db)):
    clusters = db.query(Cluster).all()
    return [
        ClusterResponse(
            name=c.name,
            last_scan_at=c.last_scan_at,
            last_drift_count=c.last_drift_count,
            total_scans=c.total_scans,
            updated_at=c.updated_at,
        )
        for c in clusters
    ]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db)):
    total_clusters = db.query(func.count(Cluster.name)).scalar() or 0
    total_drifts = db.query(func.count(Drift.id)).scalar() or 0
    unresolved_drifts = db.query(func.count(Drift.id)).filter(Drift.resolved == 0).scalar() or 0

    latest_scans_query = db.query(Scan).order_by(desc(Scan.created_at)).limit(5).all()
    latest_scans = [_scan_to_response(s) for s in latest_scans_query]

    kind_counts = dict(
        db.query(Drift.kind, func.count(Drift.id))
        .filter(Drift.resolved == 0)
        .group_by(Drift.kind)
        .all()
    )

    cluster_counts = dict(
        db.query(Drift.cluster_name, func.count(Drift.id))
        .filter(Drift.resolved == 0)
        .group_by(Drift.cluster_name)
        .all()
    )

    return DashboardSummary(
        total_clusters=total_clusters,
        total_drifts=total_drifts,
        unresolved_drifts=unresolved_drifts,
        latest_scans=latest_scans,
        drifts_by_kind=kind_counts,
        drifts_by_cluster=cluster_counts,
    )


def _drift_to_response(d: Drift) -> DriftResponse:
    return DriftResponse(
        id=str(d.id),
        scan_id=d.scan_id,
        cluster_name=d.cluster_name,
        kind=d.kind,
        name=d.name,
        namespace=d.namespace,
        file=d.file,
        drift_type=d.drift_type,
        diff=d.diff,
        git_spec=d.git_spec,
        live_spec=d.live_spec,
        created_at=d.created_at,
        resolved=d.resolved,
    )


def _scan_to_response(s: Scan) -> ScanResponse:
    return ScanResponse(
        id=str(s.id),
        scan_id=s.scan_id,
        cluster_name=s.cluster_name,
        timestamp=s.timestamp,
        total_resources=s.total_resources,
        drift_count=s.drift_count,
        created_at=s.created_at,
    )
