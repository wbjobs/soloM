"""
用户认证模块
提供用户注册、登录、权限验证等功能
"""

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any


class User:
    """用户实体类"""

    def __init__(self, username: str, email: str, password_hash: str):
        self.username = username
        self.email = email
        self.password_hash = password_hash
        self.created_at = datetime.now()
        self.last_login: Optional[datetime] = None
        self.is_active: bool = True
        self.roles: list = ["user"]

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            "username": self.username,
            "email": self.email,
            "created_at": self.created_at.isoformat(),
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "is_active": self.is_active,
            "roles": self.roles,
        }


class AuthService:
    """认证服务类"""

    def __init__(self):
        self.users: Dict[str, User] = {}
        self.tokens: Dict[str, tuple] = {}
        self.token_expiry_hours = 24

    def _hash_password(self, password: str, salt: Optional[str] = None) -> tuple:
        """
        使用 SHA-256 哈希密码
        返回 (password_hash, salt)
        """
        if salt is None:
            salt = secrets.token_hex(16)

        password_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            100000
        ).hex()

        return f"{salt}${password_hash}", salt

    def _verify_password(self, password: str, stored_hash: str) -> bool:
        """验证密码是否正确"""
        try:
            salt, _ = stored_hash.split("$", 1)
            computed_hash, _ = self._hash_password(password, salt)
            return computed_hash == stored_hash
        except (ValueError, AttributeError):
            return False

    def register(self, username: str, email: str, password: str) -> Optional[User]:
        """
        注册新用户
        :param username: 用户名
        :param email: 邮箱
        :param password: 密码
        :return: 创建的用户对象，如果用户已存在则返回 None
        """
        if username in self.users:
            return None

        password_hash, _ = self._hash_password(password)
        user = User(username, email, password_hash)
        self.users[username] = user

        return user

    def login(self, username: str, password: str) -> Optional[str]:
        """
        用户登录
        :param username: 用户名
        :param password: 密码
        :return: 访问令牌，如果登录失败则返回 None
        """
        user = self.users.get(username)
        if not user or not user.is_active:
            return None

        if not self._verify_password(password, user.password_hash):
            return None

        user.last_login = datetime.now()
        token = secrets.token_hex(32)
        expiry = datetime.now() + timedelta(hours=self.token_expiry_hours)
        self.tokens[token] = (username, expiry)

        return token

    def verify_token(self, token: str) -> Optional[User]:
        """
        验证访问令牌
        :param token: 访问令牌
        :return: 关联的用户，如果令牌无效则返回 None
        """
        if token not in self.tokens:
            return None

        username, expiry = self.tokens[token]
        if datetime.now() > expiry:
            del self.tokens[token]
            return None

        return self.users.get(username)

    def logout(self, token: str) -> bool:
        """用户登出"""
        if token in self.tokens:
            del self.tokens[token]
            return True
        return False

    def add_role(self, username: str, role: str) -> bool:
        """为用户添加角色"""
        user = self.users.get(username)
        if user and role not in user.roles:
            user.roles.append(role)
            return True
        return False

    def has_role(self, username: str, role: str) -> bool:
        """检查用户是否拥有指定角色"""
        user = self.users.get(username)
        return user is not None and role in user.roles

    def cleanup_expired_tokens(self) -> int:
        """清理过期的令牌，返回清理的数量"""
        now = datetime.now()
        expired_tokens = [
            token for token, (_, expiry) in self.tokens.items()
            if now > expiry
        ]
        for token in expired_tokens:
            del self.tokens[token]
        return len(expired_tokens)


def create_auth_service() -> AuthService:
    """创建认证服务实例"""
    return AuthService()


if __name__ == "__main__":
    auth = create_auth_service()

    user = auth.register("admin", "admin@example.com", "password123")
    if user:
        print(f"用户注册成功: {user.username}")

    token = auth.login("admin", "password123")
    if token:
        print(f"登录成功，令牌: {token[:20]}...")

    verified_user = auth.verify_token(token)
    if verified_user:
        print(f"令牌验证成功: {verified_user.username}")
