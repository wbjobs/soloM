from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    MILVUS_HOST: str = "localhost"
    MILVUS_PORT: int = 19530
    MILVUS_COLLECTION: str = "rag_documents"

    EMBEDDING_MODEL_PATH: str = "./models/bge-small-zh-v1.5"
    EMBEDDING_DEVICE: str = "cpu"
    EMBEDDING_BATCH_SIZE: int = 8

    LLM_MODEL_PATH: str = "./models/Qwen2-7B-Instruct"
    LLM_DEVICE: str = "cpu"
    LLM_MAX_TOKENS: int = 2048
    LLM_TEMPERATURE: float = 0.7

    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50

    PDF_TABLE_TOLERANCE: int = 3

    BM25_K1: float = 1.5
    BM25_B: float = 0.75

    HYBRID_VECTOR_WEIGHT: float = 0.7
    HYBRID_BM25_WEIGHT: float = 0.3

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    UPLOAD_DIR: str = "./data/uploads"
    MAX_FILE_SIZE: int = 10485760

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
