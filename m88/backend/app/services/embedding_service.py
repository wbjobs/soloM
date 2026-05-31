from sentence_transformers import SentenceTransformer
from loguru import logger
from typing import List
import numpy as np

from ..core.config import settings


class EmbeddingService:
    def __init__(self):
        self.model_path = settings.EMBEDDING_MODEL_PATH
        self.device = settings.EMBEDDING_DEVICE
        self.batch_size = settings.EMBEDDING_BATCH_SIZE
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            logger.info(f"Loading embedding model from {self.model_path} on {self.device}")
            self.model = SentenceTransformer(
                self.model_path,
                device=self.device
            )
            logger.info("Embedding model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            logger.warning("Using fallback embedding - please install a local embedding model")
            self.model = None

    def encode(self, texts: List[str]) -> List[np.ndarray]:
        if self.model is None:
            logger.warning("Embedding model not loaded, returning random vectors for testing")
            return [np.random.rand(768).astype(np.float32) for _ in texts]
        
        try:
            embeddings = self.model.encode(
                texts,
                batch_size=self.batch_size,
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True
            )
            return [emb.astype(np.float32) for emb in embeddings]
        except Exception as e:
            logger.error(f"Failed to encode texts: {e}")
            raise

    def encode_query(self, query: str) -> np.ndarray:
        return self.encode([query])[0]

    def get_embedding_dim(self) -> int:
        if self.model is not None:
            return self.model.get_sentence_embedding_dimension()
        return 768

    def is_loaded(self) -> bool:
        return self.model is not None


embedding_service = EmbeddingService()
