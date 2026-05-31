import logging

from scrapy import Spider, Request
from scrapy.signals import spider_idle

from scheduler.queue import TaskQueue
from common.config import settings


logger = logging.getLogger(__name__)


class RedisSpiderMixin:
    task_queue: TaskQueue = None
    poll_interval = 1.0

    def start_requests(self):
        if self.task_queue is None:
            self.task_queue = TaskQueue()
        self.crawler.signals.connect(self._on_spider_idle, signal=spider_idle)
        return self._fetch_tasks()

    def _fetch_tasks(self):
        while True:
            task = self.task_queue.pop(timeout=2)
            if task is None:
                break
            yield self._make_request(task)

    def _on_spider_idle(self, spider):
        if self.task_queue is None:
            return
        task = self.task_queue.pop(timeout=0)
        if task:
            request = self._make_request(task)
            self.crawler.engine.crawl(request)
            logger.info("Idle spider got new task: %s", task.get("url"))

    def _make_request(self, task):
        url = task["url"]
        method = task.get("method", "GET")
        meta = task.get("meta", {})
        meta["task_info"] = task
        retry_count = task.get("retry_count", 0)
        if retry_count > 0:
            meta["retry_times"] = retry_count
        logger.info("Crawling task: %s url=%s retry=%d", task.get("task_id"), url, retry_count)
        return Request(
            url=url,
            method=method,
            body=task.get("body"),
            meta=meta,
            callback=self.parse,
            errback=self._on_error,
            dont_filter=True,
        )

    def _on_error(self, failure):
        task_info = failure.request.meta.get("task_info", {})
        task_id = task_info.get("task_id")
        retry_times = failure.request.meta.get("retry_times", 0)

        if retry_times < settings.retry_max_times:
            logger.warning(
                "Request error (will be retried by middleware): %s - %s",
                failure.request.url, failure.value,
            )
            return

        if task_id and self.task_queue:
            self.task_queue.update_task_status(task_id, "failed")
        logger.error("Request failed permanently: %s - %s", failure.request.url, failure.value)
