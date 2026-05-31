import math
import re
from typing import List, Dict, Any, Optional, Tuple
from collections import Counter, defaultdict
from loguru import logger

try:
    import jieba
    HAS_JIEBA = True
except ImportError:
    HAS_JIEBA = False
    logger.warning("jieba not installed, using simple tokenizer for BM25")

from ..core.config import settings


_STOP_WORDS = set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有",
    "看", "好", "自己", "这", "他", "她", "它", "们", "那", "些", "什么",
    "怎么", "如何", "可以", "能", "吗", "呢", "吧", "啊", "嗯", "哦",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "and", "or", "but", "if", "of", "at", "by", "for", "with", "about",
    "to", "from", "in", "on", "that", "this", "it", "its", "not", "no"
])


def _tokenize(text: str) -> List[str]:
    if HAS_JIEBA:
        tokens = list(jieba.cut(text))
    else:
        tokens = re.findall(r'[\u4e00-\u9fff]|[a-zA-Z0-9]+', text.lower())

    return [
        t.lower().strip()
        for t in tokens
        if t.strip() and t.lower().strip() not in _STOP_WORDS
        and len(t.strip()) > 0
    ]


class BM25Index:
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus: List[Dict[str, Any]] = []
        self.doc_freqs: Counter = Counter()
        self.doc_len: List[int] = []
        self.avgdl: float = 0.0
        self.tokenized_docs: List[List[str]] = []
        self._idf_cache: Dict[str, float] = {}

    def add_document(self, doc_id: str, content: str, metadata: Dict[str, Any]):
        tokens = _tokenize(content)
        self.corpus.append({
            "doc_id": doc_id,
            "content": content,
            "metadata": metadata
        })
        self.tokenized_docs.append(tokens)
        self.doc_len.append(len(tokens))

        unique_tokens = set(tokens)
        for token in unique_tokens:
            self.doc_freqs[token] += 1

        total_len = sum(self.doc_len)
        self.avgdl = total_len / len(self.doc_len) if self.doc_len else 0
        self._idf_cache.clear()

    def _idf(self, token: str) -> float:
        if token in self._idf_cache:
            return self._idf_cache[token]

        n = len(self.corpus)
        df = self.doc_freqs.get(token, 0)
        idf = math.log((n - df + 0.5) / (df + 0.5) + 1.0)
        self._idf_cache[token] = idf
        return idf

    def search(
        self,
        query: str,
        top_k: int = 10,
        doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        if not self.corpus:
            return []

        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        scores: List[Tuple[int, float]] = []

        for idx, doc_tokens in enumerate(self.tokenized_docs):
            doc_entry = self.corpus[idx]

            if doc_ids and doc_entry["doc_id"] not in doc_ids:
                continue

            token_freqs = Counter(doc_tokens)
            dl = self.doc_len[idx]
            score = 0.0

            for qt in query_tokens:
                if qt not in token_freqs:
                    continue

                tf = token_freqs[qt]
                idf = self._idf(qt)
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * dl / self.avgdl) if self.avgdl > 0 else tf + self.k1
                score += idf * (numerator / denominator)

            if score > 0:
                scores.append((idx, score))

        scores.sort(key=lambda x: x[1], reverse=True)
        scores = scores[:top_k]

        max_score = scores[0][1] if scores else 1.0

        results = []
        for idx, score in scores:
            normalized = score / max_score if max_score > 0 else 0
            entry = self.corpus[idx]
            results.append({
                "doc_id": entry["doc_id"],
                "content": entry["content"],
                "metadata": entry["metadata"],
                "score": normalized,
                "search_type": "bm25"
            })

        return results

    def remove_by_doc_id(self, doc_id: str) -> int:
        indices_to_remove = [
            i for i, doc in enumerate(self.corpus)
            if doc["doc_id"] == doc_id
        ]

        if not indices_to_remove:
            return 0

        for i in sorted(indices_to_remove, reverse=True):
            tokens_to_remove = set(self.tokenized_docs[i])
            for token in tokens_to_remove:
                self.doc_freqs[token] -= 1
                if self.doc_freqs[token] <= 0:
                    del self.doc_freqs[token]

            self.corpus.pop(i)
            self.tokenized_docs.pop(i)
            self.doc_len.pop(i)

        total_len = sum(self.doc_len)
        self.avgdl = total_len / len(self.doc_len) if self.doc_len else 0
        self._idf_cache.clear()

        return len(indices_to_remove)

    def count(self) -> int:
        return len(self.corpus)


class BM25Service:
    def __init__(self):
        self.k1 = settings.BM25_K1
        self.b = settings.BM25_B
        self.index = BM25Index(k1=self.k1, b=self.b)
        self._initialized = False

    def add_document_chunks(
        self,
        doc_id: str,
        contents: List[str],
        metadata_list: List[Dict[str, Any]]
    ):
        for i, (content, metadata) in enumerate(zip(contents, metadata_list)):
            chunk_metadata = {**metadata, "chunk_index": i}
            self.index.add_document(doc_id, content, chunk_metadata)

        self._initialized = True
        logger.info(f"BM25 indexed {len(contents)} chunks for doc {doc_id}")

    def search(
        self,
        query: str,
        top_k: int = 10,
        doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        return self.index.search(query, top_k, doc_ids)

    def remove_by_doc_id(self, doc_id: str) -> int:
        return self.index.remove_by_doc_id(doc_id)

    def is_initialized(self) -> bool:
        return self._initialized

    def count(self) -> int:
        return self.index.count()


bm25_service = BM25Service()
