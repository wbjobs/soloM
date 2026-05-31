from pathlib import Path
from typing import List, Tuple
import re
from langchain_core.documents import Document
from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    DirectoryLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter, MarkdownHeaderTextSplitter
from app.core.config import settings


class MarkdownAwareSplitter:
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        
        self.markdown_headers = [
            ("#", "Header 1"),
            ("##", "Header 2"),
            ("###", "Header 3"),
            ("####", "Header 4"),
        ]
        
        self.markdown_splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=self.markdown_headers,
            strip_headers=False,
        )
        
        self.fallback_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=[
                "\n\n\n",
                "\n\n",
                "\n",
                " ",
                ".",
                "!",
                "?",
                ";",
                ",",
                "",
            ],
            is_separator_regex=False,
        )

    def _extract_code_blocks(self, text: str) -> Tuple[str, List[Tuple[int, int, str]]]:
        code_blocks = []
        pattern = r"```[\w]*\n([\s\S]*?)```"
        
        def replacer(match):
            start = match.start()
            end = match.end()
            content = match.group(0)
            placeholder = f"\x00CODE_BLOCK_{len(code_blocks)}\x00"
            code_blocks.append((start, end, content))
            return placeholder
        
        processed_text = re.sub(pattern, replacer, text, flags=re.MULTILINE)
        return processed_text, code_blocks

    def _restore_code_blocks(self, chunks: List[str], code_blocks: List[Tuple[int, int, str]]) -> List[str]:
        restored_chunks = []
        for chunk in chunks:
            restored = chunk
            for i, (_, _, content) in enumerate(code_blocks):
                placeholder = f"\x00CODE_BLOCK_{i}\x00"
                restored = restored.replace(placeholder, content)
            restored_chunks.append(restored)
        return restored_chunks

    def _split_preserving_code_blocks(self, text: str) -> List[str]:
        processed_text, code_blocks = self._extract_code_blocks(text)
        
        temp_doc = Document(page_content=processed_text, metadata={})
        split_docs = self.fallback_splitter.split_documents([temp_doc])
        
        chunks = [doc.page_content for doc in split_docs]
        restored_chunks = self._restore_code_blocks(chunks, code_blocks)
        
        return restored_chunks

    def _is_code_block_complete(self, text: str) -> bool:
        tick_count = text.count("```")
        return tick_count % 2 == 0

    def _merge_partial_code_blocks(self, chunks: List[str]) -> List[str]:
        if not chunks:
            return chunks
            
        merged = []
        current = chunks[0]
        
        for i in range(1, len(chunks)):
            if not self._is_code_block_complete(current):
                current += "\n" + chunks[i]
            else:
                merged.append(current)
                current = chunks[i]
        
        merged.append(current)
        return merged

    def split_text(self, text: str, is_markdown: bool = False) -> List[str]:
        if not text or not text.strip():
            return []
        
        if is_markdown:
            try:
                header_splits = self.markdown_splitter.split_text(text)
                
                final_chunks = []
                for split in header_splits:
                    if not split or not split.strip():
                        continue
                    if len(split) <= self.chunk_size:
                        final_chunks.append(split)
                    else:
                        sub_chunks = self._split_preserving_code_blocks(split)
                        final_chunks.extend(sub_chunks)
                
                final_chunks = self._merge_partial_code_blocks(final_chunks)
                final_chunks = [c for c in final_chunks if c and c.strip()]
                return final_chunks
            except Exception:
                pass
        
        chunks = self._split_preserving_code_blocks(text)
        chunks = self._merge_partial_code_blocks(chunks)
        chunks = [c for c in chunks if c and c.strip()]
        return chunks

    def split_documents(self, documents: List[Document]) -> List[Document]:
        split_docs = []
        
        for doc in documents:
            is_markdown = doc.metadata.get("file_type") == "markdown"
            chunks = self.split_text(doc.page_content, is_markdown=is_markdown)
            
            for i, chunk in enumerate(chunks):
                new_metadata = doc.metadata.copy()
                new_metadata["chunk_index"] = i
                new_metadata["total_chunks"] = len(chunks)
                
                split_doc = Document(
                    page_content=chunk,
                    metadata=new_metadata
                )
                split_docs.append(split_doc)
        
        return split_docs


class DocumentProcessingService:
    def __init__(self):
        self.chunk_size = settings.CHUNK_SIZE
        self.chunk_overlap = settings.CHUNK_OVERLAP
        
        self.markdown_aware_splitter = MarkdownAwareSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap
        )
        
        self.recursive_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            length_function=len,
            separators=[
                "\n\n\n",
                "\n\n",
                "\n",
                " ",
                ".",
                "!",
                "?",
                ";",
                ",",
                "",
            ],
        )

    def load_pdf(self, file_path: str) -> List[Document]:
        loader = PyPDFLoader(file_path)
        documents = loader.load()
        for doc in documents:
            doc.metadata["file_type"] = "pdf"
        return documents

    def load_markdown(self, file_path: str) -> List[Document]:
        loader = TextLoader(file_path, encoding="utf-8")
        documents = loader.load()
        for doc in documents:
            doc.metadata["file_type"] = "markdown"
        return documents

    def load_text(self, file_path: str) -> List[Document]:
        loader = TextLoader(file_path, encoding="utf-8")
        documents = loader.load()
        for doc in documents:
            doc.metadata["file_type"] = "text"
        return documents

    def load_document(self, file_path: str) -> List[Document]:
        path = Path(file_path)
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            return self.load_pdf(file_path)
        elif suffix == ".md" or suffix == ".markdown":
            return self.load_markdown(file_path)
        elif suffix == ".txt":
            return self.load_text(file_path)
        else:
            raise ValueError(f"Unsupported file type: {suffix}")

    def split_documents(self, documents: List[Document]) -> List[Document]:
        return self.markdown_aware_splitter.split_documents(documents)

    def _preprocess_text(self, text: str) -> str:
        text = re.sub(r'\r\n', '\n', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = text.strip()
        return text

    def process_document(self, file_path: str) -> List[Document]:
        documents = self.load_document(file_path)
        file_name = Path(file_path).name
        
        for doc in documents:
            doc.page_content = self._preprocess_text(doc.page_content)
            if "source" in doc.metadata:
                doc.metadata["file_name"] = file_name
            else:
                doc.metadata["source"] = file_path
                doc.metadata["file_name"] = file_name
        
        split_docs = self.split_documents(documents)
        return split_docs

    def load_directory(self, directory_path: str, glob: str = "**/*") -> List[Document]:
        loader = DirectoryLoader(
            directory_path,
            glob=glob,
            loader_cls=TextLoader,
            loader_kwargs={"encoding": "utf-8"},
            recursive=True,
        )
        documents = loader.load()
        
        for doc in documents:
            path = Path(doc.metadata.get("source", ""))
            if path.suffix.lower() in [".md", ".markdown"]:
                doc.metadata["file_type"] = "markdown"
            else:
                doc.metadata["file_type"] = "text"
        
        return self.split_documents(documents)
