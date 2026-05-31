import asyncio
from typing import Callable, Optional
from datetime import datetime
import logging
from pymysqlreplication import BinLogStreamReader
from pymysqlreplication.row_event import DeleteRowsEvent, UpdateRowsEvent, WriteRowsEvent
from pymysqlreplication.event import QueryEvent

logger = logging.getLogger(__name__)


class BinlogEntry:
    def __init__(
        self,
        timestamp: datetime,
        sql: str,
        database: str = "",
        table: str = "",
        operation: str = "",
        row_data: dict = None,
    ):
        self.timestamp = timestamp
        self.sql = sql
        self.database = database
        self.table = table
        self.operation = operation
        self.row_data = row_data or {}

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "sql": self.sql,
            "database": self.database,
            "table": self.table,
            "operation": self.operation,
            "row_data": self.row_data,
            "type": "binlog",
        }


class BinlogListener:
    def __init__(
        self,
        mysql_settings: dict,
        server_id: int = 1,
        callback: Optional[Callable[[BinlogEntry], None]] = None,
        only_schemas: Optional[list] = None,
        only_tables: Optional[list] = None,
    ):
        self.mysql_settings = mysql_settings
        self.server_id = server_id
        self.callback = callback
        self.only_schemas = only_schemas
        self.only_tables = only_tables
        self._running = False
        self._stream = None

    async def start(self, resume_stream: bool = False, log_file: Optional[str] = None, log_pos: int = 0):
        self._running = True
        logger.info("开始监听 MySQL Binlog")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._listen, resume_stream, log_file, log_pos)

    def stop(self):
        self._running = False
        if self._stream:
            self._stream.close()
        logger.info("停止监听 MySQL Binlog")

    def _listen(self, resume_stream: bool, log_file: Optional[str], log_pos: int):
        try:
            self._stream = BinLogStreamReader(
                connection_settings=self.mysql_settings,
                server_id=self.server_id,
                only_events=[DeleteRowsEvent, UpdateRowsEvent, WriteRowsEvent, QueryEvent],
                only_schemas=self.only_schemas,
                only_tables=self.only_tables,
                resume_stream=resume_stream,
                log_file=log_file,
                log_pos=log_pos,
                blocking=True,
            )

            for binlog_event in self._stream:
                if not self._running:
                    break

                entry = self._parse_event(binlog_event)
                if entry and self.callback:
                    self.callback(entry)

        except Exception as e:
            logger.error(f"Binlog 监听出错: {e}")
        finally:
            if self._stream:
                self._stream.close()

    def _parse_event(self, binlog_event) -> Optional[BinlogEntry]:
        timestamp = datetime.fromtimestamp(binlog_event.timestamp)

        if isinstance(binlog_event, QueryEvent):
            query = binlog_event.query
            schema = binlog_event.schema.decode() if binlog_event.schema else ""

            if query.upper().startswith(("BEGIN", "COMMIT", "ROLLBACK")):
                return None

            return BinlogEntry(
                timestamp=timestamp,
                sql=query,
                database=schema,
                operation="QUERY",
            )

        elif isinstance(binlog_event, WriteRowsEvent):
            schema = binlog_event.schema
            table = binlog_event.table

            for row in binlog_event.rows:
                sql = self._generate_insert_sql(schema, table, row["values"])
                return BinlogEntry(
                    timestamp=timestamp,
                    sql=sql,
                    database=schema,
                    table=table,
                    operation="INSERT",
                    row_data=row["values"],
                )

        elif isinstance(binlog_event, UpdateRowsEvent):
            schema = binlog_event.schema
            table = binlog_event.table

            for row in binlog_event.rows:
                sql = self._generate_update_sql(schema, table, row["before_values"], row["after_values"])
                return BinlogEntry(
                    timestamp=timestamp,
                    sql=sql,
                    database=schema,
                    table=table,
                    operation="UPDATE",
                    row_data={"before": row["before_values"], "after": row["after_values"]},
                )

        elif isinstance(binlog_event, DeleteRowsEvent):
            schema = binlog_event.schema
            table = binlog_event.table

            for row in binlog_event.rows:
                sql = self._generate_delete_sql(schema, table, row["values"])
                return BinlogEntry(
                    timestamp=timestamp,
                    sql=sql,
                    database=schema,
                    table=table,
                    operation="DELETE",
                    row_data=row["values"],
                )

        return None

    def _generate_insert_sql(self, schema: str, table: str, values: dict) -> str:
        columns = ", ".join(f"`{k}`" for k in values.keys())
        placeholders = ", ".join(self._format_value(v) for v in values.values())
        return f"INSERT INTO `{schema}`.`{table}` ({columns}) VALUES ({placeholders});"

    def _generate_update_sql(self, schema: str, table: str, before: dict, after: dict) -> str:
        set_clause = ", ".join(f"`{k}` = {self._format_value(v)}" for k, v in after.items())
        where_clause = " AND ".join(f"`{k}` = {self._format_value(v)}" for k, v in before.items())
        return f"UPDATE `{schema}`.`{table}` SET {set_clause} WHERE {where_clause};"

    def _generate_delete_sql(self, schema: str, table: str, values: dict) -> str:
        where_clause = " AND ".join(f"`{k}` = {self._format_value(v)}" for k, v in values.items())
        return f"DELETE FROM `{schema}`.`{table}` WHERE {where_clause};"

    def _format_value(self, value) -> str:
        if value is None:
            return "NULL"
        elif isinstance(value, (int, float)):
            return str(value)
        elif isinstance(value, datetime):
            return f"'{value.strftime('%Y-%m-%d %H:%M:%S')}'"
        else:
            escaped = str(value).replace("'", "''")
            return f"'{escaped}'"
