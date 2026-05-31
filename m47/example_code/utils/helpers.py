"""
工具函数模块
提供通用的工具函数和辅助方法
"""

import re
import json
import hashlib
import random
import string
from datetime import datetime, timedelta
from typing import Any, List, Dict, Optional, Union, Callable
from functools import wraps
import time


def retry(max_attempts: int = 3, delay: float = 1.0, backoff: float = 2.0) -> Callable:
    """
    重试装饰器
    :param max_attempts: 最大重试次数
    :param delay: 初始延迟时间（秒）
    :param backoff: 延迟倍数
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            attempts = 0
            current_delay = delay
            while attempts < max_attempts:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    attempts += 1
                    if attempts >= max_attempts:
                        raise
                    time.sleep(current_delay)
                    current_delay *= backoff
            return None
        return wrapper
    return decorator


def timing(func: Callable) -> Callable:
    """性能计时装饰器"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"函数 {func.__name__} 执行耗时: {end - start:.4f} 秒")
        return result
    return wrapper


def generate_random_string(length: int = 10, use_digits: bool = True, use_symbols: bool = False) -> str:
    """
    生成随机字符串
    :param length: 字符串长度
    :param use_digits: 是否包含数字
    :param use_symbols: 是否包含特殊符号
    """
    chars = string.ascii_letters
    if use_digits:
        chars += string.digits
    if use_symbols:
        chars += "!@#$%^&*()_+-=[]{}|;:,.<>?"
    return ''.join(random.choice(chars) for _ in range(length))


def generate_uuid() -> str:
    """生成唯一ID"""
    import uuid
    return str(uuid.uuid4())


def slugify(text: str, separator: str = '-') -> str:
    """
    将文本转换为 URL 友好的 slug
    :param text: 原始文本
    :param separator: 分隔符
    """
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', separator, text)
    text = text.strip(separator)
    return text


def validate_email(email: str) -> bool:
    """验证邮箱格式"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_url(url: str) -> bool:
    """验证URL格式"""
    pattern = r'^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$'
    return bool(re.match(pattern, url))


def truncate_text(text: str, max_length: int = 100, suffix: str = '...') -> str:
    """截断文本到指定长度"""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)].rstrip() + suffix


def format_date(date: Optional[datetime] = None, format_str: str = '%Y-%m-%d %H:%M:%S') -> str:
    """格式化日期时间"""
    if date is None:
        date = datetime.now()
    return date.strftime(format_str)


def parse_date(date_str: str, format_str: str = '%Y-%m-%d %H:%M:%S') -> Optional[datetime]:
    """解析日期字符串"""
    try:
        return datetime.strptime(date_str, format_str)
    except (ValueError, TypeError):
        return None


def time_ago(date: datetime) -> str:
    """
    将日期转换为相对时间字符串
    例如："5分钟前"、"2小时前"、"3天前"
    """
    now = datetime.now()
    diff = now - date

    if diff.days > 365:
        years = diff.days // 365
        return f"{years}年前"
    if diff.days > 30:
        months = diff.days // 30
        return f"{months}个月前"
    if diff.days > 0:
        return f"{diff.days}天前"
    if diff.seconds > 3600:
        hours = diff.seconds // 3600
        return f"{hours}小时前"
    if diff.seconds > 60:
        minutes = diff.seconds // 60
        return f"{minutes}分钟前"
    return "刚刚"


def md5_hash(text: str) -> str:
    """计算MD5哈希"""
    return hashlib.md5(text.encode('utf-8')).hexdigest()


def sha256_hash(text: str) -> str:
    """计算SHA256哈希"""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def to_json(data: Any, indent: int = 2, ensure_ascii: bool = False) -> str:
    """安全地转换为JSON字符串"""
    return json.dumps(data, indent=indent, ensure_ascii=ensure_ascii, default=str)


def from_json(json_str: str, default: Any = None) -> Any:
    """安全地解析JSON字符串"""
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return default


def deep_merge(dict1: Dict, dict2: Dict) -> Dict:
    """深度合并两个字典"""
    result = dict1.copy()
    for key, value in dict2.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def flatten_list(nested_list: List[Any]) -> List[Any]:
    """扁平化嵌套列表"""
    result = []
    for item in nested_list:
        if isinstance(item, list):
            result.extend(flatten_list(item))
        else:
            result.append(item)
    return result


def remove_duplicates(lst: List[Any], preserve_order: bool = True) -> List[Any]:
    """移除列表中的重复项"""
    if preserve_order:
        seen = set()
        result = []
        for item in lst:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result
    return list(set(lst))


def chunk_list(lst: List[Any], chunk_size: int) -> List[List[Any]]:
    """将列表分块"""
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]


def safe_get(data: Union[Dict, List], path: str, default: Any = None) -> Any:
    """
    安全获取嵌套数据
    :param data: 字典或列表
    :param path: 路径，例如 "users.0.name"
    :param default: 默认值
    """
    try:
        keys = path.split('.')
        result = data
        for key in keys:
            if isinstance(result, dict):
                result = result[key]
            elif isinstance(result, list) and key.isdigit():
                result = result[int(key)]
            else:
                return default
        return result
    except (KeyError, IndexError, TypeError):
        return default


@timing
def benchmark(func: Callable, iterations: int = 1000, *args, **kwargs) -> Dict:
    """
    性能基准测试
    :param func: 要测试的函数
    :param iterations: 迭代次数
    """
    times = []
    for _ in range(iterations):
        start = time.time()
        func(*args, **kwargs)
        end = time.time()
        times.append(end - start)

    return {
        "iterations": iterations,
        "total_time": sum(times),
        "avg_time": sum(times) / len(times),
        "min_time": min(times),
        "max_time": max(times),
    }


class Cache:
    """简单的内存缓存类"""

    def __init__(self, default_ttl: int = 300):
        self._cache: Dict[str, tuple] = {}
        self.default_ttl = default_ttl

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """设置缓存"""
        ttl = ttl or self.default_ttl
        expiry = time.time() + ttl
        self._cache[key] = (value, expiry)

    def get(self, key: str, default: Any = None) -> Any:
        """获取缓存"""
        if key not in self._cache:
            return default

        value, expiry = self._cache[key]
        if time.time() > expiry:
            del self._cache[key]
            return default

        return value

    def delete(self, key: str) -> bool:
        """删除缓存"""
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    def clear(self) -> None:
        """清空所有缓存"""
        self._cache.clear()

    def cleanup_expired(self) -> int:
        """清理过期缓存，返回清理的数量"""
        now = time.time()
        expired_keys = [
            key for key, (_, expiry) in self._cache.items()
            if now > expiry
        ]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)

    def __contains__(self, key: str) -> bool:
        return key in self._cache and self._cache[key][1] > time.time()
