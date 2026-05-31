import asyncio
import uuid
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

import aiomysql
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ExplainRow(BaseModel):
    id: Optional[int] = None
    select_type: str = ""
    table: str = ""
    partitions: Optional[str] = None
    type: str = ""
    possible_keys: Optional[str] = None
    key: Optional[str] = None
    key_len: Optional[int] = None
    ref: Optional[str] = None
    rows: Optional[int] = None
    filtered: Optional[float] = None
    Extra: Optional[str] = None


class ExplainResult(BaseModel):
    rows: List[ExplainRow]
    full_table_scan: bool = False
    using_filesort: bool = False
    using_temporary: bool = False
    using_index: bool = False
    estimated_rows: int = 0
    performance_score: int = 0
    summary: str = ""


class AuditLogEntry(BaseModel):
    id: str
    timestamp: str
    operation: str
    ddl_statement: str
    database: str = ""
    original_sql: str = ""
    status: str
    error_message: str = ""
    executed_by: str = "system"


class DatabaseExecutor:
    def __init__(self, host: str, port: int, user: str, password: str, database: str = ""):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self._pool: Optional[aiomysql.Pool] = None
        self._audit_logs: List[Dict[str, Any]] = []

    async def init_pool(self):
        try:
            self._pool = await aiomysql.create_pool(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                db=self.database or None,
                minsize=2,
                maxsize=10,
                autocommit=True,
                charset="utf8mb4",
            )
            logger.info("数据库连接池初始化成功")
        except Exception as e:
            logger.error(f"数据库连接池初始化失败: {e}")
            self._pool = None

    async def close_pool(self):
        if self._pool:
            self._pool.close()
            await self._pool.wait_closed()
            logger.info("数据库连接池已关闭")

    async def _ensure_pool(self):
        if not self._pool:
            await self.init_pool()
        if not self._pool:
            raise RuntimeError("数据库连接池不可用，请检查 MySQL 配置")

    async def execute_explain(self, sql: str, database: str = "") -> ExplainResult:
        await self._ensure_pool()

        explain_sql = f"EXPLAIN {sql}"
        rows_data = []

        async with self._pool.acquire() as conn:
            if database:
                await conn.select_db(database)

            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(explain_sql)
                rows_data = await cur.fetchall()

        explain_rows = []
        full_table_scan = False
        using_filesort = False
        using_temporary = False
        using_index = False
        total_estimated_rows = 0

        for row in rows_data:
            er = ExplainRow(
                id=row.get("id"),
                select_type=row.get("select_type", ""),
                table=row.get("table", ""),
                partitions=row.get("partitions"),
                type=row.get("type", ""),
                possible_keys=row.get("possible_keys"),
                key=row.get("key"),
                key_len=row.get("key_len"),
                ref=row.get("ref"),
                rows=row.get("rows"),
                filtered=row.get("filtered"),
                Extra=row.get("Extra"),
            )
            explain_rows.append(er)

            access_type = er.type.upper() if er.type else ""
            if access_type == "ALL":
                full_table_scan = True
            if er.Extra and "Using filesort" in er.Extra:
                using_filesort = True
            if er.Extra and "Using temporary" in er.Extra:
                using_temporary = True
            if er.Extra and "Using index" in er.Extra:
                using_index = True
            if er.rows:
                total_estimated_rows += er.rows

        performance_score = self._calculate_performance_score(
            full_table_scan, using_filesort, using_temporary, using_index, total_estimated_rows
        )

        summary_parts = []
        if full_table_scan:
            summary_parts.append("存在全表扫描")
        if using_filesort:
            summary_parts.append("需要额外排序(filesort)")
        if using_temporary:
            summary_parts.append("使用临时表")
        if using_index:
            summary_parts.append("使用了覆盖索引")
        if not summary_parts:
            summary_parts.append("查询计划正常")

        summary = "；".join(summary_parts) + f"。预估扫描 {total_estimated_rows} 行。"

        return ExplainResult(
            rows=explain_rows,
            full_table_scan=full_table_scan,
            using_filesort=using_filesort,
            using_temporary=using_temporary,
            using_index=using_index,
            estimated_rows=total_estimated_rows,
            performance_score=performance_score,
            summary=summary,
        )

    async def execute_explain_with_index(
        self, sql: str, ddl_statement: str, database: str = ""
    ) -> ExplainResult:
        await self._ensure_pool()

        async with self._pool.acquire() as conn:
            if database:
                await conn.select_db(database)

            async with conn.cursor() as cur:
                await cur.execute(ddl_statement)
                logger.info(f"临时执行 DDL: {ddl_statement[:100]}")

            try:
                explain_result = await self.execute_explain(sql, database)
            finally:
                await self._drop_temp_index(conn, ddl_statement)

            return explain_result

    async def _drop_temp_index(self, conn, ddl_statement: str):
        drop_sql = self._generate_drop_index_sql(ddl_statement)
        if drop_sql:
            try:
                async with conn.cursor() as cur:
                    await cur.execute(drop_sql)
                logger.info(f"回滚临时索引: {drop_sql[:100]}")
            except Exception as e:
                logger.warning(f"回滚临时索引失败: {e}")

    def _generate_drop_index_sql(self, ddl_statement: str) -> Optional[str]:
        ddl_upper = ddl_statement.strip().upper()
        if not ddl_upper.startswith("CREATE"):
            return None

        import re

        match = re.search(
            r'CREATE\s+(UNIQUE\s+)?INDEX\s+`?(\w+)`?\s+ON\s+`?(\w+)`?',
            ddl_statement,
            re.IGNORECASE,
        )
        if match:
            index_name = match.group(2)
            table_name = match.group(3)
            return f"DROP INDEX `{index_name}` ON `{table_name}`"

        match = re.search(
            r'ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+(?:UNIQUE\s+)?(?:KEY|INDEX)\s+`?(\w+)`?',
            ddl_statement,
            re.IGNORECASE,
        )
        if match:
            table_name = match.group(1)
            index_name = match.group(2)
            return f"DROP INDEX `{index_name}` ON `{table_name}`"

        return None

    async def execute_ddl(self, ddl_statement: str, database: str = "", original_sql: str = "") -> AuditLogEntry:
        await self._ensure_pool()

        log_entry = AuditLogEntry(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            operation="EXECUTE_DDL",
            ddl_statement=ddl_statement,
            database=database,
            original_sql=original_sql,
            status="pending",
            executed_by="api_user",
        )

        try:
            async with self._pool.acquire() as conn:
                if database:
                    await conn.select_db(database)

                async with conn.cursor() as cur:
                    await cur.execute(ddl_statement)

            log_entry.status = "success"
            logger.info(f"DDL 执行成功: {ddl_statement[:100]}")

        except Exception as e:
            log_entry.status = "failed"
            log_entry.error_message = str(e)
            logger.error(f"DDL 执行失败: {ddl_statement[:100]}, 错误: {e}")

        self._audit_logs.insert(0, log_entry.model_dump())
        if len(self._audit_logs) > 500:
            self._audit_logs = self._audit_logs[:500]

        return log_entry

    def get_audit_logs(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        return self._audit_logs[offset : offset + limit]

    @staticmethod
    def _calculate_performance_score(
        full_table_scan: bool,
        using_filesort: bool,
        using_temporary: bool,
        using_index: bool,
        estimated_rows: int,
    ) -> int:
        score = 100
        if full_table_scan:
            score -= 30
        if using_filesort:
            score -= 20
        if using_temporary:
            score -= 25
        if using_index:
            score += 10
        if estimated_rows > 1000000:
            score -= 20
        elif estimated_rows > 100000:
            score -= 10
        elif estimated_rows > 10000:
            score -= 5
        return max(0, min(100, score))
