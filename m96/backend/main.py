import asyncio
import uuid
import logging
from datetime import datetime
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from listeners import SlowQueryListener, BinlogListener
from ai_agent import SQLAnalyzer
from db_executor import DatabaseExecutor
from models import (
    SQLAnalyzeRequest,
    AuditReport,
    SQLEntry,
    ListenerStatus,
    HealthCheck,
    ExplainRequest,
    ExplainResponse,
    ExplainCompareRequest,
    ExplainCompareResponse,
    ExplainRowResponse,
    ExecuteDDLRequest,
    DDLOperationLog,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"发送 WebSocket 消息失败: {e}")


manager = ConnectionManager()

app_state = {
    "slow_query_listener": None,
    "binlog_listener": None,
    "sql_analyzer": None,
    "db_executor": None,
    "audit_reports": [],
    "slow_query_task": None,
    "binlog_task": None,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("应用启动中...")

    app_state["sql_analyzer"] = SQLAnalyzer(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
    )

    if settings.slow_query_log_path:
        app_state["slow_query_listener"] = SlowQueryListener(
            log_path=settings.slow_query_log_path,
            callback=handle_slow_query,
        )

    mysql_settings = {
        "host": settings.mysql_host,
        "port": settings.mysql_port,
        "user": settings.mysql_user,
        "password": settings.mysql_password,
    }

    app_state["binlog_listener"] = BinlogListener(
        mysql_settings=mysql_settings,
        server_id=settings.binlog_server_id,
        callback=handle_binlog_event,
    )

    app_state["db_executor"] = DatabaseExecutor(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_database,
    )
    await app_state["db_executor"].init_pool()

    yield

    logger.info("应用关闭中...")
    if app_state["db_executor"]:
        await app_state["db_executor"].close_pool()
    if app_state["slow_query_task"]:
        app_state["slow_query_task"].cancel()
    if app_state["binlog_task"]:
        app_state["binlog_task"].cancel()


app = FastAPI(
    title="SQL 审计与优化助手",
    description="基于 LLM 的私有化 SQL 审计与慢查询优化助手",
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


async def handle_slow_query(entry):
    await process_sql_entry(entry.to_dict())


def handle_binlog_event(entry):
    asyncio.create_task(process_sql_entry(entry.to_dict()))


async def process_sql_entry(entry_data: dict):
    try:
        sql_entry = SQLEntry(**entry_data)

        if not app_state["sql_analyzer"]:
            return

        try:
            analysis_result = await asyncio.wait_for(
                app_state["sql_analyzer"].analyze(sql_entry.sql),
                timeout=AI_ANALYSIS_TIMEOUT,
            )
        except asyncio.TimeoutError:
            logger.warning(f"自动审计超时 ({AI_ANALYSIS_TIMEOUT}s)，降级到规则分析: {sql_entry.sql[:80]}")
            analysis_result = app_state["sql_analyzer"]._fallback_analysis(
                sql_entry.sql, f"AI 分析超时 ({AI_ANALYSIS_TIMEOUT}s)，已降级到规则分析"
            )

        report = AuditReport(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            sql_entry=sql_entry,
            injection_risk=analysis_result.injection_risk,
            injection_description=analysis_result.injection_description,
            index_missing=analysis_result.index_missing,
            index_suggestions=analysis_result.index_suggestions,
            performance_issues=analysis_result.performance_issues,
            optimization_suggestions=analysis_result.optimization_suggestions,
            optimized_sql=analysis_result.optimized_sql,
            risk_score=analysis_result.risk_score,
            summary=analysis_result.summary,
        )

        app_state["audit_reports"].insert(0, report.model_dump())
        if len(app_state["audit_reports"]) > 1000:
            app_state["audit_reports"] = app_state["audit_reports"][:1000]

        await manager.broadcast({"type": "new_report", "data": report.model_dump()})

    except Exception as e:
        logger.error(f"处理 SQL 条目出错: {e}")


@app.get("/", response_model=dict)
async def root():
    return {
        "name": "SQL 审计与优化助手 API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", response_model=HealthCheck)
async def health_check():
    mysql_connected = False
    ollama_connected = False

    try:
        import pymysql

        conn = pymysql.connect(
            host=settings.mysql_host,
            port=settings.mysql_port,
            user=settings.mysql_user,
            password=settings.mysql_password,
            connect_timeout=5,
        )
        conn.close()
        mysql_connected = True
    except Exception:
        pass

    try:
        import requests

        response = requests.get(
            f"{settings.ollama_base_url}/api/tags", timeout=5
        )
        ollama_connected = response.status_code == 200
    except Exception:
        pass

    return HealthCheck(
        status="healthy" if mysql_connected or ollama_connected else "degraded",
        mysql_connected=mysql_connected,
        ollama_connected=ollama_connected,
    )


@app.get("/listener/status", response_model=ListenerStatus)
async def get_listener_status():
    slow_query_running = app_state["slow_query_task"] and not app_state["slow_query_task"].done()
    binlog_running = app_state["binlog_task"] and not app_state["binlog_task"].done()

    status_parts = []
    if slow_query_running:
        status_parts.append("慢查询监听中")
    if binlog_running:
        status_parts.append("Binlog 监听中")
    if not status_parts:
        status_parts.append("未启动监听")

    return ListenerStatus(
        slow_query=slow_query_running,
        binlog=binlog_running,
        status=" | ".join(status_parts),
    )


@app.post("/listener/slow-query/start")
async def start_slow_query_listener():
    if not app_state["slow_query_listener"]:
        raise HTTPException(status_code=400, detail="慢查询日志路径未配置")

    if app_state["slow_query_task"] and not app_state["slow_query_task"].done():
        return {"message": "慢查询监听器已在运行"}

    app_state["slow_query_task"] = asyncio.create_task(app_state["slow_query_listener"].start())
    return {"message": "慢查询监听器已启动"}


@app.post("/listener/slow-query/stop")
async def stop_slow_query_listener():
    if app_state["slow_query_listener"]:
        app_state["slow_query_listener"].stop()
    if app_state["slow_query_task"]:
        app_state["slow_query_task"].cancel()
        app_state["slow_query_task"] = None
    return {"message": "慢查询监听器已停止"}


@app.post("/listener/binlog/start")
async def start_binlog_listener():
    if not app_state["binlog_listener"]:
        raise HTTPException(status_code=400, detail="Binlog 监听器未初始化")

    if app_state["binlog_task"] and not app_state["binlog_task"].done():
        return {"message": "Binlog 监听器已在运行"}

    app_state["binlog_task"] = asyncio.create_task(
        app_state["binlog_listener"].start(
            resume_stream=False,
            log_file=settings.binlog_file,
        )
    )
    return {"message": "Binlog 监听器已启动"}


@app.post("/listener/binlog/stop")
async def stop_binlog_listener():
    if app_state["binlog_listener"]:
        app_state["binlog_listener"].stop()
    if app_state["binlog_task"]:
        app_state["binlog_task"].cancel()
        app_state["binlog_task"] = None
    return {"message": "Binlog 监听器已停止"}


AI_ANALYSIS_TIMEOUT = 60


@app.post("/analyze", response_model=AuditReport)
async def analyze_sql(request: SQLAnalyzeRequest):
    if not app_state["sql_analyzer"]:
        raise HTTPException(status_code=500, detail="SQL 分析器未初始化")

    try:
        analysis_result = await asyncio.wait_for(
            app_state["sql_analyzer"].analyze(request.sql),
            timeout=AI_ANALYSIS_TIMEOUT,
        )

        sql_entry = SQLEntry(
            timestamp=datetime.now().isoformat(),
            sql=request.sql,
            database="manual",
            type="manual",
        )

        report = AuditReport(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            sql_entry=sql_entry,
            injection_risk=analysis_result.injection_risk,
            injection_description=analysis_result.injection_description,
            index_missing=analysis_result.index_missing,
            index_suggestions=analysis_result.index_suggestions,
            performance_issues=analysis_result.performance_issues,
            optimization_suggestions=analysis_result.optimization_suggestions,
            optimized_sql=analysis_result.optimized_sql,
            risk_score=analysis_result.risk_score,
            summary=analysis_result.summary,
        )

        app_state["audit_reports"].insert(0, report.model_dump())
        if len(app_state["audit_reports"]) > 1000:
            app_state["audit_reports"] = app_state["audit_reports"][:1000]

        return report

    except asyncio.TimeoutError:
        logger.warning(f"SQL 分析超时 ({AI_ANALYSIS_TIMEOUT}s)，降级到规则分析")
        analysis_result = app_state["sql_analyzer"]._fallback_analysis(
            request.sql, f"AI 分析超时 ({AI_ANALYSIS_TIMEOUT}s)，已降级到规则分析"
        )

        sql_entry = SQLEntry(
            timestamp=datetime.now().isoformat(),
            sql=request.sql,
            database="manual",
            type="manual",
        )

        report = AuditReport(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            sql_entry=sql_entry,
            injection_risk=analysis_result.injection_risk,
            injection_description=analysis_result.injection_description,
            index_missing=analysis_result.index_missing,
            index_suggestions=analysis_result.index_suggestions,
            performance_issues=analysis_result.performance_issues,
            optimization_suggestions=analysis_result.optimization_suggestions,
            optimized_sql=analysis_result.optimized_sql,
            risk_score=analysis_result.risk_score,
            summary=analysis_result.summary,
        )

        app_state["audit_reports"].insert(0, report.model_dump())
        if len(app_state["audit_reports"]) > 1000:
            app_state["audit_reports"] = app_state["audit_reports"][:1000]

        return report

    except Exception as e:
        logger.error(f"SQL 分析失败: {e}")
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")


@app.get("/reports", response_model=List[AuditReport])
async def get_reports(limit: int = 50, offset: int = 0):
    reports = app_state["audit_reports"][offset : offset + limit]
    return reports


@app.get("/reports/{report_id}", response_model=AuditReport)
async def get_report(report_id: str):
    for report in app_state["audit_reports"]:
        if report["id"] == report_id:
            return report
    raise HTTPException(status_code=404, detail="报告不存在")


@app.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    for i, report in enumerate(app_state["audit_reports"]):
        if report["id"] == report_id:
            app_state["audit_reports"].pop(i)
            return {"message": "报告已删除"}
    raise HTTPException(status_code=404, detail="报告不存在")


@app.get("/stats")
async def get_statistics():
    reports = app_state["audit_reports"]
    total = len(reports)

    if total == 0:
        return {
            "total_reports": 0,
            "high_risk_count": 0,
            "medium_risk_count": 0,
            "low_risk_count": 0,
            "avg_risk_score": 0,
            "index_missing_count": 0,
        }

    high_risk = sum(1 for r in reports if r["injection_risk"] == "high")
    medium_risk = sum(1 for r in reports if r["injection_risk"] == "medium")
    low_risk = sum(1 for r in reports if r["injection_risk"] == "low")
    avg_score = sum(r["risk_score"] for r in reports) / total
    index_missing = sum(1 for r in reports if r["index_missing"])

    return {
        "total_reports": total,
        "high_risk_count": high_risk,
        "medium_risk_count": medium_risk,
        "low_risk_count": low_risk,
        "avg_risk_score": round(avg_score, 2),
        "index_missing_count": index_missing,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)


def _explain_to_response(result) -> ExplainResponse:
    return ExplainResponse(
        rows=[
            ExplainRowResponse(
                id=r.id,
                select_type=r.select_type,
                table=r.table,
                type=r.type,
                possible_keys=r.possible_keys,
                key=r.key,
                key_len=r.key_len,
                ref=r.ref,
                rows=r.rows,
                filtered=r.filtered,
                Extra=r.Extra,
            )
            for r in result.rows
        ],
        full_table_scan=result.full_table_scan,
        using_filesort=result.using_filesort,
        using_temporary=result.using_temporary,
        using_index=result.using_index,
        estimated_rows=result.estimated_rows,
        performance_score=result.performance_score,
        summary=result.summary,
    )


@app.post("/explain", response_model=ExplainResponse)
async def explain_sql(request: ExplainRequest):
    executor = app_state.get("db_executor")
    if not executor:
        raise HTTPException(status_code=500, detail="数据库执行器未初始化")

    try:
        result = await executor.execute_explain(request.sql, request.database)
        return _explain_to_response(result)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"EXPLAIN 执行失败: {e}")
        raise HTTPException(status_code=500, detail=f"EXPLAIN 执行失败: {str(e)}")


@app.post("/explain-compare", response_model=ExplainCompareResponse)
async def explain_compare(request: ExplainCompareRequest):
    executor = app_state.get("db_executor")
    if not executor:
        raise HTTPException(status_code=500, detail="数据库执行器未初始化")

    try:
        before = await executor.execute_explain(request.sql, request.database)
        after = await executor.execute_explain_with_index(
            request.sql, request.ddl_statement, request.database
        )

        rows_improvement = before.estimated_rows - after.estimated_rows
        score_improvement = after.performance_score - before.performance_score

        improvement_parts = []
        if rows_improvement > 0:
            improvement_parts.append(f"预估扫描行数减少 {rows_improvement} 行")
        if score_improvement > 0:
            improvement_parts.append(f"性能评分提升 {score_improvement} 分")
        if after.using_index and not before.using_index:
            improvement_parts.append("新增覆盖索引")
        if not after.full_table_scan and before.full_table_scan:
            improvement_parts.append("消除了全表扫描")
        if not improvement_parts:
            improvement_parts.append("无明显性能改善")

        return ExplainCompareResponse(
            before=_explain_to_response(before),
            after=_explain_to_response(after),
            rows_improvement=rows_improvement,
            score_improvement=score_improvement,
            improvement_summary="；".join(improvement_parts),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"EXPLAIN 对比失败: {e}")
        raise HTTPException(status_code=500, detail=f"EXPLAIN 对比失败: {str(e)}")


@app.post("/execute-ddl", response_model=DDLOperationLog)
async def execute_ddl(request: ExecuteDDLRequest):
    executor = app_state.get("db_executor")
    if not executor:
        raise HTTPException(status_code=500, detail="数据库执行器未初始化")

    ddl_upper = request.ddl_statement.strip().upper()
    allowed_prefixes = ("CREATE INDEX", "ALTER TABLE", "DROP INDEX")
    if not any(ddl_upper.startswith(p) for p in allowed_prefixes):
        raise HTTPException(
            status_code=400,
            detail=f"仅允许执行索引相关的 DDL 语句（{', '.join(allowed_prefixes)}），当前语句: {ddl_upper[:50]}",
        )

    try:
        log_entry = await executor.execute_ddl(
            ddl_statement=request.ddl_statement,
            database=request.database,
            original_sql=request.original_sql,
        )
        if log_entry.status == "failed":
            raise HTTPException(status_code=500, detail=f"DDL 执行失败: {log_entry.error_message}")
        return log_entry
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"DDL 执行失败: {e}")
        raise HTTPException(status_code=500, detail=f"DDL 执行失败: {str(e)}")


@app.get("/audit-logs", response_model=List[DDLOperationLog])
async def get_audit_logs(limit: int = 50, offset: int = 0):
    executor = app_state.get("db_executor")
    if not executor:
        return []
    logs = executor.get_audit_logs(limit, offset)
    return [DDLOperationLog(**log) for log in logs]
