import subprocess
import tempfile
import os
import logging
import time
import uuid
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone

import requests
import yaml

logger = logging.getLogger(__name__)


class SyncAgent:
    def __init__(self, backend_url: str, cluster_name: str, kubeconfig_path: Optional[str] = None,
                 kube_context: Optional[str] = None):
        self.backend_url = backend_url.rstrip("/")
        self.cluster_name = cluster_name
        self.kubeconfig_path = kubeconfig_path
        self.kube_context = kube_context
        self.client_id = f"cli-agent-{uuid.uuid4().hex[:8]}"
        self._session = requests.Session()

    def _k8s_env(self) -> Dict[str, str]:
        env = os.environ.copy()
        if self.kubeconfig_path:
            env["KUBECONFIG"] = self.kubeconfig_path
        return env

    def _k8s_cmd(self) -> List[str]:
        cmd = ["kubectl"]
        if self.kube_context:
            cmd += ["--context", self.kube_context]
        return cmd

    def pick_jobs(self, max_jobs: int = 5) -> List[Dict[str, Any]]:
        try:
            resp = self._session.post(
                f"{self.backend_url}/api/v1/sync/jobs/pick",
                json={
                    "cluster_name": self.cluster_name,
                    "client_id": self.client_id,
                    "max_jobs": max_jobs,
                },
                timeout=10,
            )
            resp.raise_for_status()
            jobs = resp.json()
            if jobs:
                logger.info("Picked %d sync job(s)", len(jobs))
            return jobs
        except requests.RequestException as e:
            logger.error("Failed to pick sync jobs: %s", e)
            return []

    def update_job_status(self, job_id: str, status: str, status_message: Optional[str] = None,
                          apply_output: Optional[str] = None, apply_error: Optional[str] = None):
        try:
            payload = {
                "status": status,
            }
            if status_message:
                payload["status_message"] = status_message
            if apply_output:
                payload["apply_output"] = apply_output
            if apply_error:
                payload["apply_error"] = apply_error

            resp = self._session.patch(
                f"{self.backend_url}/api/v1/sync/jobs/{job_id}/update",
                json=payload,
                timeout=10,
            )
            resp.raise_for_status()
            return True
        except requests.RequestException as e:
            logger.error("Failed to update job %s status: %s", job_id, e)
            return False

    def get_job_command(self, job_id: str) -> Optional[Dict[str, Any]]:
        try:
            resp = self._session.get(
                f"{self.backend_url}/api/v1/sync/jobs/{job_id}/command",
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            logger.error("Failed to get command for job %s: %s", job_id, e)
            return None

    def apply_manifest(self, yaml_content: str, force: bool = False,
                       dry_run: bool = False, namespace: Optional[str] = None) -> tuple[int, str, str]:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False, encoding="utf-8") as f:
            f.write(yaml_content)
            tmp_file = f.name

        try:
            cmd = self._k8s_cmd() + ["apply", "-f", tmp_file]
            if force:
                cmd.append("--force")
            if dry_run:
                cmd.append("--dry-run=client")
            if namespace:
                cmd += ["-n", namespace]

            logger.info("Executing: %s", " ".join(cmd))

            env = self._k8s_env()
            proc = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                timeout=120,
            )

            return proc.returncode, proc.stdout, proc.stderr

        finally:
            try:
                os.unlink(tmp_file)
            except:
                pass

    def execute_job(self, job: Dict[str, Any]) -> bool:
        job_id = job.get("job_id")
        if not job_id:
            logger.error("Job missing job_id: %s", job)
            return False

        logger.info("Executing sync job %s: %s/%s %s", job_id, job.get("namespace"), job.get("kind"), job.get("name"))

        try:
            self.update_job_status(
                job_id, "running",
                status_message="Starting kubectl apply..."
            )

            cmd_data = self.get_job_command(job_id)
            if not cmd_data:
                self.update_job_status(
                    job_id, "error",
                    status_message="Failed to get job command from backend",
                    apply_error="Failed to retrieve job command data"
                )
                return False

            yaml_content = cmd_data.get("yaml_content", "")
            if not yaml_content:
                self.update_job_status(
                    job_id, "error",
                    status_message="Empty YAML content",
                    apply_error="YAML content is empty"
                )
                return False

            force = bool(cmd_data.get("force", True))
            dry_run = bool(cmd_data.get("dry_run", False))
            namespace = cmd_data.get("namespace")

            start_time = time.time()
            returncode, stdout, stderr = self.apply_manifest(
                yaml_content, force=force, dry_run=dry_run, namespace=namespace
            )
            duration = time.time() - start_time

            if returncode == 0:
                final_status = "completed"
                message = f"Apply completed successfully in {duration:.2f}s"
                if dry_run:
                    message = f"Dry run completed in {duration:.2f}s - changes NOT applied"
                self.update_job_status(
                    job_id, final_status,
                    status_message=message,
                    apply_output=stdout
                )
                logger.info("Job %s completed in %.2fs", job_id, duration)
                return True
            else:
                self.update_job_status(
                    job_id, "failed",
                    status_message=f"Apply failed after {duration:.2f}s",
                    apply_output=stdout,
                    apply_error=stderr
                )
                logger.error("Job %s failed: %s", job_id, stderr[:500])
                return False

        except subprocess.TimeoutExpired as e:
            self.update_job_status(
                job_id, "timeout",
                status_message="kubectl apply timed out after 120s",
                apply_error=str(e)
            )
            logger.error("Job %s timed out", job_id)
            return False
        except Exception as e:
            logger.exception("Unexpected error executing job %s", job_id)
            self.update_job_status(
                job_id, "error",
                status_message=f"Unexpected error: {type(e).__name__}",
                apply_error=str(e)
            )
            return False

    def run_once(self, max_jobs: int = 5) -> int:
        jobs = self.pick_jobs(max_jobs=max_jobs)
        if not jobs:
            return 0

        success_count = 0
        for job in jobs:
            if self.execute_job(job):
                success_count += 1

        return success_count

    def run_daemon(self, interval: int = 30):
        logger.info(
            "Sync agent started as daemon (cluster=%s, interval=%ds, client_id=%s)",
            self.cluster_name, interval, self.client_id
        )

        while True:
            try:
                processed = self.run_once()
                if processed == 0:
                    logger.debug("No sync jobs pending")
            except Exception as e:
                logger.exception("Unexpected error in sync agent loop: %s", e)

            logger.debug("Sleeping %d seconds until next poll...", interval)
            time.sleep(interval)

    def health_check(self) -> bool:
        try:
            resp = self._session.get(f"{self.backend_url}/healthz", timeout=5)
            return resp.status_code == 200
        except requests.RequestException:
            return False
