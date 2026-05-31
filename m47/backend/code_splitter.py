import re
import os
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from langchain_core.documents import Document


@dataclass
class CodeChunk:
    content: str
    file_path: str
    start_line: int
    end_line: int
    chunk_type: str
    name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SimpleRecursiveSplitter:
    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 100, separators: Optional[List[str]] = None):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", ". ", " ", ""]

    def split_text(self, text: str) -> List[str]:
        if len(text) <= self.chunk_size:
            return [text]

        chunks = []

        def _split(text: str, separator_idx: int = 0) -> List[str]:
            if len(text) <= self.chunk_size:
                return [text]

            if separator_idx >= len(self.separators):
                return self._split_by_chars(text)

            sep = self.separators[separator_idx]
            parts = text.split(sep) if sep else list(text)
            good_parts = []
            current_chunk = ""

            for part in parts:
                part_with_sep = part + (sep if sep else "")
                if len(current_chunk) + len(part_with_sep) <= self.chunk_size:
                    current_chunk += part_with_sep
                else:
                    if current_chunk:
                        good_parts.append(current_chunk.rstrip(sep))
                    if len(part_with_sep) > self.chunk_size:
                        good_parts.extend(_split(part, separator_idx + 1))
                        current_chunk = ""
                    else:
                        current_chunk = part_with_sep

            if current_chunk:
                good_parts.append(current_chunk.rstrip(sep))

            return self._add_overlap(good_parts)

        return _split(text)

    def _split_by_chars(self, text: str) -> List[str]:
        chunks = []
        step = self.chunk_size - self.chunk_overlap
        for i in range(0, len(text), step):
            chunk = text[i:i + self.chunk_size]
            chunks.append(chunk)
            if i + self.chunk_size >= len(text):
                break
        return chunks

    def _add_overlap(self, chunks: List[str]) -> List[str]:
        if len(chunks) <= 1 or self.chunk_overlap <= 0:
            return chunks

        result = [chunks[0]]
        for i in range(1, len(chunks)):
            prev_chunk = chunks[i - 1]
            curr_chunk = chunks[i]

            overlap_chars = min(self.chunk_overlap, len(prev_chunk))
            overlap_text = prev_chunk[-overlap_chars:]

            if not curr_chunk.startswith(overlap_text):
                curr_chunk = overlap_text + curr_chunk

            result.append(curr_chunk)

        return result


