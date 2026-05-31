from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import List
import aiofiles
import os
from pathlib import Path

from app.core.config import UPLOAD_PATH
from app.models.schemas import (
    QueryRequest,
    QueryResponse,
    UploadResponse,
    IndexListResponse,
    DeleteIndexRequest,
    DeleteIndexResponse,
    HealthResponse,
)
from app.services.document_loader import DocumentProcessingService
from app.services.vector_store import VectorStoreService
from app.services.rag_service import RAGService

router = APIRouter()

document_service = DocumentProcessingService()
vector_store_service = VectorStoreService()


def get_rag_service():
    return RAGService(vector_store_service)


@router.get("/health", response_model=HealthResponse)
async def health_check():
    indexes = vector_store_service.list_indexes()
    return HealthResponse(status="healthy", indexes=indexes)


@router.get("/indexes", response_model=IndexListResponse)
async def list_indexes():
    indexes = vector_store_service.list_indexes()
    return IndexListResponse(indexes=indexes)


@router.post("/indexes/{index_name}/load")
async def load_index(index_name: str):
    success = vector_store_service.load_index(index_name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Index '{index_name}' not found")
    return {"success": True, "message": f"Index '{index_name}' loaded successfully"}


@router.post("/indexes/{index_name}/delete", response_model=DeleteIndexResponse)
async def delete_index(index_name: str):
    success = vector_store_service.delete_index(index_name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Index '{index_name}' not found")
    return DeleteIndexResponse(success=True, message=f"Index '{index_name}' deleted successfully")


@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    index_name: str = "default"
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    allowed_extensions = {".pdf", ".md", ".markdown", ".txt"}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    file_path = UPLOAD_PATH / file.filename
    
    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)
    
    try:
        documents = document_service.process_document(str(file_path))
        
        if not vector_store_service.load_index(index_name):
            vector_store_service.create_index(documents, index_name)
        else:
            vector_store_service.add_documents(documents)
        
        vector_store_service.save_index(index_name)
        
        return UploadResponse(
            success=True,
            message=f"File '{file.filename}' processed and indexed successfully",
            file_name=file.filename,
            chunks_count=len(documents),
            index_name=index_name
        )
    except Exception as e:
        if file_path.exists():
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.post("/upload/batch", response_model=List[UploadResponse])
async def upload_multiple_documents(
    files: List[UploadFile] = File(...),
    index_name: str = "default"
):
    results = []
    for file in files:
        try:
            result = await upload_document(file, index_name)
            results.append(result)
        except HTTPException as e:
            results.append(UploadResponse(
                success=False,
                message=f"Error: {e.detail}",
                file_name=file.filename or "unknown",
                chunks_count=0,
                index_name=index_name
            ))
    return results


@router.post("/query", response_model=QueryResponse)
async def query_rag(
    request: QueryRequest,
    rag_service: RAGService = Depends(get_rag_service)
):
    if request.index_name != "default":
        if not vector_store_service.load_index(request.index_name):
            raise HTTPException(
                status_code=404,
                detail=f"Index '{request.index_name}' not found"
            )
    
    if vector_store_service.get_vector_store() is None:
        if not vector_store_service.load_index("default"):
            raise HTTPException(
                status_code=404,
                detail="No index available. Please upload documents first."
            )
    
    try:
        result = rag_service.query(request.question)
        return QueryResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")


@router.post("/query/stream")
async def query_stream(
    request: QueryRequest,
    rag_service: RAGService = Depends(get_rag_service)
):
    if request.index_name != "default":
        if not vector_store_service.load_index(request.index_name):
            raise HTTPException(
                status_code=404,
                detail=f"Index '{request.index_name}' not found"
            )
    
    if vector_store_service.get_vector_store() is None:
        if not vector_store_service.load_index("default"):
            raise HTTPException(
                status_code=404,
                detail="No index available. Please upload documents first."
            )
    
    return StreamingResponse(
        rag_service.query_stream(request.question),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )
