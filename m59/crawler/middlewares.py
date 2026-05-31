import json
import logging
import random
import time

from scrapy import signals
from scrapy.exceptions import DropItem, IgnoreRequest
from scrapy.http import Request
from scrapy.utils.response import response_status_message

from scheduler.dedup import DedupService
from common.config import settings
from common.proxy import ProxyPool

logger = logging.getLogger(__name__)


class RedisDedupMiddleware:
    def __init__(self):
        self.dedup = DedupService()

    @classmethod
    def from_crawler(cls, crawler):
        return cls()

    def process_request(self, request, spider):
        url = request.url
        method = request.method
        if self.dedup.is_duplicate(url, method):
            task_info = request.meta.get("task_info", {})
            task_id = task_info.get("task_id")
            if task_id:
                from scheduler.queue import TaskQueue
                TaskQueue().update_task_status(task_id, "duplicate")
            logger.debug("Duplicate request dropped: %s", url)
            raise IgnoreRequest(f"Duplicate URL: {url}")
        return None


class RetryWithBackoffMiddleware:
    def __init__(self):
        self.max_retry_times = settings.retry_max_times
        self.retry_http_codes = settings.retry_http_codes
        self.backoff_base = settings.retry_backoff_base
        self.backoff_max = settings.retry_backoff_max
        self._queue = None
        self._proxy_pool = None

    @classmethod
    def from_crawler(cls, crawler):
        return cls()

    @property
    def queue(self):
        if self._queue is None:
            from scheduler.queue import TaskQueue
            self._queue = TaskQueue()
        return self._queue

    @property
    def proxy_pool(self):
        if self._proxy_pool is None:
            self._proxy_pool = ProxyPool()
        return self._proxy_pool

    def process_response(self, request, response, spider):
        if response.status not in self.retry_http_codes:
            return response

        retry_times = request.meta.get("retry_times", 0)
        task_info = request.meta.get("task_info", {})
        task_id = task_info.get("task_id", "unknown")
        url = request.url

        if retry_times >= self.max_retry_times:
            logger.warning(
                "Max retries (%d) reached for %s [HTTP %d], giving up. task_id=%s",
                retry_times, url, response.status, task_id,
            )
            if task_id:
                self.queue.update_task_status(task_id, "failed")
            return response

        if response.status in (403, 429):
            proxy = request.meta.get("proxy")
            if proxy:
                self.proxy_pool.record_failure(proxy)
                fail_count = self._get_proxy_fail_count(proxy)
                if fail_count >= settings.proxy_ban_threshold:
                    self.proxy_pool.mark_banned(proxy, ban_seconds=settings.proxy_temp_ban_seconds)
                    logger.warning("Proxy banned (fail_count=%d): %s", fail_count, proxy)

        backoff = min(self.backoff_base ** retry_times + random.uniform(0, 1), self.backoff_max)
        logger.warning(
            "Retrying (attempt %d/%d) in %.1fs: %s [HTTP %d] task_id=%s",
            retry_times + 1, self.max_retry_times, backoff, url, response.status, task_id,
        )

        time.sleep(backoff)

        new_meta = dict(request.meta)
        new_meta["retry_times"] = retry_times + 1
        new_meta["dont_redirect"] = True

        if settings.proxy_enabled:
            new_proxy = self.proxy_pool.get_proxy()
            if new_proxy:
                new_meta["proxy"] = new_proxy
                logger.info("Switching proxy for retry: %s", new_proxy)

        retry_request = Request(
            url=url,
            method=request.method,
            body=request.body,
            headers=request.headers,
            meta=new_meta,
            callback=request.callback,
            errback=request.errback,
            dont_filter=True,
        )
        return retry_request

    def process_exception(self, request, exception, spider):
        retry_times = request.meta.get("retry_times", 0)
        if retry_times >= self.max_retry_times:
            return None

        task_info = request.meta.get("task_info", {})
        task_id = task_info.get("task_id", "unknown")

        backoff = min(self.backoff_base ** retry_times + random.uniform(0, 1), self.backoff_max)
        logger.warning(
            "Retrying (attempt %d/%d) in %.1fs due to exception: %s url=%s task_id=%s",
            retry_times + 1, self.max_retry_times, backoff, str(exception), request.url, task_id,
        )

        time.sleep(backoff)

        new_meta = dict(request.meta)
        new_meta["retry_times"] = retry_times + 1

        if settings.proxy_enabled:
            new_proxy = self.proxy_pool.get_proxy()
            if new_proxy:
                new_meta["proxy"] = new_proxy

        return Request(
            url=request.url,
            method=request.method,
            body=request.body,
            headers=request.headers,
            meta=new_meta,
            callback=request.callback,
            errback=request.errback,
            dont_filter=True,
        )

    def _get_proxy_fail_count(self, proxy: str) -> int:
        stats = self.proxy_pool.get_proxy_stats(proxy)
        if stats:
            return stats.get("fail_count", 0)
        return 0


