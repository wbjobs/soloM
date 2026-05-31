import logging
import uuid
import json
import hashlib
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path
from langchain_core.documents import Document
from langchain_core.vectorstores import VectorStore
from .config import settings
from .embeddings import get_embeddings

logger = logging.getLogger(__name__)


class VectorStoreManager:
    def __init__(
        self,
        persist_dir: Optional[str] = None,
        collection_name: Optional[str] = None,
    ):
        self.persist_dir = persist_dir or settings.chroma_persist_dir
        self.collection_name = collection_name or settings.chroma_collection_name
        self.metadata_collection_name = f"{self.collection_name}_file_metadata"
        self.embeddings = get_embeddings()
        self.vector_store: Optional[VectorStore] = None
        self._metadata_collection = None
        self._ensure_persist_dir()
        self._initialize_vector_store()
        self._initialize_metadata_collection()

    def _ensure_persist_dir(self) -> None:
        persist_path = Path(self.persist_dir)
        if not persist_path.exists():
            logger.info(f"Creating vector store directory: {self.persist_dir}")
            persist_path.mkdir(parents=True, exist_ok=True)

    def _get_chroma_client(self):
        try:
            import chromadb
        except ImportError:
            logger.error("chromadb not available, cannot use metadata collection")
            return None

        return chromadb.PersistentClient(path=str(Path(self.persist_dir).resolve()))

    def _initialize_vector_store(self) -> None:
        try:
            try:
                from langchain_chroma import Chroma
            except ImportError:
                from langchain_community.vectorstores import Chroma

            self.vector_store = Chroma(
                collection_name=self.collection_name,
                embedding_function=self.embeddings,
                persist_directory=self.persist_dir,
            )
            logger.info(f"Chroma vector store initialized at {self.persist_dir}")
        except Exception as e:
            logger.error(f"Failed to initialize Chroma vector store: {e}")
            raise

    def _initialize_metadata_collection(self) -> None:
        try:
            client = self._get_chroma_client()
            if client:
                self._metadata_collection = client.get_or_create_collection(
                    name=self.metadata_collection_name,
                )
                logger.info(f"Metadata collection initialized: {self.metadata_collection_name}")
        except Exception as e:
            logger.warning(f"Failed to initialize metadata collection, falling back to collection metadata scan: {e}")
            self._metadata_collection = None

    def add_documents(self, documents: List[Document]) -> List[str]:
        if not documents:
            logger.warning("No documents to add")
            return []

        batch_size = 50
        all_ids = []

        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            ids = [str(uuid.uuid4()) for _ in batch]
            try:
                self.vector_store.add_documents(documents=batch, ids=ids)
                all_ids.extend(ids)
            except Exception as e:
                logger.error(f"Failed to add batch {i // batch_size} ({len(batch)} docs): {e}")
                for doc in batch:
                    try:
                        single_ids = [str(uuid.uuid4())]
                        self.vector_store.add_documents(documents=[doc], ids=single_ids)
                        all_ids.extend(single_ids)
                    except Exception as inner_e:
                        logger.error(f"Skipping document due to error: {inner_e}")

        logger.info(f"Added {len(all_ids)} of {len(documents)} documents to vector store")
        return all_ids

    def _generate_id_for_file(self, file_path: str, chunk_index: int) -> str:
        return f"{file_path}_{chunk_index}"

    def delete_by_file_path(self, file_path: str) -> int:
        try:
            collection = self.vector_store._collection

            results = collection.get(
                where={"file_path": file_path},
                include=["metadatas"]
            )

            ids_to_delete = results.get("ids", [])

            if ids_to_delete:
                collection.delete(ids=ids_to_delete)
                logger.info(f"Deleted {len(ids_to_delete)} chunks for file: {file_path}")
            else:
                logger.debug(f"No chunks found for file: {file_path}")

            self.delete_file_metadata(file_path)

            return len(ids_to_delete)
        except Exception as e:
            logger.error(f"Failed to delete documents for {file_path}: {e}")
            return 0

    def update_file(self, file_path: str, new_documents: List[Document]) -> List[str]:
        logger.info(f"Updating file in vector store: {file_path}")
        self.delete_by_file_path(file_path)
        return self.add_documents(new_documents)

    def similarity_search(
        self,
        query: str,
        k: Optional[int] = None,
        score_threshold: Optional[float] = None,
        filter: Optional[Dict[str, Any]] = None,
    ) -> List[Document]:
        k = k or settings.top_k_retrieve
        score_threshold = score_threshold or settings.similarity_threshold

        try:
            results = self.vector_store.similarity_search_with_score(
                query=query,
                k=k,
                filter=filter,
            )

            filtered_results = []
            for doc, score in results:
                normalized_score = 1.0 - score if score > 1.0 else score
                if normalized_score >= score_threshold:
                    doc.metadata["similarity_score"] = float(normalized_score)
                    filtered_results.append(doc)
                else:
                    logger.debug(f"Filtered out result with score {normalized_score:.4f} < {score_threshold}")

            logger.info(f"Found {len(filtered_results)} relevant documents for query: {query[:50]}...")
            return filtered_results
        except Exception as e:
            logger.error(f"Failed to perform similarity search: {e}")
            raise

    def get_all_file_paths(self) -> List[str]:
        try:
            collection = self.vector_store._collection
            results = collection.get(include=["metadatas"])
            file_paths = set()
            for metadata in results.get("metadatas", []):
                if metadata and "file_path" in metadata:
                    file_paths.add(metadata["file_path"])
            return sorted(list(file_paths))
        except Exception as e:
            logger.error(f"Failed to get file paths: {e}")
            return []

    def get_document_count(self) -> int:
        try:
            collection = self.vector_store._collection
            return collection.count()
        except Exception as e:
            logger.error(f"Failed to get document count: {e}")
            return 0

    @staticmethod
    def compute_file_hash(content: str) -> str:
        return hashlib.sha256(content.encode('utf-8')).hexdigest()

    def get_file_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        if self._metadata_collection is not None:
            try:
                results = self._metadata_collection.get(
                    ids=[file_path],
                    include=["metadatas", "documents"]
                )
                if results["ids"]:
                    metadata = results["metadatas"][0] or {}
                    if results["documents"] and results["documents"][0]:
                        metadata.update(json.loads(results["documents"][0]))
                    return metadata
            except Exception as e:
                logger.debug(f"Failed to get metadata from dedicated collection for {file_path}: {e}")

        try:
            collection = self.vector_store._collection
            results = collection.get(
                where={"file_path": file_path},
                include=["metadatas"]
            )
            if results["ids"]:
                for metadata in results["metadatas"]:
                    if metadata and "file_hash" in metadata:
                        return {
                            "file_path": file_path,
                            "file_hash": metadata.get("file_hash"),
                            "file_size": metadata.get("file_size"),
                            "last_modified": metadata.get("last_modified"),
                            "chunk_count": len(results["ids"]),
                        }
        except Exception as e:
            logger.error(f"Failed to get metadata from document collection for {file_path}: {e}")

        return None

    def update_file_metadata(self, file_path: str, content: str, chunk_count: int = 0) -> None:
        file_hash = self.compute_file_hash(content)
        file_size = len(content.encode('utf-8'))
        import time
        last_modified = time.time()

        metadata = {
            "file_path": file_path,
            "file_hash": file_hash,
            "file_size": file_size,
            "last_modified": last_modified,
            "chunk_count": chunk_count,
            "indexed_at": last_modified,
        }

        if self._metadata_collection is not None:
            try:
                self._metadata_collection.upsert(
                    ids=[file_path],
                    documents=[json.dumps(metadata, ensure_ascii=False)],
                    metadatas=[{
                        "file_path": file_path,
                        "file_hash": file_hash,
                        "file_size": file_size,
                        "last_modified": last_modified,
                    }],
                )
                logger.debug(f"Updated metadata in dedicated collection for: {file_path}")
                return
            except Exception as e:
                logger.debug(f"Failed to update dedicated metadata collection for {file_path}: {e}")

        try:
            collection = self.vector_store._collection
            results = collection.get(
                where={"file_path": file_path},
                include=["metadatas"]
            )
            if results["ids"]:
                updated_metadatas = []
                for md in results["metadatas"]:
                    new_md = dict(md or {})
                    new_md.update({
                        "file_hash": file_hash,
                        "file_size": file_size,
                        "last_modified": last_modified,
                    })
                    updated_metadatas.append(new_md)
                collection.update(
                    ids=results["ids"],
                    metadatas=updated_metadatas,
                )
                logger.debug(f"Updated metadata in document collection for: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to update metadata in document collection for {file_path}: {e}")

    def get_all_file_metadata(self) -> Dict[str, Dict[str, Any]]:
        all_metadata: Dict[str, Dict[str, Any]] = {}

        if self._metadata_collection is not None:
            try:
                results = self._metadata_collection.get(
                    include=["metadatas", "documents"]
                )
                for i, fid in enumerate(results["ids"]):
                    metadata = results["metadatas"][i] or {}
                    if results["documents"] and results["documents"][i]:
                        try:
                            metadata.update(json.loads(results["documents"][i]))
                        except json.JSONDecodeError:
                            pass
                    all_metadata[fid] = metadata
                return all_metadata
            except Exception as e:
                logger.debug(f"Failed to get all metadata from dedicated collection: {e}")

        try:
            collection = self.vector_store._collection
            results = collection.get(include=["metadatas"])
            for metadata in results.get("metadatas", []):
                if not metadata:
                    continue
                fp = metadata.get("file_path")
                if not fp or fp in all_metadata:
                    continue
                if "file_hash" in metadata:
                    all_metadata[fp] = {
                        "file_path": fp,
                        "file_hash": metadata.get("file_hash"),
                        "file_size": metadata.get("file_size"),
                        "last_modified": metadata.get("last_modified"),
                    }
        except Exception as e:
            logger.error(f"Failed to get all metadata from document collection: {e}")

        return all_metadata

    def delete_file_metadata(self, file_path: str) -> None:
        if self._metadata_collection is not None:
            try:
                self._metadata_collection.delete(ids=[file_path])
                logger.debug(f"Deleted metadata from dedicated collection for: {file_path}")
            except Exception as e:
                logger.debug(f"Failed to delete metadata from dedicated collection for {file_path}: {e}")

    def check_file_changed(self, file_path: str, content: str) -> Tuple[bool, Optional[str]]:
        current_hash = self.compute_file_hash(content)
        stored_metadata = self.get_file_metadata(file_path)

        if stored_metadata is None:
            return True, None

        stored_hash = stored_metadata.get("file_hash")
        if stored_hash is None:
            return True, stored_hash

        return current_hash != stored_hash, stored_hash

    def get_index_diff(
        self,
        current_files: List[str],
        loader,
    ) -> Dict[str, Any]:
        stored_metadata = self.get_all_file_metadata()
        stored_files = set(stored_metadata.keys())
        current_files_set = set(current_files)

        new_files = current_files_set - stored_files
        deleted_files = stored_files - current_files_set
        changed_files: List[str] = []
        unchanged_files: List[str] = []

        for file_path in current_files_set & stored_files:
            content = loader.read_file(file_path) if hasattr(loader, 'read_file') else None
            if content is None:
                changed_files.append(file_path)
                continue

            is_changed, _ = self.check_file_changed(file_path, content)
            if is_changed:
                changed_files.append(file_path)
            else:
                unchanged_files.append(file_path)

        return {
            "new_files": sorted(list(new_files)),
            "modified_files": sorted(changed_files),
            "deleted_files": sorted(list(deleted_files)),
            "unchanged_files": sorted(list(unchanged_files)),
            "summary": {
                "total_current": len(current_files_set),
                "total_stored": len(stored_files),
                "new_count": len(new_files),
                "modified_count": len(changed_files),
                "deleted_count": len(deleted_files),
                "unchanged_count": len(unchanged_files),
                "needs_update": len(new_files) + len(changed_files) + len(deleted_files) > 0,
            }
        }

    def incremental_index(
        self,
        current_files: List[str],
        loader,
        force_reindex: bool = False,
    ) -> Dict[str, Any]:
        if force_reindex:
            logger.info("Force reindex requested, clearing existing index...")
            self.clear()

        diff = self.get_index_diff(current_files, loader)

        stats = {
            "diff": diff,
            "actions": [],
            "total_chunks_processed": 0,
            "total_chunks_added": 0,
            "total_files_deleted": 0,
        }

        for file_path in diff["deleted_files"]:
            try:
                deleted_count = self.delete_by_file_path(file_path)
                stats["actions"].append({
                    "type": "delete",
                    "file_path": file_path,
                    "chunks_removed": deleted_count,
                })
                stats["total_files_deleted"] += 1
                logger.info(f"Deleted {deleted_count} chunks for removed file: {file_path}")
            except Exception as e:
                logger.error(f"Failed to delete {file_path}: {e}")
                stats["actions"].append({
                    "type": "delete",
                    "file_path": file_path,
                    "error": str(e),
                })

        files_to_process = diff["new_files"] + diff["modified_files"]
        for file_path in files_to_process:
            try:
                content = loader.read_file(file_path)
                if content is None:
                    logger.warning(f"Skipping unreadable file: {file_path}")
                    stats["actions"].append({
                        "type": "skip",
                        "file_path": file_path,
                        "reason": "unreadable",
                    })
                    continue

                documents = loader.load_file(file_path)
                if not documents:
                    logger.warning(f"No documents generated for: {file_path}")
                    self.delete_by_file_path(file_path)
                    stats["actions"].append({
                        "type": "skip",
                        "file_path": file_path,
                        "reason": "no_documents",
                    })
                    continue

                ids = self.update_file(file_path, documents)
                self.update_file_metadata(file_path, content, chunk_count=len(ids))

                stats["actions"].append({
                    "type": "update",
                    "file_path": file_path,
                    "chunks_count": len(ids),
                    "was_new": file_path in diff["new_files"],
                })
                stats["total_chunks_processed"] += len(documents)
                stats["total_chunks_added"] += len(ids)

                logger.info(
                    f"{'Added' if file_path in diff['new_files'] else 'Updated'} "
                    f"{len(ids)} chunks for: {file_path}"
                )
            except Exception as e:
                logger.error(f"Failed to process {file_path}: {e}")
                stats["actions"].append({
                    "type": "error",
                    "file_path": file_path,
                    "error": str(e),
                })

        logger.info(
            f"Incremental index complete: "
            f"{stats['total_chunks_added']} chunks added/updated, "
            f"{stats['total_files_deleted']} files deleted"
        )

        return stats

    def clear(self) -> None:
        try:
            collection = self.vector_store._collection
            collection.delete(collection.get()["ids"])
            logger.info("Vector store cleared")

            if self._metadata_collection is not None:
                try:
                    all_ids = self._metadata_collection.get()["ids"]
                    if all_ids:
                        self._metadata_collection.delete(ids=all_ids)
                    logger.info("Metadata collection cleared")
                except Exception as e:
                    logger.warning(f"Failed to clear metadata collection: {e}")
        except Exception as e:
            logger.error(f"Failed to clear vector store: {e}")
            raise

    def get_stats(self) -> Dict[str, Any]:
        return {
            "total_documents": self.get_document_count(),
            "total_files": len(self.get_all_file_paths()),
            "total_metadata_entries": len(self.get_all_file_metadata()),
            "metadata_collection": self.metadata_collection_name,
            "collection_name": self.collection_name,
            "persist_directory": self.persist_dir,
        }
