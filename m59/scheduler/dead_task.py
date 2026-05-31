import json
import logging
import time
from typing import Dict, List, Tuple

from common.config import settings
from scheduler.queue import TaskQueue

logger = logging.getLogger(__name__)


class DeadTaskDetector:
    def __init__(self):
        self.queue = TaskQueue()
        self.max_retries = settings.dead_task_max_retries

    def scan_dead_tasks(self) -> List[str]:
        dead_ids = self.queue.get_dead_tasks()
        if dead_ids:
            logger.warning("Detected %d dead tasks: %s", len(dead_ids), dead_ids[:10])
        return dead_ids

    def process_dead_task(self, task_id: str) -> str:
        status_info = self.queue.get_task_status(task_id)
        if status_info is None:
            self.queue.remove_from_dead_tasks(task_id)
            return "expired"

        task = status_info.get("task")
        if task is None:
            self.queue.update_task_status(task_id, "dead")
            return "dead"

        retry_count = task.get("retry_count", 0)

        if retry_count >= self.max_retries:
            self.queue.update_task_status(task_id, "dead")
            logger.warning("Task exceeded max retries (%d), marked dead: %s", self.max_retries, task_id)
            return "dead"

        self.queue.requeue_task(task, increment_retry=True)
        logger.info(
            "Dead task requeued: task_id=%s retry_count=%d->%d url=%s",
            task_id,
            retry_count,
            retry_count + 1,
            task.get("url", "unknown"),
        )
        return "requeued"

    def process_all_dead_tasks(self) -> Dict[str, int]:
        dead_ids = self.scan_dead_tasks()
        results = {"requeued": 0, "dead": 0, "expired": 0}
        for task_id in dead_ids:
            result = self.process_dead_task(task_id)
            results[result] = results.get(result, 0) + 1
        if results["requeued"] + results["dead"] + results["expired"] > 0:
            logger.info("Dead task processing result: %s", results)
        return results

    def get_stats(self) -> Dict:
        dead_count = self.queue.get_dead_task_count()
        return {
            "dead_task_count": dead_count,
            "task_timeout_seconds": settings.task_timeout_seconds,
            "max_retries": self.max_retries,
        }


class DeadTaskWorker:
    def __init__(self):
        self.detector = DeadTaskDetector()
        self.running = False

    def start(self):
        self.running = True
        logger.info(
            "Dead task worker started, check_interval=%ds",
            settings.dead_task_check_interval,
        )
        while self.running:
            try:
                self.detector.process_all_dead_tasks()
            except KeyboardInterrupt:
                self.running = False
                break
            except Exception as e:
                logger.error("Dead task worker error: %s", e, exc_info=True)
            time.sleep(settings.dead_task_check_interval)

    def stop(self):
        self.running = False
        logger.info("Dead task worker stopped")


def main():
    import sys
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
    )
    worker = DeadTaskWorker()
    try:
        worker.start()
    except KeyboardInterrupt:
        worker.stop()


if __name__ == "__main__":
    main()
