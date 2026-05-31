from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import os
import aiofiles
import uuid
from app.models.database import get_db
from app.schemas.document import DocumentResponse, DocumentUploadResponse
from app.services import document_service, embedding_service
from app.core.config import settings

router = APIRouter()


async def process_document_background(db: Session, document_id: str, file_path: str, file_type: str, filename: str):
    try:
        document_service.update_document_status(db, document_id, "processing")

        pages_data = document_service.extract_text(file_path, file_type)

        chunk_count = embedding_service.add_documents_to_vector_store(
            document_id=document_id,
            pages_data=pages_data,
            filename=filename
        )

        chunks_data = []
        for page in pages_data:
            chunks_data.append({
                "page_number": page.get("page_number"),
                "content": page.get("content"),
                "start_index": 0,
                "end_index": len(page.get("content", ""))
            })
        document_service.save_chunks(db, document_id, chunks_data)

        document_service.update_document_status(db, document_id, "completed", chunk_count)

    except Exception as e:
        print(f"Error processing document {document_id}: {e}")
        document_service.update_document_status(db, document_id, "failed")


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    file_ext = file.filename.split('.')[-1].lower()
    if file_ext not in ['pdf', 'txt']:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are allowed")

    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}_{file.filename}"
    file_location = os.path.join(settings.DOCUMENTS_DIR, safe_filename)

    os.makedirs(settings.DOCUMENTS_DIR, exist_ok=True)

    content = await file.read()
    file_size = len(content)

    async with aiofiles.open(file_location, 'wb') as out_file:
        await out_file.write(content)

    db_document = await document_service.save_document(
        db=db,
        filename=file.filename,
        file_path=file_location,
        file_size=file_size
    )

    background_tasks.add_task(
        process_document_background,
        db,
        db_document.id,
        file_location,
        file_ext,
        file.filename
    )

    return {
        "success": True,
        "document": db_document
    }


@router.get("/", response_model=List[DocumentResponse])
def list_documents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    documents = document_service.get_documents(db, skip=skip, limit=limit)
    return documents


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(document_id: str, db: Session = Depends(get_db)):
    document = document_service.get_document(db, document_id=document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.delete("/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):
    document = document_service.get_document(db, document_id=document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    document_service.delete_document(db, document_id=document_id)
    embedding_service.delete_documents_from_vector_store(document_id=document_id)

    return {"message": "Document deleted successfully", "success": True}


@router.post("/{document_id}/reindex")
def reindex_document(document_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    document = document_service.get_document(db, document_id=document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    embedding_service.delete_documents_from_vector_store(document_id=document_id)

    background_tasks.add_task(
        process_document_background,
        db,
        document.id,
        document.file_path,
        document.type,
        document.name
    )

    return {"message": "Reindexing started", "success": True}
