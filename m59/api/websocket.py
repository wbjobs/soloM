import asyncio
import json
import logging
from typing import List

from fastapi import WebSocket, WebSocketDisconnect

from common.config import settings
from common.stats import StatsCollector

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("WebSocket client connected, total=%d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info("WebSocket client disconnected, total=%d", len(self.active_connections))

    async def broadcast(self, data: dict):
        if not self.active_connections:
            return
        message = json.dumps(data, ensure_ascii=False)
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


async def websocket_dashboard(websocket: WebSocket):
    await manager.connect(websocket)
    stats = StatsCollector()
    try:
        while True:
            dashboard_data = stats.get_dashboard_stats()
            await websocket.send_text(json.dumps(dashboard_data, ensure_ascii=False))
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=settings.websocket_push_interval)
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error("WebSocket error: %s", e)
        manager.disconnect(websocket)


async def redis_pubsub_listener():
    import redis.asyncio as aioredis
    from common.config import settings as cfg

    r = aioredis.Redis(
        host=cfg.redis_host,
        port=cfg.redis_port,
        db=cfg.redis_db,
        password=cfg.redis_password or None,
        decode_responses=True,
    )
    pubsub = r.pubsub()
    await pubsub.subscribe(cfg.stats_channel)
    logger.info("Redis pubsub listener started on channel: %s", cfg.stats_channel)

    while True:
        try:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message.get("type") == "message":
                data = json.loads(message["data"])
                await manager.broadcast(data)
        except Exception as e:
            logger.error("Pubsub listener error: %s", e)
            await asyncio.sleep(1)
