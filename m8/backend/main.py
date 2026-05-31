from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router
from app.api.finetune_routes import router as finetune_router

app = FastAPI(
    title="私有化 RAG 系统 API",
    description="基于 LangChain + FAISS 的检索增强生成系统，支持 LoRA 微调",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
app.include_router(finetune_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "message": "私有化 RAG 系统 API",
        "version": "1.1.0",
        "docs": "/docs",
        "features": [
            "RAG 问答",
            "文档索引管理",
            "LoRA 模型微调",
            "实时训练监控"
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
