import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import settings
from app.db.database import Base, engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing OCR microservice...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables verified")
    except Exception as e:
        logger.warning("Database unavailable at startup: %s", e)
    logger.info("OCR microservice started")
    yield
    logger.info("OCR microservice shutting down")


app = FastAPI(
    title="票据 OCR 识别微服务",
    description="基于 DBNet + CRNN 的票据 OCR 识别，支持键值对提取和条件检索",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.include_router(router)


@app.get("/", summary="工作台首页")
async def index():
    return FileResponse("app/static/index.html")


@app.get("/health", summary="健康检查")
async def health():
    return {"status": "ok"}
