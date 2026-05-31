import json
import logging
import time
from datetime import datetime, timezone
from typing import Dict, Optional

import redis

from common.config import settings

logger = logging.getLogger(__name__)


class StatsCollector:
    def __init__(self):
        self.redis = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password or None,
            decode_responses=True,
        )
        self.key = settings.stats_redis_key
        self.channel = settings.stats_channel

    @staticmethod
    def _today_key() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def record_crawl(self, status_code: int, response_time: float = 0.0, task_id: str = ""):
        today = self._today_key()
        pipe = self.redis.pipeline()
        pipe.hincrby(f"{self.key}:{today}", "total_crawled", 1)
        if 200 <= status_code < 400:
            pipe.hincrby(f"{self.key}:{today}", "success_count", 1)
        else:
            pipe.hincrby(f"{self.key}:{today}", "fail_count", 1)
        if response_time > 0:
            pipe.hincrby(f"{self.key}:{today}", "response_time_sum", int(response_time * 1000))
            pipe.hincrby(f"{self.key}:{today}", "response_time_count", 1)
        pipe.hset(f"{self.key}:{today}", "last_updated", time.time())
        pipe.expire(f"{self.key}:{today}", 86400 * 2)
        pipe.execute()
        self._publish_update(today)

    def record_clean(self, task_id: str = ""):
        today = self._today_key()
        pipe = self.redis.pipeline()
        pipe.hincrby(f"{self.key}:{today}", "cleaned_count", 1)
        pipe.hset(f"{self.key}:{today}", "last_updated", time.time())
        pipe.expire(f"{self.key}:{today}", 86400 * 2)
        pipe.execute()
        self._publish_update(today)

    def get_today_stats(self) -> Dict:
        today = self._today_key()
        data = self.redis.hgetall(f"{self.key}:{today}")
        total = int(data.get("total_crawled", 0))
        success = int(data.get("success_count", 0))
        fail = int(data.get("fail_count", 0))
        cleaned = int(data.get("cleaned_count", 0))
        rt_sum = int(data.get("response_time_sum", 0))
        rt_count = int(data.get("response_time_count", 0))
        avg_rt = (rt_sum / rt_count / 1000.0) if rt_count > 0 else 0.0
        success_rate = (success / total * 100) if total > 0 else 0.0

        return {
            "date": today,
            "total_crawled": total,
            "success_count": success,
            "fail_count": fail,
            "cleaned_count": cleaned,
            "success_rate": round(success_rate, 2),
            "avg_response_time": round(avg_rt, 3),
            "last_updated": float(data.get("last_updated", 0)),
        }

    def get_dashboard_stats(self) -> Dict:
        today_stats = self.get_today_stats()

        from scheduler.queue import TaskQueue
        from common.proxy import ProxyPool

        queue = TaskQueue()
        pool = ProxyPool()

        try:
            queue_stats = {
                "pending_tasks": queue.get_queue_size(),
                "result_queue_size": queue.get_result_queue_size(),
            }
        except Exception:
            queue_stats = {"pending_tasks": 0, "result_queue_size": 0}

        try:
            proxy_stats = {
                "proxy_available": pool.count(),
                "proxy_blacklisted": pool.blacklist_count(),
            }
        except Exception:
            proxy_stats = {"proxy_available": 0, "proxy_blacklisted": 0}

        return {
            **today_stats,
            **queue_stats,
            **proxy_stats,
            "timestamp": time.time(),
        }

    def _publish_update(self, today: str):
        try:
            stats = self.get_today_stats()
            self.redis.publish(self.channel, json.dumps(stats, ensure_ascii=False))
        except Exception as e:
            logger.debug("Stats publish failed: %s", e)
