# 🔒 加密笔记 - 跨平台本地优先的加密笔记客户端

一个基于 Tauri 构建的跨平台桌面笔记应用，采用本地优先策略，所有数据都在本地进行 AES-256-GCM 加密存储。

## ✨ 功能特性

- **本地优先**：所有数据存储在本地，无需云端
- **端到端加密**：使用 AES-256-GCM 算法加密笔记内容
- **系统密钥环**：加密密钥安全存储在系统密钥链中（Windows Credential Manager / macOS Keychain / Linux Secret Service）
- **SQLite 数据库**：高性能本地数据库存储
- **富文本编辑**：支持纯文本笔记编辑
- **搜索功能**：支持笔记标题和内容搜索
- **跨平台**：支持 Windows、macOS、Linux

## 🏗️ 技术架构

### 后端（Rust - Tauri 主进程）

- **加密层** ([crypto.rs](file:///e:/soloM/m86/src-tauri/src/crypto.rs))
  - AES-256-GCM 对称加密
  - 系统密钥环集成（keyring crate）
  - 安全的随机数生成

- **数据层** ([database.rs](file:///e:/soloM/m86/src-tauri/src/database.rs))
  - SQLite 数据库（rusqlite）
  - 笔记 CRUD 操作
  - 数据加密/解密透明处理

- **API 层** ([main.rs](file:///e:/soloM/m86/src-tauri/src/main.rs))
  - Tauri 命令暴露给前端
  - 数据库初始化管理
  - 线程安全的状态管理

### 前端（React + TypeScript）

- **API 层** ([api/index.ts](file:///e:/soloM/m86/src/api/index.ts)) - Tauri 命令调用封装
- **类型定义** ([types/index.ts](file:///e:/soloM/m86/src/types/index.ts)) - TypeScript 接口定义
- **主组件** ([App.tsx](file:///e:/soloM/m86/src/App.tsx)) - 完整的 UI 逻辑
  - 侧边栏笔记列表
  - 笔记编辑器
  - 搜索功能

## 📦 安装与运行

### 前置要求

1. **Node.js** (v18+)
2. **Rust** (最新稳定版)
3. **Windows 构建工具**（仅 Windows）：
   - 安装 Visual Studio Build Tools
   - 勾选 "Desktop development with C++"
   - 确保 `dlltool.exe` 可用（可通过 MinGW 或 MSYS2 安装）

### 开发运行

```bash
# 安装依赖
npm install

# 启动开发模式
npm run tauri dev
```

### 构建生产版本

```bash
npm run tauri build
```

## 🔐 安全设计

### 加密流程

1. **首次启动**：自动生成 256 位（32 字节）加密密钥
2. **密钥存储**：密钥通过系统密钥环安全存储
3. **数据加密**：
   - 每条笔记的标题和内容单独加密
   - 使用 12 字节随机 nonce（每次加密唯一）
   - AES-256-GCM 提供机密性和完整性校验
4. **数据库**：加密后的数据存储在 SQLite 中

### 数据位置

- **Windows**: `%APPDATA%\EncryptedNotes\notes.db`
- **macOS**: `~/Library/Application Support/EncryptedNotes/notes.db`
- **Linux**: `~/.local/share/EncryptedNotes/notes.db`

## 📁 项目结构

```
.
├── src/                          # 前端源代码
│   ├── api/index.ts              # API 调用层
│   ├── types/index.ts            # TypeScript 类型
│   ├── App.tsx                   # 主应用组件
│   ├── index.css                 # 全局样式
│   └── main.tsx                  # 入口文件
├── src-tauri/                    # Tauri 后端
│   ├── src/
│   │   ├── crypto.rs             # 加密模块
│   │   ├── database.rs           # 数据库模块
│   │   ├── models.rs             # 数据模型
│   │   └── main.rs               # 主程序
│   ├── Cargo.toml                # Rust 依赖
│   └── tauri.conf.json           # Tauri 配置
├── package.json                  # npm 配置
└── README.md                     # 项目说明
```

## 🚀 API 接口（Tauri Commands）

| 命令 | 说明 |
|------|------|
| `initialize_database` | 初始化数据库连接 |
| `create_note` | 创建新笔记 |
| `get_notes` | 获取所有笔记列表 |
| `get_note_by_id` | 根据 ID 获取笔记 |
| `update_note` | 更新笔记内容 |
| `delete_note` | 删除笔记 |
| `search_notes` | 搜索笔记 |

## 🛡️ 注意事项

1. **密钥备份**：请确保系统密钥环已备份，丢失密钥将导致所有数据无法解密
2. **数据安全**：数据库文件本身不加密，但内容是逐字段加密的
3. **密码保护**：当前版本使用系统密钥环，未来可添加主密码保护

## 🐛 Bug 修复记录

### Linux 系统休眠唤醒后 IPC 通信断开问题

**问题描述**: 在 Linux 系统下，系统休眠唤醒后，主进程与渲染进程之间的 IPC 通信通道断开，导致无法保存新笔记且界面无响应。

**根本原因**:
1. SQLite 数据库连接在休眠后文件描述符失效
2. 系统密钥环（Secret Service）会话在休眠后需要重新认证
3. Mutex 锁在休眠时可能被持有，导致唤醒后死锁
4. Tauri WebView 在唤醒后可能重建 IPC 通道，导致状态不同步

**修复方案**:

| 模块 | 修复内容 | 文件 |
|------|----------|------|
| **数据库层** | 连接健康检查 + 自动重连，5秒间隔心跳检测，最多5次指数退避重试 | [database.rs](file:///e:/soloM/m86/src-tauri/src/database.rs) |
| **电源管理** | Linux logind DBus 监听 `PrepareForSleep` 信号，休眠前清理资源，唤醒后自动恢复 | [power.rs](file:///e:/soloM/m86/src-tauri/src/power.rs) |
| **状态管理** | `AppState` 添加连接状态标志、错误信息、唤醒通道 | [main.rs](file:///e:/soloM/m86/src-tauri/src/main.rs) |
| **IPC 重试** | 所有数据库操作使用 `with_retry` 包装，失败自动重试3次 | [main.rs](file:///e:/soloM/m86/src-tauri/src/main.rs) |
| **密钥刷新** | 重连时重新从密钥环获取密钥，刷新加密服务 | [database.rs](file:///e:/soloM/m86/src-tauri/src/database.rs) |
| **前端事件** | 监听 `connection-status`、`power-event`、`wakeup-recovery` 事件 | [api/index.ts](file:///e:/soloM/m86/src/api/index.ts) |
| **UI 反馈** | 连接状态横幅、连接指示灯、手动重连按钮、错误提示 Toast | [App.tsx](file:///e:/soloM/m86/src/App.tsx) |

**恢复流程**:
```
系统休眠 → 收到 PrepareForSleep(true) → 标记断开连接 → 系统唤醒
      ↓
收到 PrepareForSleep(false) → 触发恢复流程 → 尝试重连数据库
      ↓
成功 → 发送连接恢复事件 → 刷新笔记列表 → UI 恢复正常
      ↓
失败 → 重试5次（指数退避）→ 全部失败 → 提示用户手动重连
```

**新增 Tauri Commands**:
- `reconnect_database` - 手动重连数据库
- `get_connection_status` - 获取当前连接状态
- `health_check` - 健康检查
- `refresh_encryption_key` - 刷新加密密钥

## 📝 License

MIT License
