# 私有化 RAG（检索增强生成）系统

基于 LangChain + FAISS 的私有化文档问答系统，支持 PDF/Markdown 文档解析、向量索引、流式回答和引用来源高亮显示。

## 项目结构

```
m8/
├── backend/                 # 后端 Python 服务
│   ├── app/
│   │   ├── api/            # API 路由
│   │   ├── core/           # 核心配置
│   │   ├── models/         # 数据模型
│   │   └── services/       # 业务服务
│   ├── uploads/            # 上传文件存储
│   ├── indexes/            # FAISS 索引存储
│   ├── requirements.txt    # Python 依赖
│   └── main.py            # FastAPI 应用入口
└── frontend/              # 前端 Next.js 应用
    ├── app/               # Next.js App Router
    ├── components/        # React 组件
    ├── lib/               # 工具函数
    ├── types/             # TypeScript 类型定义
    └── styles/            # 样式文件
```

## 功能特性

### 后端 (Python)
- ✅ **文档解析**: 支持 PDF、Markdown、TXT 格式文件
- ✅ **文本分块**: 基于 LangChain 的递归字符分割
- ✅ **向量索引**: FAISS 高效向量存储与检索
- ✅ **嵌入模型**: 支持 OpenAI Embeddings 和本地 HuggingFace 模型
- ✅ **RAG 问答**: 基于检索的增强生成
- ✅ **流式输出**: Server-Sent Events (SSE) 流式回答
- ✅ **多索引管理**: 支持创建、加载、删除多个索引

### 前端 (Next.js)
- ✅ **对话界面**: 类 ChatGPT 的聊天体验
- ✅ **流式输出**: 实时显示 AI 回答
- ✅ **文档上传**: 拖拽或点击上传文档
- ✅ **引用来源**: 显示并高亮引用的原文片段
- ✅ **响应式设计**: 支持移动端和桌面端
- ✅ **TypeScript**: 完整的类型支持

## 快速开始

### 1. 后端设置

```bash
cd backend

# 创建虚拟环境
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
copy .env.example .env
# 编辑 .env 文件，设置 OPENAI_API_KEY 等参数

# 启动后端服务
python main.py
```

后端服务将在 http://localhost:8000 启动

API 文档: http://localhost:8000/docs

### 2. 前端设置

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端服务将在 http://localhost:3000 启动

## 环境变量配置

### 后端 (.env)

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | 必填 |
| `OPENAI_API_BASE` | OpenAI API 基础地址 | https://api.openai.com/v1 |
| `OPENAI_MODEL_NAME` | 使用的模型名称 | gpt-3.5-turbo |
| `EMBEDDING_MODEL_NAME` | 本地嵌入模型名称 | all-MiniLM-L6-v2 |
| `CHUNK_SIZE` | 文本分块大小 | 500 |
| `CHUNK_OVERLAP` | 分块重叠大小 | 50 |
| `MAX_RETRIEVED_DOCS` | 最大检索文档数 | 4 |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/upload` | 上传并索引单个文档 |
| POST | `/api/v1/upload/batch` | 批量上传文档 |
| POST | `/api/v1/query` | 查询问答（非流式） |
| POST | `/api/v1/query/stream` | 查询问答（流式） |
| GET | `/api/v1/indexes` | 获取索引列表 |
| POST | `/api/v1/indexes/{name}/load` | 加载指定索引 |
| POST | `/api/v1/indexes/{name}/delete` | 删除指定索引 |
| GET | `/api/v1/health` | 健康检查 |

## 使用说明

1. **上传文档**:
   - 点击左侧"上传文档"标签
   - 拖拽或点击选择 PDF/Markdown/TXT 文件
   - 点击"开始上传"进行处理和索引

2. **问答对话**:
   - 在底部输入框输入问题
   - 按 Enter 或点击发送按钮
   - AI 将基于文档内容流式回答
   - 点击"引用来源"查看相关原文片段

3. **索引管理**:
   - 在"索引管理"标签页查看和管理文档索引
   - 支持切换不同的知识库

## 技术栈

### 后端
- **FastAPI**: 高性能 Web 框架
- **LangChain**: LLM 应用开发框架
- **FAISS**: Facebook 向量相似度搜索库
- **PyPDF**: PDF 文档解析
- **HuggingFace Transformers**: 本地嵌入模型

### 前端
- **Next.js 14**: React 全栈框架
- **TypeScript**: 类型安全
- **Tailwind CSS**: 样式框架
- **Lucide React**: 图标库
- **SSE**: Server-Sent Events 流式通信

## 注意事项

### 通用
1. 首次运行会下载 HuggingFace 嵌入模型，可能需要一些时间
2. 确保有足够的磁盘空间存储上传文件和索引
3. 生产环境请配置适当的安全措施和认证
4. 大文件上传可能需要调整 Nginx/反向代理的超时设置

### LoRA 微调
1. **模拟模式**: 默认使用模拟训练模式（`_simulation_mode = True`），无需 GPU 和深度学习依赖
2. **真实训练**: 如需真实训练，请安装完整依赖并设置 `_simulation_mode = False`
3. **GPU 建议**: 真实训练建议使用 GPU，显存至少 8GB
4. **基础模型**: 默认使用 TinyLlama-1.1B，可根据需要调整为更大模型（如 Llama-2-7B）
5. **数据集要求**: 建议至少 100 条 QA 对才能获得较好的微调效果
6. **训练时间**: 根据数据集大小和硬件配置，训练时间从几分钟到几小时不等
