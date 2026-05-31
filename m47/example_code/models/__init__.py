"""
数据模型模块
定义数据库表结构和数据验证逻辑
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum


class Status(Enum):
    """状态枚举"""
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    DELETED = "deleted"


class Priority(Enum):
    """优先级枚举"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


@dataclass
class BaseModel:
    """基础模型类"""
    id: Optional[int] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    def update_timestamp(self):
        """更新时间戳"""
        self.updated_at = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        result = {}
        for key, value in self.__dict__.items():
            if isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, Enum):
                result[key] = value.value
            elif hasattr(value, 'to_dict'):
                result[key] = value.to_dict()
            else:
                result[key] = value
        return result


@dataclass
class UserProfile(BaseModel):
    """用户资料模型"""
    user_id: int = 0
    first_name: str = ""
    last_name: str = ""
    avatar_url: Optional[str] = None
    bio: str = ""
    phone: Optional[str] = None

    @property
    def full_name(self) -> str:
        """获取用户全名"""
        return f"{self.first_name} {self.last_name}".strip()

    def validate(self) -> List[str]:
        """验证数据，返回错误列表"""
        errors = []
        if not self.first_name:
            errors.append("名字不能为空")
        if not self.last_name:
            errors.append("姓氏不能为空")
        if self.phone and not self._validate_phone(self.phone):
            errors.append("手机号码格式不正确")
        return errors

    @staticmethod
    def _validate_phone(phone: str) -> bool:
        """验证手机号码格式"""
        import re
        pattern = r'^1[3-9]\d{9}$'
        return bool(re.match(pattern, phone))


@dataclass
class Post(BaseModel):
    """文章模型"""
    title: str = ""
    content: str = ""
    author_id: int = 0
    status: Status = Status.DRAFT
    priority: Priority = Priority.MEDIUM
    tags: List[str] = field(default_factory=list)
    view_count: int = 0
    like_count: int = 0

    def validate(self) -> List[str]:
        """验证文章数据"""
        errors = []
        if not self.title:
            errors.append("标题不能为空")
        if len(self.title) > 200:
            errors.append("标题长度不能超过200字符")
        if not self.content:
            errors.append("内容不能为空")
        if self.author_id <= 0:
            errors.append("作者ID无效")
        return errors

    def publish(self) -> bool:
        """发布文章"""
        errors = self.validate()
        if errors:
            return False
        self.status = Status.PUBLISHED
        self.update_timestamp()
        return True

    def add_tag(self, tag: str) -> None:
        """添加标签"""
        tag = tag.strip().lower()
        if tag and tag not in self.tags:
            self.tags.append(tag)

    def remove_tag(self, tag: str) -> bool:
        """移除标签"""
        tag = tag.strip().lower()
        if tag in self.tags:
            self.tags.remove(tag)
            return True
        return False

    def increment_views(self) -> int:
        """增加浏览次数"""
        self.view_count += 1
        return self.view_count

    def increment_likes(self) -> int:
        """增加点赞次数"""
        self.like_count += 1
        return self.like_count

    def get_summary(self, max_length: int = 150) -> str:
        """获取文章摘要"""
        if len(self.content) <= max_length:
            return self.content
        return self.content[:max_length].rstrip() + "..."


@dataclass
class Comment(BaseModel):
    """评论模型"""
    post_id: int = 0
    author_id: int = 0
    content: str = ""
    parent_id: Optional[int] = None
    is_approved: bool = False

    def validate(self) -> List[str]:
        """验证评论"""
        errors = []
        if not self.content.strip():
            errors.append("评论内容不能为空")
        if len(self.content) > 1000:
            errors.append("评论内容不能超过1000字符")
        if self.post_id <= 0:
            errors.append("文章ID无效")
        if self.author_id <= 0:
            errors.append("作者ID无效")
        return errors

    def approve(self) -> None:
        """批准评论"""
        self.is_approved = True
        self.update_timestamp()


def create_post(title: str, content: str, author_id: int) -> Post:
    """创建文章的工厂函数"""
    return Post(
        title=title,
        content=content,
        author_id=author_id,
    )


def create_comment(post_id: int, author_id: int, content: str, parent_id: Optional[int] = None) -> Comment:
    """创建评论的工厂函数"""
    return Comment(
        post_id=post_id,
        author_id=author_id,
        content=content,
        parent_id=parent_id,
    )
