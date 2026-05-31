import logging
import time

from common.config import settings
from cleaner.transform import Cleaner
from scheduler.queue import TaskQueue
from storage.mongo import MongoStorage

logger = logging.getLogger(__name__)


class CleanerWorker:
    def __init__(self):
        self.queue = TaskQueue()
        self.cleaner = Cleaner()
        self.storage = MongoStorage()
        self.running = False
        self._stats = None

    @property
    def stats(self):
        if self._stats is None:
            from common.stats import StatsCollector
            self._stats = StatsCollector()
        return self._stats

    def start(self):
        self.running = True
        logger.info("Cleaner worker started, polling interval=%.1fs", settings.cleaner_poll_interval)
        while self.running:
            try:
                self._process_one()
            except KeyboardInterrupt:
                self.running = False
                break
            except Exception as e:
                logger.error("Cleaner error: %s", e, exc_info=True)
                time.sleep(settings.cleaner_poll_interval)

    def _process_one(self):
        result = self.queue.pop_result(timeout=int(settings.cleaner_poll_interval))
        if result is None:
            return

        task_id = result.get("task_id", "unknown")
        url = result.get("url", "")
        logger.info("Cleaning: task_id=%s url=%s", task_id, url)

        if not self.cleaner.validate(result):
            logger.warning("Invalid data, skipping: task_id=%s", task_id)
            return

        cleaned_data = self.cleaner.clean(result)

        self.storage.save_raw(result)
        self.storage.save_cleaned(cleaned_data)

        self.queue.push_clean_task({
            "task_id": task_id,
            "url": url,
            "status": "cleaned",
            "cleaned_at": cleaned_data.get("cleaned_at"),
        })

        self.stats.record_clean(task_id=task_id)

        logger.info("Cleaned & stored: task_id=%s url=%s", task_id, url)

    def stop(self):
        self.running = False
        logger.info("Cleaner worker stopped")


def main():
    import sys
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
    )
    worker = CleanerWorker()
    try:
        worker.start()
    except KeyboardInterrupt:
        worker.stop()


if __name__ == "__main__":
    main()
