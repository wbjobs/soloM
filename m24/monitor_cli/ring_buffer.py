import json
import os
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Deque, Dict, List, Optional


_HISTORY_DIR = Path.home() / ".monitor_cli"
_HISTORY_FILE = _HISTORY_DIR / "history.jsonl"
_DEFAULT_WINDOW_SECONDS = 60
_MAX_BUFFER_SIZE = 7200


@dataclass
class ContainerSnapshot:
    timestamp: float
    name: str
    container_id: str
    cpu_pct: float
    mem_usage: int
    mem_limit: int
    mem_pct: float
    is_running: bool


@dataclass
class PollSnapshot:
    timestamp: float
    containers: List[ContainerSnapshot] = field(default_factory=list)


class RingBuffer:
    def __init__(self, maxlen: int = _MAX_BUFFER_SIZE):
        self._buf: Deque[PollSnapshot] = deque(maxlen=maxlen)

    def push(self, snapshot: PollSnapshot) -> None:
        self._buf.append(snapshot)

    def query(self, window_seconds: float = _DEFAULT_WINDOW_SECONDS) -> List[PollSnapshot]:
        cutoff = time.time() - window_seconds
        return [s for s in self._buf if s.timestamp >= cutoff]

    def clear(self) -> None:
        self._buf.clear()

    def __len__(self) -> int:
        return len(self._buf)


def _ensure_history_dir() -> None:
    _HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def persist_snapshot(snapshot: PollSnapshot) -> None:
    _ensure_history_dir()
    entry = {
        "timestamp": snapshot.timestamp,
        "containers": [asdict(c) for c in snapshot.containers],
    }
    with open(_HISTORY_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load_history(window_seconds: float = _DEFAULT_WINDOW_SECONDS) -> List[PollSnapshot]:
    cutoff = time.time() - window_seconds
    snapshots: List[PollSnapshot] = []

    if not _HISTORY_FILE.exists():
        return snapshots

    try:
        with open(_HISTORY_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    ts = entry.get("timestamp", 0)
                    if ts < cutoff:
                        continue
                    containers = []
                    for cd in entry.get("containers", []):
                        containers.append(ContainerSnapshot(
                            timestamp=cd.get("timestamp", ts),
                            name=cd.get("name", ""),
                            container_id=cd.get("container_id", ""),
                            cpu_pct=cd.get("cpu_pct", 0.0),
                            mem_usage=cd.get("mem_usage", 0),
                            mem_limit=cd.get("mem_limit", 1),
                            mem_pct=cd.get("mem_pct", 0.0),
                            is_running=cd.get("is_running", True),
                        ))
                    snapshots.append(PollSnapshot(timestamp=ts, containers=containers))
                except (json.JSONDecodeError, TypeError):
                    continue
    except OSError:
        return snapshots

    return snapshots


def compact_history_file(window_seconds: float = _DEFAULT_WINDOW_SECONDS) -> None:
    cutoff = time.time() - window_seconds
    if not _HISTORY_FILE.exists():
        return

    kept: List[str] = []
    try:
        with open(_HISTORY_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line_stripped = line.strip()
                if not line_stripped:
                    continue
                try:
                    entry = json.loads(line_stripped)
                    if entry.get("timestamp", 0) >= cutoff:
                        kept.append(line_stripped)
                except (json.JSONDecodeError, TypeError):
                    continue
    except OSError:
        return

    _ensure_history_dir()
    with open(_HISTORY_FILE, "w", encoding="utf-8") as f:
        for line in kept:
            f.write(line + "\n")
