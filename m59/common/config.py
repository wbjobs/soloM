from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""

    mongo_host: str = "localhost"
    mongo_port: int = 27017
    mongo_db: str = "crawler_platform"
    mongo_user: str = ""
    mongo_password: str = ""

    task_queue_key: str = "crawler:task_queue"
    dedup_set_key: str = "crawler:dedup_fingerprints"
    task_status_prefix: str = "crawler:task_status:"
    result_queue_key: str = "crawler:result_queue"
    clean_queue_key: str = "crawler:clean_queue"
    dead_task_zset_key: str = "crawler:dead_tasks"

    api_host: str = "0.0.0.0"
    api_port: int = 8000

    cleaner_batch_size: int = 100
    cleaner_poll_interval: float = 1.0

    task_status_ttl: int = 86400
    dedup_fingerprint_ttl: int = 604800
    result_queue_ttl: int = 3600
    clean_queue_ttl: int = 3600

    task_timeout_seconds: int = 1800
    dead_task_check_interval: int = 60
    dead_task_max_retries: int = 3

    retry_enabled: bool = True
    retry_max_times: int = 3
    retry_http_codes: list = [403, 429, 500, 502, 503, 504]
    retry_backoff_base: float = 2.0
    retry_backoff_max: float = 300.0

    proxy_enabled: bool = False
    proxy_ban_threshold: int = 5
    proxy_temp_ban_seconds: int = 600

    proxy_provider_type: str = "generic"
    proxy_provider_api_url: str = ""
    proxy_provider_api_key: str = ""
    proxy_provider_fetch_count: int = 10
    proxy_provider_fetch_interval: int = 300

    stats_redis_key: str = "crawler:stats"
    stats_channel: str = "crawler:stats_channel"

    websocket_push_interval: float = 2.0

    @property
    def redis_url(self) -> str:
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @property
    def mongo_uri(self) -> str:
        if self.mongo_user and self.mongo_password:
            return f"mongodb://{self.mongo_user}:{self.mongo_password}@{self.mongo_host}:{self.mongo_port}/{self.mongo_db}?authSource=admin"
        return f"mongodb://{self.mongo_host}:{self.mongo_port}/{self.mongo_db}"

    class Config:
        env_file = ".env"
        env_prefix = "APP_"


settings = Settings()
