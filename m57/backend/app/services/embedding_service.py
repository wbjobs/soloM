from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter, MarkdownHeaderTextSplitter
from langchain_core.documents import Document
from app.core.config import settings
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=150,
    length_function=len,
    separators=["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""]
)

markdown_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[
        ("#", "Header 1"),
        ("##", "Header 2"),
        ("###", "Header 3"),
    ]
)

vector_store = None


def get_vector_store():
    global vector_store
    if vector_store is None:
        vector_store = Chroma(
            persist_directory=settings.CHROMA_PERSIST_DIR,
            embedding_function=embeddings,
            collection_name="rag_documents"
        )
    return vector_store


def add_documents_to_vector_store(document_id: str, pages_data: List[Dict[str, Any]], filename: str):
    all_splits = []
    all_ids = []
    chunk_index = 0

    for page_data in pages_data:
        page_number = page_data.get("page_number")
        content = page_data.get("content", "")
        raw_text = page_data.get("raw_text", "")
        tables = page_data.get("tables", [])
        has_tables = page_data.get("has_tables", False)

        if has_tables and tables:
            for table in tables:
                table_content = table["structured_text"] + "\n\n" + table["markdown"]

                doc = Document(
                    page_content=table_content,
                    metadata={
                        "document_id": document_id,
                        "filename": filename,
                        "page_number": page_number if page_number else 0,
                        "is_table": True,
                        "table_index": table.get("table_index", 0),
                        "chunk_type": "table",
                        "chunk_index": chunk_index
                    }
                )
                all_splits.append(doc)
                all_ids.append(f"{document_id}_{chunk_index}")
                chunk_index += 1

        if raw_text and raw_text.strip():
            text_docs = _split_text_content(
                raw_text,
                document_id,
                filename,
                page_number,
                chunk_index
            )

            for doc in text_docs:
                all_splits.append(doc)
                all_ids.append(f"{document_id}_{chunk_index}")
                chunk_index += 1

    if not all_splits:
        logger.warning(f"No content to add for document {document_id}, using full page content")
        for page_data in pages_data:
            page_number = page_data.get("page_number")
            content = page_data.get("content", page_data.get("raw_text", ""))
            if content.strip():
                doc = Document(
                    page_content=content,
                    metadata={
                        "document_id": document_id,
                        "filename": filename,
                        "page_number": page_number if page_number else 0,
                        "is_table": False,
                        "chunk_type": "text",
                        "chunk_index": chunk_index
                    }
                )
                all_splits.append(doc)
                all_ids.append(f"{document_id}_{chunk_index}")
                chunk_index += 1

    if all_splits:
        vs = get_vector_store()
        vs.add_documents(documents=all_splits, ids=all_ids)
        logger.info(f"Added {len(all_splits)} chunks to vector store for document {document_id}")
    else:
        logger.error(f"No valid content found for document {document_id}")

    return len(all_splits)


def _split_text_content(
    text: str,
    document_id: str,
    filename: str,
    page_number: int,
    start_chunk_index: int
) -> List[Document]:
    docs = []

    try:
        splits = text_splitter.split_text(text)
    except Exception as e:
        logger.warning(f"Text splitting failed, using simple split: {e}")
        splits = [text[i:i + 800] for i in range(0, len(text), 650)]

    for i, split in enumerate(splits):
        if not split.strip():
            continue

        metadata = {
            "document_id": document_id,
            "filename": filename,
            "page_number": page_number if page_number else 0,
            "is_table": False,
            "chunk_type": "text",
            "chunk_index": start_chunk_index + i
        }

        doc = Document(page_content=f"[第 {page_number} 页]\n{split}", metadata=metadata)
        docs.append(doc)

    return docs


def search_documents(query: str, k: int = 4, document_ids: List[str] = None):
    vs = get_vector_store()

    try:
        if document_ids:
            filter_dict = {"document_id": {"$in": document_ids}}
            results = vs.similarity_search_with_score(query, k=k * 2, filter=filter_dict)
        else:
            results = vs.similarity_search_with_score(query, k=k * 2)

        results = _deduplicate_and_rank(results, k)

        formatted_results = []
        for doc, score in results:
            metadata = doc.metadata
            formatted_results.append({
                "id": str(metadata.get("chunk_index", "")),
                "document_name": metadata.get("filename", "Unknown"),
                "page_number": metadata.get("page_number"),
                "content": doc.page_content,
                "score": float(score),
                "is_table": metadata.get("is_table", False),
                "chunk_type": metadata.get("chunk_type", "text")
            })

        return formatted_results

    except Exception as e:
        logger.error(f"Error searching documents: {e}")
        return []


def _deduplicate_and_rank(results: List[tuple], k: int) -> List[tuple]:
    seen_contents = set()
    unique_results = []

    table_results = []
    text_results = []

    for doc, score in results:
        content = doc.page_content[:200]
        if content in seen_contents:
            continue
        seen_contents.add(content)

        if doc.metadata.get("is_table", False):
            table_results.append((doc, score * 0.9))
        else:
            text_results.append((doc, score))

    table_results.sort(key=lambda x: x[1])
    text_results.sort(key=lambda x: x[1])

    merged = []
    table_idx = 0
    text_idx = 0

    while len(merged) < k and (table_idx < len(table_results) or text_idx < len(text_results)):
        if table_idx < len(table_results) and (text_idx >= len(text_results) or table_results[table_idx][1] <= text_results[text_idx][1]):
            merged.append(table_results[table_idx])
            table_idx += 1
        elif text_idx < len(text_results):
            merged.append(text_results[text_idx])
            text_idx += 1

    return merged[:k]


def delete_documents_from_vector_store(document_id: str):
    vs = get_vector_store()
    try:
        vs.delete(where={"document_id": document_id})
        logger.info(f"Deleted vectors for document {document_id}")
    except Exception as e:
        logger.warning(f"Could not delete vectors for document {document_id}: {e}")
