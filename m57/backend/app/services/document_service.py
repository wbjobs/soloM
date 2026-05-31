from sqlalchemy.orm import Session
from app.models.database import Document, Chunk
from app.schemas.document import DocumentCreate
from app.services.pdf_processor import extract_text_from_pdf, get_pdf_chunks
import os
import re
from app.core.config import settings
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


async def save_document(db: Session, filename: str, file_path: str, file_size: int):
    file_ext = filename.split('.')[-1].lower()
    db_document = Document(
        name=filename,
        file_path=file_path,
        type=file_ext,
        size=file_size,
        status="processing"
    )
    db.add(db_document)
    db.commit()
    db.refresh(db_document)
    return db_document


def extract_text_from_txt(file_path: str):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(file_path, 'r', encoding='gbk') as f:
            content = f.read()

    content = clean_text(content)
    paragraphs = split_text_by_paragraphs(content)

    pages = []
    for i, para in enumerate(paragraphs):
        pages.append({
            "page_number": i + 1,
            "content": para,
            "raw_text": para,
            "has_tables": False,
            "tables": []
        })
    return pages


def extract_text(file_path: str, file_type: str):
    if file_type == 'pdf':
        logger.info(f"Extracting text from PDF: {file_path}")
        pages = extract_text_from_pdf(file_path)
        logger.info(f"Extracted {len(pages)} pages from PDF")
        return pages
    elif file_type == 'txt':
        logger.info(f"Extracting text from TXT: {file_path}")
        return extract_text_from_txt(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def get_document_chunks(file_path: str, file_type: str):
    if file_type == 'pdf':
        return get_pdf_chunks(file_path)
    elif file_type == 'txt':
        pages = extract_text_from_txt(file_path)
        chunks = []
        for page in pages:
            chunks.append({
                "page_number": page["page_number"],
                "content": page["content"],
                "start_index": page["page_number"] - 1,
                "end_index": page["page_number"],
                "is_table": False
            })
        return chunks
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def clean_text(text: str) -> str:
    if not text:
        return ""

    text = text.replace('\x00', '')
    text = re.sub(r'\r\n', '\n', text)
    text = re.sub(r'\r', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = text.strip()

    return text


def split_text_by_paragraphs(text: str, max_len: int = 800) -> list:
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


def update_document_status(db: Session, document_id: str, status: str, chunk_count: int = None):
    db_document = get_document(db, document_id)
    if db_document:
        db_document.status = status
        if chunk_count is not None:
            db_document.chunk_count = chunk_count
        db_document.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_document)
        logger.info(f"Document {document_id} status updated to {status}")
    return db_document


def save_chunks(db: Session, document_id: str, chunks_data):
    for chunk_data in chunks_data:
        db_chunk = Chunk(
            document_id=document_id,
            page_number=chunk_data.get("page_number"),
            content=chunk_data.get("content"),
            start_index=chunk_data.get("start_index"),
            end_index=chunk_data.get("end_index")
        )
        db.add(db_chunk)
    db.commit()
    logger.info(f"Saved {len(chunks_data)} chunks for document {document_id}")


def get_document(db: Session, document_id: str):
    return db.query(Document).filter(Document.id == document_id).first()


def get_documents(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Document).order_by(Document.created_at.desc()).offset(skip).limit(limit).all()


def delete_document(db: Session, document_id: str):
    db_document = get_document(db, document_id)
    if db_document:
        if os.path.exists(db_document.file_path):
            os.remove(db_document.file_path)
        db.delete(db_document)
        db.commit()
        logger.info(f"Document {document_id} deleted")
    return db_document
