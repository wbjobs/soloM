from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg2://ocr_user:ocr_pass@localhost:5432/ocr_db"
    UPLOAD_DIR: str = "uploads"
    DBNET_ONNX_PATH: str = "models/dbnet.onnx"
    CRNN_ONNX_PATH: str = "models/crnn.onnx"
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
