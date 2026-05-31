"""
数据库操作工具模块
提供数据库连接、查询、事务等功能
"""

import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, List, Dict, Optional, Tuple, Generator
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class DatabaseManager:
    """数据库管理器"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, db_path: str = None):
        """单例模式"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialize(db_path or ':memory:')
        return cls._instance

    def _initialize(self, db_path: str) -> None:
        """初始化数据库连接"""
        self.db_path = db_path
        self._local = threading.local()
        self._create_tables()

    @contextmanager
    def get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """获取数据库连接（线程安全）"""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(
                self.db_path,
                detect_types=sqlite3.PARSE_DECLTYPES,
                check_same_thread=False
            )
            self._local.conn.row_factory = sqlite3.Row
        try:
            yield self._local.conn
        except Exception as e:
            logger.error(f"数据库错误: {e}")
            raise

    def _create_tables(self) -> None:
        """创建数据库表"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    author_id INTEGER NOT NULL,
                    status TEXT DEFAULT 'draft',
                    priority TEXT DEFAULT 'medium',
                    view_count INTEGER DEFAULT 0,
                    like_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (author_id) REFERENCES users (id)
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    post_id INTEGER NOT NULL,
                    author_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    parent_id INTEGER,
                    is_approved BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (post_id) REFERENCES posts (id),
                    FOREIGN KEY (author_id) REFERENCES users (id)
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS post_tags (
                    post_id INTEGER NOT NULL,
                    tag_id INTEGER NOT NULL,
                    PRIMARY KEY (post_id, tag_id),
                    FOREIGN KEY (post_id) REFERENCES posts (id),
                    FOREIGN KEY (tag_id) REFERENCES tags (id)
                )
            ''')

            cursor.execute('CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)')

            conn.commit()

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Connection, None, None]:
        """事务上下文管理器"""
        with self.get_connection() as conn:
            try:
                yield conn
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error(f"事务回滚: {e}")
                raise

    def execute_query(self, query: str, params: Tuple = None) -> List[sqlite3.Row]:
        """执行查询语句"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params or ())
            return cursor.fetchall()

    def execute_update(self, query: str, params: Tuple = None) -> int:
        """执行更新语句，返回影响的行数"""
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params or ())
            return cursor.rowcount

    def insert(self, table: str, data: Dict[str, Any]) -> int:
        """
        插入数据
        :param table: 表名
        :param data: 数据字典
        :return: 新插入行的ID
        """
        columns = ', '.join(data.keys())
        placeholders = ', '.join(['?' for _ in data])
        values = tuple(data.values())

        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"

        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(query, values)
            return cursor.lastrowid

    def update(self, table: str, data: Dict[str, Any], where: str, where_params: Tuple = None) -> int:
        """
        更新数据
        :param table: 表名
        :param data: 更新的数据字典
        :param where: WHERE 条件
        :param where_params: WHERE 条件参数
        :return: 影响的行数
        """
        set_clause = ', '.join([f"{key} = ?" for key in data.keys()])
        values = tuple(data.values()) + (where_params or ())

        query = f"UPDATE {table} SET {set_clause} WHERE {where}"

        return self.execute_update(query, values)

    def delete(self, table: str, where: str, where_params: Tuple = None) -> int:
        """
        删除数据
        :param table: 表名
        :param where: WHERE 条件
        :param where_params: WHERE 条件参数
        :return: 影响的行数
        """
        query = f"DELETE FROM {table} WHERE {where}"
        return self.execute_update(query, where_params or ())

    def find_by_id(self, table: str, id: int) -> Optional[sqlite3.Row]:
        """根据ID查找记录"""
        query = f"SELECT * FROM {table} WHERE id = ?"
        results = self.execute_query(query, (id,))
        return results[0] if results else None

    def find_all(self, table: str, order_by: str = "id", limit: int = None) -> List[sqlite3.Row]:
        """查询所有记录"""
        query = f"SELECT * FROM {table} ORDER BY {order_by}"
        if limit:
            query += f" LIMIT {limit}"
        return self.execute_query(query)

    def paginate(self, table: str, page: int = 1, per_page: int = 20, order_by: str = "id DESC") -> Dict[str, Any]:
        """分页查询"""
        offset = (page - 1) * per_page

        count_query = f"SELECT COUNT(*) as total FROM {table}"
        total = self.execute_query(count_query)[0]['total']

        data_query = f"SELECT * FROM {table} ORDER BY {order_by} LIMIT ? OFFSET ?"
        items = self.execute_query(data_query, (per_page, offset))

        return {
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
        }

    def count(self, table: str, where: str = None, where_params: Tuple = None) -> int:
        """统计记录数"""
        query = f"SELECT COUNT(*) as total FROM {table}"
        if where:
            query += f" WHERE {where}"
        result = self.execute_query(query, where_params or ())
        return result[0]['total']

    def exists(self, table: str, where: str, where_params: Tuple = None) -> bool:
        """检查记录是否存在"""
        return self.count(table, where, where_params) > 0

    def batch_insert(self, table: str, data_list: List[Dict[str, Any]]) -> List[int]:
        """批量插入数据"""
        ids = []
        with self.transaction() as conn:
            cursor = conn.cursor()
            for data in data_list:
                columns = ', '.join(data.keys())
                placeholders = ', '.join(['?' for _ in data])
                values = tuple(data.values())
                query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
                cursor.execute(query, values)
                ids.append(cursor.lastrowid)
        return ids

    def close(self) -> None:
        """关闭数据库连接"""
        if hasattr(self._local, 'conn') and self._local.conn:
            self._local.conn.close()
            self._local.conn = None


