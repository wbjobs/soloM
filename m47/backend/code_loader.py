import os
import logging
import hashlib
from typing import List, Optional
from pathlib import Path
from langchain_core.documents import Document
from .config import settings
from .code_splitter import SmartCodeSplitter

logger = logging.getLogger(__name__)

_BINARY_SIGNATURES = [
    b'\x00',
    b'\xff\xd8\xff',
    b'\x89PNG',
    b'PK\x03\x04',
    b'\x1f\x8b',
    b'GIF8',
    b'BM',
    b'\x7fELF',
    b'\xca\xfe\xba\xbe',
    b'\xfe\xed\xfa\xce',
    b'\xfe\xed\xfa\xcf',
    b'\xce\xfa\xed\xfe',
    b'\xcf\xfa\xed\xfe',
]


class CodeLoader:
    def __init__(
        self,
        code_dir: Optional[str] = None,
        file_extensions: Optional[List[str]] = None,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
    ):
        self.code_dir = code_dir or settings.code_dir
        self.file_extensions = file_extensions or settings.file_extension_list
        self.chunk_size = chunk_size or settings.chunk_size
        self.chunk_overlap = chunk_overlap or settings.chunk_overlap
        self.splitter = SmartCodeSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
        )
        self._skipped_files: List[str] = []
        self._ensure_code_dir()

    def _ensure_code_dir(self) -> None:
        code_path = Path(self.code_dir)
        if not code_path.exists():
            logger.info(f"Creating code directory: {self.code_dir}")
            code_path.mkdir(parents=True, exist_ok=True)

    def _is_binary_file(self, file_path: str) -> bool:
        try:
            with open(file_path, 'rb') as f:
                chunk = f.read(8192)
                if not chunk:
                    return False

                for sig in _BINARY_SIGNATURES:
                    if chunk.startswith(sig):
                        return True

                null_count = chunk.count(b'\x00')
                if null_count > 0 and (null_count / len(chunk)) > 0.01:
                    return True

                return False
        except (OSError, IOError) as e:
            logger.warning(f"Cannot read file for binary check {file_path}: {e}")
            return True

    def is_valid_file(self, file_path: str) -> bool:
        path = Path(file_path)
        if not path.is_file():
            return False

        if not path.suffix.lower() in self.file_extensions:
            return False

        if '/.' in str(path) or '\\.' in str(path) or path.name.startswith('.'):
            return False

        exclude_patterns = ['__pycache__', 'node_modules', '.git', '.venv', 'venv', 'dist', 'build', 'target']
        for pattern in exclude_patterns:
            if pattern in path.parts:
                return False

        if self._is_binary_file(file_path):
            logger.debug(f"Skipping binary file: {file_path}")
            return False

        return True

    def get_all_files(self) -> List[str]:
        code_path = Path(self.code_dir)
        if not code_path.exists():
            logger.warning(f"Code directory does not exist: {self.code_dir}")
            return []

        files = []
        for root, dirs, filenames in os.walk(code_path):
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['__pycache__', 'node_modules', '.git', '.venv', 'venv', 'dist', 'build', 'target']]
            for filename in filenames:
                file_path = os.path.join(root, filename)
                if self.is_valid_file(file_path):
                    files.append(file_path)

        logger.info(f"Found {len(files)} valid code files in {self.code_dir}")
        return files

    def read_file(self, file_path: str) -> Optional[str]:
        encodings = ['utf-8', 'utf-8-sig', 'gbk', 'gb2312', 'gb18030', 'big5', 'shift_jis', 'euc-jp', 'euc-kr', 'latin-1']

        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    content = f.read()

                if content and not content.strip():
                    continue

                return content
            except (UnicodeDecodeError, UnicodeError):
                continue
            except (OSError, IOError) as e:
                logger.error(f"IO error reading file {file_path} with {encoding}: {e}")
                return None

        try:
            with open(file_path, 'rb') as f:
                raw = f.read()
            content = raw.decode('utf-8', errors='replace')
            if content.strip():
                logger.warning(f"File {file_path} decoded with replacement characters, content may be corrupted")
                return content
        except Exception as e:
            logger.error(f"All encodings failed for {file_path}: {e}")

        logger.warning(f"Could not decode file {file_path}, skipping")
        return None

    def load_file(self, file_path: str) -> List[Document]:
        if not self.is_valid_file(file_path):
            logger.debug(f"Skipping invalid file: {file_path}")
            return []

        content = self.read_file(file_path)
        if content is None:
            return []

        if not content.strip():
            logger.debug(f"Skipping empty file: {file_path}")
            return []

        try:
            documents = self.splitter.split_file(file_path, content)
            logger.debug(f"Created {len(documents)} chunks from {file_path}")
            return documents
        except Exception as e:
            logger.error(f"Error splitting file {file_path}: {e}")
            self._skipped_files.append(file_path)
            return []

    def load_all(self) -> List[Document]:
        all_documents: List[Document] = []
        self._skipped_files = []
        files = self.get_all_files()
        failed_count = 0

        for file_path in files:
            try:
                docs = self.load_file(file_path)
                all_documents.extend(docs)
            except Exception as e:
                failed_count += 1
                logger.error(f"Error processing {file_path}: {e}")
                self._skipped_files.append(file_path)
                continue

        logger.info(f"Loaded {len(all_documents)} document chunks from {len(files)} files")
        if failed_count > 0:
            logger.warning(f"Failed to process {failed_count} files")
        if self._skipped_files:
            logger.warning(f"Skipped files: {self._skipped_files}")

        return all_documents

    def reload_file(self, file_path: str) -> List[Document]:
        logger.info(f"Reloading file: {file_path}")
        return self.load_file(file_path)

    @staticmethod
    def compute_file_hash(content: str) -> str:
        return hashlib.sha256(content.encode('utf-8')).hexdigest()

    def get_file_hash(self, file_path: str) -> Optional[str]:
        content = self.read_file(file_path)
        if content is None:
            return None
        return self.compute_file_hash(content)
