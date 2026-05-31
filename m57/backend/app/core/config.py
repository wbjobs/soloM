from pydantic_settings import BaseSettings
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class Settings(BaseSettings):
    PROJECT_NAME: str = "RAG Backend API"

    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'data', 'db', 'app.db')}")

    DOCUMENTS_DIR: str = os.getenv("DOCUMENTS_DIR", os.path.join(BASE_DIR, "data", "documents"))
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", os.path.join(BASE_DIR, "data", "chroma"))

    LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen2.5")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "http://localhost:11434")

    class Config:
        case_sensitive = True


settings = Settings()
