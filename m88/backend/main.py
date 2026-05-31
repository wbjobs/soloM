from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from app.core.config import settings
from app.api.documents import router as documents_router
from app.api.chat import router as chat_router
from app.api.health import router as health_router
from app.api.pdf_preview import router as pdf_preview_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting RAG application...")
    logger.info(f"Milvus: {settings.MILVUS_HOST}:{settings.MILVUS_PORT}")
    logger.info(f"Embedding model: {settings.EMBEDDING_MODEL_PATH}")
    logger.info(f"LLM model: {settings.LLM_MODEL_PATH}")
    yield
    logger.info("Shutting down RAG application...")


app = FastAPI(
    title="RAG Knowledge Base Q&A API",
    description="私有化部署的 RAG 知识库问答助手 API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(pdf_preview_router)


@app.get("/")
async def root():
    return {
        "name": "RAG Knowledge Base Q&A API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
