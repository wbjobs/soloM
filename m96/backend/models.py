from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class SQLAnalyzeRequest(BaseModel):
    sql: str


class SQLEntry(BaseModel):
    id: Optional[str] = None
    timestamp: str
    sql: str
    database: str = ""
    type: str
    query_time: Optional[float] = None
    rows_examined: Optional[int] = None
    operation: Optional[str] = None
    table: Optional[str] = None


class AuditReport(BaseModel):
    id: str
    timestamp: str
    sql_entry: SQLEntry
    injection_risk: str
    injection_description: str
    index_missing: bool
    index_suggestions: List[str]
    performance_issues: List[str]
    optimization_suggestions: List[str]
    optimized_sql: Optional[str] = None
    risk_score: int
    summary: str


class ListenerStatus(BaseModel):
    slow_query: bool
    binlog: bool
    status: str


class HealthCheck(BaseModel):
    status: str
    mysql_connected: bool
    ollama_connected: bool


class ExplainRequest(BaseModel):
    sql: str
    database: str = ""


class ExecuteDDLRequest(BaseModel):
    ddl_statement: str
    database: str = ""
    original_sql: str = ""


class ExplainCompareRequest(BaseModel):
    sql: str
    ddl_statement: str
    database: str = ""


class ExplainRowResponse(BaseModel):
    id: Optional[int] = None
    select_type: str = ""
    table: str = ""
    type: str = ""
    possible_keys: Optional[str] = None
    key: Optional[str] = None
    key_len: Optional[int] = None
    ref: Optional[str] = None
    rows: Optional[int] = None
    filtered: Optional[float] = None
    Extra: Optional[str] = None


class ExplainResponse(BaseModel):
    rows: List[ExplainRowResponse]
    full_table_scan: bool = False
    using_filesort: bool = False
    using_temporary: bool = False
    using_index: bool = False
    estimated_rows: int = 0
    performance_score: int = 0
    summary: str = ""


class ExplainCompareResponse(BaseModel):
    before: ExplainResponse
    after: ExplainResponse
    rows_improvement: int = 0
    score_improvement: int = 0
    improvement_summary: str = ""


class DDLOperationLog(BaseModel):
    id: str
    timestamp: str
    operation: str
    ddl_statement: str
    database: str = ""
    original_sql: str = ""
    status: str
    error_message: str = ""
    executed_by: str = ""
