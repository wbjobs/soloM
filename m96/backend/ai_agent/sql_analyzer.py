import json
import re
import unicodedata
from typing import Optional, Dict, Any
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
import logging

logger = logging.getLogger(__name__)

MAX_SQL_LENGTH = 4000
MAX_COMMENT_LENGTH = 200


class SQLAuditResult(BaseModel):
    sql: str = Field(description="原始 SQL 语句")
    injection_risk: str = Field(description="注入风险等级: high, medium, low, none")
    injection_description: str = Field(description="注入风险详细描述")
    index_missing: bool = Field(description="是否缺少索引")
    index_suggestions: list[str] = Field(description="索引建议列表")
    performance_issues: list[str] = Field(description="性能问题列表")
    optimization_suggestions: list[str] = Field(description="优化建议列表")
    optimized_sql: Optional[str] = Field(description="优化后的 SQL 语句")
    risk_score: int = Field(description="风险评分 0-100")
    summary: str = Field(description="审计摘要")


class SQLAnalyzer:
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3"):
        self.base_url = base_url
        self.model = model
        self.llm = ChatOllama(
            base_url=base_url,
            model=model,
            temperature=0.1,
            timeout=120,
        )
        self.parser = PydanticOutputParser(pydantic_object=SQLAuditResult)
        self._build_chain()

    def _build_chain(self):
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    """你是一位专业的 MySQL DBA 和 SQL 安全专家。请分析给定的 SQL 语句，识别潜在的安全风险和性能问题，并提供优化建议。

分析维度：
1. SQL 注入风险：检查是否存在注入漏洞（如字符串拼接、未使用参数化查询等）
2. 索引分析：检查 WHERE、JOIN、ORDER BY、GROUP BY 子句是否需要索引
3. 性能分析：检查是否存在全表扫描、临时表、文件排序等问题
4. 语法优化：提供更高效的 SQL 写法

{format_instructions}

注意：
- 只返回 JSON 格式，不要有其他解释文字
- 如果没有问题，也要填写相应字段（如 injection_risk: "none"）
- 风险评分范围 0-100，分数越高风险越大""",
                ),
                ("human", "请分析以下 SQL 语句：\n\n{sql}"),
            ]
        )
        prompt = prompt.partial(format_instructions=self.parser.get_format_instructions())
        self.chain = prompt | self.llm | self.parser

    async def analyze(self, sql: str) -> SQLAuditResult:
        original_sql = sql
        try:
            sql = self._preprocess_sql(sql)
            if not sql.strip():
                logger.warning("SQL 预处理后为空，使用规则分析")
                return self._fallback_analysis(original_sql, "SQL 预处理后内容为空")

            logger.info(f"开始分析 SQL: {sql[:100]}...")
            result = await self.chain.ainvoke({"sql": sql})
            result.sql = original_sql
            logger.info(f"SQL 分析完成，风险评分: {result.risk_score}")
            return result
        except Exception as e:
            logger.error(f"SQL 分析出错: {e}")
            return self._fallback_analysis(original_sql, str(e))

    def _preprocess_sql(self, sql: str) -> str:
        sql = self._strip_binary_data(sql)
        sql = self._truncate_long_comments(sql)
        sql = self._collapse_whitespace(sql)
        sql = self._truncate_sql(sql)
        return sql

    def _strip_binary_data(self, sql: str) -> str:
        cleaned = []
        for ch in sql:
            if ch == '\n' or ch == '\r' or ch == '\t':
                cleaned.append(' ')
                continue
            cat = unicodedata.category(ch)
            if cat.startswith('C'):
                continue
            if cat == 'Co' or cat == 'Cs':
                continue
            if not ch.isprintable() and ch not in (' ',):
                continue
            cleaned.append(ch)
        result = ''.join(cleaned)
        result = re.sub(r'0x[0-9A-Fa-f]{16,}', '<BINARY_DATA>', result)
        result = re.sub(r"X'([0-9A-Fa-f]{16,})'", "X'<TRUNCATED>'", result)
        return result

    def _truncate_long_comments(self, sql: str) -> str:
        def _replace_block_comment(match):
            comment = match.group(0)
            if len(comment) > MAX_COMMENT_LENGTH:
                inner = comment[2:-2].strip()
                preview = inner[:MAX_COMMENT_LENGTH]
                return f"/* {preview}... */"
            return comment

        def _replace_line_comment(match):
            comment = match.group(0)
            if len(comment) > MAX_COMMENT_LENGTH:
                return comment[:MAX_COMMENT_LENGTH] + "..."
            return comment

        sql = re.sub(r'/\*.*?\*/', _replace_block_comment, sql, flags=re.DOTALL)
        sql = re.sub(r'--[^\n]*', _replace_line_comment, sql)
        return sql

    def _collapse_whitespace(self, sql: str) -> str:
        sql = re.sub(r'[ \t]+', ' ', sql)
        sql = re.sub(r'\n\s*\n+', '\n', sql)
        return sql.strip()

    def _truncate_sql(self, sql: str) -> str:
        if len(sql) <= MAX_SQL_LENGTH:
            return sql
        truncated = sql[:MAX_SQL_LENGTH]
        last_semicolon = truncated.rfind(';')
        if last_semicolon > MAX_SQL_LENGTH // 2:
            truncated = truncated[:last_semicolon + 1]
        else:
            last_keyword = max(
                truncated.upper().rfind(kw)
                for kw in [' WHERE ', ' AND ', ' FROM ', ' SELECT ', ' JOIN ']
            )
            if last_keyword > MAX_SQL_LENGTH // 2:
                truncated = truncated[:last_keyword].rstrip()
        truncated += "\n-- [截断] 原始 SQL 长度超出上下文窗口限制，已截断"
        return truncated

    def _fallback_analysis(self, sql: str, error: str) -> SQLAuditResult:
        basic_analysis = self._basic_sql_check(sql)
        return SQLAuditResult(
            sql=sql,
            injection_risk=basic_analysis["injection_risk"],
            injection_description=basic_analysis["injection_description"] + f" (AI 分析失败: {error})",
            index_missing=basic_analysis["index_missing"],
            index_suggestions=basic_analysis["index_suggestions"],
            performance_issues=basic_analysis["performance_issues"],
            optimization_suggestions=basic_analysis["optimization_suggestions"],
            optimized_sql=None,
            risk_score=basic_analysis["risk_score"],
            summary="基础规则分析结果（AI 分析失败）",
        )

    def _basic_sql_check(self, sql: str) -> Dict[str, Any]:
        sql_upper = sql.upper().strip()
        injection_risk = "low"
        injection_description = "未发现明显注入风险"
        index_missing = False
        index_suggestions = []
        performance_issues = []
        optimization_suggestions = []
        risk_score = 0

        injection_patterns = [
            (r"'.*\s+OR\s+'.*'='", "high", "发现经典的永真式注入模式"),
            (r"';.*--", "high", "发现注释注入模式"),
            (r"';\s*(DROP|DELETE|INSERT|UPDATE|ALTER)", "high", "发现堆叠查询注入风险"),
            (r"UNION.*SELECT", "medium", "存在 UNION 查询注入风险"),
            (r"EXEC\s*\(", "high", "发现执行命令注入风险"),
        ]

        for pattern, risk, desc in injection_patterns:
            if re.search(pattern, sql_upper):
                injection_risk = risk
                injection_description = desc
                risk_score += 30 if risk == "high" else 15
                break

        if "WHERE" not in sql_upper and sql_upper.startswith(("SELECT", "UPDATE", "DELETE")):
            if sql_upper.startswith("SELECT") and "FROM" in sql_upper:
                performance_issues.append("SELECT 语句缺少 WHERE 条件，可能导致全表扫描")
                index_missing = True
                optimization_suggestions.append("添加 WHERE 条件限制返回行数")
                risk_score += 10

        if "LIKE" in sql_upper and re.search(r"LIKE\s*['\"]%", sql_upper):
            performance_issues.append("LIKE 查询以通配符开头，无法使用索引")
            index_suggestions.append("考虑使用全文索引替代前缀模糊查询")
            optimization_suggestions.append("如果可能，避免使用前导通配符")
            risk_score += 10

        if "ORDER BY" in sql_upper:
            match = re.search(r"ORDER BY\s+(\w+)", sql_upper)
            if match:
                column = match.group(1)
                if column not in ["1", "2", "3"]:
                    index_suggestions.append(f"考虑为排序列 {column} 添加索引")

        if "JOIN" in sql_upper:
            join_columns = re.findall(r"ON\s+(\w+)\.(\w+)\s*=", sql_upper)
            for table, column in join_columns:
                index_suggestions.append(f"考虑为关联列 {table}.{column} 添加索引")

        if "SELECT *" in sql_upper:
            performance_issues.append("使用 SELECT * 查询不必要的列")
            optimization_suggestions.append("明确指定需要查询的列名")
            risk_score += 5

        if "GROUP BY" in sql_upper:
            match = re.search(r"GROUP BY\s+(\w+)", sql_upper)
            if match:
                column = match.group(1)
                index_suggestions.append(f"考虑为分组列 {column} 添加索引")

        if len(index_suggestions) > 0:
            index_missing = True

        return {
            "injection_risk": injection_risk,
            "injection_description": injection_description,
            "index_missing": index_missing,
            "index_suggestions": index_suggestions,
            "performance_issues": performance_issues,
            "optimization_suggestions": optimization_suggestions,
            "risk_score": min(risk_score, 100),
        }
