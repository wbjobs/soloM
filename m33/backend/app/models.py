from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, Text, JSON, Index
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base


class Scan(Base):
    __tablename__ = "scans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(String(255), nullable=False, unique=True)
    cluster_name = Column(String(255), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    total_resources = Column(Integer, default=0)
    drift_count = Column(Integer, default=0)
    checked_keys = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_scans_cluster_timestamp", "cluster_name", "timestamp"),
    )


class Drift(Base):
    __tablename__ = "drifts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(String(255), nullable=False, index=True)
    cluster_name = Column(String(255), nullable=False, index=True)
    kind = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    namespace = Column(String(255), nullable=False)
    file = Column(Text, nullable=True)
    drift_type = Column(String(100), nullable=False)
    diff = Column(JSON, default=dict)
    git_spec = Column(JSON, default=dict)
    live_spec = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    resolved = Column(Integer, default=0)

    __table_args__ = (
        Index("ix_drifts_cluster_kind", "cluster_name", "kind"),
        Index("ix_drifts_scan_id", "scan_id"),
        Index("ix_drifts_resolved", "resolved"),
    )


class Cluster(Base):
    __tablename__ = "clusters"

    name = Column(String(255), primary_key=True)
    last_scan_at = Column(DateTime(timezone=True), nullable=True)
    last_drift_count = Column(Integer, default=0)
    total_scans = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(String(255), nullable=False, unique=True, index=True)
    cluster_name = Column(String(255), nullable=False, index=True)
    drift_id = Column(String(255), nullable=True)
    kind = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    namespace = Column(String(255), nullable=False)
    file = Column(Text, nullable=True)
    git_spec = Column(JSON, nullable=False)
    dry_run = Column(Integer, default=0)
    force = Column(Integer, default=1)
    status = Column(String(50), nullable=False, default="pending")
    status_message = Column(Text, nullable=True)
    kubectl_command = Column(Text, nullable=True)
    apply_output = Column(Text, nullable=True)
    apply_error = Column(Text, nullable=True)
    picked_by = Column(String(255), nullable=True)
    picked_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_sync_jobs_cluster_status", "cluster_name", "status"),
        Index("ix_sync_jobs_status_created", "status", "created_at"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    action = Column(String(100), nullable=False, index=True)
    user = Column(String(255), nullable=True, index=True)
    cluster_name = Column(String(255), nullable=True, index=True)
    drift_id = Column(String(255), nullable=True)
    sync_job_id = Column(String(255), nullable=True)
    resource_kind = Column(String(255), nullable=True)
    resource_name = Column(String(255), nullable=True)
    resource_namespace = Column(String(255), nullable=True)
    details = Column(JSON, default=dict)
    ip_address = Column(String(255), nullable=True)
    user_agent = Column(String(500), nullable=True)

    __table_args__ = (
        Index("ix_audit_cluster_action", "cluster_name", "action"),
        Index("ix_audit_user_timestamp", "user", "timestamp"),
    )