class ProxyRotationMiddleware:
    def __init__(self):
        self._proxy_pool = None

    @classmethod
    def from_crawler(cls, crawler):
        return cls()

    @property
    def proxy_pool(self):
        if self._proxy_pool is None:
            self._proxy_pool = ProxyPool()
        return self._proxy_pool

    def process_request(self, request, spider):
        if not settings.proxy_enabled:
            return None

        if request.meta.get("proxy"):
            return None

        proxy = self.proxy_pool.get_proxy()
        if proxy:
            request.meta["proxy"] = proxy
            logger.debug("Assigned proxy: %s for %s", proxy, request.url)
        else:
            logger.debug("No proxy available, using direct connection for %s", request.url)
        return None

    def process_response(self, request, response, spider):
        if not settings.proxy_enabled:
            return response

        proxy = request.meta.get("proxy")
        if not proxy:
            return response

        if response.status in (403, 429):
            self.proxy_pool.record_failure(proxy)
            logger.warning("Proxy got %d: %s for %s", response.status, proxy, request.url)
        else:
            self.proxy_pool.record_success(proxy)

        return response

    def process_exception(self, request, exception, spider):
        if not settings.proxy_enabled:
            return None

        proxy = request.meta.get("proxy")
        if proxy:
            self.proxy_pool.record_failure(proxy)
            logger.warning("Proxy connection failed: %s - %s", proxy, str(exception))

        return None


class RedisResultPipeline:
    def __init__(self):
        self._queue = None
        self._stats = None

    @classmethod
    def from_crawler(cls, crawler):
        return cls()

    @property
    def queue(self):
        if self._queue is None:
            from scheduler.queue import TaskQueue
            self._queue = TaskQueue()
        return self._queue

    @property
    def stats(self):
        if self._stats is None:
            from common.stats import StatsCollector
            self._stats = StatsCollector()
        return self._stats

    def process_item(self, item, spider):
        task_info = item.get("task_info", {})
        task_id = task_info.get("task_id", "unknown")

        result_data = {
            "task_id": task_id,
            "spider_name": item.get("spider_name", spider.name),
            "url": item.get("url"),
            "status_code": item.get("status_code"),
            "title": item.get("title"),
            "meta_description": item.get("meta_description"),
            "keywords": item.get("keywords"),
            "content": item.get("content"),
            "links": item.get("links", []),
            "crawled_at": time.time(),
        }

        self.queue.push_result(result_data)

        if task_id:
            self.queue.update_task_status(task_id, "completed")

        started_at = task_info.get("started_at", 0)
        response_time = (time.time() - started_at) if started_at else 0.0
        self.stats.record_crawl(
            status_code=item.get("status_code", 0),
            response_time=response_time,
            task_id=task_id,
        )

        logger.info("Result pushed to Redis: task_id=%s url=%s", task_id, item.get("url"))
        return item
