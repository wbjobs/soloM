import json
import time
import uuid
from typing import Any, Dict, List, Optional

import redis

from common.config import settings


class TaskQueue:
    def __init__(self):
        self.redis = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=settings.redis_password or None,
            decode_responses=True,
        )

    def push(self, task: Dict[str, Any]) -> str:
        task_id = task.get("task_id") or str(uuid.uuid4())
        task["task_id"] = task_id
        task["created_at"] = task.get("created_at") or time.time()
        task["status"] = task.get("status") or "pending"
        task["retry_count"] = task.get("retry_count", 0)
        self.redis.rpush(settings.task_queue_key, json.dumps(task, ensure_ascii=False))
        self._set_task_status(task_id, "pending", task)
        return task_id

    def push_batch(self, tasks: List[Dict[str, Any]]) -> List[str]:
        pipe = self.redis.pipeline()
        task_ids = []
        for task in tasks:
            task_id = task.get("task_id") or str(uuid.uuid4())
            task["task_id"] = task_id
            task["created_at"] = task.get("created_at") or time.time()
            task["status"] = task.get("status") or "pending"
            task["retry_count"] = task.get("retry_count", 0)
            status_key = f"{settings.task_status_prefix}{task_id}"
            pipe.rpush(settings.task_queue_key, json.dumps(task, ensure_ascii=False))
            pipe.hset(status_key, mapping={"status": "pending", "task": json.dumps(task, ensure_ascii=False)})
            pipe.expire(status_key, settings.task_status_ttl)
            task_ids.append(task_id)
        pipe.execute()
        return task_ids

    def pop(self, timeout: int = 0) -> Optional[Dict[str, Any]]:
        result = self.redis.blpop(settings.task_queue_key, timeout=timeout)
        if result is None:
            return None
        _, raw = result
        task = json.loads(raw)
        task_id = task["task_id"]
        task["started_at"] = time.time()
        self._set_task_status(task_id, "running", task)
        self.redis.zadd(
            settings.dead_task_zset_key,
            {task_id: time.time() + settings.task_timeout_seconds},
        )
        return task

    def push_result(self, result_data: Dict[str, Any]):
        key = settings.result_queue_key
        self.redis.rpush(key, json.dumps(result_data, ensure_ascii=False))
        self.redis.expire(key, settings.result_queue_ttl)

    def pop_result(self, timeout: int = 0) -> Optional[Dict[str, Any]]:
        result = self.redis.blpop(settings.result_queue_key, timeout=timeout)
        if result is None:
            return None
        _, raw = result
        return json.loads(raw)

    def push_clean_task(self, clean_data: Dict[str, Any]):
        key = settings.clean_queue_key
        self.redis.rpush(key, json.dumps(clean_data, ensure_ascii=False))
        self.redis.expire(key, settings.clean_queue_ttl)

    def pop_clean_task(self, timeout: int = 0) -> Optional[Dict[str, Any]]:
        result = self.redis.blpop(settings.clean_queue_key, timeout=timeout)
        if result is None:
            return None
        _, raw = result
        return json.loads(raw)

    def _set_task_status(self, task_id: str, status: str, task: Dict[str, Any]):
        status_key = f"{settings.task_status_prefix}{task_id}"
        self.redis.hset(
            status_key,
            mapping={"status": status, "task": json.dumps(task, ensure_ascii=False)},
        )
        self.redis.expire(status_key, settings.task_status_ttl)

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        status_key = f"{settings.task_status_prefix}{task_id}"
        data = self.redis.hgetall(status_key)
        if not data:
            return None
        return {"task_id": task_id, "status": data.get("status"), "task": json.loads(data["task"]) if data.get("task") else None}

    def update_task_status(self, task_id: str, status: str):
        status_key = f"{settings.task_status_prefix}{task_id}"
        self.redis.hset(status_key, "status", status)
        self.redis.expire(status_key, settings.task_status_ttl)
        if status in ("completed", "failed", "duplicate", "dead"):
            self.redis.zrem(settings.dead_task_zset_key, task_id)

    def requeue_task(self, task: Dict[str, Any], increment_retry: bool = True):
        task_id = task["task_id"]
        if increment_retry:
            task["retry_count"] = task.get("retry_count", 0) + 1
        task["status"] = "pending"
        del task.get("started_at", None)
        self.redis.rpush(settings.task_queue_key, json.dumps(task, ensure_ascii=False))
        self._set_task_status(task_id, "pending", task)
        self.redis.zrem(settings.dead_task_zset_key, task_id)

    def get_dead_tasks(self, now: Optional[float] = None) -> List[str]:
        if now is None:
            now = time.time()
        return self.redis.zrangebyscore(settings.dead_task_zset_key, "-inf", now)

    def get_dead_task_count(self, now: Optional[float] = None) -> int:
        if now is None:
            now = time.time()
        return self.redis.zcount(settings.dead_task_zset_key, "-inf", now)

    def remove_from_dead_tasks(self, task_id: str):
        self.redis.zrem(settings.dead_task_zset_key, task_id)

    def get_queue_size(self) -> int:
        return self.redis.llen(settings.task_queue_key)

    def get_result_queue_size(self) -> int:
        return self.redis.llen(settings.result_queue_key)

    def ping(self) -> bool:
        try:
            return self.redis.ping()
        except redis.ConnectionError:
            return False
