# 私有化部署的 RAG 知识库问答助手

一个完整的私有化部署 RAG (Retrieval-Augmented Generation) 知识库问答系统，包含 FastAPI 后端和 Vue3 前端。

## 功能特性

### 后端
- ⚡ **FastAPI 高性能后端** - 异步处理，自动 API 文档
- 📄 **多格式文档支持** - PDF、Markdown、TXT
- 🔗 **LangChain 集成** - 文档加载、分块、检索链
- 🧠 **本地 Embedding 模型** - 支持 Sentence-Transformers 系列模型
- 🗄️ **Milvus 向量数据库** - 高性能向量检索
- 💬 **流式响应** - SSE 实时推送回答
- 📊 **健康检查** - 系统状态监控

### 前端
- 💬 **流式对话界面** - 打字机效果实时显示
- 📚 **文档管理** - 拖拽上传、进度显示、删除管理
- 🎯 **文档选择** - 可指定特定文档进行问答
- 🔍 **来源展示** - 显示参考片段和相似度
- 🎨 **现代化 UI** - Tailwind CSS 响应式设计
- 📱 **移动端适配** - 支持各种屏幕尺寸

## 技术架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Vue 3 前端     │────▶│  FastAPI 后端    │────▶│  Milvus 向量库   │
│  (流式对话)      │     │  (RAG 流水线)    │     │  (向量存储)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  LangChain      │
                        │  - 文档加载     │
                        │  - 文本分块     │
                        │  - 检索增强     │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  本地模型       │
                        │  - Embedding    │
                        │  - LLM          │
                        └─────────────────┘
```

## 项目结构

```
m88/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── api/                # API 路由
│   │   │   ├── documents.py    # 文档管理接口
│   │   │   ├── chat.py         # 对话接口
│   │   │   └── health.py       # 健康检查
│   │   ├── core/               # 核心模块
│   │   │   ├── config.py       # 配置管理
│   │   │   └── database.py     # Milvus 客户端
│   │   ├── services/           # 业务服务
│   │   │   ├── embedding_service.py   # 向量嵌入服务
│   │   │   ├── document_service.py    # 文档处理服务
│   │   │   ├── llm_service.py         # LLM 生成服务
│   │   │   └── rag_service.py         # RAG 查询服务
│   │   └── schemas/            # Pydantic 数据模型
│   ├── data/                   # 数据存储
│   │   └── uploads/            # 上传文件
│   ├── models/                 # 本地模型目录
│   ├── main.py                 # 应用入口
│   ├── requirements.txt        # Python 依赖
│   └── .env.example            # 环境变量示例
├── frontend/                   # Vue 3 前端
│   ├── src/
│   │   ├── api/                # API 客户端
│   │   ├── components/         # 可复用组件
│   │   │   └── DocumentSidebar.vue
│   │   ├── router/             # 路由配置
│   │   ├── stores/             # Pinia 状态管理
│   │   ├── views/              # 页面视图
│   │   │   ├── ChatView.vue
│   │   │   └── DocumentsView.vue
│   │   ├── App.vue
│   │   └── main.ts
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── docker/                     # Docker 配置
│   ├── docker-compose.yml
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── nginx.conf
└── README.md
```

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone <repository-url>
cd m88

# 2. 启动全部服务
cd docker
docker-compose up -d

# 3. 访问服务
# 前端: http://localhost
# 后端 API: http://localhost:8000
# API 文档: http://localhost:8000/docs
```

### 方式二：本地开发

#### 后端服务

```bash
cd backend

# 1. 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置 Milvus、模型路径等

# 4. 确保 Milvus 服务已启动
# 可使用 Docker 启动 Milvus:
# docker run -d --name milvus -p 19530:19530 -p 9091:9091 milvusdb/milvus:v2.3.5

# 5. 下载本地模型
# - Embedding 模型: 如 bge-small-zh-v1.5
# - LLM 模型: 如 Qwen2-7B-Instruct
# 放置到 backend/models/ 目录下

# 6. 启动后端
python main.py
```

#### 前端服务

```bash
cd frontend

# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env

# 3. 启动开发服务器
npm run dev
```

## API 接口

### 文档管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/documents/upload` | 上传文档 |
| DELETE | `/api/documents/{doc_id}` | 删除文档 |
| GET | `/api/documents` | 获取文档列表 |

### 对话问答

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/chat/query` | 发送问题（支持流式） |

### 健康检查

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/health` | 获取系统状态 |

## 配置说明

### 后端配置 (.env)

```env
# Milvus 配置
MILVUS_HOST=localhost
MILVUS_PORT=19530
MILVUS_COLLECTION=rag_documents

# Embedding 模型配置
EMBEDDING_MODEL_PATH=./models/bge-small-zh-v1.5
EMBEDDING_DEVICE=cpu
EMBEDDING_BATCH_SIZE=8

# LLM 配置
LLM_MODEL_PATH=./models/Qwen2-7B-Instruct
LLM_DEVICE=cpu
LLM_MAX_TOKENS=2048
LLM_TEMPERATURE=0.7

# 文本分块配置
CHUNK_SIZE=500
CHUNK_OVERLAP=50

# 文件存储
UPLOAD_DIR=./data/uploads
MAX_FILE_SIZE=10485760
```

## 模型推荐

### Embedding 模型
- **BAAI/bge-small-zh-v1.5** - 中文通用，速度快
- **BAAI/bge-base-zh-v1.5** - 效果更好，稍慢
- **shibing624/text2vec-base-chinese** - 轻量级中文模型

### LLM 模型
- **Qwen/Qwen2-7B-Instruct** - 开源中文模型，效果好
- **THUDM/chatglm3-6b** - 轻量级，适合资源有限场景
- **meta-llama/Llama-3-8B-Instruct** - 通用能力强

## 核心流程

### 文档上传流程
1. 用户上传 PDF/MD/TXT 文件
2. 使用 LangChain Loader 加载文档内容
3. RecursiveCharacterTextSplitter 进行文本分块
4. 本地 Embedding 模型生成向量
5. 向量存储到 Milvus 数据库

### 问答流程
1. 用户输入问题
2. Embedding 模型生成问题向量
3. Milvus 检索最相似的 Top-K 文档片段
4. 构建 Prompt：上下文 + 问题
5. LLM 流式生成回答
6. SSE 推送到前端显示

## 常见问题

### 1. Milvus 连接失败？
确保 Milvus 服务已启动，检查 `.env` 中的 `MILVUS_HOST` 和 `MILVUS_PORT` 配置。

### 2. 模型加载失败？
检查模型路径是否正确，确保有足够的内存/显存。CPU 模式可使用量化模型。

### 3. 如何提高检索准确率？
- 增加 `CHUNK_SIZE` 保留更多上下文
- 调整 `top_k` 参数获取更多候选
- 选择更好的 Embedding 模型
- 对文档进行预处理，去除无关内容

### 4. 如何加速回答生成？
- 使用量化后的 LLM 模型
- 降低 `LLM_MAX_TOKENS`
- 使用 GPU 加速
- 配置批量处理参数

## 生产部署建议

1. **反向代理**: 使用 Nginx 配置 HTTPS 和负载均衡
2. **认证授权**: 添加 API Key 或 OAuth2 认证
3. **日志监控**: 集成 ELK 或 Prometheus + Grafana
4. **数据备份**: 定期备份 Milvus 数据和上传文件
5. **资源限制**: 配置 Docker 资源限制，防止 OOM
6. **模型优化**: 使用 GPTQ/AWQ 量化减少显存占用

## 许可证

MIT License
