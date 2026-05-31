import logging
from typing import List, Optional
from langchain_core.embeddings import Embeddings
from langchain_core.documents import Document
from .config import settings

logger = logging.getLogger(__name__)


class OllamaEmbeddings(Embeddings):
    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        try:
            from langchain_ollama import OllamaEmbeddings as LangChainOllamaEmbeddings
        except ImportError:
            from langchain_community.embeddings import OllamaEmbeddings as LangChainOllamaEmbeddings

        self._embeddings = LangChainOllamaEmbeddings(
            base_url=base_url or settings.ollama_base_url,
            model=model or settings.ollama_embedding_model,
        )

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._embeddings.embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        return self._embeddings.embed_query(text)


class OpenAIEmbeddings(Embeddings):
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        try:
            from langchain_openai import OpenAIEmbeddings as LangChainOpenAIEmbeddings
        except ImportError:
            from langchain_community.embeddings import OpenAIEmbeddings as LangChainOpenAIEmbeddings

        self._embeddings = LangChainOpenAIEmbeddings(
            api_key=api_key or settings.openai_api_key,
            base_url=base_url or settings.openai_base_url,
            model=model or settings.openai_embedding_model,
        )

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._embeddings.embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        return self._embeddings.embed_query(text)


def get_embeddings() -> Embeddings:
    provider = settings.llm_provider.lower()

    if provider == "ollama":
        logger.info(f"Using Ollama embeddings: {settings.ollama_embedding_model}")
        return OllamaEmbeddings()
    elif provider == "openai":
        logger.info(f"Using OpenAI embeddings: {settings.openai_embedding_model}")
        return OpenAIEmbeddings()
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}. Use 'ollama' or 'openai'.")
