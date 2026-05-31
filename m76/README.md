# 🔐 加密笔记 - Encrypted Notes

跨平台 Electron 本地加密笔记应用，配合自托管同步服务器使用。

## ✨ 功能特性

- **AES-256 端到端加密**：笔记在本地使用 AES-256 算法加密，密钥由用户密码通过 PBKDF2 派生
- **Markdown 支持**：内置 Markdown 编辑器和实时预览
- **本地存储**：加密笔记安全存储在本地磁盘
- **自托管同步**：可配置的 Express 同步服务器，仅存储密文，无法解密内容
- **跨平台**：支持 Windows、macOS、Linux

## 🏗️ 项目结构

```
encrypted-notes/
├── client/                 # Electron 客户端
│   ├── main.js            # 主进程
│   ├── crypto.js          # 加密模块
│   ├── renderer.js        # 渲染进程
│   ├── index.html         # UI 界面
│   ├── style.css          # 样式文件
│   └── package.json
├── server/                 # Express 同步服务器
│   ├── server.js          # 服务器主文件
│   └── package.json
└── package.json           # 根目录配置
```

## 🚀 快速开始

### 安装依赖

```bash
npm run install:all
```

### 启动开发环境

```bash
# 同时启动服务器和客户端
npm run dev

# 或分别启动
# 启动服务器 (端口 3000)
npm run dev:server

# 启动 Electron 客户端
npm run dev:client
```

## 📖 使用说明

### 客户端使用

1. **首次使用**：
   - 打开应用后会提示输入加密密码
   - 此密码用于生成 AES-256 密钥，请牢记！
   - 密码丢失将无法恢复笔记内容

2. **创建笔记**：
   - 点击左侧「新建笔记」按钮
   - 输入笔记标题和 Markdown 内容
   - 点击「保存」按钮（笔记会自动加密后存储）

3. **查看笔记**：
   - 点击左侧笔记列表
   - 切换「编辑/预览」标签查看效果

4. **同步笔记**：
   - 确保同步服务器已启动
   - 点击「同步」按钮
   - 配置服务器地址（默认：http://localhost:3000）
   - 输入用户ID以区分不同用户

### 服务器部署

1. **本地运行**：
   ```bash
   cd server
   npm start
   ```

2. **生产环境部署**：
   - 使用 PM2 或 systemd 管理进程
   - 建议配置 Nginx 反向代理并启用 HTTPS
   - 数据存储在 `server/data/` 目录下

## 🔒 安全说明

### 加密机制

- **密钥派生**：使用 PBKDF2 算法，100,000 次迭代
- **加密算法**：AES-256-CBC 模式
- **随机盐值**：每个笔记使用独立的随机盐和 IV
- **端到端加密**：服务器仅存储密文，无法解密

### 数据存储

- **客户端**：存储在系统用户数据目录
  - Windows: `%APPDATA%/encrypted-notes/notes/`
  - macOS: `~/Library/Application Support/encrypted-notes/notes/`
  - Linux: `~/.config/encrypted-notes/notes/`

- **服务器**：存储在 `server/data/` 目录，每个用户一个 JSON 文件

## 🔌 API 接口

### 同步笔记

```
POST /sync
Content-Type: application/json

{
  "userId": "user123",
  "notes": {
    "note-id": {
      "ciphertext": "...",
      "salt": "...",
      "iv": "...",
      "timestamp": 1234567890
    }
  }
}
```

### 获取用户笔记

```
GET /notes/:userId
```

## 🛠️ 构建应用

```bash
cd client
npm run build
```

构建产物位于 `client/dist/` 目录。

## ⚠️ 注意事项

1. **密码管理**：应用不存储密码，也无法恢复。请务必牢记密码！
2. **数据备份**：建议定期备份本地笔记目录
3. **网络安全**：生产环境请使用 HTTPS 协议
4. **服务器安全**：建议在同步服务器前增加身份验证层

## 📝 License

MIT
