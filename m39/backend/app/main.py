from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import neo4j_conn
from app.routers import threat


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    neo4j_conn.close()


app = FastAPI(
    title="网络安全威胁情报关联分析系统",
    description="基于知识图谱的威胁情报关联分析 API，支持 IP、域名、Hash、CVE 漏洞之间的关联查询",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(threat.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "threat-intelligence-kg"}
