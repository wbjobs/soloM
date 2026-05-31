# RAG 知识库问答助手 - 前端

基于 Vue 3 + TypeScript + Tailwind CSS 的知识库问答前端界面。

## 功能特性

- 📄 文档上传与管理（支持 PDF、Markdown、TXT）
- 💬 流式对话界面，实时显示回答
- 📚 可选择特定文档进行问答
- 🔍 显示参考来源和相似度
- 🎨 美观的现代化界面设计

## 技术栈

- **框架**: Vue 3 + Composition API
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **状态管理**: Pinia
- **路由**: Vue Router
- **HTTP 客户端**: Axios
- **Markdown 渲染**: marked
- **构建工具**: Vite

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 项目结构

```
src/
├── api/              # API 接口定义
├── components/       # 可复用组件
├── router/           # 路由配置
├── stores/           # Pinia 状态管理
├── views/            # 页面视图
├── App.vue           # 根组件
├── main.ts           # 入口文件
└── style.css         # 全局样式
```

## 配置

复制 `.env.example` 为 `.env` 并修改配置：

```
VITE_API_BASE_URL=http://localhost:8000/api
```

## 主要页面

### 对话页面 (`/`)
- 流式对话界面
- 支持 Markdown 渲染
- 显示参考来源
- 可选择检索数量
- 侧边栏文档选择

### 文档管理页面 (`/documents`)
- 拖拽上传文档
- 显示上传进度
- 文档列表管理
- 删除文档
