# RAG 代码库智能问答助手

一个基于 RAG（检索增强生成）技术的本地代码库智能问答系统。它可以索引你的代码仓库，让你通过自然语言提问来获取关于代码的详细解答。

## ✨ 功能特性

- 🔍 **智能代码检索**：基于语义相似度检索相关代码片段
- 📁 **多语言支持**：支持 Python、JavaScript、TypeScript、Java、C++、Go、Rust 等多种编程语言
- 🔄 **实时索引更新**：使用 Watchdog 监听代码目录变动，自动更新索引
- 🧩 **智能分块**：按函数、类等代码结构进行分块，提高检索准确度
- 🤖 **双 LLM 支持**：支持本地 Ollama 和 OpenAI 接口
- 💬 **流式回答**：支持流式输出，实时展示回答
- 📎 **引用展示**：回答中展示引用的代码文件路径和行号
- 🎨 **美观界面**：现代化的聊天界面，深色主题

## 🏗️ 项目结构

```
m47/
├── backend/                 # 后端代码
│   ├── __init__.py
│   ├── config.py           # 配置管理
│   ├── code_splitter.py    # 代码分块模块
│   ├── code_loader.py      # 代码加载模块
│   ├── embeddings.py       # Embedding 模块
│   ├── vector_store.py     # 向量数据库模块
│   ├── file_watcher.py     # 文件监听模块
│   ├── rag_service.py      # RAG 问答服务
│   └── main.py             # FastAPI 主入口
├── frontend/               # 前端代码
│   ├── index.html          # 主页面
│   ├── style.css           # 样式文件
│   └── app.js              # 前端逻辑
├── example_code/           # 示例代码目录
├── data/
│   └── chroma/             # ChromaDB 数据存储
├── requirements.txt        # Python 依赖
├── .env.example           # 环境变量示例
├── .env                   # 环境变量配置
└── start.py               # 启动脚本
```

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并根据需要修改：

```bash
cp .env.example .env
```

主要配置项：

```env
# LLM 提供商：ollama 或 openai
LLM_PROVIDER=ollama

# Ollama 配置（使用本地模型）
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=qwen2.5:7b

# OpenAI 配置（使用云端 API）
OPENAI_API_KEY=your-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-3.5-turbo

# 代码目录配置
CODE_DIR=./example_code
FILE_EXTENSIONS=.py,.js,.ts,.java,.cpp,.c,.h,.go,.rs,.rb,.php,.cs
```

### 3. 准备 LLM 服务

#### 选项 A：使用本地 Ollama（推荐）

1. 安装 Ollama：https://ollama.ai/

2. 下载所需模型：

```bash
# 下载 Embedding 模型
ollama pull nomic-embed-text

# 下载聊天模型（推荐 qwen2.5 或 mistral）
ollama pull qwen2.5:7b
```

3. 启动 Ollama 服务：

```bash
ollama serve
```

#### 选项 B：使用 OpenAI API

1. 获取 OpenAI API Key
2. 在 `.env` 中设置 `LLM_PROVIDER=openai`
3. 配置你的 API Key

### 4. 准备代码目录

将你想要索引的代码放入 `CODE_DIR` 指定的目录（默认为 `./example_code`）。项目已包含一些示例代码供测试。

### 5. 启动应用

```bash
python start.py
```

启动后访问：
- 🌐 聊天界面：http://localhost:8000/static/index.html
- 📚 API 文档：http://localhost:8000/docs
- 🏠 API 根路径：http://localhost:8000

## 💡 使用说明

### 聊天界面

1. 在输入框中输入你的问题，例如：
   - "解释一下 User 类的作用"
   - "AuthService 中的 register 方法是如何工作的？"
   - "如何使用 Cache 类？"
   - "数据库查询构建器有哪些功能？"

2. 按 Enter 发送，Shift + Enter 换行

3. 助手会基于代码库中的内容给出回答，并在回答底部展示引用的代码文件

### 侧边栏功能

