# 基于 CRDT 的离线优先协同代码编辑器

一个支持离线编辑的协同代码编辑器，使用 Yjs CRDT 算法实现多端无冲突数据同步。

## 技术架构

### 核心技术栈

- **前端**: React 18 + Monaco Editor
- **后端**: Node.js + Express + WebSocket
- **CRDT 算法**: Yjs
- **本地存储**: IndexedDB (y-indexeddb)
- **同步协议**: WebSocket (y-websocket)

### 项目结构

```
m94/
├── client/                    # 前端 React 应用
│   ├── src/
│   │   ├── components/        # UI 组件
│   │   │   ├── CodeEditor.js        # Monaco 编辑器组件
│   │   │   ├── ConnectionStatus.js  # 连接状态组件
│   │   │   ├── RoomJoin.js          # 房间加入页面
│   │   │   └── UserList.js          # 在线用户列表
│   │   ├── hooks/             # 自定义 Hooks
│   │   │   ├── useCRDT.js           # CRDT 服务 Hook
│   │   │   └── useNetworkStatus.js  # 网络状态 Hook
│   │   ├── services/          # 业务服务
│   │   │   ├── crdtService.js       # CRDT 同步服务
│   │   │   └── storageService.js    # IndexedDB 存储服务
│   │   └── App.js             # 主应用组件
│   └── package.json
└── server/                    # 后端 WebSocket 服务
    ├── server.js              # 主服务器入口
    ├── y-websocket-server.js  # Yjs WebSocket 服务器实现
    └── package.json
```

## 核心功能模块

### 1. CRDT 算法模块 (`crdtService.js`)

**实现原理**:
- 使用 Yjs 提供的 Conflict-free Replicated Data Type (CRDT)
- 核心数据结构: `Y.Text` 用于文本内容存储
- 每个客户端拥有独立的 Y.Doc 实例
- 操作以增量更新的形式传播，而非全量同步

**关键特性**:
- 自动处理并发编辑冲突
- 保持因果一致性
- 支持离线编辑后的无缝合并

```javascript
// 核心代码片段
const ydoc = new Y.Doc();
const ytext = ydoc.getText('monaco');

// 监听文档更新
ydoc.on('update', (update, origin) => {
  // 同步更新到其他客户端
});

// Monaco Editor 绑定
new MonacoBinding(ytext, editor.getModel(), editors, awareness);
```

### 2. WebSocket 同步服务 (`y-websocket-server.js`)

**实现原理**:
- 基于原生 WebSocket 实现 Yjs 同步协议
- 支持多房间隔离
- 服务端维护每个房间的 Y.Doc 实例
- 使用二进制协议传输 CRDT 更新

**消息类型**:
- `messageSync (0)`: CRDT 文档同步
- `messageAwareness (1)`: 在线状态和光标位置
- `messageAuth (2)`: 认证信息

**同步流程**:
1. 客户端连接 → 发送 Sync Step 1 (状态向量)
2. 服务器响应 Sync Step 2 (缺失的更新)
3. 双向实时同步增量更新

### 3. IndexedDB 本地存储模块 (`storageService.js`)

**实现原理**:
- 使用 `y-indexeddb` 实现 Yjs 文档的本地持久化
- 自动将所有 CRDT 操作保存到浏览器 IndexedDB
- 离线时从本地加载文档
- 恢复网络后自动与服务器同步

**数据持久化**:
- 用户设置 (userId, userName, 颜色)
- 最近访问的房间列表
- 每个房间的完整编辑历史 (通过 Yjs 更新)

```javascript
// IndexedDB 持久化
const indexeddbProvider = new IndexeddbPersistence(
  `crdt-editor-${roomName}`,
  ydoc
);

indexeddbProvider.on('synced', () => {
  console.log('本地数据已加载');
});
```

### 4. 网络状态管理 (`useNetworkStatus.js`)

