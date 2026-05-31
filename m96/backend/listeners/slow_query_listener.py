import re
import asyncio
from typing import Callable, Optional
from datetime import datetime
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class SlowQueryEntry:
    def __init__(
        self,
        timestamp: datetime,
        query_time: float,
        lock_time: float,
        rows_sent: int,
        rows_examined: int,
        sql: str,
        database: str = "",
        user: str = "",
        host: str = "",
    ):
        self.timestamp = timestamp
        self.query_time = query_time
        self.lock_time = lock_time
        self.rows_sent = rows_sent
        self.rows_examined = rows_examined
        self.sql = sql
        self.database = database
        self.user = user
        self.host = host

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "query_time": self.query_time,
            "lock_time": self.lock_time,
            "rows_sent": self.rows_sent,
            "rows_examined": self.rows_examined,
            "sql": self.sql,
            "database": self.database,
            "user": self.user,
            "host": self.host,
            "type": "slow_query",
        }


class SlowQueryListener:
    def __init__(self, log_path: str, callback: Optional[Callable[[SlowQueryEntry], None]] = None):
        self.log_path = Path(log_path)
        self.callback = callback
        self._running = False
        self._file_position = 0

    async def start(self):
        if not self.log_path.exists():
            logger.warning(f"慢查询日志文件不存在: {self.log_path}")
            return

        self._running = True
        self._file_position = self.log_path.stat().st_size
        logger.info(f"开始监听慢查询日志: {self.log_path}")

        while self._running:
            await self._check_new_lines()
            await asyncio.sleep(1)

    def stop(self):
        self._running = False
        logger.info("停止监听慢查询日志")

    async def _check_new_lines(self):
        try:
            current_size = self.log_path.stat().st_size
            if current_size < self._file_position:
                self._file_position = 0

            if current_size > self._file_position:
                with open(self.log_path, "r", encoding="utf-8", errors="ignore") as f:
                    f.seek(self._file_position)
                    new_content = f.read()
                    self._file_position = f.tell()
                    await self._parse_content(new_content)
        except Exception as e:
            logger.error(f"读取慢查询日志出错: {e}")

    async def _parse_content(self, content: str):
        entries = self._parse_slow_query_log(content)
        for entry in entries:
            if self.callback:
                if asyncio.iscoroutinefunction(self.callback):
                    await self.callback(entry)
                else:
                    self.callback(entry)

    def _parse_slow_query_log(self, content: str) -> list[SlowQueryEntry]:
        entries = []
        lines = content.split("\n")

        current_entry = None
        sql_lines = []

        time_pattern = re.compile(r"^# Time: (\d{6}\s+\d{1,2}:\d{2}:\d{2})")
        user_host_pattern = re.compile(r"^# User@Host: ([^\[]*)\[[^\]]*\]\s+@\s+([^\s]*)\s*\[[^\]]*\]")
        stats_pattern = re.compile(
            r"^# Query_time: ([\d.]+)\s+Lock_time: ([\d.]+)\s+Rows_sent: (\d+)\s+Rows_examined: (\d+)"
        )
        db_pattern = re.compile(r"^use (\w+);")

        for line in lines:
            time_match = time_pattern.match(line)
            if time_match:
                if current_entry and sql_lines:
                    current_entry.sql = " ".join(sql_lines).strip()
                    entries.append(current_entry)
                timestamp_str = time_match.group(1)
                timestamp = datetime.strptime(timestamp_str, "%y%m%d %H:%M:%S")
                current_entry = SlowQueryEntry(
                    timestamp=timestamp,
                    query_time=0,
                    lock_time=0,
                    rows_sent=0,
                    rows_examined=0,
                    sql="",
                )
                sql_lines = []
                continue

            if current_entry is None:
                continue

            user_host_match = user_host_pattern.match(line)
            if user_host_match:
                current_entry.user = user_host_match.group(1).strip()
                current_entry.host = user_host_match.group(2).strip()
                continue

            stats_match = stats_pattern.match(line)
            if stats_match:
                current_entry.query_time = float(stats_match.group(1))
                current_entry.lock_time = float(stats_match.group(2))
                current_entry.rows_sent = int(stats_match.group(3))
                current_entry.rows_examined = int(stats_match.group(4))
                continue

            db_match = db_pattern.match(line)
            if db_match:
                current_entry.database = db_match.group(1)
                continue

            if line.startswith("#"):
                continue

            if line.strip():
                sql_lines.append(line.strip())

        if current_entry and sql_lines:
            current_entry.sql = " ".join(sql_lines).strip()
            entries.append(current_entry)

        return entries

    def parse_existing_log(self) -> list[SlowQueryEntry]:
        if not self.log_path.exists():
            return []
        with open(self.log_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return self._parse_slow_query_log(content)
