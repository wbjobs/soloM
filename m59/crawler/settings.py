import os

BOT_NAME = "crawler_platform"

SPIDER_MODULES = ["crawler.spiders"]
NEWSPIDER_MODULE = "crawler.spiders"

ROBOTSTXT_OBEY = False

CONCURRENT_REQUESTS = 32
CONCURRENT_REQUESTS_PER_DOMAIN = 8
DOWNLOAD_DELAY = 0.5

DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

DOWNLOADER_MIDDLEWARES = {
    "crawler.middlewares.RedisDedupMiddleware": 400,
    "crawler.middlewares.ProxyRotationMiddleware": 500,
    "crawler.middlewares.RetryWithBackoffMiddleware": 600,
    "scrapy.downloadermiddlewares.retry.RetryMiddleware": None,
}

ITEM_PIPELINES = {
    "crawler.pipelines.RedisResultPipeline": 300,
}

DOWNLOAD_TIMEOUT = 30

REDIS_HOST = os.getenv("APP_REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("APP_REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("APP_REDIS_DB", 0))
REDIS_PASSWORD = os.getenv("APP_REDIS_PASSWORD", "")

MONGO_URI = os.getenv("APP_MONGO_URI", "mongodb://localhost:27017/crawler_platform")

PROXY_ENABLED = os.getenv("APP_PROXY_ENABLED", "false").lower() == "true"
