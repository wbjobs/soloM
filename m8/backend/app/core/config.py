from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    OPENAI_API_KEY: str = ""
    OPENAI_API_BASE: str = "https://api.openai.com/v1"
    OPENAI_MODEL_NAME: str = "gpt-3.5-turbo"
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50
    MAX_RETRIEVED_DOCS: int = 4
    UPLOAD_DIR: str = "uploads"
    INDEX_DIR: str = "indexes"
    
    DATASET_DIR: str = "datasets"
    FINETUNE_OUTPUT_DIR: str = "finetune_outputs"
    LOG_DIR: str = "logs"
    
    FINETUNE_BASE_MODEL: str = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
    FINETUNE_MAX_SEQ_LENGTH: int = 512
    FINETUNE_BATCH_SIZE: int = 4
    FINETUNE_LEARNING_RATE: float = 2e-4
    FINETUNE_NUM_EPOCHS: int = 3
    FINETUNE_LORA_R: int = 8
    FINETUNE_LORA_ALPHA: int = 32
    FINETUNE_LORA_DROPOUT: float = 0.05
    
    FINETUNE_DEVICE: str = "cpu"

    class Config:
        env_file = ".env"


settings = Settings()

BASE_DIR = Path(__file__).parent.parent.parent
UPLOAD_PATH = BASE_DIR / settings.UPLOAD_DIR
INDEX_PATH = BASE_DIR / settings.INDEX_DIR
DATASET_PATH = BASE_DIR / settings.DATASET_DIR
FINETUNE_OUTPUT_PATH = BASE_DIR / settings.FINETUNE_OUTPUT_DIR
LOG_PATH = BASE_DIR / settings.LOG_DIR

UPLOAD_PATH.mkdir(exist_ok=True)
INDEX_PATH.mkdir(exist_ok=True)
DATASET_PATH.mkdir(exist_ok=True)
FINETUNE_OUTPUT_PATH.mkdir(exist_ok=True)
LOG_PATH.mkdir(exist_ok=True)
