from fastapi import APIRouter, HTTPException

from api.schemas import (
    BatchSubmitResponse,
    DataQueryRequest,
    DataQueryResponse,
    DeadTaskProcessResponse,
    DeadTaskStatsResponse,
    HealthResponse,
    ProxyAddBatchRequest,
    ProxyAddRequest,
    ProxyPoolStatusResponse,
    ProxyStatsResponse,
    ProxyUnbanRequest,
    QueueStatsResponse,
    SubmitBatchRequest,
    SubmitTaskRequest,
    TaskStatusResponse,
    TaskSubmitResponse,
)
from common.proxy import ProxyPool
from scheduler.dead_task import DeadTaskDetector
from scheduler.dispatcher import Dispatcher
from scheduler.queue import TaskQueue
from storage.mongo import MongoStorage

router = APIRouter()

dispatcher = Dispatcher()
storage = MongoStorage()
queue = TaskQueue()
proxy_pool = ProxyPool()
dead_task_detector = DeadTaskDetector()


@router.get("/health", response_model=HealthResponse)
def health_check():
    redis_ok = queue.ping()
    mongo_ok = False
    try:
        storage.client.admin.command("ping")
        mongo_ok = True
    except Exception:
        pass
    return HealthResponse(
        status="healthy" if (redis_ok and mongo_ok) else "degraded",
        redis=redis_ok,
        mongodb=mongo_ok,
    )


@router.post("/tasks", response_model=TaskSubmitResponse)
def submit_task(req: SubmitTaskRequest):
    task_id = dispatcher.submit_url(
        url=str(req.url),
        spider_name=req.spider_name,
        method=req.method,
        body=req.body,
        meta=req.meta,
        priority=req.priority,
    )
    if task_id is None:
        return TaskSubmitResponse(task_id=None, message="URL already processed (duplicate)")
    return TaskSubmitResponse(task_id=task_id, message="Task submitted successfully")


@router.post("/tasks/batch", response_model=BatchSubmitResponse)
def submit_batch(req: SubmitBatchRequest):
    task_ids = dispatcher.submit_urls(
        urls=[str(u) for u in req.urls],
        spider_name=req.spider_name,
        method=req.method,
        meta=req.meta,
    )
    return BatchSubmitResponse(
        task_ids=task_ids,
        submitted_count=len(task_ids),
        message=f"Submitted {len(task_ids)} tasks (skipped duplicates)",
    )


@router.get("/tasks/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str):
    status = dispatcher.get_task_status(task_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return TaskStatusResponse(**status)


@router.get("/stats", response_model=QueueStatsResponse)
def get_queue_stats():
    stats = dispatcher.get_queue_stats()
    stats["dead_task_count"] = dead_task_detector.get_stats()["dead_task_count"]
    stats["proxy_pool_size"] = proxy_pool.count()
    stats["proxy_blacklist_size"] = proxy_pool.blacklist_count()
    return QueueStatsResponse(**stats)


@router.get("/dead-tasks/stats", response_model=DeadTaskStatsResponse)
def get_dead_task_stats():
    return DeadTaskStatsResponse(**dead_task_detector.get_stats())


@router.post("/dead-tasks/process", response_model=DeadTaskProcessResponse)
def process_dead_tasks():
    results = dead_task_detector.process_all_dead_tasks()
    return DeadTaskProcessResponse(**results)


@router.post("/data/query", response_model=DataQueryResponse)
def query_data(req: DataQueryRequest):
    if req.collection == "raw":
        items = storage.query_raw(
            filter_dict=req.filter,
            skip=req.skip,
            limit=req.limit,
            sort_by=req.sort_by,
            sort_order=req.sort_order,
        )
        total = storage.count_raw(req.filter)
    else:
        items = storage.query_cleaned(
            filter_dict=req.filter,
            skip=req.skip,
            limit=req.limit,
            sort_by=req.sort_by,
            sort_order=req.sort_order,
        )
        total = storage.count_cleaned(req.filter)

    return DataQueryResponse(items=items, total=total, skip=req.skip, limit=req.limit)


@router.get("/data/raw/{task_id}")
def get_raw_data(task_id: str):
    data = storage.get_raw(task_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Raw data not found")
    return data


@router.get("/data/cleaned/{task_id}")
def get_cleaned_data(task_id: str):
    data = storage.get_cleaned(task_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Cleaned data not found")
    return data


@router.delete("/data/raw/{task_id}")
def delete_raw_data(task_id: str):
    deleted = storage.delete_raw(task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Raw data not found")
    return {"message": "Deleted", "task_id": task_id}


@router.delete("/data/cleaned/{task_id}")
def delete_cleaned_data(task_id: str):
    deleted = storage.delete_cleaned(task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cleaned data not found")
    return {"message": "Deleted", "task_id": task_id}


@router.post("/dedup/clear")
def clear_dedup():
    dispatcher.clear_dedup()
    return {"message": "Dedup fingerprints cleared"}


@router.post("/dedup/cleanup")
def cleanup_expired_fingerprints():
    removed = dispatcher.dedup.cleanup()
    return {"removed": removed, "message": f"Cleaned up {removed} expired fingerprints"}


@router.post("/proxy/add")
def add_proxy(req: ProxyAddRequest):
    added = proxy_pool.add_proxy(req.proxy_url, req.weight)
    if not added:
        return {"message": "Proxy already in blacklist", "proxy_url": req.proxy_url}
    return {"message": "Proxy added", "proxy_url": req.proxy_url}


@router.post("/proxy/add-batch")
def add_proxy_batch(req: ProxyAddBatchRequest):
    added = proxy_pool.add_proxies(req.proxy_urls, req.weight)
    return {"message": f"Added {added} proxies", "added_count": added, "total": len(req.proxy_urls)}


@router.delete("/proxy/remove")
def remove_proxy(proxy_url: str):
    proxy_pool.remove_proxy(proxy_url)
    return {"message": "Proxy removed", "proxy_url": proxy_url}


@router.get("/proxy/stats/{proxy_url:path}", response_model=ProxyStatsResponse)
def get_proxy_stats(proxy_url: str):
    stats = proxy_pool.get_proxy_stats(proxy_url)
    if stats is None:
        raise HTTPException(status_code=404, detail="Proxy stats not found")
    return ProxyStatsResponse(**stats)


@router.get("/proxy/status", response_model=ProxyPoolStatusResponse)
def get_proxy_pool_status():
    return ProxyPoolStatusResponse(
        available_count=proxy_pool.count(),
        blacklisted_count=proxy_pool.blacklist_count(),
        proxies=proxy_pool.get_all_proxies(),
        blacklisted=proxy_pool.get_blacklisted(),
    )


@router.post("/proxy/unban")
def unban_proxy(req: ProxyUnbanRequest):
    proxy_pool.unban_proxy(req.proxy_url)
    return {"message": "Proxy unbanned", "proxy_url": req.proxy_url}


@router.post("/proxy/blacklist/clear")
def clear_proxy_blacklist():
    proxy_pool.clear_blacklist()
    return {"message": "Proxy blacklist cleared"}
