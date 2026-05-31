import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from urllib.parse import urlencode

import httpx

from common.config import settings
from common.proxy import ProxyPool

logger = logging.getLogger(__name__)


class BaseProxyProvider(ABC):
    @abstractmethod
    async def fetch_proxies(self) -> List[str]:
        ...

    @abstractmethod
    def get_provider_name(self) -> str:
        ...


class KuaidailiProvider(BaseProxyProvider):
    def get_provider_name(self) -> str:
        return "kuaidaili"

    async def fetch_proxies(self) -> List[str]:
        api_url = settings.proxy_provider_api_url
        if not api_url:
            logger.warning("Kuaidaili API URL not configured")
            return []

        params = {
            "orderid": settings.proxy_provider_api_key,
            "num": settings.proxy_provider_fetch_count,
            "format": "json",
            "sep": "1",
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{api_url}?{urlencode(params)}")
                resp.raise_for_status()
                data = resp.json()

            if data.get("code") != 0 and "data" not in data:
                proxy_list = data.get("proxy_list", [])
                if not proxy_list:
                    if isinstance(data, list):
                        proxy_list = data
                    else:
                        logger.warning("Kuaidaili unexpected response: %s", resp.text[:200])
                        return []
                return [f"http://{p}" for p in proxy_list]

            proxies = data.get("data", {}).get("proxy_list", [])
            return [f"http://{p}" for p in proxies]
        except Exception as e:
            logger.error("Kuaidaili fetch failed: %s", e)
            return []


class ZhiMaProvider(BaseProxyProvider):
    def get_provider_name(self) -> str:
        return "zhima"

    async def fetch_proxies(self) -> List[str]:
        api_url = settings.proxy_provider_api_url
        if not api_url:
            logger.warning("ZhiMa API URL not configured")
            return []

        params = {
            "key": settings.proxy_provider_api_key,
            "num": settings.proxy_provider_fetch_count,
            "format": "json",
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{api_url}?{urlencode(params)}")
                resp.raise_for_status()
                data = resp.json()

            code = data.get("code") or data.get("Code")
            if code and str(code) != "0" and str(code) != "200":
                logger.warning("ZhiMa API error: %s", data)
                return []

            items = data.get("data") or data.get("Data") or data.get("proxy_list") or []
            proxies = []
            for item in items:
                if isinstance(item, str):
                    proxies.append(f"http://{item}")
                elif isinstance(item, dict):
                    ip = item.get("ip") or item.get("Ip") or ""
                    port = item.get("port") or item.get("Port") or ""
                    if ip and port:
                        proxies.append(f"http://{ip}:{port}")
            return proxies
        except Exception as e:
            logger.error("ZhiMa fetch failed: %s", e)
            return []


class GenericApiProvider(BaseProxyProvider):
    def get_provider_name(self) -> str:
        return "generic"

    async def fetch_proxies(self) -> List[str]:
        api_url = settings.proxy_provider_api_url
        if not api_url:
            return []

        headers = {}
        api_key = settings.proxy_provider_api_key
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(api_url, headers=headers)
                resp.raise_for_status()
                data = resp.json()

            proxies = []
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, str):
                        proxies.append(item if "://" in item else f"http://{item}")
                    elif isinstance(item, dict):
                        p = item.get("proxy") or item.get("url") or item.get("ip")
                        if p:
                            proxies.append(p if "://" in p else f"http://{p}")
            elif isinstance(data, dict):
                items = data.get("data") or data.get("proxies") or data.get("result") or []
                for item in items:
                    if isinstance(item, str):
                        proxies.append(item if "://" in item else f"http://{item}")
                    elif isinstance(item, dict):
                        ip = item.get("ip") or ""
                        port = item.get("port") or ""
                        if ip:
                            proxies.append(f"http://{ip}:{port}" if port else f"http://{ip}")
            return proxies
        except Exception as e:
            logger.error("Generic proxy API fetch failed: %s", e)
            return []


PROVIDER_REGISTRY = {
    "kuaidaili": KuaidailiProvider,
    "zhima": ZhiMaProvider,
    "generic": GenericApiProvider,
}


class ProxyProviderManager:
    def __init__(self):
        self.proxy_pool = ProxyPool()
        self._provider: Optional[BaseProxyProvider] = None
        self._last_fetch_time: float = 0
        self._running = False

    @property
    def provider(self) -> BaseProxyProvider:
        if self._provider is None:
            provider_name = settings.proxy_provider_type
            cls = PROVIDER_REGISTRY.get(provider_name, GenericApiProvider)
            self._provider = cls()
        return self._provider

    async def fetch_and_refresh(self) -> Dict:
        now = time.time()
        elapsed = now - self._last_fetch_time
        if elapsed < settings.proxy_provider_fetch_interval:
            return {
                "status": "skipped",
                "reason": f"too_frequent (elapsed={elapsed:.0f}s, interval={settings.proxy_provider_fetch_interval}s)",
            }

        proxies = await self.provider.fetch_and_refresh() if hasattr(self.provider, 'fetch_and_refresh') else await self.provider.fetch_proxies()
        self._last_fetch_time = now

        if not proxies:
            return {"status": "no_proxies", "count": 0}

        added = self.proxy_pool.add_proxies(proxies)
        logger.info("Proxy provider %s: fetched %d, added %d", self.provider.get_provider_name(), len(proxies), added)
        return {
            "status": "ok",
            "provider": self.provider.get_provider_name(),
            "fetched": len(proxies),
            "added": added,
        }

    async def auto_refresh_loop(self):
        self._running = True
        logger.info(
            "Proxy auto-refresh started, provider=%s interval=%ds",
            settings.proxy_provider_type,
            settings.proxy_provider_fetch_interval,
        )
        while self._running:
            try:
                result = await self.fetch_and_refresh()
                if result.get("status") == "ok":
                    logger.info("Auto-refresh: %s", result)
            except Exception as e:
                logger.error("Auto-refresh error: %s", e, exc_info=True)
            await asyncio.sleep(settings.proxy_provider_fetch_interval)

    def stop(self):
        self._running = False
        logger.info("Proxy auto-refresh stopped")

    def get_status(self) -> Dict:
        return {
            "provider": settings.proxy_provider_type,
            "api_url": settings.proxy_provider_api_url[:50] + "..." if settings.proxy_provider_api_url else "",
            "fetch_interval": settings.proxy_provider_fetch_interval,
            "last_fetch_time": self._last_fetch_time,
            "pool_available": self.proxy_pool.count(),
            "pool_blacklisted": self.proxy_pool.blacklist_count(),
        }
