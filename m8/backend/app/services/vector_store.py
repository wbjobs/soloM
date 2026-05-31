from pathlib import Path
from typing import List, Optional, Dict, Any
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_openai import OpenAIEmbeddings
from app.core.config import settings, INDEX_PATH


class VectorStoreService:
    def __init__(self):
        self.embeddings = self._get_embeddings()
        self._vector_store: Optional[FAISS] = None
        self._index_name: str = "default"

    def _get_embeddings(self):
        if settings.OPENAI_API_KEY:
            return OpenAIEmbeddings(
                openai_api_key=settings.OPENAI_API_KEY,
                openai_api_base=settings.OPENAI_API_BASE,
            )
        else:
            return HuggingFaceEmbeddings(
                model_name=settings.EMBEDDING_MODEL_NAME,
                model_kwargs={"device": "cpu"},
                encode_kwargs={"normalize_embeddings": True},
            )

    def create_index(self, documents: List[Document], index_name: str = "default") -> FAISS:
        self._vector_store = FAISS.from_documents(documents, self.embeddings)
        self._index_name = index_name
        return self._vector_store

    def add_documents(self, documents: List[Document]) -> None:
        if self._vector_store is None:
            self.create_index(documents)
        else:
            self._vector_store.add_documents(documents)

    def similarity_search(
        self, query: str, k: int = None, filter: Optional[Dict[str, Any]] = None
    ) -> List[Document]:
        if self._vector_store is None:
            raise ValueError("Vector store not initialized. Please create or load an index first.")
        
        k = k or settings.MAX_RETRIEVED_DOCS
        return self._vector_store.similarity_search(query, k=k, filter=filter)

    def similarity_search_with_score(
        self, query: str, k: int = None, filter: Optional[Dict[str, Any]] = None
    ) -> List[tuple[Document, float]]:
        if self._vector_store is None:
            raise ValueError("Vector store not initialized. Please create or load an index first.")
        
        k = k or settings.MAX_RETRIEVED_DOCS
        return self._vector_store.similarity_search_with_score(query, k=k, filter=filter)

    def save_index(self, index_name: Optional[str] = None) -> None:
        if self._vector_store is None:
            raise ValueError("Vector store not initialized. Nothing to save.")
        
        index_name = index_name or self._index_name
        save_path = INDEX_PATH / index_name
        self._vector_store.save_local(str(save_path))

    def load_index(self, index_name: str = "default") -> bool:
        load_path = INDEX_PATH / index_name
        if not load_path.exists():
            return False
        
        self._vector_store = FAISS.load_local(
            str(load_path),
            self.embeddings,
            allow_dangerous_deserialization=True
        )
        self._index_name = index_name
        return True

    def delete_index(self, index_name: str = "default") -> bool:
        load_path = INDEX_PATH / index_name
        if not load_path.exists():
            return False
        
        import shutil
        shutil.rmtree(load_path)
        return True

    def list_indexes(self) -> List[str]:
        if not INDEX_PATH.exists():
            return []
        return [d.name for d in INDEX_PATH.iterdir() if d.is_dir()]

    def get_vector_store(self) -> Optional[FAISS]:
        return self._vector_store

    def as_retriever(self, **kwargs):
        if self._vector_store is None:
            raise ValueError("Vector store not initialized. Please create or load an index first.")
        return self._vector_store.as_retriever(**kwargs)
