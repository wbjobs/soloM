import logging
from typing import Any, Dict, List, Optional

from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError

from common.config import settings

logger = logging.getLogger(__name__)


class MongoStorage:
    RAW_COLLECTION = "raw_data"
    CLEANED_COLLECTION = "cleaned_data"

    def __init__(self):
        self._client = None
        self._db = None

    @property
    def client(self) -> MongoClient:
        if self._client is None:
            self._client = MongoClient(settings.mongo_uri)
        return self._client

    @property
    def db(self):
        if self._db is None:
            self._db = self.client[settings.mongo_db]
            self._ensure_indexes()
        return self._db

    def _ensure_indexes(self):
        self.db[self.RAW_COLLECTION].create_index([("task_id", ASCENDING)], unique=True)
        self.db[self.RAW_COLLECTION].create_index([("url", ASCENDING)])
        self.db[self.RAW_COLLECTION].create_index([("crawled_at", DESCENDING)])

        self.db[self.CLEANED_COLLECTION].create_index([("task_id", ASCENDING)], unique=True)
        self.db[self.CLEANED_COLLECTION].create_index([("url", ASCENDING)])
        self.db[self.CLEANED_COLLECTION].create_index([("cleaned_at", DESCENDING)])

    def save_raw(self, data: Dict[str, Any]) -> str:
        collection = self.db[self.RAW_COLLECTION]
        try:
            result = collection.insert_one(data)
            return str(result.inserted_id)
        except DuplicateKeyError:
            task_id = data.get("task_id", "unknown")
            logger.warning("Duplicate raw data, updating: task_id=%s", task_id)
            collection.replace_one({"task_id": task_id}, data, upsert=True)
            return task_id

    def save_cleaned(self, data: Dict[str, Any]) -> str:
        collection = self.db[self.CLEANED_COLLECTION]
        try:
            result = collection.insert_one(data)
            return str(result.inserted_id)
        except DuplicateKeyError:
            task_id = data.get("task_id", "unknown")
            logger.warning("Duplicate cleaned data, updating: task_id=%s", task_id)
            collection.replace_one({"task_id": task_id}, data, upsert=True)
            return task_id

    def save_batch_raw(self, items: List[Dict[str, Any]]) -> List[str]:
        if not items:
            return []
        collection = self.db[self.RAW_COLLECTION]
        result = collection.insert_many(items, ordered=False)
        return [str(oid) for oid in result.inserted_ids]

    def get_raw(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self.db[self.RAW_COLLECTION].find_one({"task_id": task_id}, {"_id": 0})

    def get_cleaned(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self.db[self.CLEANED_COLLECTION].find_one({"task_id": task_id}, {"_id": 0})

    def query_raw(
        self,
        filter_dict: Optional[Dict] = None,
        skip: int = 0,
        limit: int = 50,
        sort_by: str = "crawled_at",
        sort_order: int = -1,
    ) -> List[Dict[str, Any]]:
        cursor = (
            self.db[self.RAW_COLLECTION]
            .find(filter_dict or {}, {"_id": 0})
            .sort(sort_by, sort_order)
            .skip(skip)
            .limit(limit)
        )
        return list(cursor)

    def query_cleaned(
        self,
        filter_dict: Optional[Dict] = None,
        skip: int = 0,
        limit: int = 50,
        sort_by: str = "cleaned_at",
        sort_order: int = -1,
    ) -> List[Dict[str, Any]]:
        cursor = (
            self.db[self.CLEANED_COLLECTION]
            .find(filter_dict or {}, {"_id": 0})
            .sort(sort_by, sort_order)
            .skip(skip)
            .limit(limit)
        )
        return list(cursor)

    def count_raw(self, filter_dict: Optional[Dict] = None) -> int:
        return self.db[self.RAW_COLLECTION].count_documents(filter_dict or {})

    def count_cleaned(self, filter_dict: Optional[Dict] = None) -> int:
        return self.db[self.CLEANED_COLLECTION].count_documents(filter_dict or {})

    def delete_raw(self, task_id: str) -> bool:
        result = self.db[self.RAW_COLLECTION].delete_one({"task_id": task_id})
        return result.deleted_count > 0

    def delete_cleaned(self, task_id: str) -> bool:
        result = self.db[self.CLEANED_COLLECTION].delete_one({"task_id": task_id})
        return result.deleted_count > 0

    def close(self):
        if self._client:
            self._client.close()
            self._client = None
            self._db = None
