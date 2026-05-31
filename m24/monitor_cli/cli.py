import json
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import click
import docker
from rich.console import Console
from rich.table import Table

from .ring_buffer import (
    ContainerSnapshot,
    PollSnapshot,
    RingBuffer,
    compact_history_file,
    load_history,
    persist_snapshot,
)


@dataclass
class ContainerPeak:
    name: str
    short_id: str
    peak_cpu_pct: float = 0.0
    peak_mem_pct: float = 0.0
    peak_mem_usage: int = 0
    last_mem_limit: int = 1
    last_seen: float = field(default_factory=time.time)
    is_running: bool = True


_peak_cache: Dict[str, ContainerPeak] = {}
_CACHE_TTL_SECONDS = 300


def _get_docker_client():
    try:
        client = docker.from_env()
        client.ping()
        return client
    except docker.errors.DockerException as exc:
        raise click.ClickException(
            f"Cannot connect to Docker daemon: {exc}\n"
            "Make sure Docker is running and accessible."
        )


def _safe_get(d, *keys, default=None):
    cur = d
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


def _calc_cpu_percent(stats):
    if not isinstance(stats, dict):
        return 0.0

    cpu_total = _safe_get(stats, "cpu_stats", "cpu_usage", "total_usage", default=0)
    precpu_total = _safe_get(stats, "precpu_stats", "cpu_usage", "total_usage", default=0)
    cpu_delta = cpu_total - precpu_total

    system_cpu = _safe_get(stats, "cpu_stats", "system_cpu_usage", default=0)
    presystem_cpu = _safe_get(stats, "precpu_stats", "system_cpu_usage", default=0)
    system_delta = system_cpu - presystem_cpu

    online_cpus = _safe_get(stats, "cpu_stats", "online_cpus", default=None)
    if online_cpus is None:
        percpu = _safe_get(stats, "cpu_stats", "cpu_usage", "percpu_usage", default=[])
        online_cpus = len(percpu) if percpu else 1

    if system_delta > 0 and cpu_delta > 0 and online_cpus > 0:
        return (cpu_delta / system_delta) * online_cpus * 100.0
    return 0.0


def _calc_memory_usage(stats):
    if not isinstance(stats, dict):
        return 0, 1
    usage = _safe_get(stats, "memory_stats", "usage", default=0)
    limit = _safe_get(stats, "memory_stats", "limit", default=1)
    return usage, limit


def _format_bytes(value):
    if value < 1024:
        return f"{value} B"
    elif value < 1024 * 1024:
        return f"{value / 1024:.1f} KB"
    elif value < 1024 * 1024 * 1024:
        return f"{value / (1024 * 1024):.1f} MB"
    else:
        return f"{value / (1024 * 1024 * 1024):.2f} GB"


def _update_peak_cache(container_id: str, name: str, short_id: str,
                       cpu_pct: float, mem_usage: int, mem_limit: int,
                       mem_pct: float, is_running: bool) -> ContainerPeak:
    now = time.time()
    if container_id not in _peak_cache:
        _peak_cache[container_id] = ContainerPeak(
            name=name, short_id=short_id,
            peak_cpu_pct=cpu_pct,
            peak_mem_pct=mem_pct,
            peak_mem_usage=mem_usage,
            last_mem_limit=mem_limit,
            last_seen=now, is_running=is_running,
        )
    else:
        rec = _peak_cache[container_id]
        rec.name = name
        rec.short_id = short_id
        rec.peak_cpu_pct = max(rec.peak_cpu_pct, cpu_pct)
        if mem_pct > rec.peak_mem_pct:
            rec.peak_mem_pct = mem_pct
            rec.peak_mem_usage = mem_usage
        rec.last_mem_limit = mem_limit
        rec.last_seen = now
        rec.is_running = is_running
    return _peak_cache[container_id]


def _cleanup_expired_cache():
    now = time.time()
    expired = [cid for cid, rec in _peak_cache.items()
               if not rec.is_running and (now - rec.last_seen) > _CACHE_TTL_SECONDS]
    for cid in expired:
        del _peak_cache[cid]


def _mark_all_cached_not_running():
    for rec in _peak_cache.values():
        rec.is_running = False


