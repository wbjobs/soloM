import logging
import requests
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class Reporter:
    def __init__(self, backend_url: str, cluster_name: str = "default"):
        self.backend_url = backend_url.rstrip("/")
        self.cluster_name = cluster_name

    def report_drifts(self, drifts: List[Dict[str, Any]], scan_id: Optional[str] = None) -> bool:
        payload = {
            "cluster_name": self.cluster_name,
            "scan_id": scan_id or datetime.now(timezone.utc).isoformat(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "drift_count": len(drifts),
            "drifts": drifts,
        }

        try:
            resp = requests.post(
                f"{self.backend_url}/api/v1/drifts/report",
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
            logger.info("Reported %d drifts to backend (scan_id=%s)", len(drifts), payload["scan_id"])
            return True
        except requests.RequestException as e:
            logger.error("Failed to report drifts to backend: %s", e)
            return False

    def report_scan_result(self, total_resources: int, drift_count: int,
                           checked_keys: List[str], scan_id: Optional[str] = None) -> bool:
        payload = {
            "cluster_name": self.cluster_name,
            "scan_id": scan_id or datetime.now(timezone.utc).isoformat(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_resources": total_resources,
            "drift_count": drift_count,
            "checked_keys": checked_keys,
        }

        try:
            resp = requests.post(
                f"{self.backend_url}/api/v1/scans",
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
            logger.info("Reported scan result: %d/%d drifted", drift_count, total_resources)
            return True
        except requests.RequestException as e:
            logger.error("Failed to report scan result: %s", e)
            return False

    def health_check(self) -> bool:
        try:
            resp = requests.get(f"{self.backend_url}/healthz", timeout=5)
            return resp.status_code == 200
        except requests.RequestException:
            return False
