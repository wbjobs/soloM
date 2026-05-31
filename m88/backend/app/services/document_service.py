import os
import uuid
import re
from datetime import datetime
from typing import List, Tuple, Dict, Any
from loguru import logger

from langchain_community.document_loaders import TextLoader, UnstructuredMarkdownLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from ..core.config import settings
from .embedding_service import embedding_service
from .pdf_table_parser import parse_pdf_with_tables
from .bm25_service import bm25_service
from ..core.database import milvus_client


class TableAwareSplitter:
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self._text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ".", "。", "!", "！", "?", "？", ";", "；", " ", ""]
        )
        self._table_pattern = re.compile(r'\[表格\](.*?)\[/表格\]', re.DOTALL)

    def split_documents(self, documents: List[Document]) -> List[Document]:
        chunks: List[Document] = []

        for doc in documents:
            doc_type = doc.metadata.get("type", "text")
            content = doc.page_content

            if doc_type == "table" or self._table_pattern.search(content):
                chunks.extend(self._split_table_document(doc))
            else:
                chunks.extend(self._split_text_document(doc))

        return chunks

    def _split_table_document(self, doc: Document) -> List[Document]:
        content = doc.page_content
        table_matches = list(self._table_pattern.finditer(content))

        if not table_matches:
            return self._split_text_document(doc)

        parts: List[Tuple[str, str]] = []
        last_end = 0

        for match in table_matches:
            if match.start() > last_end:
                before = content[last_end:match.start()].strip()
                if before:
                    parts.append(("text", before))

            table_content = match.group(0)
            parts.append(("table", table_content))
            last_end = match.end()

        if last_end < len(content):
            remaining = content[last_end:].strip()
            if remaining:
                parts.append(("text", remaining))

        chunks: List[Document] = []
        for part_type, part_content in parts:
            if part_type == "table":
                table_len = len(part_content)
                if table_len <= self.chunk_size * 2:
                    chunks.append(Document(
                        page_content=part_content,
                        metadata={**doc.metadata, "chunk_type": "table"}
                    ))
                else:
                    sub_chunks = self._split_large_table(part_content, doc.metadata)
                    chunks.extend(sub_chunks)
            else:
                text_chunks = self._text_splitter.split_text(part_content)
                for tc in text_chunks:
                    chunks.append(Document(
                        page_content=tc,
                        metadata={**doc.metadata, "chunk_type": "text"}
                    ))

        return self._merge_adjacent_text_chunks(chunks, doc.metadata)

    def _split_large_table(self, table_content: str, base_metadata: Dict) -> List[Document]:
        lines = table_content.split("\n")
        header_line = ""
        sep_line = ""
        data_lines = []

        for i, line in enumerate(lines):
            if line.strip().startswith("|") and not header_line:
                header_line = line
                if i + 1 < len(lines) and re.match(r'\|\s*[-:]+', lines[i + 1]):
                    sep_line = lines[i + 1]
                    continue
            elif header_line and not sep_line and re.match(r'\|\s*[-:]+', line):
                sep_line = line
            elif line.strip().startswith("|"):
                data_lines.append(line)

        if not header_line or not data_lines:
            return [Document(
                page_content=table_content,
                metadata={**base_metadata, "chunk_type": "table"}
            )]

        header_block = f"[表格]\n{header_line}\n{sep_line}"
        chunks = []
        current_lines = []

        for line in data_lines:
            current_lines.append(line)
            current_text = f"{header_block}\n" + "\n".join(current_lines) + "\n[/表格]"

            if len(current_text) > self.chunk_size * 2 and len(current_lines) > 1:
                current_lines.pop()
                chunk_text = f"{header_block}\n" + "\n".join(current_lines) + "\n[/表格]"
                chunks.append(Document(
                    page_content=chunk_text,
                    metadata={**base_metadata, "chunk_type": "table_partial"}
                ))
                current_lines = [line]

        if current_lines:
            chunk_text = f"{header_block}\n" + "\n".join(current_lines) + "\n[/表格]"
            chunks.append(Document(
                page_content=chunk_text,
                metadata={**base_metadata, "chunk_type": "table_partial"}
            ))

        return chunks

    def _merge_adjacent_text_chunks(
        self,
        chunks: List[Document],
        base_metadata: Dict
    ) -> List[Document]:
        if not chunks:
            return chunks

        merged: List[Document] = []
        buffer = ""
        buffer_type = "text"

        for chunk in chunks:
            chunk_type = chunk.metadata.get("chunk_type", "text")
            chunk_content = chunk.page_content

            if chunk_type in ("table", "table_partial"):
                if buffer:
                    merged.append(Document(
                        page_content=buffer,
                        metadata={**base_metadata, "chunk_type": buffer_type}
                    ))
                    buffer = ""
                merged.append(chunk)
            else:
                if len(buffer) + len(chunk_content) + 2 <= self.chunk_size:
                    buffer = buffer + "\n\n" + chunk_content if buffer else chunk_content
                    buffer_type = "text"
                else:
                    if buffer:
                        merged.append(Document(
                            page_content=buffer,
                            metadata={**base_metadata, "chunk_type": buffer_type}
                        ))
                    buffer = chunk_content
                    buffer_type = "text"

        if buffer:
            merged.append(Document(
                page_content=buffer,
                metadata={**base_metadata, "chunk_type": buffer_type}
            ))

        return merged

    def _split_text_document(self, doc: Document) -> List[Document]:
        sub_chunks = self._text_splitter.split_documents([doc])
        for sc in sub_chunks:
            sc.metadata["chunk_type"] = "text"
        return sub_chunks


