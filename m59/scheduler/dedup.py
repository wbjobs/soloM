import hashlib
import time
from typing import Optional

import redis

from common.config import settings


class DedupService:
    def __init__(self):
        self.redis = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password or None,
            decode_responses=True,
        )
        self.set_key = settings.dedup_set_key
        self.ttl = settings.dedup_fingerprint_ttl

    @staticmethod
    def fingerprint(url: str, method: str = "GET", body: Optional[str] = None) -> str:
        raw = f"{method.upper()}:{url}"
        if body:
            raw += f":{body}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _cleanup_expired(self):
        cutoff = time.time() - self.ttl
        self.redis.zremrangebyscore(self.set_key, "-inf", cutoff)

    def is_duplicate(self, url: str, method: str = "GET", body: Optional[str] = None) -> bool:
        fp = self.fingerprint(url, method, body)
        score = self.redis.zscore(self.set_key, fp)
        if score is not None:
            if time.time() - score > self.ttl:
                self.redis.zrem(self.set_key, fp)
                return False
            return True
        return False

    def add_fingerprint(self, url: str, method: str = "GET", body: Optional[str] = None) -> bool:
        fp = self.fingerprint(url, method, body)
        added = self.redis.zadd(self.set_key, {fp: time.time()})
        return added == 0

    def check_and_add(self, url: str, method: str = "GET", body: Optional[str] = None) -> bool:
        fp = self.fingerprint(url, method, body)
        now = time.time()
        score = self.redis.zscore(self.set_key, fp)
        if score is not None and (now - score) <= self.ttl:
            return True
        self.redis.zadd(self.set_key, {fp: now})
        return False

    def remove_fingerprint(self, url: str, method: str = "GET", body: Optional[str] = None):
        fp = self.fingerprint(url, method, body)
        self.redis.zrem(self.set_key, fp)

    def clear_all(self):
        self.redis.delete(self.set_key)

    def count(self) -> int:
        self._cleanup_expired()
        return self.redis.zcard(self.set_key)

    def cleanup(self) -> int:
        cutoff = time.time() - self.ttl
        removed = self.redis.zremrangebyscore(self.set_key, "-inf", cutoff)
        return removed or 0
