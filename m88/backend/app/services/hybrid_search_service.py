from loguru import logger
from typing import List, Optional, Dict, Any
from enum import Enum

from .embedding_service import embedding_service
from .bm25_service import bm25_service
from ..core.database import milvus_client
from ..core.config import settings


class SearchMode(str, Enum):
    VECTOR = "vector"
    BM25 = "bm25"
    HYBRID = "hybrid"


def _rrf_merge(
    vector_results: List[Dict[str, Any]],
    bm25_results: List[Dict[str, Any]],
    top_k: int = 5,
    vector_weight: float = 0.7,
    bm25_weight: float = 0.3,
    k: int = 60
) -> List[Dict[str, Any]]:
    rrf_scores: Dict[str, Dict[str, Any]] = {}

    for rank, result in enumerate(vector_results):
        key = f"{result['doc_id']}_{result.get('chunk_index', rank)}"
        rrf_score = vector_weight / (k + rank + 1)
        if key not in rrf_scores:
            rrf_scores[key] = {
                **result,
                "vector_score": result["score"],
                "bm25_score": 0.0,
                "rrf_score": 0.0,
                "search_type": "hybrid"
            }
        rrf_scores[key]["rrf_score"] += rrf_score

    for rank, result in enumerate(bm25_results):
        key = f"{result['doc_id']}_{result.get('metadata', {}).get('chunk_index', rank)}"
        rrf_score = bm25_weight / (k + rank + 1)
        if key not in rrf_scores:
            rrf_scores[key] = {
                **result,
                "vector_score": 0.0,
                "bm25_score": result["score"],
                "rrf_score": 0.0,
                "search_type": "hybrid"
            }
        else:
            rrf_scores[key]["bm25_score"] = result["score"]
        rrf_scores[key]["rrf_score"] += rrf_score

    sorted_results = sorted(
        rrf_scores.values(),
        key=lambda x: x["rrf_score"],
        reverse=True
    )

    for result in sorted_results:
        result["score"] = result["rrf_score"]

    return sorted_results[:top_k]


class HybridSearchService:
    def __init__(self):
        self.embedding_service = embedding_service
        self.bm25_service = bm25_service
        self.milvus_client = milvus_client
        self.vector_weight = settings.HYBRID_VECTOR_WEIGHT
        self.bm25_weight = settings.HYBRID_BM25_WEIGHT

    def search(
        self,
        query: str,
        top_k: int = 5,
        doc_ids: Optional[List[str]] = None,
        mode: str = "hybrid"
    ) -> List[Dict[str, Any]]:
        search_mode = SearchMode(mode)

        if search_mode == SearchMode.VECTOR:
            return self._vector_search(query, top_k, doc_ids)
        elif search_mode == SearchMode.BM25:
            return self._bm25_search(query, top_k, doc_ids)
        else:
            return self._hybrid_search(query, top_k, doc_ids)

    def _vector_search(
        self,
        query: str,
        top_k: int = 5,
        doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        try:
            query_embedding = self.embedding_service.encode_query(query)
            results = self.milvus_client.search_vectors(
                query_embedding=query_embedding,
                top_k=top_k,
                doc_ids=doc_ids
            )
            for r in results:
                r["search_type"] = "vector"
            return results
        except Exception as e:
            logger.error(f"Vector search error: {e}")
            return []

    def _bm25_search(
        self,
        query: str,
        top_k: int = 5,
        doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        try:
            return self.bm25_service.search(query, top_k, doc_ids)
        except Exception as e:
            logger.error(f"BM25 search error: {e}")
            return []

    def _hybrid_search(
        self,
        query: str,
        top_k: int = 5,
        doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        candidate_k = min(top_k * 3, 30)

        vector_results = self._vector_search(query, candidate_k, doc_ids)
        bm25_results = self._bm25_search(query, candidate_k, doc_ids)

        if not vector_results and not bm25_results:
            return []
        if not vector_results:
            return bm25_results[:top_k]
        if not bm25_results:
            return vector_results[:top_k]

        merged = _rrf_merge(
            vector_results=vector_results,
            bm25_results=bm25_results,
            top_k=top_k,
            vector_weight=self.vector_weight,
            bm25_weight=self.bm25_weight
        )

        logger.info(
            f"Hybrid search: vector={len(vector_results)}, "
            f"bm25={len(bm25_results)}, merged={len(merged)}"
        )

        return merged


hybrid_search_service = HybridSearchService()