class DocumentService:
    def __init__(self):
        self.upload_dir = settings.UPLOAD_DIR
        self.chunk_size = settings.CHUNK_SIZE
        self.chunk_overlap = settings.CHUNK_OVERLAP
        self.max_file_size = settings.MAX_FILE_SIZE
        self.pdf_table_tolerance = settings.PDF_TABLE_TOLERANCE
        self._ensure_upload_dir()
        self.doc_metadata: Dict[str, Dict[str, Any]] = {}

    def _ensure_upload_dir(self):
        os.makedirs(self.upload_dir, exist_ok=True)

    def _load_pdf(self, file_path: str) -> List[Document]:
        try:
            documents = parse_pdf_with_tables(
                file_path,
                table_tolerance=self.pdf_table_tolerance
            )
            if documents:
                logger.info(
                    f"PDF table-aware parsing: {len(documents)} blocks, "
                    f"tables: {sum(1 for d in documents if d.metadata.get('type') == 'table')}, "
                    f"text: {sum(1 for d in documents if d.metadata.get('type') == 'text')}"
                )
                return documents
        except Exception as e:
            logger.warning(f"Table-aware PDF parsing failed, falling back to basic loader: {e}")

        from langchain_community.document_loaders import PyPDFLoader
        logger.info("Using fallback PyPDFLoader")
        loader = PyPDFLoader(file_path)
        docs = loader.load()
        for doc in docs:
            doc.metadata["type"] = "text"
        return docs

    def _load_markdown(self, file_path: str) -> List[Document]:
        loader = UnstructuredMarkdownLoader(file_path)
        docs = loader.load()
        for doc in docs:
            doc.metadata["type"] = "text"
        return docs

    def _load_text(self, file_path: str) -> List[Document]:
        loader = TextLoader(file_path, encoding="utf-8")
        docs = loader.load()
        for doc in docs:
            doc.metadata["type"] = "text"
        return docs

    def _load_documents(self, file_path: str, file_ext: str) -> List[Document]:
        if file_ext == '.pdf':
            return self._load_pdf(file_path)
        elif file_ext == '.md':
            return self._load_markdown(file_path)
        elif file_ext in ['.txt']:
            return self._load_text(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_ext}")

    def _split_documents(self, documents: List[Document]) -> List[Document]:
        has_tables = any(
            d.metadata.get("type") == "table" for d in documents
        )

        if has_tables:
            logger.info("Using TableAwareSplitter for documents with tables")
            splitter = TableAwareSplitter(
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap
            )
            return splitter.split_documents(documents)
        else:
            logger.info("Using RecursiveCharacterTextSplitter for text-only documents")
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
                separators=["\n\n", "\n", ".", "。", "!", "！", "?", "？", ";", "；", " ", ""]
            )
            chunks = splitter.split_documents(documents)
            for chunk in chunks:
                chunk.metadata["chunk_type"] = "text"
            return chunks

    def _extract_metadata(self, doc: Document, file_name: str) -> Dict[str, Any]:
        metadata = doc.metadata.copy()
        metadata["source"] = file_name
        metadata["upload_time"] = datetime.now().isoformat()
        return metadata

    async def upload_document(self, file_content: bytes, filename: str) -> Tuple[bool, str, Dict[str, Any]]:
        try:
            if len(file_content) > self.max_file_size:
                return False, f"File too large. Max size: {self.max_file_size} bytes", {}

            file_ext = os.path.splitext(filename)[1].lower()
            if file_ext not in ['.pdf', '.md', '.txt']:
                return False, f"Unsupported file type: {file_ext}. Supported: .pdf, .md, .txt", {}

            doc_id = str(uuid.uuid4())
            file_path = os.path.join(self.upload_dir, f"{doc_id}{file_ext}")

            with open(file_path, 'wb') as f:
                f.write(file_content)

            logger.info(f"Saved file: {file_path}")

            documents = self._load_documents(file_path, file_ext)

            if not documents:
                return False, "No content found in document", {}

            chunks = self._split_documents(documents)

            table_count = sum(1 for c in chunks if c.metadata.get("chunk_type") in ("table", "table_partial"))
            text_count = len(chunks) - table_count
            logger.info(
                f"Split document into {len(chunks)} chunks "
                f"(text: {text_count}, table: {table_count})"
            )

            contents = [doc.page_content for doc in chunks]
            metadatas = [self._extract_metadata(doc, filename) for doc in chunks]

            embeddings = embedding_service.encode(contents)

            milvus_client.insert_vectors(
                doc_id=doc_id,
                doc_name=filename,
                contents=contents,
                embeddings=embeddings,
                metadata=metadatas
            )

            bm25_service.add_document_chunks(
                doc_id=doc_id,
                contents=contents,
                metadata_list=metadatas
            )

            self.doc_metadata[doc_id] = {
                "doc_id": doc_id,
                "doc_name": filename,
                "upload_time": datetime.now(),
                "file_size": len(file_content),
                "chunk_count": len(chunks),
                "status": "completed",
                "file_path": file_path,
                "table_chunks": table_count,
                "text_chunks": text_count
            }

            return True, "Document uploaded and indexed successfully", {
                "doc_id": doc_id,
                "doc_name": filename,
                "chunk_count": len(chunks),
                "table_chunks": table_count,
                "text_chunks": text_count
            }

        except Exception as e:
            logger.error(f"Error uploading document: {e}")
            return False, f"Error: {str(e)}", {}

    def delete_document(self, doc_id: str) -> Tuple[bool, str, int]:
        try:
            deleted_count = milvus_client.delete_by_doc_id(doc_id)
            bm25_service.remove_by_doc_id(doc_id)

            if doc_id in self.doc_metadata:
                file_path = self.doc_metadata[doc_id].get("file_path")
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
                del self.doc_metadata[doc_id]

            return True, f"Deleted {deleted_count} chunks", deleted_count
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            return False, f"Error: {str(e)}", 0

    def get_documents(self) -> List[Dict[str, Any]]:
        try:
            milvus_docs = milvus_client.get_documents()
            result = []

            for doc in milvus_docs:
                doc_id = doc["doc_id"]
                if doc_id in self.doc_metadata:
                    result.append(self.doc_metadata[doc_id])
                else:
                    result.append({
                        "doc_id": doc_id,
                        "doc_name": doc["doc_name"],
                        "upload_time": datetime.now(),
                        "file_size": 0,
                        "chunk_count": 0,
                        "status": "indexed"
                    })

            return result
        except Exception as e:
            logger.error(f"Error getting documents: {e}")
            return []

    def get_document_count(self) -> int:
        return len(self.get_documents())


document_service = DocumentService()