class CodeStructureSplitter:
    LANGUAGE_PATTERNS = {
        '.py': {
            'class': re.compile(r'^\s*class\s+(\w+)'),
            'function': re.compile(r'^\s*(?:def|async def)\s+(\w+)'),
            'method': re.compile(r'^\s*(?:def|async def)\s+(\w+)'),
            'comment': re.compile(r'^\s*#'),
            'docstring': re.compile(r'^\s*""".*?""".*?$|^\s*""".*?$|^.*?""".*?$'),
        },
        '.js': {
            'class': re.compile(r'^\s*(?:export\s+)?class\s+(\w+)'),
            'function': re.compile(r'^\s*(?:export\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\s*(?:function|\()?)'),
            'method': re.compile(r'^\s*(?:async\s+)?(\w+)\s*\('),
            'comment': re.compile(r'^\s*//'),
            'docstring': re.compile(r'^\s*/\*\*.*?\*/.*?$'),
        },
        '.ts': {
            'class': re.compile(r'^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)'),
            'function': re.compile(r'^\s*(?:export\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*[:=].*?(?:=>|\()?)'),
            'method': re.compile(r'^\s*(?:async\s+)?(\w+)\s*\('),
            'comment': re.compile(r'^\s*//'),
            'docstring': re.compile(r'^\s*/\*\*.*?\*/.*?$'),
        },
        '.java': {
            'class': re.compile(r'^\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?class\s+(\w+)'),
            'function': re.compile(r'^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:[\w<>\[\]]+)\s+(\w+)\s*\('),
            'method': re.compile(r'^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:[\w<>\[\]]+)\s+(\w+)\s*\('),
            'comment': re.compile(r'^\s*//'),
            'docstring': re.compile(r'^\s*/\*\*.*?\*/.*?$'),
        },
        '.cpp': {
            'class': re.compile(r'^\s*(?:class|struct)\s+(\w+)'),
            'function': re.compile(r'^\s*(?:[\w:]+\s+)?(\w+)\s*\([^;]*\)\s*(?:const\s*)?\s*\{?'),
            'method': re.compile(r'^\s*(?:[\w:]+\s+)?(\w+)\s*\([^;]*\)\s*(?:const\s*)?\s*\{?'),
            'comment': re.compile(r'^\s*//'),
            'docstring': re.compile(r'^\s*/\*\*.*?\*/.*?$'),
        },
        '.go': {
            'class': re.compile(r'^\s*type\s+(\w+)\s+struct'),
            'function': re.compile(r'^\s*func\s+(?:\([^)]+\)\s+)?(\w+)\s*\('),
            'method': re.compile(r'^\s*func\s+(?:\([^)]+\)\s+)?(\w+)\s*\('),
            'comment': re.compile(r'^\s*//'),
            'docstring': re.compile(r'^\s*//'),
        },
        '.rs': {
            'class': re.compile(r'^\s*(?:pub\s+)?(?:struct|enum|impl)\s+(\w+)'),
            'function': re.compile(r'^\s*(?:pub\s+)?fn\s+(\w+)\s*\('),
            'method': re.compile(r'^\s*(?:pub\s+)?fn\s+(\w+)\s*\('),
            'comment': re.compile(r'^\s*//'),
            'docstring': re.compile(r'^\s*///'),
        },
    }

    @classmethod
    def get_separators_for_extension(cls, ext: str) -> List[str]:
        language_separators = {
            '.py': ["\n\nclass ", "\n\ndef ", "\n\nasync def ", "\nclass ", "\ndef ", "\nasync def ", "\n\n", "\n", ". ", " ", ""],
            '.js': ["\n\nclass ", "\n\nfunction ", "\n\nconst ", "\n\nlet ", "\nclass ", "\nfunction ", "\nconst ", "\nlet ", "\n\n", "\n", ". ", " ", ""],
            '.ts': ["\n\nclass ", "\n\nfunction ", "\n\nconst ", "\n\nlet ", "\nclass ", "\nfunction ", "\nconst ", "\nlet ", "\n\n", "\n", ". ", " ", ""],
            '.java': ["\n\nclass ", "\n\npublic ", "\n\nprivate ", "\n\nprotected ", "\nclass ", "\npublic ", "\nprivate ", "\nprotected ", "\n\n", "\n", ". ", " ", ""],
            '.cpp': ["\n\nclass ", "\n\nstruct ", "\n\nint ", "\n\nvoid ", "\nclass ", "\nstruct ", "\n\n", "\n", ". ", " ", ""],
            '.go': ["\n\nfunc ", "\n\ntype ", "\nfunc ", "\ntype ", "\n\n", "\n", ". ", " ", ""],
            '.rs': ["\n\nfn ", "\n\nstruct ", "\n\nimpl ", "\nfn ", "\nstruct ", "\nimpl ", "\n\n", "\n", ". ", " ", ""],
        }
        return language_separators.get(ext, ["\n\n", "\n", ". ", " ", ""])

    @classmethod
    def split_by_structure(cls, file_path: str, content: str) -> List[CodeChunk]:
        ext = os.path.splitext(file_path)[1].lower()
        patterns = cls.LANGUAGE_PATTERNS.get(ext, cls.LANGUAGE_PATTERNS['.py'])
        lines = content.split('\n')
        chunks: List[CodeChunk] = []

        current_class: Optional[str] = None
        current_class_start: int = 0
        current_function: Optional[str] = None
        current_function_start: int = 0
        current_function_indent: int = 0
        class_indent: int = 0

        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if not stripped or patterns['comment'].match(line) or patterns['docstring'].match(line):
                continue

            indent = len(line) - len(line.lstrip())

            class_match = patterns['class'].match(line)
            if class_match:
                if current_function is not None:
                    chunks.append(CodeChunk(
                        content='\n'.join(lines[current_function_start - 1:i - 1]),
                        file_path=file_path,
                        start_line=current_function_start,
                        end_line=i - 1,
                        chunk_type='function',
                        name=current_function,
                        metadata={'parent_class': current_class}
                    ))
                    current_function = None

                if current_class is not None:
                    chunks.append(CodeChunk(
                        content='\n'.join(lines[current_class_start - 1:i - 1]),
                        file_path=file_path,
                        start_line=current_class_start,
                        end_line=i - 1,
                        chunk_type='class',
                        name=current_class
                    ))

                current_class = class_match.group(1)
                current_class_start = i
                class_indent = indent
                continue

            func_match = patterns['function'].match(line)
            if func_match:
                func_name = func_match.group(1) or func_match.group(2)
                if func_name:
                    if current_function is not None and indent <= current_function_indent:
                        chunks.append(CodeChunk(
                            content='\n'.join(lines[current_function_start - 1:i - 1]),
                            file_path=file_path,
                            start_line=current_function_start,
                            end_line=i - 1,
                            chunk_type='function',
                            name=current_function,
                            metadata={'parent_class': current_class}
                        ))
                        current_function = None

                    if current_class is not None and indent <= class_indent:
                        chunks.append(CodeChunk(
                            content='\n'.join(lines[current_class_start - 1:i - 1]),
                            file_path=file_path,
                            start_line=current_class_start,
                            end_line=i - 1,
                            chunk_type='class',
                            name=current_class
                        ))
                        current_class = None

                    current_function = func_name
                    current_function_start = i
                    current_function_indent = indent
                continue

            if current_function is not None and indent <= current_function_indent and not line.rstrip().endswith(')'):
                if '{' in line and '}' not in line:
                    continue
                chunks.append(CodeChunk(
                    content='\n'.join(lines[current_function_start - 1:i - 1]),
                    file_path=file_path,
                    start_line=current_function_start,
                    end_line=i - 1,
                    chunk_type='function',
                    name=current_function,
                    metadata={'parent_class': current_class}
                ))
                current_function = None

        if current_function is not None:
            chunks.append(CodeChunk(
                content='\n'.join(lines[current_function_start - 1:]),
                file_path=file_path,
                start_line=current_function_start,
                end_line=len(lines),
                chunk_type='function',
                name=current_function,
                metadata={'parent_class': current_class}
            ))

        if current_class is not None:
            chunks.append(CodeChunk(
                content='\n'.join(lines[current_class_start - 1:]),
                file_path=file_path,
                start_line=current_class_start,
                end_line=len(lines),
                chunk_type='class',
                name=current_class
            ))

        if not chunks:
            chunks.append(CodeChunk(
                content=content,
                file_path=file_path,
                start_line=1,
                end_line=len(lines),
                chunk_type='file'
            ))

        return chunks


