# Markdown 编辑器 - WASM PDF 导出

一个纯前端为主、后端辅助的 Markdown 编辑器，使用 WebAssembly 在浏览器本地完成 Markdown 到 PDF 的渲染与导出。

## 技术栈

### 前端
- **Vite** - 构建工具
- **CodeMirror 6** - 代码编辑器（支持 Markdown 语法高亮）
- **Marked** - Markdown 解析和渲染
- **Typst WASM** - WebAssembly PDF 生成引擎
- **DOMPurify** - HTML 安全清理

### 后端
- **Node.js + Express** - Web 服务器
- **SQLite (better-sqlite3)** - 轻量级数据库
- **CORS** - 跨域支持

## 功能特性

1. ✅ 左侧 Markdown 源码编辑区（支持代码高亮）
2. ✅ 右侧实时预览区
3. ✅ WebAssembly 本地 PDF 导出（无需服务端）
4. ✅ 后端保存用户历史文档记录
5. ✅ 响应式布局设计

## 项目结构

```
m41/
├── frontend/                 # 前端项目
│   ├── src/
│   │   ├── main.js          # 主入口文件
│   │   ├── pdfExport.js     # WASM PDF 导出模块
│   │   └── style.css        # 样式文件
│   ├── index.html           # HTML 入口
│   ├── vite.config.js       # Vite 配置
│   └── package.json         # 前端依赖
├── backend/                  # 后端项目
│   ├── server.js            # Express 服务器
│   └── package.json         # 后端依赖
└── README.md                # 项目说明
```

## 快速开始

### 1. 安装依赖

**安装前端依赖：**
```bash
cd frontend
npm install
```

**安装后端依赖：**
```bash
cd ../backend
npm install
```

### 2. 启动服务

**启动后端服务（端口 3000）：**
```bash
cd backend
npm start
```

**启动前端开发服务器（端口 5173）：**
```bash
cd frontend
npm run dev
```

### 3. 访问应用

打开浏览器访问：http://localhost:5173

## 使用说明

### 编辑 Markdown
- 在左侧编辑区输入 Markdown 内容
- 右侧会实时显示渲染效果

### 保存文档
- 点击「💾 保存文档」按钮保存到后端 SQLite 数据库

### 查看历史记录
- 点击「📜 历史记录」按钮查看和加载历史文档

### 导出 PDF (WASM)
- 点击「📄 导出 PDF (WASM)」按钮
- 系统使用 WebAssembly 在浏览器本地生成 PDF 文件
- 无需上传到服务器，保护隐私

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/documents` | 获取所有文档列表 |
| GET | `/api/documents/:id` | 获取单个文档 |
| POST | `/api/documents` | 创建新文档 |
| PUT | `/api/documents/:id` | 更新文档 |
| DELETE | `/api/documents/:id` | 删除文档 |
| GET | `/api/health` | 健康检查 |

## WebAssembly 核心实现

项目使用 Typst 的 WebAssembly 实现来本地生成 PDF：

```javascript
// pdfExport.js 中的核心逻辑
import { createTypstRenderer } from '@myriaddreamin/typst.ts';

const renderer = await createTypstRenderer();
await renderer.init({
  getModule: () => import('@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url'),
});

// 渲染 PDF
const pdfData = await session.renderPdf();
```

**优势：**
- 🚀 高性能：WASM 接近原生速度
- 🔒 隐私保护：所有处理在本地完成
- ⚡ 离线可用：无需网络连接
- 💾 节省带宽：无需上传下载大文件

## 开发说明

### 前端代理配置
Vite 已配置代理到后端，所有 `/api/*` 请求会自动转发到 `http://localhost:3000`。

### WASM 支持
Vite 配置了 `vite-plugin-wasm` 和 `vite-plugin-top-level-await` 插件，支持 WebAssembly 模块加载。

## 许可证

MIT