def _collect_container_stats():
    client = _get_docker_client()
    _mark_all_cached_not_running()

    current_data: Dict[str, dict] = {}
    try:
        containers = client.containers.list()
    except docker.errors.APIError:
        containers = []

    for container in containers:
        container_id = container.id
        try:
            try:
                stats = container.stats(stream=False)
            except (docker.errors.APIError, docker.errors.NotFound):
                stats = {}

            cpu_pct = _calc_cpu_percent(stats)
            mem_usage, mem_limit = _calc_memory_usage(stats)
            mem_pct = (mem_usage / mem_limit) * 100.0 if mem_limit > 0 else 0.0

            _update_peak_cache(
                container_id=container_id,
                name=container.name,
                short_id=container.short_id,
                cpu_pct=cpu_pct,
                mem_usage=mem_usage,
                mem_limit=mem_limit,
                mem_pct=mem_pct,
                is_running=True,
            )

            current_data[container_id] = {
                "cpu_pct": cpu_pct,
                "mem_usage": mem_usage,
                "mem_limit": mem_limit,
                "mem_pct": mem_pct,
            }
        except Exception:
            pass

    _cleanup_expired_cache()

    results = []
    for container_id, rec in _peak_cache.items():
        if container_id in current_data:
            cur = current_data[container_id]
            results.append({
                "name": rec.name,
                "id": rec.short_id,
                "cpu_pct": cur["cpu_pct"],
                "mem_usage": cur["mem_usage"],
                "mem_limit": cur["mem_limit"],
                "mem_pct": cur["mem_pct"],
                "peak_cpu_pct": rec.peak_cpu_pct,
                "peak_mem_pct": rec.peak_mem_pct,
                "is_running": True,
            })
        else:
            results.append({
                "name": rec.name,
                "id": rec.short_id,
                "cpu_pct": rec.peak_cpu_pct,
                "mem_usage": rec.peak_mem_usage,
                "mem_limit": rec.last_mem_limit,
                "mem_pct": rec.peak_mem_pct,
                "peak_cpu_pct": rec.peak_cpu_pct,
                "peak_mem_pct": rec.peak_mem_pct,
                "is_running": False,
            })
    return results


@click.group()
def cli():
    """Docker container monitoring CLI tool."""
    pass


@cli.command()
@click.option("--show-peaks/--no-show-peaks", default=True, help="Show peak values for terminated transient containers.")
def status(show_peaks):
    """Show a table of all running containers with CPU and memory usage."""
    console = Console()
    containers = _collect_container_stats()

    if not containers:
        console.print("[yellow]No running containers found.[/yellow]")
        return

    table = Table(title="Running Containers", show_lines=True)
    table.add_column("Status", style="dim", no_wrap=True)
    table.add_column("Container", style="cyan", no_wrap=True)
    table.add_column("ID", style="dim")
    table.add_column("CPU %", justify="right")
    table.add_column("Memory Usage", justify="right")
    table.add_column("Memory %", justify="right")

    for c in containers:
        if c["is_running"]:
            status_str = "[green]RUNNING[/green]"
        else:
            status_str = "[red]TERMINATED[/red]"
            if not show_peaks:
                continue

        cpu_str = f"{c['cpu_pct']:.1f}%"
        mem_str = f"{_format_bytes(c['mem_usage'])} / {_format_bytes(c['mem_limit'])}"
        mem_pct_str = f"{c['mem_pct']:.1f}%"

        cpu_style = "red" if c["cpu_pct"] > 80 else "green"
        mem_style = "red" if c["mem_pct"] > 80 else "green"

        table.add_row(
            status_str,
            c["name"],
            c["id"],
            f"[{cpu_style}]{cpu_str}[/{cpu_style}]",
            mem_str,
            f"[{mem_style}]{mem_pct_str}[/{mem_style}]",
        )

    console.print(table)