class SmartCodeSplitter:
    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 100):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split_file(self, file_path: str, content: str) -> List[Document]:
        ext = os.path.splitext(file_path)[1].lower()
        documents: List[Document] = []

        structure_chunks = CodeStructureSplitter.split_by_structure(file_path, content)

        for chunk in structure_chunks:
            if len(chunk.content) > self.chunk_size * 1.5:
                documents.extend(self._split_large_chunk(chunk))
            else:
                documents.append(self._chunk_to_document(chunk))

        if not documents:
            documents.extend(self._fallback_split(file_path, content, ext))

        return documents

    def _chunk_to_document(self, chunk: CodeChunk) -> Document:
        metadata = {
            "file_path": chunk.file_path,
            "start_line": chunk.start_line,
            "end_line": chunk.end_line,
            "chunk_type": chunk.chunk_type,
            "source": chunk.file_path,
        }
        if chunk.name:
            metadata["name"] = chunk.name
        if chunk.metadata:
            metadata.update(chunk.metadata)

        header = self._create_chunk_header(chunk)
        full_content = f"{header}\n{chunk.content}"

        return Document(page_content=full_content, metadata=metadata)

    def _create_chunk_header(self, chunk: CodeChunk) -> str:
        header_parts = [f"File: {chunk.file_path}"]
        header_parts.append(f"Lines: {chunk.start_line}-{chunk.end_line}")
        header_parts.append(f"Type: {chunk.chunk_type}")
        if chunk.name:
            header_parts.append(f"Name: {chunk.name}")
        if chunk.metadata and chunk.metadata.get('parent_class'):
            header_parts.append(f"Class: {chunk.metadata['parent_class']}")
        return " | ".join(header_parts)

    def _split_large_chunk(self, chunk: CodeChunk) -> List[Document]:
        ext = os.path.splitext(chunk.file_path)[1].lower()
        separators = CodeStructureSplitter.get_separators_for_extension(ext)

        splitter = SimpleRecursiveSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=separators,
        )

        split_texts = splitter.split_text(chunk.content)
        documents = []
        lines = chunk.content.split('\n')
        current_line = chunk.start_line

        for text in split_texts:
            text_lines = text.split('\n')
            end_line = current_line + len(text_lines) - 1
            new_chunk = CodeChunk(
                content=text,
                file_path=chunk.file_path,
                start_line=current_line,
                end_line=min(end_line, chunk.end_line),
                chunk_type=f"{chunk.chunk_type}_segment",
                name=chunk.name,
                metadata=chunk.metadata
            )
            documents.append(self._chunk_to_document(new_chunk))
            current_line = max(current_line + 1, end_line - self.chunk_overlap // 20)

        return documents

    def _fallback_split(self, file_path: str, content: str, ext: str) -> List[Document]:
        separators = CodeStructureSplitter.get_separators_for_extension(ext)
        splitter = SimpleRecursiveSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=separators,
        )

        split_texts = splitter.split_text(content)
        split_docs = [
            Document(
                page_content=text,
                metadata={"file_path": file_path, "source": file_path, "chunk_type": "fallback"}
            )
            for text in split_texts
        ]

        for i, doc in enumerate(split_docs):
            lines = doc.page_content.split('\n')
            doc.metadata.update({
                "start_line": i * (self.chunk_size // 20) + 1,
                "end_line": (i + 1) * (self.chunk_size // 20),
                "name": f"segment_{i}"
            })
            header = f"File: {file_path} | Lines: {doc.metadata['start_line']}-{doc.metadata['end_line']} | Type: fallback"
            doc.page_content = f"{header}\n{doc.page_content}"

        return split_docs
