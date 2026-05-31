import re
from typing import List, Tuple, Optional, Dict, Any
from dataclasses import dataclass, field
from loguru import logger

import pdfplumber
from langchain_core.documents import Document


@dataclass
class TableBlock:
    page: int
    bbox: Tuple[float, float, float, float]
    headers: List[str]
    rows: List[List[str]]
    markdown: str


@dataclass
class ContentBlock:
    block_type: str
    page: int
    content: str
    bbox: Optional[Tuple[float, float, float, float]] = None


def _normalize_whitespace(text: str) -> str:
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _table_to_markdown(headers: List[str], rows: List[List[str]]) -> str:
    if not headers and not rows:
        return ""

    col_count = len(headers) if headers else (len(rows[0]) if rows else 0)
    if col_count == 0:
        return ""

    if not headers:
        headers = [f"列{i+1}" for i in range(col_count)]

    header_line = "| " + " | ".join(headers) + " |"
    sep_line = "| " + " | ".join(["---"] * col_count) + " |"
    row_lines = []
    for row in rows:
        padded = row + [""] * (col_count - len(row))
        cells = [cell.replace("\n", " ").replace("|", "｜") for cell in padded[:col_count]]
        row_lines.append("| " + " | ".join(cells) + " |")

    return "\n".join([header_line, sep_line] + row_lines)


def _bbox_overlap(
    box1: Tuple[float, float, float, float],
    box2: Tuple[float, float, float, float],
    threshold: float = 0.5
) -> bool:
    x0 = max(box1[0], box2[0])
    y0 = max(box1[1], box2[1])
    x1 = min(box1[2], box2[2])
    y1 = min(box1[3], box2[3])

    if x0 >= x1 or y0 >= y1:
        return False

    intersection = (x1 - x0) * (y1 - y0)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    smaller = min(area1, area2)

    if smaller == 0:
        return False

    return (intersection / smaller) > threshold


def _extract_tables_from_page(
    page: Any,
    page_num: int,
    table_tolerance: int = 3
) -> List[TableBlock]:
    tables: List[TableBlock] = []

    try:
        extracted = page.find_tables(
            table_settings={
                "vertical_strategy": "lines",
                "horizontal_strategy": "lines",
                "snap_tolerance": table_tolerance,
                "join_tolerance": table_tolerance,
                "edge_min_length": 10,
                "min_words_vertical": 1,
                "min_words_horizontal": 1,
            }
        )
    except Exception:
        try:
            extracted = page.find_tables(
                table_settings={
                    "vertical_strategy": "text",
                    "horizontal_strategy": "text",
                    "snap_tolerance": table_tolerance,
                    "join_tolerance": table_tolerance,
                }
            )
        except Exception as e:
            logger.warning(f"Failed to extract tables on page {page_num}: {e}")
            return tables

    for table_obj in extracted:
        try:
            table_data = table_obj.extract()
            if not table_data or len(table_data) < 2:
                continue

            headers = [str(h).strip() if h else "" for h in table_data[0]]
            if all(not h for h in headers):
                if len(table_data) > 1:
                    headers = [f"列{i+1}" for i in range(len(table_data[0]))]
                else:
                    continue

            rows = []
            for row in table_data[1:]:
                cleaned = [str(cell).strip() if cell else "" for cell in row]
                if any(c for c in cleaned):
                    rows.append(cleaned)

            if not rows:
                continue

            markdown = _table_to_markdown(headers, rows)
            if not markdown:
                continue

            bbox = table_obj.bbox

            tables.append(TableBlock(
                page=page_num,
                bbox=bbox,
                headers=headers,
                rows=rows,
                markdown=markdown
            ))
        except Exception as e:
            logger.warning(f"Failed to process table on page {page_num}: {e}")
            continue

    return tables


def _extract_text_excluding_tables(
    page: Any,
    page_num: int,
    table_bboxes: List[Tuple[float, float, float, float]],
    header_margin: float = 15.0
) -> str:
    try:
        full_text = page.within_bbox(
            (0, 0, page.width, page.height)
        ).extract_text() or ""
    except Exception:
        full_text = page.extract_text() or ""

    if not table_bboxes:
        return _normalize_whitespace(full_text)

    try:
        filtered_words = []
        for word in page.extract_words(keep_blank_chars=True, x_tolerance=3, y_tolerance=3):
            word_bbox = (
                word["x0"],
                word["top"] - header_margin,
                word["x1"],
                word["bottom"] + header_margin
            )
            in_table = any(
                _bbox_overlap(word_bbox, tbl_bbox, threshold=0.3)
                for tbl_bbox in table_bboxes
            )
            if not in_table:
                filtered_words.append(word)

        if not filtered_words:
            return ""

        lines: Dict[float, List[str]] = {}
        for w in filtered_words:
            top_key = round(w["top"], 0)
            found = False
            for existing_top in lines:
                if abs(existing_top - top_key) < 5:
                    lines[existing_top].append((w["x0"], w["text"]))
                    found = True
                    break
            if not found:
                lines[top_key] = [(w["x0"], w["text"])]

        sorted_lines = []
        for top in sorted(lines.keys()):
            words_in_line = sorted(lines[top], key=lambda x: x[0])
            line_text = " ".join(w[1] for w in words_in_line)
            sorted_lines.append(line_text)

        return _normalize_whitespace("\n".join(sorted_lines))
    except Exception as e:
        logger.warning(f"Filtered text extraction failed on page {page_num}: {e}, using full text")
        return _normalize_whitespace(full_text)


def parse_pdf_with_tables(
    file_path: str,
    table_tolerance: int = 3,
    merge_table_threshold: float = 0.8
) -> List[Document]:
    blocks: List[ContentBlock] = []

    with pdfplumber.open(file_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            logger.debug(f"Processing page {page_num + 1}/{len(pdf.pages)}")

            tables = _extract_tables_from_page(page, page_num, table_tolerance)
            table_bboxes = [t.bbox for t in tables]

            text = _extract_text_excluding_tables(page, page_num, table_bboxes)

            if text:
                blocks.append(ContentBlock(
                    block_type="text",
                    page=page_num,
                    content=text,
                    bbox=None
                ))

            for table in tables:
                table_text = f"[表格]\n{table.markdown}\n[/表格]"
                blocks.append(ContentBlock(
                    block_type="table",
                    page=page_num,
                    content=table_text,
                    bbox=table.bbox
                ))

            blocks.sort(key=lambda b: (b.page, b.bbox[1] if b.bbox else 0))

    documents = []
    current_text_parts: List[str] = []

    for block in blocks:
        if block.block_type == "text":
            current_text_parts.append(block.content)
        elif block.block_type == "table":
            if current_text_parts:
                combined = "\n\n".join(current_text_parts)
                if combined.strip():
                    documents.append(Document(
                        page_content=combined,
                        metadata={"page": block.page, "type": "text"}
                    ))
                current_text_parts = []

            documents.append(Document(
                page_content=block.content,
                metadata={
                    "page": block.page,
                    "type": "table",
                    "headers": block.content.count("|") // 2 if "|" in block.content else 0
                }
            ))

    if current_text_parts:
        combined = "\n\n".join(current_text_parts)
        if combined.strip():
            documents.append(Document(
                page_content=combined,
                metadata={"page": blocks[-1].page if blocks else 0, "type": "text"}
            ))

    logger.info(f"Parsed PDF: {len(documents)} content blocks extracted")
    return documents