@cli.command()
@click.option("--limit", default=80.0, type=float, help="Alert threshold percentage for CPU/memory.")
@click.option("--interval", default=5.0, type=float, help="Polling interval in seconds.")
def watch(limit, interval):
    """Real-time monitoring with alerts when CPU or memory exceeds threshold."""
    console = Console()
    console.print(f"[bold]Watching containers (threshold: {limit}%, interval: {interval}s)[/bold]")
    console.print("[dim]Press Ctrl+C to stop.[/dim]")
    console.print("[dim]Data is recorded for the 'report' command.[/dim]\n")

    triggered_alerts: Dict[str, set] = defaultdict(set)
    ring = RingBuffer()
    persist_counter = 0

    try:
        while True:
            poll_snapshots: list = []
            try:
                client = _get_docker_client()
                _mark_all_cached_not_running()

                try:
                    containers = client.containers.list()
                except docker.errors.APIError:
                    containers = []

                for container in containers:
                    try:
                        try:
                            stats = container.stats(stream=False)
                        except (docker.errors.APIError, docker.errors.NotFound):
                            continue

                        cpu_pct = _calc_cpu_percent(stats)
                        mem_usage, mem_limit = _calc_memory_usage(stats)
                        mem_pct = (mem_usage / mem_limit) * 100.0 if mem_limit > 0 else 0.0

                        rec = _update_peak_cache(
                            container_id=container.id,
                            name=container.name,
                            short_id=container.short_id,
                            cpu_pct=cpu_pct,
                            mem_usage=mem_usage,
                            mem_limit=mem_limit,
                            mem_pct=mem_pct,
                            is_running=True,
                        )

                        poll_snapshots.append(ContainerSnapshot(
                            timestamp=time.time(),
                            name=container.name,
                            container_id=container.short_id,
                            cpu_pct=cpu_pct,
                            mem_usage=mem_usage,
                            mem_limit=mem_limit,
                            mem_pct=mem_pct,
                            is_running=True,
                        ))

                        alerts = []
                        alert_key_cpu = f"cpu-{limit}"
                        alert_key_mem = f"mem-{limit}"

                        if cpu_pct > limit and alert_key_cpu not in triggered_alerts[container.id]:
                            alerts.append(f"CPU={cpu_pct:.1f}% (peak={rec.peak_cpu_pct:.1f}%)")
                            triggered_alerts[container.id].add(alert_key_cpu)
                        elif cpu_pct <= limit and alert_key_cpu in triggered_alerts[container.id]:
                            triggered_alerts[container.id].discard(alert_key_cpu)

                        if mem_pct > limit and alert_key_mem not in triggered_alerts[container.id]:
                            alerts.append(f"MEM={mem_pct:.1f}% (peak={rec.peak_mem_pct:.1f}%)")
                            triggered_alerts[container.id].add(alert_key_mem)
                        elif mem_pct <= limit and alert_key_mem in triggered_alerts[container.id]:
                            triggered_alerts[container.id].discard(alert_key_mem)

                        if alerts:
                            alert_msg = " | ".join(alerts)
                            console.print(
                                f"[bold red][ALERT] {container.name} ({container.short_id}) — {alert_msg}[/bold red]"
                            )
                    except Exception:
                        continue

                _cleanup_expired_cache()
            except click.ClickException:
                raise
            except Exception as exc:
                console.print(f"[dim yellow]Warning: poll error ({exc}), retrying in {interval}s...[/dim yellow]")

            if poll_snapshots:
                now = time.time()
                poll = PollSnapshot(timestamp=now, containers=poll_snapshots)
                ring.push(poll)

                persist_counter += 1
                if persist_counter % 3 == 0:
                    try:
                        persist_snapshot(poll)
                    except OSError as exc:
                        console.print(f"[dim yellow]Warning: failed to persist data ({exc})[/dim yellow]")

                    if persist_counter % 36 == 0:
                        try:
                            compact_history_file()
                        except Exception:
                            pass

            time.sleep(interval)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopped watching.[/yellow]")


@cli.command()
@click.option("--format", "output_format", type=click.Choice(["json"], case_sensitive=False), default="json", help="Output format for the report.")
@click.option("--output", "-o", "output_path", type=click.Path(), default=None, help="Output file path. Defaults to ./monitor_report_<timestamp>.json")
@click.option("--window", default=60, type=int, help="Time window in seconds to include in the report.")
def report(output_format, output_path, window):
    """Export monitoring data from the past minute as a JSON file for analysis."""
    console = Console()

    snapshots = load_history(window_seconds=window)

    if not snapshots:
        console.print(f"[yellow]No monitoring data found in the last {window}s.[/yellow]")
        console.print("[dim]Start 'monitor-cli watch' first to begin recording data.[/dim]")
        return

    report_data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_seconds": window,
        "poll_count": len(snapshots),
        "snapshots": [],
    }

    for snap in snapshots:
        entry = {
            "timestamp": snap.timestamp,
            "iso_time": datetime.fromtimestamp(snap.timestamp, tz=timezone.utc).isoformat(),
            "containers": [asdict(c) for c in snap.containers],
        }
        report_data["snapshots"].append(entry)

    if output_path is None:
        ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = f"monitor_report_{ts_str}.json"

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2, ensure_ascii=False)

    console.print(f"[green]Report exported to {out_file}[/green]")
    console.print(f"[dim]  Polls: {report_data['poll_count']}  |  Window: {window}s[/dim]")


if __name__ == "__main__":
    cli()