- **索引信息**：查看当前索引的文档数量、文件数量等
- **重新索引**：强制重新扫描并索引所有代码文件
- **清空索引**：清空当前向量数据库
- **已索引文件**：查看所有已索引的文件列表
- **最近变更**：查看文件监听模块捕获的文件变更

### 实时索引

应用启动后，文件监听模块会自动监控 `CODE_DIR` 目录下的所有代码文件：
- 📝 创建新文件 → 自动索引
- ✏️ 修改文件 → 自动更新索引
- 🗑️ 删除文件 → 自动从索引中移除

## 🔌 API 接口

### 健康检查
```http
GET /api/health
```

### 获取统计信息
```http
GET /api/stats
```

### 提问（非流式）
```http
POST /api/query
Content-Type: application/json

{
    "query": "解释一下 User 类的作用",
    "chat_history": [{"role": "user", "content": "..."}],
    "k": 5
}
```

### 提问（流式）
```http
POST /api/query/stream
Content-Type: application/json

{
    "query": "解释一下 User 类的作用",
    "chat_history": []
}
```

### 触发索引
```http
POST /api/index
Content-Type: application/json

{
    "code_dir": "./example_code",
    "force_reindex": true
}
```

### 获取已索引文件
```http
GET /api/files
```

### 清空索引
```http
DELETE /api/index
```

## 🎯 核心技术

### 后端技术栈
- **FastAPI**：高性能 Web 框架
- **LangChain**：LLM 应用开发框架
- **ChromaDB**：向量数据库
- **Watchdog**：文件系统事件监听
- **Tree-sitter**（可选）：代码语法解析

### 代码分块策略

1. **结构感知分块**：按函数、类等代码结构进行分块
2. **语言特定分块**：针对不同编程语言使用不同的分块规则
3. **递归分块**：对于过大的代码块，使用 LangChain 的递归分块器进一步分割
4. **元数据增强**：每个代码块包含文件路径、行号范围、类型、名称等元数据

### RAG 流程

```
用户问题
    ↓
Query Embedding 生成
    ↓
向量相似度检索（Top-K）
    ↓
相关代码片段重排序
    ↓
构建 Prompt（包含代码上下文）
    ↓
LLM 生成回答
    ↓
返回回答 + 引用的代码文件
```

## ⚙️ 优化建议

### 提高检索准确度

1. **调整相似度阈值**：在 `.env` 中修改 `SIMILARITY_THRESHOLD`（默认 0.5）
2. **调整检索数量**：修改 `TOP_K_RETRIEVE`（默认 5）
3. **调整分块大小**：修改 `CHUNK_SIZE` 和 `CHUNK_OVERLAP`

### 提高回答质量

1. 使用更大的 LLM 模型（如 `qwen2.5:14b` 或 `gpt-4`）
2. 提供更具体的问题
3. 在问题中包含相关的文件名或函数名

### 性能优化

1. 使用 GPU 加速 Ollama 推理
2. 对于大型代码库，考虑使用批量索引
3. 定期清理过期的向量数据

## ❓ 常见问题

### Q: 启动时报错 "No model found"
A: 确保你已经使用 `ollama pull` 下载了所需的模型，并且 Ollama 服务正在运行。

### Q: 回答质量不高怎么办？
A: 可以尝试：
- 增加 `TOP_K_RETRIEVE` 值以检索更多上下文
- 降低 `SIMILARITY_THRESHOLD` 以包含更多相关结果
- 使用更大的聊天模型
- 提供更具体的问题

### Q: 如何更换代码目录？
A: 修改 `.env` 中的 `CODE_DIR` 配置，然后重启应用或点击"重新索引"按钮。

### Q: 支持哪些编程语言？
A: 默认支持 Python、JavaScript、TypeScript、Java、C/C++、Go、Rust、Ruby、PHP、C#。你可以在 `.env` 的 `FILE_EXTENSIONS` 中添加更多扩展名。

## 📝 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
