# 离线优先协同代码片段管理器

基于 Yjs (CRDT算法) 的离线优先协同代码片段管理工具

## 技术栈

### 后端
- Node.js + Express
- WebSocket
- MongoDB
- Yjs (CRDT)
- JWT 认证

### 前端
- React 18
- TypeScript
- Monaco Editor
- Yjs + y-websocket + y-indexeddb
- Zustand

## 项目结构

```
.
├── backend/                 # 后端代码
│   ├── src/
│   │   ├── models/     # MongoDB 数据模型
│   │   ├── middleware/   # 中间件 (JWT认证)
│   │   ├── routes/     # API路由
│   │   ├── websocket/  # Yjs WebSocket服务器
│   │   └── server.ts  # 服务器入口
│   └── package.json
└── frontend/              # 前端代码
    ├── src/
    │   ├── components/    # React组件
    │   ├── pages/         # 页面组件
    │   ├── store/        # Zustand状态管理
    │   ├── yjs/          # Yjs客户端
    │   └── main.tsx       # 入口
    └── package.json
    └── vite.config.ts
```

## 快速开始

### 前置要求
- Node.js 18+
- MongoDB 5.0+

### 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 启动服务

```bash
# 启动 MongoDB (确保 MongoDB 服务已运行)

# 启动后端服务 (端口 3001)
cd backend
npm run dev

# 启动前端开发服务器 (端口 3000)
cd frontend
npm run dev
```

### 访问应用

打开浏览器访问: http://localhost:3000

## 核心功能

### 离线优先
- 使用 IndexedDB 本地存储
- 断网时可正常编辑
- 网络恢复后自动同步

### 协同编辑
- Yjs CRDT 算法实现无冲突合并
- WebSocket 实时同步
- 多客户端自动冲突解决

### 用户认证
- JWT Token 认证
- 注册/登录功能
- Token 持久化存储

### 代码编辑
- Monaco Editor 代码编辑器
- 多语言支持
- 语法高亮

## API 接口

### 认证
- `POST /api/auth/register - 用户注册
- `POST /api/auth/login - 用户登录

### 代码片段
- `GET /api/snippets - 获取代码片段列表
- `GET /api/snippets/:id - 获取单个代码片段
- `POST /api/snippets - 创建代码片段
- `DELETE /api/snippets/:id - 删除代码片段

### WebSocket
- `ws://localhost:3001/ws/:snippetId - Yjs 实时同步

## 环境变量

### 后端 (.env)
```
PORT=3001
MONGODB_URI=mongodb://localhost:27017/code-snippet-manager
JWT_SECRET=your-secret-key
```
