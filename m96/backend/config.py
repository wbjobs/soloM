from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = ""

    slow_query_log_path: str = ""
    binlog_server_id: int = 1
    binlog_file: Optional[str] = None

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"


settings = Settings()
