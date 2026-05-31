from pymilvus import connections, Collection, FieldSchema, CollectionSchema, DataType, utility
from loguru import logger
from typing import List, Optional, Dict, Any
import numpy as np

from .config import settings


class MilvusClient:
    def __init__(self):
        self.host = settings.MILVUS_HOST
        self.port = settings.MILVUS_PORT
        self.collection_name = settings.MILVUS_COLLECTION
        self.collection: Optional[Collection] = None
        self._connect()
        self._init_collection()

    def _connect(self):
        try:
            connections.connect(
                alias="default",
                host=self.host,
                port=self.port
            )
            logger.info(f"Connected to Milvus at {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to Milvus: {e}")
            raise

    def _init_collection(self):
        if utility.has_collection(self.collection_name):
            self.collection = Collection(self.collection_name)
            self.collection.load()
            logger.info(f"Loaded existing collection: {self.collection_name}")
        else:
            self._create_collection()

    def _create_collection(self):
        fields = [
            FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
            FieldSchema(name="doc_id", dtype=DataType.VARCHAR, max_length=100),
            FieldSchema(name="doc_name", dtype=DataType.VARCHAR, max_length=255),
            FieldSchema(name="chunk_index", dtype=DataType.INT64),
            FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=65535),
            FieldSchema(name="metadata", dtype=DataType.JSON),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=768)
        ]
        
        schema = CollectionSchema(fields, description="RAG document collection")
        self.collection = Collection(self.collection_name, schema)
        
        index_params = {
            "index_type": "IVF_FLAT",
            "metric_type": "COSINE",
            "params": {"nlist": 1024}
        }
        self.collection.create_index(
            field_name="embedding",
            index_params=index_params
        )
        self.collection.load()
        logger.info(f"Created new collection: {self.collection_name}")

    def insert_vectors(
        self,
        doc_id: str,
        doc_name: str,
        contents: List[str],
        embeddings: List[np.ndarray],
        metadata: Optional[List[Dict[str, Any]]] = None
    ) -> List[int]:
        if metadata is None:
            metadata = [{} for _ in contents]
        
        data = [
            [doc_id] * len(contents),
            [doc_name] * len(contents),
            list(range(len(contents))),
            contents,
            metadata,
            embeddings
        ]
        
        result = self.collection.insert(data)
        self.collection.flush()
        logger.info(f"Inserted {len(contents)} vectors for document {doc_name}")
        return result.primary_keys

    def search_vectors(
        self,
        query_embedding: np.ndarray,
        top_k: int = 5,
        doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        search_params = {
            "metric_type": "COSINE",
            "params": {"nprobe": 16}
        }
        
        expr = None
        if doc_ids and len(doc_ids) > 0:
            expr = f"doc_id in {doc_ids}"
        
        results = self.collection.search(
            data=[query_embedding],
            anns_field="embedding",
            param=search_params,
            limit=top_k,
            expr=expr,
            output_fields=["doc_id", "doc_name", "chunk_index", "content", "metadata"]
        )
        
        hits = []
        for hit in results[0]:
            hits.append({
                "id": hit.id,
                "doc_id": hit.entity.get("doc_id"),
                "doc_name": hit.entity.get("doc_name"),
                "chunk_index": hit.entity.get("chunk_index"),
                "content": hit.entity.get("content"),
                "metadata": hit.entity.get("metadata"),
                "score": hit.score
            })
        
        return hits

    def delete_by_doc_id(self, doc_id: str) -> int:
        expr = f"doc_id == '{doc_id}'"
        result = self.collection.delete(expr)
        self.collection.flush()
        delete_count = result.delete_count if hasattr(result, 'delete_count') else 0
        logger.info(f"Deleted {delete_count} vectors for document {doc_id}")
        return delete_count

    def get_documents(self) -> List[Dict[str, Any]]:
        results = self.collection.query(
            expr="id >= 0",
            output_fields=["doc_id", "doc_name"],
            limit=10000
        )
        
        docs = {}
        for result in results:
            doc_id = result["doc_id"]
            if doc_id not in docs:
                docs[doc_id] = {
                    "doc_id": doc_id,
                    "doc_name": result["doc_name"]
                }
        
        return list(docs.values())

    def count_vectors(self) -> int:
        return self.collection.num_entities


milvus_client = MilvusClient()
