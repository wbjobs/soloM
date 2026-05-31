from fastapi import APIRouter, HTTPException
from loguru import logger

from ..schemas import HealthResponse
from ..services.rag_service import rag_service

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    try:
        status = rag_service.get_health_status()
        return HealthResponse(**status)
    except Exception as e:
        logger.error(f"Health check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
