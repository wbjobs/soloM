# Docker 容器资源分析器

基于 Tauri (Rust + Vue3 + D3.js) 开发的桌面应用，用于分析本地 Docker 容器的资源占用。

## 功能特性

- **容器总览**: 实时显示所有容器状态、CPU、内存使用率
- **容器资源依赖拓扑图**: 使用 D3.js 力导向图展示容器间的网络关系
- **内存泄漏趋势图**: 实时监控容器内存使用趋势，辅助检测内存泄漏
- **容器日志查看**: 实时查看运行中容器的日志

## 项目架构

### 1. Rust 系统调用层 (`src-tauri/src/`)

```
src-tauri/src/
├── main.rs              # Tauri 应用入口
├── commands.rs          # Tauri 命令定义
└── docker/
    ├── mod.rs           # 模块导出
    ├── models.rs        # 数据模型定义
    └── client.rs        # Docker API 客户端
```

### 2. Tauri 桥接层

- 使用 `#[tauri::command]` 宏定义 Rust 命令
- 前端通过 `invoke()` 调用后端功能

### 3. 前端可视化层 (`src/`)

```
src/
├── App.vue              # 主应用组件
├── main.ts              # 应用入口
├── style.css            # 全局样式
├── types/
│   └── index.ts         # TypeScript 类型定义
├── api/
│   └── docker.ts        # Tauri 命令调用封装
└── components/
    ├── TopologyChart.vue   # 容器拓扑图 (D3.js 力导向图)
    └── MemoryChart.vue     # 内存趋势图 (D3.js 折线图)
```

## 技术栈

- **后端**: Rust + Tokio + Reqwest
- **前端框架**: Vue 3 + TypeScript
- **可视化**: D3.js
- **桌面框架**: Tauri
- **构建工具**: Vite

## 前置要求

1. **Docker**: 需要本地安装并运行 Docker Daemon
2. **Rust**: 1.60+
3. **Node.js**: 16+
4. **Windows 系统依赖** (Windows):
   - Microsoft Visual Studio C++ Build Tools
   - WebView2 (Windows 11 已预装)

## Docker 配置

确保 Docker Daemon 开启 TCP 端口 (2375) 监听：

**Windows (Docker Desktop)**:
1. 打开 Docker Desktop 设置
2. 进入 "General"
3. 勾选 "Expose daemon on tcp://localhost:2375 without TLS"

## 安装与运行

```bash
# 安装依赖
npm install

# 开发模式运行
npm run tauri:dev

# 构建生产版本
npm run tauri:build
```

## Docker API 调用说明

Rust 客户端通过 HTTP 调用 Docker Engine API:

| API 端点 | 功能 |
|---------|------|
| `GET /containers/json` | 获取容器列表 |
| `GET /containers/{id}/stats` | 获取容器资源统计 |
| `GET /containers/{id}/logs` | 获取容器日志 |

## 可视化图表

### 容器拓扑图
- **节点颜色**: 表示 CPU 负载状态（绿色-正常，黄色-中等，红色-高）
- **节点大小**: 表示内存使用率
- **连线**: 表示容器处于同一网络
- **交互**: 支持拖拽节点、悬停显示详情

### 内存趋势图
- 多容器内存使用对比
- 实时更新 (每 3 秒)
- 悬停显示具体数值
- 辅助识别内存泄漏模式

## 项目结构总结

```
.
├── src/                      # 前端 Vue3 代码
│   ├── components/           # D3.js 可视化组件
│   ├── api/                  # Tauri API 封装
│   └── types/                # TypeScript 类型
├── src-tauri/                # Rust 后端代码
│   ├── src/
│   │   ├── docker/           # Docker API 调用层
│   │   ├── commands.rs       # Tauri 命令桥接
│   │   └── main.rs           # 应用入口
│   ├── Cargo.toml            # Rust 依赖
│   └── tauri.conf.json       # Tauri 配置
├── package.json              # Node.js 依赖
└── vite.config.ts            # Vite 构建配置
```
