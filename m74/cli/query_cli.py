import argparse
import json
import re
import sys
import sqlite3
import hashlib
import os
from datetime import datetime
from typing import Any, List, Optional, Tuple, Dict

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        try:
            import io
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
        except Exception:
            pass

import polars as pl
import requests


def _escape_special_chars(value: Any) -> str:
    if value is None:
        return "NULL"
    s = str(value)
    s = s.replace('\r\n', '\\n')
    s = s.replace('\n', '\\n')
    s = s.replace('\r', '\\r')
    s = s.replace('\t', '\\t')
    s = s.replace('\v', '\\v')
    s = s.replace('\f', '\\f')
    s = s.replace('\b', '\\b')
    return s


def _convert_to_serializable(data: List[List[Any]]) -> List[List[Any]]:
    result = []
    for row in data:
        new_row = []
        for val in row:
            if val is None:
                new_row.append(None)
            elif isinstance(val, (int, float, bool, str)):
                new_row.append(val)
            else:
                new_row.append(str(val))
        result.append(new_row)
    return result


def _is_numeric(value: Any) -> bool:
    if value is None:
        return False
    try:
        float(value)
        return True
    except (ValueError, TypeError):
        return False


class QueryCache:
    def __init__(self, db_path: str = None, max_entries: int = 10):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "query_cache.db")
        self.db_path = db_path
        self.max_entries = max_entries
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS query_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sql_hash TEXT UNIQUE NOT NULL,
                sql TEXT NOT NULL,
                columns TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                accessed_at TEXT NOT NULL,
                access_count INTEGER DEFAULT 1
            )
        ''')
        conn.commit()
        conn.close()

    def _hash_sql(self, sql: str) -> str:
        return hashlib.md5(sql.strip().lower().encode('utf-8')).hexdigest()

    def get(self, sql: str) -> Optional[Tuple[List[str], List[List[Any]]]]:
        sql_hash = self._hash_sql(sql)
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT columns, data FROM query_cache WHERE sql_hash = ?
        ''', (sql_hash,))
        row = cursor.fetchone()

        if row:
            cursor.execute('''
                UPDATE query_cache
                SET accessed_at = ?, access_count = access_count + 1
                WHERE sql_hash = ?
            ''', (datetime.now().isoformat(), sql_hash))
            conn.commit()

            columns = json.loads(row[0])
            data = json.loads(row[1])
            conn.close()
            return (columns, data)

        conn.close()
        return None

    def put(self, sql: str, columns: List[str], data: List[List[Any]]):
        sql_hash = self._hash_sql(sql)
        columns_json = json.dumps(columns, ensure_ascii=False)
        data_json = json.dumps(data, ensure_ascii=False)
        now = datetime.now().isoformat()

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT OR REPLACE INTO query_cache
            (sql_hash, sql, columns, data, created_at, accessed_at, access_count)
            VALUES (?, ?, ?, ?, ?, ?,
                COALESCE((SELECT access_count + 1 FROM query_cache WHERE sql_hash = ?), 1)
            )
        ''', (sql_hash, sql, columns_json, data_json, now, now, sql_hash))

        cursor.execute('''
            DELETE FROM query_cache
            WHERE id NOT IN (
                SELECT id FROM query_cache
                ORDER BY accessed_at DESC
                LIMIT ?
            )
        ''', (self.max_entries,))

        conn.commit()
        conn.close()

    def get_recent(self, limit: int = 10) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT sql, created_at, accessed_at, access_count
            FROM query_cache
            ORDER BY accessed_at DESC
            LIMIT ?
        ''', (limit,))
        rows = cursor.fetchall()
        conn.close()

        return [
            {
                "sql": row[0],
                "created_at": row[1],
                "accessed_at": row[2],
                "access_count": row[3]
            }
            for row in rows
        ]

    def clear(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM query_cache')
        conn.commit()
        conn.close()


class ASCIIChart:
    @staticmethod
    def _get_numeric_columns(columns: List[str], data: List[List[Any]]) -> List[int]:
        numeric_cols = []
        for i in range(len(columns)):
            count = sum(1 for row in data if _is_numeric(row[i]))
            if len(data) > 0 and count / len(data) > 0.5:
                numeric_cols.append(i)
        return numeric_cols

    @staticmethod
    def line_chart(
        columns: List[str],
        data: List[List[Any]],
        x_col: Optional[str] = None,
        y_col: Optional[str] = None,
        width: int = 60,
        height: int = 15
    ) -> str:
        if not data:
            return "无数据"

        numeric_cols = ASCIIChart._get_numeric_columns(columns, data)
        if not numeric_cols:
            return "无可数值列用于绘制图表"

        x_idx = 0
        if x_col and x_col in columns:
            x_idx = columns.index(x_col)

        y_idx = numeric_cols[0]
        if y_col and y_col in columns and columns.index(y_col) in numeric_cols:
            y_idx = columns.index(y_col)

        y_label = columns[y_idx]
        x_label = columns[x_idx]

        values = []
        x_labels = []
        for row in data:
            if _is_numeric(row[y_idx]):
                values.append(float(row[y_idx]))
                x_labels.append(_escape_special_chars(row[x_idx]) if row[x_idx] is not None else "NULL")

        if not values:
            return "无可绘制数据"

        min_val = min(values)
        max_val = max(values)
        val_range = max_val - min_val if max_val != min_val else 1

        canvas = [[' ' for _ in range(width)] for _ in range(height)]

        for i, val in enumerate(values):
            x_pos = int(i * (width - 2) / max(len(values) - 1, 1)) + 1
            y_pos = height - 1 - int((val - min_val) / val_range * (height - 2)) - 1
            if 0 <= y_pos < height and 0 <= x_pos < width:
                canvas[y_pos][x_pos] = '*'

        for i in range(len(values) - 1):
            x1 = int(i * (width - 2) / max(len(values) - 1, 1)) + 1
            y1 = height - 1 - int((values[i] - min_val) / val_range * (height - 2)) - 1
            x2 = int((i + 1) * (width - 2) / max(len(values) - 1, 1)) + 1
            y2 = height - 1 - int((values[i + 1] - min_val) / val_range * (height - 2)) - 1

            dx = abs(x2 - x1)
            dy = abs(y2 - y1)
            sx = 1 if x1 < x2 else -1
            sy = 1 if y1 < y2 else -1
            err = dx - dy

            x, y = x1, y1
            while True:
                if 0 <= y < height and 0 <= x < width and canvas[y][x] == ' ':
                    canvas[y][x] = '·'
                if x == x2 and y == y2:
                    break
                e2 = 2 * err
                if e2 > -dy:
                    err -= dy
                    x += sx
                if e2 < dx:
                    err += dx
                    y += sy

        for i in range(width):
            canvas[height - 1][i] = '─'
        for i in range(height):
            canvas[i][0] = '│'
        canvas[height - 1][0] = '└'

        lines = []
        lines.append(f"\n📈 ASCII 折线图 - {y_label} vs {x_label}")
        lines.append("┌" + "─" * (width - 1))

        for i in range(height - 1):
            val_label = f"{max_val - i * val_range / (height - 2):.1f}"
            line = f"{val_label:>6} │" + ''.join(canvas[i][1:])
            lines.append(line)

        lines.append("└" + "─" * (width - 1))

        if len(x_labels) > 0:
            step = max(1, len(x_labels) // 10)
            x_axis_labels = []
            for i in range(0, len(x_labels), step):
                label = x_labels[i]
                if len(label) > 6:
                    label = label[:5] + '…'
                pos = int(i * (width - 2) / max(len(x_labels) - 1, 1)) + 1
                x_axis_labels.append((pos, label))

            x_label_line = [' '] * width
            for pos, label in x_axis_labels:
                for j, c in enumerate(label):
                    if pos + j < width:
                        x_label_line[pos + j] = c
            lines.append(f"       {' '.join(x_label_line)}")

        return '\n'.join(lines)

    @staticmethod
    def bar_chart(
        columns: List[str],
        data: List[List[Any]],
        x_col: Optional[str] = None,
        y_col: Optional[str] = None,
        width: int = 50,
        max_bars: int = 15
    ) -> str:
        if not data:
            return "无数据"

        numeric_cols = ASCIIChart._get_numeric_columns(columns, data)
        if not numeric_cols:
            return "无数字列用于绘制图表"

        x_idx = 0
        if x_col and x_col in columns:
            x_idx = columns.index(x_col)

        y_idx = numeric_cols[0]
        if y_col and y_col in columns and columns.index(y_col) in numeric_cols:
            y_idx = columns.index(y_col)

        y_label = columns[y_idx]

        display_data = data[:max_bars]
        values = []
        x_labels = []
        for row in display_data:
            val = float(row[y_idx]) if _is_numeric(row[y_idx]) else 0
            values.append(val)
            x_labels.append(_escape_special_chars(row[x_idx]) if row[x_idx] is not None else "NULL")

        if not values:
            return "无可绘制数据"

        max_val = max(values) if values else 1

        lines = []
        lines.append(f"\n📊 ASCII 柱状图 - {y_label}")
        lines.append("┌" + "─" * (width - 2) + "┐")

        for i, (val, label) in enumerate(zip(values, x_labels)):
            bar_len = int(val / max_val * (width - 4)) if max_val > 0 else 0
            bar = '█' * bar_len
            display_label = label[:10]
            if len(display_label) < 10:
                display_label = display_label + ' ' * (10 - len(display_label))
            lines.append(f"│ {display_label} │ {bar:<{width - 14}} │ {val:>8.2f}")

        lines.append("└" + "─" * (width - 2) + "┘")

        return '\n'.join(lines)

    @staticmethod
    def auto_chart(
        columns: List[str],
        data: List[List[Any]],
        x_col: Optional[str] = None,
        y_col: Optional[str] = None,
        chart_type: str = "line"
    ) -> str:
        if chart_type == "bar":
            return ASCIIChart.bar_chart(columns, data, x_col, y_col)
        else:
            return ASCIIChart.line_chart(columns, data, x_col, y_col)


class SQLQueryCLI:
    def __init__(self):
        self.parser = argparse.ArgumentParser(
            description="自定义 SQL 查询引擎 - 支持对本地 CSV 文件执行 SQL 查询并可视化"
        )
        self.cache = QueryCache(max_entries=10)
        self._setup_arguments()

    def _setup_arguments(self):
        self.parser.add_argument(
            "-s", "--sql",
            type=str,
            required=False,
            help="SQL 查询语句，例如: 'SELECT name, age FROM data.csv WHERE age > 20'"
        )
        self.parser.add_argument(
            "-S", "--server",
            type=str,
            default="http://127.0.0.1:8000/visualize",
            help="可视化服务地址 (默认: http://127.0.0.1:8000/visualize)"
        )
        self.parser.add_argument(
            "--chart-type",
            type=str,
            default="line",
            choices=["line", "bar", "scatter"],
            help="图表类型 (默认: line)"
        )
        self.parser.add_argument(
            "--x-axis",
            type=str,
            default=None,
            help="指定 X 轴列名 (默认使用第一列)"
        )
        self.parser.add_argument(
            "--y-axis",
            type=str,
            default=None,
            help="指定 Y 轴列名 (默认使用所有数值列)"
        )
        self.parser.add_argument(
            "--title",
            type=str,
            default="Query Result",
            help="图表标题 (默认: Query Result)"
        )
        self.parser.add_argument(
            "--no-viz",
            action="store_true",
            help="只执行查询不发送到可视化服务"
        )
        self.parser.add_argument(
            "--no-cache",
            action="store_true",
            help="跳过缓存，强制重新执行查询"
        )
        self.parser.add_argument(
            "--list-cache",
            action="store_true",
            help="列出最近的查询缓存记录"
        )
        self.parser.add_argument(
            "--clear-cache",
            action="store_true",
            help="清空所有查询缓存"
        )
        self.parser.add_argument(
            "--ascii-only",
            action="store_true",
            help="即使查询未命中缓存，也只显示 ASCII 图表，不请求远程服务"
        )

    def run(self):
        args = self.parser.parse_args()

        if args.list_cache:
            self._list_cache()
            return

        if args.clear_cache:
            self.cache.clear()
            print("✅ 缓存已清空")
            return

        if not args.sql:
            print("❌ 错误: 请使用 -s/--sql 参数指定 SQL 查询语句")
            print("   或使用 --list-cache 查看缓存，--clear-cache 清空缓存")
            sys.exit(1)

        try:
            if not args.no_cache:
                cached_result = self.cache.get(args.sql)
                if cached_result:
                    columns, data = cached_result
                    print("📦 从缓存读取结果")
                    print(f"🔍 SQL: {args.sql}")

                    self._print_results(columns, data)

                    ascii_chart = ASCIIChart.auto_chart(
                        columns=columns,
                        data=data,
                        x_col=args.x_axis,
                        y_col=args.y_axis,
                        chart_type=args.chart_type
                    )
                    print(ascii_chart)

                    print("\n💡 提示: 使用 --no-cache 参数可以强制重新执行查询")
                    return

            csv_file = self._extract_csv_filename(args.sql)
            if not csv_file:
                print("❌ 错误: 无法从 SQL 中提取 CSV 文件名")
                print("   示例: SELECT name, age FROM data.csv WHERE age > 20")
                sys.exit(1)

            print(f"📂 读取 CSV 文件: {csv_file}")
            df = pl.read_csv(
                csv_file,
                quote_char='"',
                separator=',',
                ignore_errors=False,
                try_parse_dates=True,
                low_memory=False
            )

            table_name = csv_file.replace('.', '_').replace('-', '_')
            sql = self._rewrite_sql(args.sql, csv_file, table_name)

            print(f"\n🔍 执行 SQL: {sql}\n")

            ctx = pl.SQLContext()
            ctx.register(table_name, df)
            result_df = ctx.execute(sql).collect()

            if result_df.is_empty():
                print("📭 查询结果为空")
                return

            columns = result_df.columns
            data = _convert_to_serializable(result_df.to_numpy().tolist())

            self.cache.put(args.sql, columns, data)

            self._print_results(columns, data)

            if args.ascii_only:
                ascii_chart = ASCIIChart.auto_chart(
                    columns=columns,
                    data=data,
                    x_col=args.x_axis,
                    y_col=args.y_axis,
                    chart_type=args.chart_type
                )
                print(ascii_chart)
            elif not args.no_viz:
                self._send_to_visualization(
                    columns=columns,
                    data=data,
                    server=args.server,
                    chart_type=args.chart_type,
                    x_axis=args.x_axis,
                    y_axis=args.y_axis,
                    title=args.title
                )

        except Exception as e:
            print(f"\n❌ 执行失败: {e}")
            sys.exit(1)

    def _list_cache(self):
        recent = self.cache.get_recent(limit=10)
        if not recent:
            print("📭 缓存为空")
            return

        print(f"📋 最近 {len(recent)} 条查询缓存:\n")
        print(f"{'#':<3} {'SQL':<60} {'访问次数':<8} {'最后访问时间':<20}")
        print("-" * 95)

        for i, item in enumerate(recent, 1):
            sql_display = item["sql"][:57] + "..." if len(item["sql"]) > 60 else item["sql"]
            access_time = item["accessed_at"].replace("T", " ")[:19]
            print(f"{i:<3} {sql_display:<60} {item['access_count']:<8} {access_time:<20}")

        print(f"\n💾 缓存数据库: {self.cache.db_path}")

    def _extract_csv_filename(self, sql: str) -> Optional[str]:
        pattern = r'(?i)FROM\s+([a-zA-Z0-9_\-]+\.csv)'
        match = re.search(pattern, sql)
        if match:
            return match.group(1)
        return None

    def _rewrite_sql(self, sql: str, csv_file: str, table_name: str) -> str:
        pattern = rf'(?i)FROM\s+{re.escape(csv_file)}'
        return re.sub(pattern, f'FROM {table_name}', sql)

    def _print_results(self, columns: List[str], data: List[List[Any]]):
        print(f"📊 查询结果 ({len(data)} 行):")
        print()

        col_widths = [len(col) for col in columns]
        for row in data:
            for i, val in enumerate(row):
                val_str = _escape_special_chars(val)
                if len(val_str) > col_widths[i]:
                    col_widths[i] = len(val_str)

        header = " | ".join(
            f"{col:<{col_widths[i]}}" for i, col in enumerate(columns)
        )
        print(f"| {header} |")

        separator = " | ".join(
            "-" * col_widths[i] for i in range(len(columns))
        )
        print(f"| {separator} |")

        for row in data:
            formatted_row = " | ".join(
                f"{_escape_special_chars(val):<{col_widths[i]}}"
                for i, val in enumerate(row)
            )
            print(f"| {formatted_row} |")

    def _send_to_visualization(
        self,
        columns: List[str],
        data: List[List[Any]],
        server: str,
        chart_type: str,
        x_axis: Optional[str],
        y_axis: Optional[str],
        title: str
    ):
        print(f"\n📤 发送数据到可视化服务: {server}")

        payload = {
            "columns": columns,
            "data": data,
            "chart_type": chart_type,
            "x_axis": x_axis,
            "y_axis": y_axis,
            "title": title
        }

        try:
            response = requests.post(server, json=payload, timeout=30)

            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    image_url = result.get("image_url")
                    print("\n✅ 可视化成功!")
                    print(f"📈 图片 URL: {image_url}")
                    print(f"🌐 查看 Dashboard: http://127.0.0.1:8000/")
                else:
                    print(f"\n❌ 可视化失败: {result.get('error', '未知错误')}")
            else:
                print(f"\n❌ HTTP 请求失败: {response.status_code}")
                print(f"   {response.text}")

        except requests.exceptions.ConnectionError:
            print("\n❌ 无法连接到可视化服务")
            print("   请确保服务已启动: python server/main.py")
        except Exception as e:
            print(f"\n❌ 发送请求失败: {e}")


def main():
    cli = SQLQueryCLI()
    cli.run()


if __name__ == "__main__":
    main()
