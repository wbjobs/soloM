# 积分系统数据库设计

## 核心逻辑

1. **赚取积分**：用户 Pin（固定）他人的文件 → 获得积分
2. **消费积分**：用户消耗积分 → 自己的文件获得更多 Pin 保障

## 表结构

### 1. users（用户表）

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT UNIQUE NOT NULL,           -- 用户唯一标识（钱包地址/随机ID）
  nickname TEXT NOT NULL,                 -- 昵称
  points INTEGER NOT NULL DEFAULT 100,    -- 积分余额（注册赠送100）
  total_earned INTEGER NOT NULL DEFAULT 0, -- 累计赚取
  total_spent INTEGER NOT NULL DEFAULT 0,  -- 累计消费
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 2. files（文件表）

```sql
CREATE TABLE files (
  cid TEXT PRIMARY KEY,                    -- IPFS CID
  name TEXT NOT NULL,                       -- 文件名
  size INTEGER NOT NULL,                    -- 文件大小
  mime_type TEXT NOT NULL,                  -- MIME 类型
  owner_id INTEGER NOT NULL,                -- 上传者用户ID
  pin_count INTEGER NOT NULL DEFAULT 0,     -- 被 Pin 次数（热度）
  reward_level INTEGER NOT NULL DEFAULT 0,  -- 奖励等级（0=无，1=基础，2=高级）
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

### 3. pins（Pin 记录表）

```sql
CREATE TABLE pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,                 -- Pin 者
  file_cid TEXT NOT NULL,                   -- 被 Pin 的文件
  created_at TEXT NOT NULL,
  UNIQUE(user_id, file_cid),                -- 同一用户不能重复 Pin 同一文件
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (file_cid) REFERENCES files(cid)
);
```

### 4. point_transactions（积分交易表）

```sql
CREATE TABLE point_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,                       -- 'earn' | 'spend'
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,                -- 描述（如 "Pin 文件 QmXYZ..."）
  ref_type TEXT,                            -- 关联类型：'pin' | 'reward'
  ref_id TEXT,                              -- 关联ID
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 积分规则

### 赚取积分

| 行为 | 积分 | 限制 |
|------|------|------|
| 新用户注册 | +100 | 一次性 |
| Pin 他人文件 | +10 | 每日最多 10 次，同一文件只算一次 |

### 消费积分

| 服务 | 积分消耗 | 效果 |
|------|----------|------|
| 基础 Pin 保障 | -50 | 标记为热门，优先被其他节点 Pin |
| 高级 Pin 保障 | -200 | 高优先级，置顶展示 |

## 索引

```sql
CREATE INDEX idx_files_owner ON files(owner_id);
CREATE INDEX idx_files_pin_count ON files(pin_count DESC);
CREATE INDEX idx_pins_user ON pins(user_id);
CREATE INDEX idx_pins_file ON pins(file_cid);
CREATE INDEX idx_tx_user ON point_transactions(user_id);
CREATE INDEX idx_tx_created ON point_transactions(created_at DESC);
CREATE INDEX idx_users_points ON users(points DESC);
```