**实现原理**:
- 监听浏览器 `online` / `offline` 事件
- WebSocket 心跳检测
- 指数退避自动重连机制
- 离线时缓存所有编辑操作

**状态流转**:
```
在线 → 连接中断 → 离线模式 (本地存储) → 恢复网络 → 自动重连 → 同步合并
```

## 多用户协同特性

### 在线用户列表
- 实时显示所有在线用户
- 每个用户有唯一的标识颜色
- 显示用户的光标位置

### 光标跟随
- 通过 Yjs Awareness 协议同步光标位置
- 编辑器中显示其他用户的光标和选区
- 不同用户使用不同颜色区分

### 房间管理
- 支持创建/加入多个房间
- 房间数据相互隔离
- 最近访问房间记录

## 启动方式

### 1. 启动后端服务

```bash
cd server
npm install
npm start
```

后端服务将运行在 `http://localhost:1234`

### 2. 启动前端应用

```bash
cd client
npm install
npm start
```

前端应用将运行在 `http://localhost:3000`

## 使用指南

### 多人协同测试
1. 打开两个浏览器窗口访问 `http://localhost:3000`
2. 在两个窗口中输入相同的房间名称（例如 `test-room`）
3. 在任意编辑器中输入内容，观察另一个窗口的实时同步

### 离线功能测试
1. 打开编辑器并输入一些内容
2. 断开网络连接（浏览器开发者工具 → Network → Offline）
3. 继续编辑内容（内容自动保存到本地）
4. 恢复网络连接
5. 观察离线期间的编辑自动同步到服务器和其他客户端

## CRDT 工作原理

### 什么是 CRDT？
CRDT (Conflict-free Replicated Data Type) 是一种数据结构，可以在多个节点之间复制，并且这些节点可以独立地更新，而不需要在更新之间进行协调，保证最终一致性。

### Yjs 如何工作？
Yjs 使用一种叫做 "YATA" 的 CRDT 算法，专门为文本编辑优化：
1. 每个字符都有唯一的标识符，包含创建者信息
2. 插入操作不会覆盖，而是在特定位置插入新字符
3. 删除操作标记墓碑，不会物理删除
4. 合并时根据字符 ID 和位置信息自动排序

### 为什么不会产生冲突？
- 并发插入相同位置：根据字符 ID 排序，结果确定
- 并发删除相同内容：幂等操作，结果一致
- 并发插入和删除：因果一致性保证正确结果

## API 接口

### HTTP API
- `GET /api/rooms` - 获取所有活跃房间
- `GET /api/rooms/:roomName` - 获取指定房间信息

### WebSocket 协议
- 连接 URL: `ws://localhost:1234?room=xxx&userId=xxx&userName=xxx&color=xxx`
- 二进制协议: Yjs 同步协议

## 依赖说明

### 后端依赖
- `yjs`: CRDT 核心库
- `ws`: WebSocket 服务器
- `express`: HTTP 服务器
- `lib0`: Yjs 工具库

### 前端依赖
- `yjs`: CRDT 核心库
- `y-monaco`: Monaco Editor 绑定
- `y-websocket`: WebSocket 客户端
- `y-indexeddb`: IndexedDB 持久化
- `@monaco-editor/react`: Monaco Editor React 封装
- `monaco-editor`: 代码编辑器

## 扩展功能建议

1. **文档历史**: 实现版本历史和撤销/重做
2. **评论系统**: 支持代码评论和讨论
3. **文件树**: 支持多文件编辑
4. **实时编译**: 集成代码运行和调试
5. **权限管理**: 房间访问控制
6. **端到端加密**: 保护编辑内容安全

## 注意事项

1. 生产环境建议使用 Redis 或其他持久化存储替代内存存储
2. 需要配置反向代理（如 Nginx）处理 WebSocket 连接
3. 考虑使用 CDN 加速静态资源
4. 大文档可能需要优化 CRDT 合并性能
