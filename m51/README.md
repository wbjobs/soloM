# WebRTC P2P 去中心化文件传输平台

一个基于 WebRTC DataChannel 的去中心化文件传输平台，支持 Mesh 网络拓扑和大文件分片传输。

## 技术架构

### 后端（信令服务器）
- **Node.js + Express** - HTTP 服务器
- **WebSocket** - 信令通信
- **功能**：房间管理、信令转发、Peer 状态监控

### 前端
- **React + Vite** - 前端框架
- **WebRTC DataChannel** - P2P 数据传输
- **SparkMD5** - 文件哈希计算
- **功能**：文件分片、Mesh 调度、传输状态监控

## 核心功能

### 1. WebRTC P2P 直连
- 通过信令服务器交换 SDP 和 ICE 候选
- 使用 STUN 服务器进行 NAT 穿透
- 自动重连机制

### 2. 大文件分片传输
- 默认分片大小：256KB
- MD5 哈希校验（分片计算）
- 断点续传支持

### 3. Mesh 网络拓扑
- 多对多连接
- 分片并行传输
- 多源下载加速

### 4. 房间管理
- 创建/加入房间
- 房间成员列表
- 自动建立 Peer 连接

### 5. 状态监控
- 实时连接状态
- Mesh 网络拓扑可视化
- 传输进度追踪

## 快速开始

### 1. 启动后端信令服务器
```bash
cd server
npm install
npm start
```
服务器运行在 `http://localhost:8080`

### 2. 启动前端开发服务器
```bash
cd client
npm install
npm run dev
```
前端运行在 `http://localhost:3000`

## 使用说明

### 步骤 1: 连接到房间
1. 打开两个浏览器窗口，都访问 `http://localhost:3000`
2. 在第一个窗口点击"生成"创建房间 ID，然后点击"加入房间"
3. 在第二个窗口输入相同的房间 ID，点击"加入房间"
4. 等待几秒，两个节点会自动建立 P2P 连接

### 步骤 2: 发送文件
1. 在任意一个窗口拖拽或点击选择文件
2. 文件会自动计算 MD5 哈希
3. 点击"发送"按钮
4. 另一个窗口会收到文件请求，点击"接收"开始下载

### 步骤 3: 多节点传输
1. 打开第三个浏览器窗口，加入同一房间
2. Mesh 网络会自动形成
3. 文件传输时会自动利用多个源并行下载

## 项目结构

```
├── server/                    # 后端信令服务器
│   ├── src/
│   │   └── server.js         # 服务器主文件
│   └── package.json
│
└── client/                    # 前端应用
    ├── src/
    │   ├── components/       # React 组件
    │   │   ├── RoomManager.jsx      # 房间管理
    │   │   ├── ConnectionMonitor.jsx # 连接监控
    │   │   └── FileTransfer.jsx      # 文件传输
    │   ├── lib/              # 核心库
    │   │   ├── signalingClient.js    # 信令客户端
    │   │   ├── webrtcManager.js      # WebRTC 管理
    │   │   ├── fileChunker.js        # 文件分片
    │   │   └── meshTransferManager.js # Mesh 调度
    │   ├── styles/
    │   │   └── index.css     # 全局样式
    │   ├── App.jsx           # 主应用
    │   └── main.jsx          # 入口文件
    └── package.json
```

## 核心模块说明

### signalingClient.js
- WebSocket 连接管理
- 房间加入/离开
- 信令消息收发

### webrtcManager.js
- RTCPeerConnection 管理
- DataChannel 建立
- 连接状态监控

### fileChunker.js
- 文件分片处理
- MD5 哈希计算
- Blob 合并与下载

### meshTransferManager.js
- 分片调度算法
- 多源并行下载
- 传输状态追踪

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## 注意事项

1. **WebRTC 需要 HTTPS**：生产环境必须使用 HTTPS
2. **STUN/TURN 服务器**：复杂网络环境可能需要 TURN 服务器
3. **文件大小限制**：浏览器内存限制，建议单文件不超过 2GB
4. **局域网测试**：同一局域网内传输效果最佳

## 扩展建议

- 添加 TURN 服务器支持
- 实现文件加密传输
- 添加传输队列管理
- 支持文件夹传输
- 添加历史记录功能
