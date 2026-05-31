import os
from typing import List
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _get_env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def _get_env_int(name: str, default: int = 0) -> int:
    try:
        return int(_get_env(name, str(default)))
    except (ValueError, TypeError):
        return default


def _get_env_float(name: str, default: float = 0.0) -> float:
    try:
        return float(_get_env(name, str(default)))
    except (ValueError, TypeError):
        return default


@dataclass
class Settings:
    llm_provider: str = "ollama"

    ollama_base_url: str = "http://localhost:11434"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_chat_model: str = "qwen2.5:7b"

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_chat_model: str = "gpt-3.5-turbo"

    chroma_persist_dir: str = "./data/chroma"
    chroma_collection_name: str = "code_rag"

    code_dir: str = "./example_code"
    file_extensions: str = ".py,.js,.ts,.java,.cpp,.c,.h,.go,.rs,.rb,.php,.cs"

    chunk_size: int = 800
    chunk_overlap: int = 100
    top_k_retrieve: int = 5
    similarity_threshold: float = 0.5

    server_host: str = "0.0.0.0"
    server_port: int = 8000

    def __post_init__(self):
        self.llm_provider = _get_env("LLM_PROVIDER", self.llm_provider)

        self.ollama_base_url = _get_env("OLLAMA_BASE_URL", self.ollama_base_url)
        self.ollama_embedding_model = _get_env("OLLAMA_EMBEDDING_MODEL", self.ollama_embedding_model)
        self.ollama_chat_model = _get_env("OLLAMA_CHAT_MODEL", self.ollama_chat_model)

        self.openai_api_key = _get_env("OPENAI_API_KEY", self.openai_api_key)
        self.openai_base_url = _get_env("OPENAI_BASE_URL", self.openai_base_url)
        self.openai_embedding_model = _get_env("OPENAI_EMBEDDING_MODEL", self.openai_embedding_model)
        self.openai_chat_model = _get_env("OPENAI_CHAT_MODEL", self.openai_chat_model)

        self.chroma_persist_dir = _get_env("CHROMA_PERSIST_DIR", self.chroma_persist_dir)
        self.chroma_collection_name = _get_env("CHROMA_COLLECTION_NAME", self.chroma_collection_name)

        self.code_dir = _get_env("CODE_DIR", self.code_dir)
        self.file_extensions = _get_env("FILE_EXTENSIONS", self.file_extensions)

        self.chunk_size = _get_env_int("CHUNK_SIZE", self.chunk_size)
        self.chunk_overlap = _get_env_int("CHUNK_OVERLAP", self.chunk_overlap)
        self.top_k_retrieve = _get_env_int("TOP_K_RETRIEVE", self.top_k_retrieve)
        self.similarity_threshold = _get_env_float("SIMILARITY_THRESHOLD", self.similarity_threshold)

        self.server_host = _get_env("SERVER_HOST", self.server_host)
        self.server_port = _get_env_int("SERVER_PORT", self.server_port)

    @property
    def file_extension_list(self) -> List[str]:
        return [ext.strip() for ext in self.file_extensions.split(",") if ext.strip()]


settings = Settings()