class QueryBuilder:
    """SQL 查询构建器"""

    def __init__(self, table: str):
        self.table = table
        self._select = "*"
        self._where = []
        self._where_params = []
        self._order_by = None
        self._limit = None
        self._offset = None
        self._joins = []

    def select(self, columns: str) -> 'QueryBuilder':
        self._select = columns
        return self

    def where(self, condition: str, params: Any = None) -> 'QueryBuilder':
        self._where.append(condition)
        if params is not None:
            if isinstance(params, (list, tuple)):
                self._where_params.extend(params)
            else:
                self._where_params.append(params)
        return self

    def or_where(self, condition: str, params: Any = None) -> 'QueryBuilder':
        if self._where:
            self._where[-1] = f"({self._where[-1]} OR {condition})"
        else:
            self._where.append(condition)
        if params is not None:
            if isinstance(params, (list, tuple)):
                self._where_params.extend(params)
            else:
                self._where_params.append(params)
        return self

    def where_in(self, column: str, values: List[Any]) -> 'QueryBuilder':
        placeholders = ', '.join(['?' for _ in values])
        self._where.append(f"{column} IN ({placeholders})")
        self._where_params.extend(values)
        return self

    def where_like(self, column: str, pattern: str) -> 'QueryBuilder':
        self._where.append(f"{column} LIKE ?")
        self._where_params.append(pattern)
        return self

    def where_between(self, column: str, start: Any, end: Any) -> 'QueryBuilder':
        self._where.append(f"{column} BETWEEN ? AND ?")
        self._where_params.extend([start, end])
        return self

    def order_by(self, column: str, direction: str = "ASC") -> 'QueryBuilder':
        self._order_by = f"{column} {direction.upper()}"
        return self

    def limit(self, limit: int) -> 'QueryBuilder':
        self._limit = limit
        return self

    def offset(self, offset: int) -> 'QueryBuilder':
        self._offset = offset
        return self

    def join(self, table: str, on: str, join_type: str = "INNER") -> 'QueryBuilder':
        self._joins.append(f"{join_type} JOIN {table} ON {on}")
        return self

    def build(self) -> Tuple[str, Tuple]:
        """构建 SQL 查询和参数"""
        query = f"SELECT {self._select} FROM {self.table}"

        if self._joins:
            query += ' ' + ' '.join(self._joins)

        if self._where:
            query += " WHERE " + " AND ".join(self._where)

        if self._order_by:
            query += f" ORDER BY {self._order_by}"

        if self._limit is not None:
            query += f" LIMIT {self._limit}"

        if self._offset is not None:
            query += f" OFFSET {self._offset}"

        return query, tuple(self._where_params)

    def execute(self, db: DatabaseManager) -> List[sqlite3.Row]:
        """执行查询"""
        query, params = self.build()
        return db.execute_query(query, params)


def get_db(db_path: str = None) -> DatabaseManager:
    """获取数据库管理器实例"""
    return DatabaseManager(db_path)


def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """将 Row 对象转换为字典"""
    return {key: row[key] for key in row.keys()}


def rows_to_dicts(rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
    """将 Row 列表转换为字典列表"""
    return [row_to_dict(row) for row in rows]
