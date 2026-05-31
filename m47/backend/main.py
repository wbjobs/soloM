import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .config import settings
from .code_loader import CodeLoader
from .vector_store import VectorStoreManager
from .file_watcher import FileWatcher
from .rag_service import RAGService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Code RAG API",
    description="本地代码库智能问答助手 API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str = Field(..., description="用户的问题")
    chat_history: Optional[List[Dict[str, str]]] = Field(None, description="聊天历史记录")
    k: Optional[int] = Field(None, description="检索的文档数量")


class IndexRequest(BaseModel):
    code_dir: Optional[str] = Field(None, description="要索引的代码目录")
    force_reindex: bool = Field(False, description="是否强制重新索引")


class FilePathRequest(BaseModel):
    file_path: str = Field(..., description="文件路径")


class ChangeLogEntry(BaseModel):
    type: str
    file_path: str
    timestamp: float
    details: Dict[str, Any]


code_loader: Optional[CodeLoader] = None
vector_store_manager: Optional[VectorStoreManager] = None
file_watcher: Optional[FileWatcher] = None
rag_service: Optional[RAGService] = None
change_log: List[ChangeLogEntry] = []


def on_file_change(change_type: str, file_path: str, chunk_count: int) -> None:
    import time
    entry = ChangeLogEntry(
        type=change_type,
        file_path=file_path,
        timestamp=time.time(),
        details={"chunk_count": chunk_count},
    )
    change_log.append(entry)
    if len(change_log) > 100:
        change_log.pop(0)
    logger.info(f"File change logged: {change_type} - {file_path} ({chunk_count} chunks)")


@app.on_event("startup")
async def startup_event():
    global code_loader, vector_store_manager, file_watcher, rag_service

    logger.info("Initializing Code RAG services...")

    try:
        code_loader = CodeLoader()
        vector_store_manager = VectorStoreManager()
        rag_service = RAGService(vector_store_manager)
        file_watcher = FileWatcher(
            code_loader=code_loader,
            vector_store_manager=vector_store_manager,
            on_change_callback=on_file_change,
        )

        logger.info("Performing incremental index check...")
        files = code_loader.get_all_files()
        index_stats = vector_store_manager.incremental_index(files, code_loader)
        summary = index_stats.get("diff", {}).get("summary", {})
        if summary.get("needs_update"):
            logger.info(
                f"Incremental index complete: "
                f"{summary.get('new_count', 0)} new, "
                f"{summary.get('modified_count', 0)} modified, "
                f"{summary.get('deleted_count', 0)} deleted files"
            )
        else:
            logger.info("No file changes detected, index is up to date")

        file_watcher.start()
        logger.info("Code RAG services initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    global file_watcher
    if file_watcher:
        file_watcher.stop()
        logger.info("File watcher stopped")


@app.get("/")
async def root():
    return {
        "name": "Code RAG API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "GET /api/health": "健康检查",
            "GET /api/stats": "获取统计信息",
            "POST /api/query": "提交问题并获取回答",
            "POST /api/query/stream": "流式获取回答",
            "POST /api/index": "触发增量代码索引",
            "GET /api/index/diff": "查看索引差异（Hash 比对）",
            "POST /api/index/file": "重新索引单个文件",
            "DELETE /api/index/file": "从索引中移除单个文件",
            "GET /api/files": "获取已索引的文件列表",
            "GET /api/changes": "获取文件变更日志",
            "DELETE /api/index": "清空索引",
        },
    }


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "watcher_running": file_watcher.is_running if file_watcher else False,
        "llm_provider": settings.llm_provider,
    }


@app.get("/api/stats")
async def get_stats():
    if not vector_store_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    stats = vector_store_manager.get_stats()
    stats["watcher_running"] = file_watcher.is_running if file_watcher else False
    stats["code_dir"] = settings.code_dir
    stats["llm_provider"] = settings.llm_provider

    return stats


@app.post("/api/query")
async def query(request: QueryRequest):
    if not rag_service:
        raise HTTPException(status_code=503, detail="Service not initialized")

    try:
        result = rag_service.ask(
            query=request.query,
            chat_history=request.chat_history,
        )
        return result
    except Exception as e:
        logger.error(f"Error processing query: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/query/stream")
