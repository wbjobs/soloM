from loguru import logger
from typing import List, AsyncGenerator, Optional
import time
import json

from .hybrid_search_service import hybrid_search_service
from .llm_service import llm_service
from .bm25_service import bm25_service
from ..schemas import RetrievedChunk, QueryResponse


class RAGService:
    def __init__(self):
        self.hybrid_search = hybrid_search_service
        self.llm_service = llm_service
        self.bm25_service = bm25_service

    def retrieve(
        self,
        question: str,
        top_k: int = 5,
        doc_ids: Optional[List[str]] = None,
        search_mode: str = "hybrid"
    ) -> List[RetrievedChunk]:
        try:
            results = self.hybrid_search.search(
                query=question,
                top_k=top_k,
                doc_ids=doc_ids,
                mode=search_mode
            )

            chunks = []
            for result in results:
                metadata = result.get("metadata", {})
                if isinstance(metadata, str):
                    try:
                        metadata = json.loads(metadata)
                    except (json.JSONDecodeError, TypeError):
                        metadata = {}

                page = metadata.get("page")
                bbox = metadata.get("bbox")
                doc_name = result.get("doc_name", "")
                if not doc_name and "doc_name" in metadata:
                    doc_name = metadata["doc_name"]

                chunk_index = result.get("chunk_index", 0)
                if chunk_index == 0 and "chunk_index" in metadata:
                    chunk_index = metadata["chunk_index"]

                chunks.append(RetrievedChunk(
                    doc_id=result.get("doc_id", ""),
                    doc_name=doc_name,
                    chunk_index=chunk_index,
                    content=result.get("content", ""),
                    score=result.get("score", 0.0),
                    metadata=metadata,
                    page=page,
                    bbox=bbox,
                    search_type=result.get("search_type", "vector"),
                    vector_score=result.get("vector_score", 0.0),
                    bm25_score=result.get("bm25_score", 0.0)
                ))

            logger.info(
                f"Retrieved {len(chunks)} chunks "
                f"(mode={search_mode}, "
                f"vector_avg={sum(c.vector_score for c in chunks) / len(chunks):.3f}, "
                f"bm25_avg={sum(c.bm25_score for c in chunks) / len(chunks):.3f})"
                if chunks else f"Retrieved 0 chunks (mode={search_mode})"
            )
            return chunks

        except Exception as e:
            logger.error(f"Error retrieving chunks: {e}")
            raise

    async def query(
        self,
        question: str,
        top_k: int = 5,
        doc_ids: Optional[List[str]] = None,
        stream: bool = True,
        search_mode: str = "hybrid"
    ) -> AsyncGenerator[str, None]:
        start_time = time.time()

        sources = self.retrieve(question, top_k, doc_ids, search_mode)

        if stream:
            sources_json = json.dumps(
                [s.model_dump() for s in sources],
                ensure_ascii=False
            )
            yield f"data: {json.dumps({'type': 'sources', 'data': sources_json})}\n\n"

            full_answer = ""
            async for token in self.llm_service.generate(question, sources, stream=True):
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'data': token})}\n\n"

            latency = time.time() - start_time
            yield f"data: {json.dumps({'type': 'done', 'data': {'latency': latency, 'total_tokens': len(full_answer)}})}\n\n"
            yield "data: [DONE]\n\n"
        else:
            full_answer = ""
            async for token in self.llm_service.generate(question, sources, stream=False):
                full_answer += token

            latency = time.time() - start_time
            response = QueryResponse(
                answer=full_answer,
                sources=sources,
                total_tokens=len(full_answer),
                latency=latency
            )
            yield response.model_dump_json()

    def get_health_status(self) -> dict:
        from ..core.database import milvus_client
        try:
            milvus_connected = milvus_client.count_vectors() >= 0
        except Exception:
            milvus_connected = False

        return {
            "status": "healthy" if milvus_connected and self.llm_service.is_loaded() else "degraded",
            "milvus_connected": milvus_connected,
            "embedding_model_loaded": self.hybrid_search.embedding_service.is_loaded(),
            "llm_model_loaded": self.llm_service.is_loaded(),
            "bm25_indexed": self.bm25_service.is_initialized(),
            "total_documents": milvus_client.count_vectors() if milvus_connected else 0,
            "total_vectors": milvus_client.count_vectors() if milvus_connected else 0
        }


rag_service = RAGService()
