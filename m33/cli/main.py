import argparse
import logging
import sys
import time
import uuid
from datetime import datetime, timezone

from drift_detector.git_sync import GitSync
from drift_detector.k8s_client import K8sClient
from drift_detector.differ import Differ
from drift_detector.reporter import Reporter
from drift_detector.sync_agent import SyncAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("drift-cli")


def run_scan(args) -> int:
    git_sync = GitSync(
        repo_url=args.git_repo,
        branch=args.git_branch,
        git_token=args.git_token,
    )

    k8s_client = K8sClient(
        kubeconfig_path=args.kubeconfig,
        context=args.kube_context,
    )

    differ = Differ(ignore_fields=args.ignore_fields.split(",") if args.ignore_fields else None)
    reporter = Reporter(
        backend_url=args.backend_url,
        cluster_name=args.cluster_name,
    )

    scan_id = str(uuid.uuid4())
    logger.info("Starting drift scan (scan_id=%s)", scan_id)

    if not reporter.health_check():
        logger.error("Backend at %s is not reachable. Aborting.", args.backend_url)
        return 1

    try:
        repo_path = git_sync.clone_or_pull(work_dir=args.work_dir)
        yaml_dirs = args.yaml_dirs.split(",") if args.yaml_dirs else None
        git_manifests = git_sync.parse_k8s_manifests(repo_path, yaml_dirs=yaml_dirs)

        if not git_manifests:
            logger.warning("No K8s manifests found in repository")
            return 0

        logger.info("Found %d manifests in Git repo", len(git_manifests))

        drifts, checked_keys = differ.compare(git_manifests, k8s_client)
        drift_dicts = [d.to_dict() for d in drifts]

        for drift in drifts:
            logger.warning(
                "Drift detected: [%s] %s/%s (%s) - %s",
                drift["drift_type"], drift["namespace"], drift["name"],
                drift["kind"], drift["file"]
            )

        success = reporter.report_drifts(drift_dicts, scan_id=scan_id)
        reporter.report_scan_result(
            total_resources=len(git_manifests),
            drift_count=len(drifts),
            checked_keys=checked_keys,
            scan_id=scan_id,
        )

        if not success:
            logger.error("Failed to report drifts to backend")
            return 1

        logger.info("Scan complete: %d drifts out of %d resources", len(drifts), len(git_manifests))
        return 1 if drifts else 0

    except Exception as e:
        logger.exception("Scan failed: %s", e)
        return 1
    finally:
        if not args.work_dir:
            git_sync.cleanup()


def run_daemon(args):
    logger.info("Running in daemon mode (interval=%ds)", args.interval)
    while True:
        try:
            run_scan(args)
        except Exception as e:
            logger.exception("Daemon scan cycle failed: %s", e)
        logger.info("Sleeping %d seconds until next scan...", args.interval)
        time.sleep(args.interval)


def run_sync_agent(args) -> int:
    agent = SyncAgent(
        backend_url=args.backend_url,
        cluster_name=args.cluster_name,
        kubeconfig_path=args.kubeconfig,
        kube_context=args.kube_context,
    )

    if not agent.health_check():
        logger.error("Backend at %s is not reachable. Aborting.", args.backend_url)
        return 1

    if args.daemon:
        agent.run_daemon(interval=args.interval)
        return 0
    else:
        processed = agent.run_once(max_jobs=args.max_jobs)
        logger.info("Sync agent processed %d job(s)", processed)
        return 0


def run_full_daemon(args):
    import threading

    logger.info("Running full daemon: drift detection + sync agent (interval=%ds)", args.interval)

    def scan_loop():
        while True:
            try:
                run_scan(args)
            except Exception as e:
                logger.exception("Scan loop failed: %s", e)
            time.sleep(args.interval)

    def sync_loop():
        agent = SyncAgent(
            backend_url=args.backend_url,
            cluster_name=args.cluster_name,
            kubeconfig_path=args.kubeconfig,
            kube_context=args.kube_context,
        )
        agent.run_daemon(interval=args.sync_interval)

    scan_thread = threading.Thread(target=scan_loop, daemon=True)
    sync_thread = threading.Thread(target=sync_loop, daemon=True)

    scan_thread.start()
    sync_thread.start()

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        logger.info("Shutting down full daemon...")


def main():
    parser = argparse.ArgumentParser(
        description="GitOps Configuration Drift Detection CLI"
    )
    sub = parser.add_subparsers(dest="command", help="Available commands")

    scan_parser = sub.add_parser("scan", help="Run a single drift detection scan")
    _add_common_args(scan_parser)

    daemon_parser = sub.add_parser("daemon", help="Run drift detection continuously")
    _add_common_args(daemon_parser)
    daemon_parser.add_argument(
        "--interval", type=int, default=300,
        help="Scan interval in seconds (default: 300)"
    )

    sync_parser = sub.add_parser("sync-agent", help="Run sync agent to apply Git config to cluster")
    sync_parser.add_argument("--backend-url", default="http://localhost:8000", help="Dashboard backend URL")
    sync_parser.add_argument("--cluster-name", default="default", help="Cluster name identifier")
    sync_parser.add_argument("--kubeconfig", default=None, help="Path to kubeconfig file")
    sync_parser.add_argument("--kube-context", default=None, help="Kubernetes context name")
    sync_parser.add_argument("--max-jobs", type=int, default=5, help="Max jobs to process per cycle")
    sync_parser.add_argument("--daemon", action="store_true", help="Run as daemon")
    sync_parser.add_argument("--interval", type=int, default=30, help="Poll interval in seconds (daemon mode)")

    full_parser = sub.add_parser("full-daemon", help="Run both drift detection and sync agent")
    _add_common_args(full_parser)
    full_parser.add_argument("--interval", type=int, default=300, help="Scan interval in seconds (default: 300)")
    full_parser.add_argument("--sync-interval", type=int, default=30, help="Sync agent poll interval in seconds (default: 30)")

    args = parser.parse_args()

    if args.command == "scan":
        sys.exit(run_scan(args))
    elif args.command == "daemon":
        run_daemon(args)
    elif args.command == "sync-agent":
        sys.exit(run_sync_agent(args))
    elif args.command == "full-daemon":
        run_full_daemon(args)
    else:
        parser.print_help()
        sys.exit(1)


def _add_common_args(parser):
    parser.add_argument("--git-repo", required=True, help="Git repository URL")
    parser.add_argument("--git-branch", default="main", help="Git branch (default: main)")
    parser.add_argument("--git-token", default=None, help="Git access token")
    parser.add_argument("--kubeconfig", default=None, help="Path to kubeconfig file")
    parser.add_argument("--kube-context", default=None, help="Kubernetes context name")
    parser.add_argument("--backend-url", default="http://localhost:8000", help="Dashboard backend URL")
    parser.add_argument("--cluster-name", default="default", help="Cluster name identifier")
    parser.add_argument("--yaml-dirs", default=None, help="Comma-separated list of YAML directories in repo")
    parser.add_argument("--work-dir", default=None, help="Working directory for git clone")
    parser.add_argument("--ignore-fields", default=None, help="Comma-separated list of field paths to ignore")


if __name__ == "__main__":
    main()