async def query_stream(request: QueryRequest):
    if not rag_service:
        raise HTTPException(status_code=503, detail="Service not initialized")

    async def generate():
        import json
        async for chunk in rag_service.ask_stream(
            query=request.query,
            chat_history=request.chat_history,
        ):
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/api/index")
async def index_code(request: IndexRequest):
    if not code_loader or not vector_store_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    try:
        loader_to_use = code_loader
        if request.code_dir and request.code_dir != settings.code_dir:
            loader_to_use = CodeLoader(code_dir=request.code_dir)

        files = loader_to_use.get_all_files()
        index_stats = vector_store_manager.incremental_index(
            files,
            loader_to_use,
            force_reindex=request.force_reindex,
        )

        summary = index_stats.get("diff", {}).get("summary", {})
        chunks_added = index_stats.get("total_chunks_added", 0)
        files_deleted = index_stats.get("total_files_deleted", 0)

        if chunks_added > 0 or files_deleted > 0:
            return {
                "status": "success",
                "message": (
                    f"Incremental index complete: "
                    f"{summary.get('new_count', 0)} new, "
                    f"{summary.get('modified_count', 0)} modified, "
                    f"{summary.get('deleted_count', 0)} deleted files. "
                    f"{chunks_added} chunks added/updated, "
                    f"{files_deleted} files removed from index."
                ),
                "chunks_added": chunks_added,
                "files_deleted": files_deleted,
                "diff": index_stats.get("diff"),
                "actions": index_stats.get("actions"),
                "incremental": True,
            }
        else:
            return {
                "status": "success",
                "message": "Index is already up to date. No changes detected.",
                "chunks_added": 0,
                "files_deleted": 0,
                "diff": index_stats.get("diff"),
                "incremental": True,
            }
    except Exception as e:
        logger.error(f"Error indexing code: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DiffRequest(BaseModel):
    code_dir: Optional[str] = Field(None, description="要对比的代码目录，默认为配置目录")


@app.get("/api/index/diff")
async def get_index_diff(code_dir: Optional[str] = None):
    if not code_loader or not vector_store_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    try:
        loader_to_use = code_loader
        if code_dir and code_dir != settings.code_dir:
            loader_to_use = CodeLoader(code_dir=code_dir)

        files = loader_to_use.get_all_files()
        diff = vector_store_manager.get_index_diff(files, loader_to_use)

        return diff
    except Exception as e:
        logger.error(f"Error getting index diff: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/files")
async def get_indexed_files():
    if not vector_store_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    try:
        file_paths = vector_store_manager.get_all_file_paths()
        return {
            "files": file_paths,
            "count": len(file_paths),
        }
    except Exception as e:
        logger.error(f"Error getting indexed files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/changes")
async def get_file_changes(limit: int = 50):
    recent_changes = change_log[-limit:] if limit > 0 else change_log.copy()
    return {
        "changes": list(reversed(recent_changes)),
        "count": len(recent_changes),
    }


@app.delete("/api/index")
async def clear_index():
    if not vector_store_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    try:
        vector_store_manager.clear()
        return {
            "status": "success",
            "message": "Index cleared",
        }
    except Exception as e:
        logger.error(f"Error clearing index: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/index/file")
async def reindex_file(request: FilePathRequest):
    if not code_loader or not vector_store_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    try:
        content = code_loader.read_file(request.file_path)
        documents = code_loader.reload_file(request.file_path)
        if documents:
            ids = vector_store_manager.update_file(request.file_path, documents)
            if content:
                vector_store_manager.update_file_metadata(
                    request.file_path,
                    content,
                    chunk_count=len(ids),
                )
            return {
                "status": "success",
                "message": f"Reindexed {len(documents)} chunks for {request.file_path}",
                "chunks_indexed": len(documents),
            }
        else:
            deleted = vector_store_manager.delete_by_file_path(request.file_path)
            return {
                "status": "warning",
                "message": f"No content found for file, deleted {deleted} existing chunks",
                "chunks_deleted": deleted,
            }
    except Exception as e:
        logger.error(f"Error reindexing file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/index/file")
async def remove_file_from_index(request: FilePathRequest):
    if not vector_store_manager:
        raise HTTPException(status_code=503, detail="Service not initialized")

    try:
        deleted_count = vector_store_manager.delete_by_file_path(request.file_path)
        return {
            "status": "success",
            "message": f"Deleted {deleted_count} chunks for {request.file_path}",
            "chunks_deleted": deleted_count,
        }
    except Exception as e:
        logger.error(f"Error removing file from index: {e}")
        raise HTTPException(status_code=500, detail=str(e))


frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")
    logger.info(f"Mounted frontend static files from {frontend_path}")
