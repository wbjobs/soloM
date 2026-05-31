import logging
import time
from typing import Dict, List, Optional

from scheduler.dedup import DedupService
from scheduler.queue import TaskQueue

logger = logging.getLogger(__name__)


class Dispatcher:
    def __init__(self):
        self.queue = TaskQueue()
        self.dedup = DedupService()

    def submit_url(
        self,
        url: str,
        spider_name: str = "default",
        method: str = "GET",
        body: Optional[str] = None,
        meta: Optional[Dict] = None,
        priority: int = 0,
    ) -> Optional[str]:
        if self.dedup.check_and_add(url, method, body):
            logger.info("URL already processed, skipped: %s", url)
            return None

        task = {
            "url": url,
            "spider_name": spider_name,
            "method": method,
            "body": body,
            "meta": meta or {},
            "priority": priority,
        }
        task_id = self.queue.push(task)
        logger.info("Task submitted: task_id=%s url=%s", task_id, url)
        return task_id

    def submit_urls(
        self,
        urls: List[str],
        spider_name: str = "default",
        method: str = "GET",
        meta: Optional[Dict] = None,
    ) -> List[str]:
        tasks = []
        for url in urls:
            if self.dedup.check_and_add(url, method):
                logger.info("URL already processed, skipped: %s", url)
                continue
            tasks.append({
                "url": url,
                "spider_name": spider_name,
                "method": method,
                "meta": meta or {},
                "priority": 0,
            })

        if not tasks:
            return []

        task_ids = self.queue.push_batch(tasks)
        logger.info("Batch submitted: %d tasks", len(task_ids))
        return task_ids

    def get_task_status(self, task_id: str) -> Optional[Dict]:
        return self.queue.get_task_status(task_id)

    def mark_complete(self, task_id: str):
        self.queue.update_task_status(task_id, "completed")

    def mark_failed(self, task_id: str):
        self.queue.update_task_status(task_id, "failed")

    def get_queue_stats(self) -> Dict:
        return {
            "pending_tasks": self.queue.get_queue_size(),
            "result_queue_size": self.queue.get_result_queue_size(),
            "dedup_count": self.dedup.count(),
            "dead_task_count": self.queue.get_dead_task_count(),
            "redis_alive": self.queue.ping(),
        }

    def clear_dedup(self):
        self.dedup.clear_all()
        logger.info("Dedup fingerprints cleared")
