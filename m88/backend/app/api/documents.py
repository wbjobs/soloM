from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from typing import List
from loguru import logger

from ..schemas import DocumentUploadResponse, DocumentDeleteResponse, DocumentListResponse, DocumentInfo
from ..services.document_service import document_service

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(file: UploadFile = File(...)):
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        content = await file.read()
        logger.info(f"Received file: {file.filename}, size: {len(content)} bytes")
        
        success, message, data = await document_service.upload_document(
            file_content=content,
            filename=file.filename
        )
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        return DocumentUploadResponse(
            success=True,
            message=message,
            doc_id=data.get("doc_id"),
            doc_name=data.get("doc_name"),
            chunk_count=data.get("chunk_count")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{doc_id}", response_model=DocumentDeleteResponse)
async def delete_document(doc_id: str):
    try:
        success, message, deleted_count = document_service.delete_document(doc_id)
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        return DocumentDeleteResponse(
            success=True,
            message=message,
            deleted_count=deleted_count
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=DocumentListResponse)
async def list_documents():
    try:
        documents_data = document_service.get_documents()
        
        documents = []
        for doc in documents_data:
            documents.append(DocumentInfo(
                doc_id=doc["doc_id"],
                doc_name=doc["doc_name"],
                upload_time=doc["upload_time"],
                file_size=doc.get("file_size", 0),
                chunk_count=doc.get("chunk_count", 0),
                status=doc.get("status", "indexed")
            ))
        
        return DocumentListResponse(
            documents=documents,
            total=len(documents)
        )
        
    except Exception as e:
        logger.error(f"List documents error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
