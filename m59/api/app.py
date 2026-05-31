import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from api.routes import router
from api.websocket import websocket_dashboard, redis_pubsub_listener


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(redis_pubsub_listener())
    yield
    task.cancel()


app = FastAPI(
    title="Distributed Crawler Platform",
    description="分布式爬虫任务调度与数据清洗平台 REST API",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(router, prefix="/api/v1", tags=["crawler"])

app.add_api_websocket_route("/ws/dashboard", websocket_dashboard)

app.mount("/static", StaticFiles(directory="api/static"), name="static")


@app.get("/")
def root():
    return FileResponse("api/static/dashboard.html")


@app.get("/api/v1/stats/dashboard")
def get_dashboard_stats():
    from common.stats import StatsCollector
    return StatsCollector().get_dashboard_stats()


@app.post("/api/v1/proxy-provider/refresh")
async def refresh_proxy_provider():
    from common.proxy_provider import ProxyProviderManager
    manager = ProxyProviderManager()
    result = await manager.fetch_and_refresh()
    return result


@app.get("/api/v1/proxy-provider/status")
def get_proxy_provider_status():
    from common.proxy_provider import ProxyProviderManager
    manager = ProxyProviderManager()
    return manager.get_status()
