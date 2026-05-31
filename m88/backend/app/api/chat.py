from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from loguru import logger
import json

from ..schemas import QueryRequest, QueryResponse
from ..services.rag_service import rag_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/query")
async def query(request: QueryRequest):
    try:
        logger.info(
            f"Received query: {request.question[:50]}..., "
            f"stream={request.stream}, mode={request.search_mode}"
        )

        if request.stream:
            return StreamingResponse(
                rag_service.query(
                    question=request.question,
                    top_k=request.top_k,
                    doc_ids=request.doc_ids,
                    stream=True,
                    search_mode=request.search_mode
                ),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Content-Type": "text/event-stream",
                    "Access-Control-Allow-Origin": "*"
                }
            )
        else:
            response_json = ""
            async for chunk in rag_service.query(
                question=request.question,
                top_k=request.top_k,
                doc_ids=request.doc_ids,
                stream=False,
                search_mode=request.search_mode
            ):
                response_json = chunk

            response_data = json.loads(response_json)
            return QueryResponse(**response_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
