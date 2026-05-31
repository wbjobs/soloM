import logging
import random
import time
from typing import Dict, List, Optional

import redis

from common.config import settings

logger = logging.getLogger(__name__)


class ProxyPool:
    PROXY_POOL_KEY = "crawler:proxy_pool"
    PROXY_BLACKLIST_KEY = "crawler:proxy_blacklist"
    PROXY_STATS_PREFIX = "crawler:proxy_stats:"

    def __init__(self):
        self.redis = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password or None,
            decode_responses=True,
        )

    def add_proxy(self, proxy_url: str, weight: int = 1) -> bool:
        if not proxy_url:
            return False
        if self.redis.sismember(self.PROXY_BLACKLIST_KEY, proxy_url):
            logger.info("Proxy in blacklist, skipping: %s", proxy_url)
            return False
        self.redis.hset(self.PROXY_POOL_KEY, proxy_url, weight)
        logger.info("Proxy added: %s (weight=%d)", proxy_url, weight)
        return True

    def add_proxies(self, proxy_urls: List[str], weight: int = 1) -> int:
        added = 0
        pipe = self.redis.pipeline()
        for url in proxy_urls:
            if self.redis.sismember(self.PROXY_BLACKLIST_KEY, url):
                continue
            pipe.hset(self.PROXY_POOL_KEY, url, weight)
            added += 1
        pipe.execute()
        return added

    def remove_proxy(self, proxy_url: str):
        self.redis.hdel(self.PROXY_POOL_KEY, proxy_url)
        logger.info("Proxy removed: %s", proxy_url)

    def get_proxy(self) -> Optional[str]:
        proxies = self.redis.hgetall(self.PROXY_POOL_KEY)
        if not proxies:
            return None
        weights = {k: int(v) for k, v in proxies.items()}
        total = sum(weights.values())
        r = random.uniform(0, total)
        cumulative = 0
        for proxy, w in weights.items():
            cumulative += w
            if r <= cumulative:
                return proxy
        return list(weights.keys())[0]

    def mark_banned(self, proxy_url: str, ban_seconds: int = 0):
        self.redis.hdel(self.PROXY_POOL_KEY, proxy_url)
        stats_key = f"{self.PROXY_STATS_PREFIX}{proxy_url}"
        self.redis.hincrby(stats_key, "ban_count", 1)
        self.redis.hset(stats_key, "last_ban_at", time.time())
        if ban_seconds > 0:
            self.redis.setex(f"{self.PROXY_BLACKLIST_KEY}:temp:{proxy_url}", ban_seconds, "1")
            logger.warning("Proxy temporarily banned for %ds: %s", ban_seconds, proxy_url)
        else:
            self.redis.sadd(self.PROXY_BLACKLIST_KEY, proxy_url)
            logger.warning("Proxy permanently blacklisted: %s", proxy_url)

    def record_success(self, proxy_url: str):
        stats_key = f"{self.PROXY_STATS_PREFIX}{proxy_url}"
        self.redis.hincrby(stats_key, "success_count", 1)
        self.redis.hset(stats_key, "last_success_at", time.time())

    def record_failure(self, proxy_url: str):
        stats_key = f"{self.PROXY_STATS_PREFIX}{proxy_url}"
        self.redis.hincrby(stats_key, "fail_count", 1)
        self.redis.hset(stats_key, "last_fail_at", time.time())

    def get_proxy_stats(self, proxy_url: str) -> Optional[Dict]:
        stats_key = f"{self.PROXY_STATS_PREFIX}{proxy_url}"
        data = self.redis.hgetall(stats_key)
        if not data:
            return None
        return {
            "proxy": proxy_url,
            "success_count": int(data.get("success_count", 0)),
            "fail_count": int(data.get("fail_count", 0)),
            "ban_count": int(data.get("ban_count", 0)),
            "last_success_at": float(data.get("last_success_at", 0)),
            "last_fail_at": float(data.get("last_fail_at", 0)),
            "last_ban_at": float(data.get("last_ban_at", 0)),
        }

    def get_all_proxies(self) -> List[str]:
        proxies = self.redis.hgetall(self.PROXY_POOL_KEY)
        return list(proxies.keys())

    def get_blacklisted(self) -> List[str]:
        return list(self.redis.smembers(self.PROXY_BLACKLIST_KEY))

    def unban_proxy(self, proxy_url: str):
        self.redis.srem(self.PROXY_BLACKLIST_KEY, proxy_url)
        self.redis.delete(f"{self.PROXY_BLACKLIST_KEY}:temp:{proxy_url}")
        self.redis.hset(self.PROXY_POOL_KEY, proxy_url, 1)
        logger.info("Proxy unbanned: %s", proxy_url)

    def clear_blacklist(self):
        self.redis.delete(self.PROXY_BLACKLIST_KEY)
        keys = self.redis.keys(f"{self.PROXY_BLACKLIST_KEY}:temp:*")
        if keys:
            self.redis.delete(*keys)
        logger.info("Proxy blacklist cleared")

    def count(self) -> int:
        return self.redis.hlen(self.PROXY_POOL_KEY)

    def blacklist_count(self) -> int:
        return self.redis.scard(self.PROXY_BLACKLIST_KEY)
