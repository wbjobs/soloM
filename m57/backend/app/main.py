from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import documents, chat
from app.core.config import settings
from app.models.database import init_db

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])


@app.on_event("startup")
async def startup_event():
    init_db()


@app.get("/")
async def root():
    return {"message": "Welcome to RAG API", "version": "1.0.0"}


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "rag-backend"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
