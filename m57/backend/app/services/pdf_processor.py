import pdfplumber
import fitz  # PyMuPDF
import pandas as pd
from typing import List, Dict, Any, Tuple
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PDFProcessor:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.has_tables = False
        self.table_pages = set()

    def extract_with_pdfplumber(self) -> List[Dict[str, Any]]:
        pages = []
        try:
            with pdfplumber.open(self.file_path) as pdf:
                for page_num, page in enumerate(pdf.pages, 1):
                    page_content = {
                        "page_number": page_num,
                        "content": "",
                        "tables": [],
                        "is_table_page": False
                    }

                    try:
                        tables = page.extract_tables()
                        if tables and len(tables) > 0:
                            page_content["is_table_page"] = True
                            page_content["tables"] = self._process_tables(tables, page_num)
                            self.has_tables = True
                            self.table_pages.add(page_num)
                    except Exception as e:
                        logger.warning(f"Error extracting tables from page {page_num}: {e}")

                    try:
                        text = page.extract_text() or ""
                        text = self._clean_text(text)
                        page_content["raw_text"] = text
                    except Exception as e:
                        logger.warning(f"Error extracting text from page {page_num} with pdfplumber: {e}")
                        page_content["raw_text"] = ""

                    page_content["content"] = self._format_page_content(page_content)
                    pages.append(page_content)

        except Exception as e:
            logger.error(f"Error processing PDF with pdfplumber: {e}")
            raise

        return pages

    def extract_with_pymupdf(self) -> List[Dict[str, Any]]:
        pages = []
        try:
            doc = fitz.open(self.file_path)
            for page_num, page in enumerate(doc, 1):
                try:
                    text = page.get_text("text") or ""
                    text = self._clean_text(text)
                    pages.append({
                        "page_number": page_num,
                        "content": text,
                        "raw_text": text,
                        "tables": [],
                        "is_table_page": False
                    })
                except Exception as e:
                    logger.warning(f"Error extracting text from page {page_num} with pymupdf: {e}")
                    pages.append({
                        "page_number": page_num,
                        "content": "",
                        "raw_text": "",
                        "tables": [],
                        "is_table_page": False
                    })
            doc.close()
        except Exception as e:
            logger.error(f"Error processing PDF with pymupdf: {e}")
            raise

        return pages

    def _process_tables(self, tables: List[List[List[Any]]], page_num: int) -> List[Dict[str, Any]]:
        processed_tables = []
        for table_idx, table in enumerate(tables):
            if not table or len(table) < 2:
                continue

            try:
                df = pd.DataFrame(table[1:], columns=table[0])
                df = df.dropna(how='all')
                df = df.fillna('')

                if df.empty or len(df.columns) == 0:
                    continue

                table_data = {
                    "table_index": table_idx,
                    "headers": [str(h).strip() for h in df.columns.tolist()],
                    "rows": df.values.tolist(),
                    "row_count": len(df),
                    "col_count": len(df.columns),
                    "markdown": self._table_to_markdown(df, page_num, table_idx),
                    "structured_text": self._table_to_structured_text(df, page_num, table_idx)
                }
                processed_tables.append(table_data)
            except Exception as e:
                logger.warning(f"Error processing table {table_idx} on page {page_num}: {e}")
                continue

        return processed_tables

    def _table_to_markdown(self, df: pd.DataFrame, page_num: int, table_idx: int) -> str:
        headers = [str(h).strip() for h in df.columns.tolist()]
        markdown_lines = [
            f"### 表格 {table_idx + 1} (第 {page_num} 页)",
            "",
            "| " + " | ".join(headers) + " |",
            "| " + " | ".join(["---"] * len(headers)) + " |"
        ]

        for _, row in df.iterrows():
            row_values = [str(v).strip() for v in row.tolist()]
            markdown_lines.append("| " + " | ".join(row_values) + " |")

        return "\n".join(markdown_lines)

    def _table_to_structured_text(self, df: pd.DataFrame, page_num: int, table_idx: int) -> str:
        headers = [str(h).strip() for h in df.columns.tolist()]
        lines = [f"[表格 {table_idx + 1} - 第 {page_num} 页]"]
        lines.append(f"列名: {', '.join(headers)}")
        lines.append("-" * 50)

        for row_idx, row in df.iterrows():
            row_data = []
            for col_idx, value in enumerate(row.tolist()):
                value_str = str(value).strip()
                if value_str:
                    row_data.append(f"{headers[col_idx]}: {value_str}")
            if row_data:
                lines.append(f"第 {row_idx + 1} 行: " + " | ".join(row_data))

        return "\n".join(lines)

    def _format_page_content(self, page_data: Dict[str, Any]) -> str:
        content_parts = []

        if page_data.get("raw_text"):
            cleaned_text = self._clean_text(page_data["raw_text"])
            if cleaned_text:
                content_parts.append(f"[第 {page_data['page_number']} 页 文本内容]")
                content_parts.append(cleaned_text)

        if page_data.get("tables"):
            content_parts.append("")
            content_parts.append(f"[第 {page_data['page_number']} 页 表格数据]")
            for table in page_data["tables"]:
                content_parts.append("")
                content_parts.append(table["structured_text"])
                content_parts.append("")
                content_parts.append(table["markdown"])
                content_parts.append("")

        return "\n".join(content_parts)

    def _clean_text(self, text: str) -> str:
        if not text:
            return ""

        text = text.replace('\x00', '')
        text = re.sub(r'\r\n', '\n', text)
        text = re.sub(r'\r', '\n', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'[^\x00-\x7F\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', lambda m: m.group(0) if ord(m.group(0)) < 128 or ('\u4e00' <= m.group(0) <= '\u9fff') else '', text)
        text = text.strip()

        return text

    def extract_text(self, prefer_pdfplumber: bool = True) -> List[Dict[str, Any]]:
        if prefer_pdfplumber:
            try:
                pages = self.extract_with_pdfplumber()
                if self._validate_extraction(pages):
                    logger.info(f"Successfully extracted {len(pages)} pages using pdfplumber")
                    if self.has_tables:
                        logger.info(f"Found tables on pages: {sorted(self.table_pages)}")
                    return pages
            except Exception as e:
                logger.warning(f"pdfplumber extraction failed, falling back to pymupdf: {e}")

        try:
            pages = self.extract_with_pymupdf()
            logger.info(f"Successfully extracted {len(pages)} pages using pymupdf")
            return pages
        except Exception as e:
            logger.error(f"All extraction methods failed: {e}")
            raise

    def _validate_extraction(self, pages: List[Dict[str, Any]]) -> bool:
        if not pages:
            return False

        total_chars = sum(len(p.get("content", "")) for p in pages)
        if total_chars < 100:
            logger.warning(f"Extraction produced only {total_chars} characters, may be low quality")
            return False

        return True

    def get_document_chunks(self, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        chunks = []
        chunk_idx = 0

        for page in pages:
            page_num = page["page_number"]

            if page.get("tables"):
                for table in page["tables"]:
                    chunks.append({
                        "page_number": page_num,
                        "content": table["structured_text"] + "\n\n" + table["markdown"],
                        "start_index": chunk_idx,
                        "end_index": chunk_idx + 1,
                        "is_table": True,
                        "table_index": table["table_index"]
                    })
                    chunk_idx += 1

            if page.get("raw_text"):
                text_chunks = self._split_text_by_paragraphs(page["raw_text"])
                for text_chunk in text_chunks:
                    if len(text_chunk.strip()) > 20:
                        chunks.append({
                            "page_number": page_num,
                            "content": f"[第 {page_num} 页]\n{text_chunk}",
                            "start_index": chunk_idx,
                            "end_index": chunk_idx + 1,
                            "is_table": False
                        })
                        chunk_idx += 1

        return chunks

    def _split_text_by_paragraphs(self, text: str, max_len: int = 800) -> List[str]:
        paragraphs = re.split(r'\n\s*\n', text)
        result = []

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            if len(para) <= max_len:
                result.append(para)
            else:
                sentences = re.split(r'(?<=[。！？.!?])\s*', para)
                current_chunk = ""
                for sent in sentences:
                    if len(current_chunk) + len(sent) <= max_len:
                        current_chunk += sent
                    else:
                        if current_chunk:
                            result.append(current_chunk)
                        current_chunk = sent
                if current_chunk:
                    result.append(current_chunk)

        return result


def extract_text_from_pdf(file_path: str) -> List[Dict[str, Any]]:
    processor = PDFProcessor(file_path)
    pages = processor.extract_text()

    result = []
    for page in pages:
        result.append({
            "page_number": page["page_number"],
            "content": page["content"],
            "raw_text": page.get("raw_text", ""),
            "has_tables": page.get("is_table_page", False),
            "tables": page.get("tables", [])
        })

    return result


def get_pdf_chunks(file_path: str) -> List[Dict[str, Any]]:
    processor = PDFProcessor(file_path)
    pages = processor.extract_text()
    return processor.get_document_chunks(pages)
