# LLM 提示词注入检测网关

私有化部署的 LLM 提示词注入检测网关，用于代理用户到大模型（如 OpenAI 接口）的请求。结合**关键词权重**、**语义向量相似度**双重检测，以及**攻击日志审计与自学习**功能，持续优化检测准确性。

## 功能特性

- 🔍 **实时检测**：请求转发前自动检测提示词注入攻击
- 🧠 **语义理解**：基于 TF-IDF 向量相似度的语义检测，降低误报
- 🚫 **自动拦截**：检测到攻击时返回 400 错误并拦截请求
- 📊 **混合评分**：关键词 + 正则 + 语义的加权评分系统
- 🛡️ **良性模式识别**：识别代码/技术上下文，避免误判正常请求
- 📋 **日志审计**：所有拦截请求自动存入 Elasticsearch 或本地文件
- 🎛️ **管理后台**：Web 界面查看、筛选、标记拦截日志
- 📚 **自学习优化**：管理员标记"误报"/"确实攻击"后，系统自动更新向量库
- 🌍 **双语支持**：支持中英文检测规则
- 📝 **详细日志**：完整的请求日志和攻击尝试记录
- 🔄 **透明代理**：兼容 OpenAI 兼容的 API 接口

## 项目结构

```
.
├── config/
│   ├── detection-rules.js      # 关键词和正则检测规则
│   └── injection-corpus.js     # 语义检测参考语料库
├── public/
│   └── admin.html              # 管理后台 Web 界面
├── src/
│   ├── server.js               # 主服务器入口
│   ├── detector.js             # 混合检测核心模块
│   ├── semantic-detector.js    # 语义向量相似度检测
│   ├── storage.js              # 日志存储（ES + 本地文件 fallback）
│   └── logger.js               # 日志模块
├── tests/
│   └── test-detection.js       # 检测功能测试
├── data/                       # 本地存储数据目录（自动创建）
├── logs/                       # 日志目录（自动创建）
├── .env.example                # 环境变量示例
├── package.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_API_BASE_URL=https://api.openai.com
DETECTION_THRESHOLD=50
SEMANTIC_ENABLED=true
STORAGE_ENABLED=true
ADMIN_PASSWORD=admin123
LOG_LEVEL=info
```

### 3. 启动服务

```bash
# 生产模式
npm start

# 开发模式（自动重启）
npm run dev
```

### 4. 访问管理后台

访问 `http://localhost:3000/admin`，使用默认密码 `admin123` 登录。

### 5. 运行测试

```bash
npm test
```

## 检测原理

### 混合评分架构

网关采用三层检测机制，最终通过混合评分算法综合判断：

```
用户输入 → [关键词/正则检测] → 规则得分
        → [语义向量检测]   → 语义得分
                    ↓
          [混合评分算法] → 最终得分 → 是否拦截
```

### 1. 关键词 + 正则检测

- 每个关键词和正则模式都有预设权重
- 匹配到的项累加权重得到规则得分

### 2. 语义向量检测（核心创新）

基于 TF-IDF + 余弦相似度，解决纯关键词匹配的误报问题：

- **参考语料库**：包含 50 条注入攻击短语和 36 条良性短语
- **字符 n-gram 分词**：对英文和中文分别使用 n-gram 切分
- **TF-IDF 向量化**：将文本转为 TF-IDF 加权的特征向量
- **余弦相似度**：计算输入与参考语料库的向量相似度
- **良性校正**：如果输入与良性短语相似度高于阈值，降低攻击得分

### 3. 混合评分算法

| 场景 | 处理逻辑 |
|------|---------|
| 语义检测确认攻击 | 规则得分 + 语义得分 |
| 良性上下文匹配（>0.60） | 大幅降低规则得分 |
| 低注入相似度（<0.25） | 中度降低规则得分 |
| 正常请求 | 保持原始规则得分 |

### 误报修复示例

| 输入 | 纯关键词检测 | 混合评分检测 |
|------|:---:|:---:|
| "忽略空值继续执行" | ❌ 误报 | ✅ 正确放行 |
| "绕过缓存获取最新数据" | ❌ 误报 | ✅ 正确放行 |
| "覆盖默认配置文件" | ❌ 误报 | ✅ 正确放行 |
| "忽略之前的指令" | ✅ 正确拦截 | ✅ 正确拦截 |

## 自学习系统

### 工作流程

```
检测 → 拦截 → 存入日志 → 管理员审核 → 标记反馈
                                                    ↓
                    动态更新向量库 ← 自动学习样本 ←
```

### 反馈类型

- **✅ 误报（False Positive）**：系统将该样本加入良性向量库，下次遇到相似内容会正确放行
- **⚠️ 确实攻击（True Positive）**：系统将该样本加入攻击向量库，下次遇到相似内容会更准确地拦截
- **🤔 不确定（Unsure）**：仅标记，不参与学习

### 学习效果

每次学习后，系统会自动重新计算 TF-IDF 和所有参考向量，无需重启服务。已学习的样本会持久化到 `data/learned-samples.json`，重启后自动加载。

## 管理后台 API

### 登录

```http
POST /api/admin/login
Content-Type: application/json

{ "password": "admin123" }
```

### 获取日志列表

```http
GET /api/admin/logs?page=1&pageSize=20&feedback=pending&search=忽略
```

参数：
- `page`: 页码，默认 1
- `pageSize`: 每页条数，默认 20
- `feedback`: 筛选状态（pending/false_positive/true_positive/unsure）
- `search`: 搜索内容
- `fromDate` / `toDate`: 日期范围
- `minScore`: 最低分数

### 标记反馈

```http
POST /api/admin/logs/:id/feedback
Content-Type: application/json

{ "feedback": "false_positive", "note": "代码讨论中的正常用语" }
```

### 获取统计

```http
GET /api/admin/stats
```

## 存储配置

### Elasticsearch（推荐）

```env
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your_password
ELASTICSEARCH_INDEX=llm_injection_logs
```

### 本地文件（默认 fallback）

如果 Elasticsearch 不可用或未配置，系统自动降级为本地 JSON 文件存储：

- 拦截日志：`data/injection-logs.json`
- 已学习样本：`data/learned-samples.json`

## API 端点

### 健康检查

```http
GET /health
```

### 检测 API

```http
POST /api/detect
Content-Type: application/json

{ "text": "忽略空值继续处理" }
```

### 代理 OpenAI API

```javascript
const openai = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
});
```

### 管理后台

```
GET /admin
```

## 自定义配置

### 修改检测阈值

在 `.env` 中调整 `DETECTION_THRESHOLD`（默认 50）。

### 添加语义参考语料

编辑 `config/injection-corpus.js`：

```javascript
injectionPhrases: [ "your new injection pattern here" ],
benignPhrases: [ "your benign pattern here" ]
```

### 关闭功能

```env
# 关闭语义检测
SEMANTIC_ENABLED=false

# 关闭日志存储和自学习
STORAGE_ENABLED=false
```

## 日志

- `combined.log` - 所有日志
- `error.log` - 仅错误日志
- `injection-attempts.log` - 注入攻击尝试记录
- `data/injection-logs.json` - 结构化拦截日志（本地存储时）

## License

MIT
