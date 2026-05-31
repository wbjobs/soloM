# 基于知识图谱的网络安全威胁情报关联分析系统

## 系统架构

- **后端**: FastAPI + Neo4j (图数据库)
- **前端**: React + TypeScript + AntV G6 (图可视化)

## 功能特性

1. **威胁情报知识图谱存储**
   - 存储 IP、域名、Hash、CVE 漏洞四类节点
   - 支持多种关联关系：RESOLVES_TO、COMMUNICATES_WITH、HOSTS、DOWNLOADS、EXPLOITS、RELATED_TO

2. **核心查询接口**
   - 输入恶意 IP，自动查询并返回 2 度以内所有关联节点和关系
   - 支持自定义查询深度（1-5 度）

3. **可视化图谱展示**
   - 使用 AntV G6 进行力导向图布局
   - 节点类型按颜色区分
   - 支持拖拽、缩放、节点点击查看详情

4. **CRUD 操作接口**
   - 节点的增删改查
   - 关系的创建和删除
   - 图谱统计信息查询

## 目录结构

```
m39/
├── backend/                 # 后端项目
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py        # 配置文件
│   │   ├── database.py      # Neo4j 数据库连接
│   │   ├── main.py          # FastAPI 应用入口
│   │   ├── models.py        # Pydantic 数据模型
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   └── threat.py    # 威胁情报 API 路由
│   │   └── services/
│   │       ├── __init__.py
│   │       └── graph_service.py  # 图谱服务逻辑
│   ├── seed_data.py         # 示例数据导入脚本
│   ├── requirements.txt     # Python 依赖
│   └── .env.example         # 环境变量示例
└── frontend/                # 前端项目
    ├── src/
    │   ├── components/      # React 组件
    │   ├── services/        # API 服务
    │   ├── types/           # TypeScript 类型定义
    │   ├── App.tsx          # 主应用组件
    │   ├── main.tsx         # 应用入口
    │   └── index.css        # 样式文件
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

## 快速开始

### 前置要求

1. **Neo4j 数据库** (版本 4.x 或 5.x)
   - 下载并安装 Neo4j Desktop
   - 创建一个新数据库
   - 设置用户名和密码

2. **Python 3.9+**
3. **Node.js 18+**

### 后端部署

1. 进入后端目录并安装依赖:

```bash
cd backend
pip install -r requirements.txt
```

2. 配置环境变量:

复制 `.env.example` 为 `.env` 并修改配置:

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password_here
```

3. 导入示例数据:

```bash
python seed_data.py
```

4. 启动后端服务:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端 API 文档: http://localhost:8000/docs

### 前端部署

1. 进入前端目录并安装依赖:

```bash
cd frontend
npm install
```

2. 启动开发服务器:

```bash
npm run dev
```

前端访问地址: http://localhost:5173

## API 接口说明

### 核心查询接口

**POST /api/threat/query**

查询恶意 IP 的关联图谱

请求体:
```json
{
  "ip": "185.220.101.34",
  "max_depth": 2
}
```

响应:
```json
{
  "nodes": [
    {
      "id": "185.220.101.34",
      "label": "IP",
      "name": "185.220.101.34",
      "properties": {
        "country": "DE",
        "threat_level": "high"
      }
    }
  ],
  "relationships": [
    {
      "source_id": "185.220.101.34",
      "target_id": "c2-server.net",
      "type": "RESOLVES_TO",
      "properties": {}
    }
  ]
}
```

### 其他接口

- `GET /api/threat/nodes` - 获取所有节点
- `POST /api/threat/nodes` - 创建新节点
- `GET /api/threat/nodes/{id}` - 获取节点详情
- `PUT /api/threat/nodes/{id}` - 更新节点
- `DELETE /api/threat/nodes/{id}` - 删除节点
- `POST /api/threat/relationships` - 创建关系
- `DELETE /api/threat/relationships` - 删除关系
- `GET /api/threat/stats` - 获取图谱统计

## 使用示例

1. 启动 Neo4j 数据库
2. 启动后端服务并导入示例数据
3. 启动前端服务
4. 在前端界面选择示例 IP（如 `185.220.101.34`），点击查询
5. 查看该 IP 的 2 度关联图谱，包含：
   - 直接关联的域名、IP
   - 关联的恶意文件哈希
   - 哈希对应的 CVE 漏洞
   - 等等

## 示例数据说明

示例数据包含以下恶意实体：

- **恶意 IP**: 185.220.101.34 (Tor 出口节点/C2服务器), 91.234.99.42 (钓鱼/僵尸网络)
- **恶意域名**: evil-pharm.com (钓鱼), c2-server.net (C2), malware-distro.xyz (恶意软件分发)
- **恶意文件哈希**: TrickBot、Mirai、Emotet 等恶意样本的哈希
- **漏洞**: CVE-2024-3400 (PAN-OS), CVE-2023-44228 (Log4j) 等关键漏洞

---

## 性能优化方案

### 问题分析

1. **后端 Cypher 查询性能问题**
   - 原查询使用 `MATCH path = (center)-[*1..N]-(connected)` 进行全路径匹配
   - 在深层递归和节点数多时，会产生路径爆炸（Path Explosion）
   - 查询时间随深度呈指数级增长

2. **前端渲染性能问题**
   - G6 渲染 1000+ 节点时会卡死
   - 力导向布局算法复杂度为 O(n²)，节点越多越慢
   - 大量边渲染导致 Canvas 重绘压力大

### 后端优化方案

#### 1. 查询算法优化

**位置**: [graph_service.py](file:///e:/soloM/m39/backend/app/services/graph_service.py)

- **BFS 分层查询替代全路径匹配**:
  ```cypher
  -- 优化前（路径爆炸）
  MATCH path = (center:IP {name: $ip})-[*1..3]-(connected)
  
  -- 优化后（BFS 扩展）
  CALL apoc.path.expandConfig(center, {
      relationshipFilter: null,
      minLevel: 1,
      maxLevel: $max_depth,
      uniqueness: 'NODE_GLOBAL',
      limit: $max_nodes
  })
  ```

- **三重查询降级机制**:
  1. **APOC 扩展查询**（最优）- 使用 Neo4j APOC 库的 BFS 算法
  2. **分层迭代查询**（备选）- 不依赖 APOC 的纯 Cypher 实现
  3. **单查询简化版**（兼容）- 最基础但性能相对较差的实现

#### 2. 查询结果限制

- 硬限制：默认最大 5000 节点，10000 条关系
- 软限制：通过 API 参数 `max_nodes` 和 `max_relationships` 可调
- 结果截断标识：`metadata.is_truncated` 提示用户结果不完整

#### 3. 查询缓存机制

```python
_query_cache: dict[str, tuple[float, GraphData]] = {}
CACHE_TTL_SECONDS = 300  # 5 分钟缓存
```

- 基于内存的 LRU 缓存（简化实现）
- 相同查询 5 分钟内直接返回缓存结果
- 可通过 API 参数 `use_cache: false` 强制刷新
- 提供缓存管理接口：
  - `GET /api/threat/cache/stats` - 查看缓存统计
  - `DELETE /api/threat/cache/clear` - 清除所有缓存

#### 4. 响应元数据

每次查询返回性能元数据：

```json
{
  "metadata": {
    "query_time_ms": 45.23,
    "node_count": 1234,
    "relationship_count": 2456,
    "query_depth": 2,
    "is_truncated": false,
    "max_nodes_limit": 5000,
    "max_relationships_limit": 10000,
    "used_cache": false
  }
}
```

### 前端优化方案

#### 1. 智能渲染策略

**位置**: [performance.ts](file:///e:/soloM/m39/frontend/src/utils/performance.ts)

根据节点数量自动选择渲染模式：

| 节点数量 | 渲染模式 | 策略说明 |
|---------|---------|---------|
| < 200 | 完整模式 (full) | 完整渲染所有节点、标签、边 |
| 200-500 | 完整模式 (full) | 隐藏节点标签，加速渲染 |
| 500-3000 | 采样模式 (sampled) | 按比例采样节点，保留中心节点 |
| ≥ 3000 | 聚合模式 (aggregated) | 按类型聚合节点，用单个聚合节点表示 |

#### 2. 节点采样算法

```typescript
function sampleNodes(nodes: ThreatNode[], sampleRate: number, centerIp?: string) {
  // 1. 始终保留中心 IP 节点
  // 2. 其余节点按等步长采样
  // 3. 自动计算采样率：sampleRate = max(0.2, 500 / nodeCount)
}
```

#### 3. 节点聚合算法

```typescript
function aggregateNodesByType(nodes: ThreatNode[], centerIp?: string) {
  // 1. 保留中心节点不聚合
  // 2. 按节点类型（IP/Domain/Hash/CVE）分组
  // 3. 每组最大 200 个节点，超出则创建多个聚合节点
  // 4. 关系也同步聚合，累计 count 属性
}
```

#### 4. 渲染性能优化

**位置**: [GraphCanvas.tsx](file:///e:/soloM/m39/frontend/src/components/GraphCanvas.tsx)

- **Canvas 渲染器**: 使用 `renderer: 'canvas'` 替代默认 SVG
- **缓存开启**: 大数据量时启用 canvas 缓存
- **布局优化**:
  - 大数据量时禁用布局动画 (`enableLayoutAnimation: false`)
  - 降低力导向布局参数：`alpha: 0.2`, `alphaMin: 0.005`
  - 静态布局完成后直接 fitView，避免动画卡顿
- **边渲染控制**: 极大数据量时 (`≥3000` 节点) 不渲染边，只渲染节点

#### 5. 性能监控与警告

- 实时显示：原始节点数、渲染节点数、查询时间、渲染时间
- 节点数 ≥ 200 时显示性能警告条
- 自动提示当前渲染模式（完整/采样/聚合）
- 结果截断时显示警告信息

### 后端 API 新增参数

```json
{
  "ip": "185.220.101.34",
  "max_depth": 2,
  "max_nodes": 2000,        // 新增：最大节点数
  "max_relationships": 5000, // 新增：最大关系数
  "use_cache": true          // 新增：是否使用缓存
}
```

### 性能测试

#### 生成大数据量测试数据

```bash
cd backend
python generate_large_data.py 5000  # 生成 5000 个节点
```

#### 运行性能对比测试

```bash
cd backend
python performance_test.py
```

#### 预期性能提升

| 查询深度 | 优化前 | 优化后（首次） | 优化后（缓存） | 缓存提升 |
|---------|-------|--------------|--------------|---------|
| 1 度 | 150ms | 40ms | 5ms | 8x |
| 2 度 | 800ms | 120ms | 5ms | 160x |
| 3 度 | 5000ms+ | 350ms | 5ms | 1000x+ |

| 节点数量 | 优化前渲染 | 优化后渲染 | 提升 |
|---------|-----------|-----------|-----|
| 500 | 2s | 300ms | 6x |
| 2000 | 10s+ (卡顿) | 1.5s | 7x |
| 5000 | 卡死 | 2s (聚合模式) | 正常可用 |

### Neo4j 性能调优建议

1. **安装 APOC 库**
   - 下载对应版本的 APOC Jar 包
   - 放入 Neo4j `plugins` 目录
   - 修改 `neo4j.conf`:
     ```
     dbms.security.procedures.unrestricted=apoc.*
     dbms.security.procedures.allowlist=apoc.*
     ```

2. **创建索引**
   ```cypher
   CREATE INDEX ip_name FOR (n:IP) ON (n.name);
   CREATE INDEX domain_name FOR (n:Domain) ON (n.name);
   CREATE INDEX hash_name FOR (n:Hash) ON (n.name);
   CREATE INDEX cve_name FOR (n:CVE) ON (n.name);
   ```

3. **内存配置**
   - 修改 `neo4j.conf`:
     ```
     dbms.memory.heap.initial_size=4G
     dbms.memory.heap.max_size=8G
     dbms.memory.pagecache.size=4G
     ```

### 前端高级选项

在查询面板的「高级选项」中可以调整：
- **最大节点数**: 100 - 20000
- **最大关系数**: 100 - 50000
- **使用缓存**: 开关控制是否使用缓存

---

## 潜在威胁预测功能

### 功能概述

集成了图神经网络（GNN）风格的链路预测算法，基于现有的图谱结构，预测两个看似无关的节点之间是否存在潜在的攻击链路。预测结果会以高亮方式显示在前端图谱上。

### 核心算法

**位置**: [link_prediction.py](file:///e:/soloM/m39/backend/app/services/link_prediction.py)

系统集成了 7 种链路预测算法，通过加权组合生成最终预测结果：

| 算法 | 权重 | 说明 |
|-----|------|------|
| 资源分配指数 (Resource Allocation) | 25% | 基于共同邻居度数的资源传递模型 |
| Adamic-Adar 指数 | 20% | 共同邻居度数的对数加权和 |
| GNN 嵌入相似度 | 20% | 3 层图神经网络节点嵌入的余弦相似度 |
| Jaccard 系数 | 15% | 共同邻居与并集邻居的比例 |
| 共同邻居数 (Common Neighbors) | 10% | 共享邻居节点数量 |
| 优先连接 (Preferential Attachment) | 5% | 基于节点度数的乘积 |
| 路径距离 | 5% | 最短路径距离的衰减得分 |

### GNN 节点嵌入

实现了简化的 GCN（图卷积网络）风格的节点表示学习：

```python
# 3 层消息传递
degree_inv_sqrt = diag(1.0 / sqrt(degree_matrix.diagonal()))
normalized_adj = degree_inv_sqrt @ adj_matrix @ degree_inv_sqrt
prop_matrix = 0.5 * (identity + normalized_adj)

for _ in range(3):
    embeddings = prop_matrix @ embeddings
    embeddings = tanh(embeddings)

embeddings = L2_normalize(embeddings)
```

- 使用对称归一化的邻接矩阵进行消息传递
- 3 层传播捕获高阶结构信息
- Tanh 激活函数引入非线性
- L2 归一化便于相似度计算

### 置信度分级

| 置信度 | 阈值 | 颜色 |
|-------|------|------|
| 高 (high) | ≥ 0.7 | 🔴 #ef4444 |
| 中 (medium) | ≥ 0.4 | 🟡 #f59e0b |
| 低 (low) | < 0.4 | 🟢 #10b981 |

### 预测 API 接口

#### 1. 潜在威胁预测

**POST /api/threat/predict/threats**

预测指定中心节点的潜在攻击链路：

请求体:
```json
{
  "center_id": "185.220.101.34",
  "max_depth": 3,
  "top_k": 20,
  "min_score": 0.3,
  "include_graph_data": false
}
```

响应:
```json
{
  "center_id": "185.220.101.34",
  "predictions": [
    {
      "source_id": "185.220.101.34",
      "target_id": "c2-evil.net",
      "score": 0.823,
      "combined_score": 0.823,
      "confidence": "high",
      "predicted_relationship": "COMMUNICATES_WITH",
      "explanation": "共同邻居数: 5 个，资源分配指数: 1.234，...",
      "algorithms": {
        "common_neighbors": 5,
        "jaccard": 0.312,
        "adamic_adar": 1.234,
        "resource_allocation": 0.891,
        "preferential_attachment": 456,
        "embedding_similarity": 0.782,
        "path_distance_score": 0.6
      }
    }
  ],
  "prediction_metadata": {
    "prediction_time_ms": 245.67,
    "total_candidates": 156,
    "prediction_count": 20,
    "high_confidence_count": 8,
    "medium_confidence_count": 10,
    "low_confidence_count": 2
  }
}
```

#### 2. 单对节点预测

**POST /api/threat/predict/link**

预测两个特定节点之间的潜在关联。

#### 3. 批量预测

**POST /api/threat/predict/batch**

批量预测多对节点之间的潜在关联。

#### 4. 获取算法信息

**GET /api/threat/predict/algorithms**

获取所有可用算法及其权重信息。

#### 5. 清除预测缓存

**DELETE /api/threat/predict/cache/clear**

清除图结构缓存，强制重新计算。

### 前端高亮显示

**位置**: [GraphCanvas.tsx](file:///e:/soloM/m39/frontend/src/components/GraphCanvas.tsx)

预测结果在图谱上的高亮效果：

- **预测目标节点**: 放大 1.3 倍，边框加粗，阴影增强，标签加粗
- **预测链路**: 
  - 虚线样式 `lineDash: [5, 5]`
  - 颜色按置信度分级
  - 线宽 4px（普通边 1.5px）
  - 箭头放大
  - 标签加粗高亮
- **交互**: 点击预测节点或边可查看详细预测说明

### 预测控制面板

**位置**: [QueryPanel.tsx](file:///e:/soloM/m39/frontend/src/components/QueryPanel.tsx)

前端提供完整的预测控制选项：

- **预测深度**: 2-5 跳（默认 3 跳）
- **返回数量**: 5-100 条（默认 20 条）
- **置信度阈值**: 0.1-0.9（默认 0.3）
- **显示/隐藏切换**: 一键控制预测结果显示
- **统计信息**: 实时显示高/中/低置信度预测数量

### 预测结果详情

**位置**: [PredictionPanel.tsx](file:///e:/soloM/m39/frontend/src/components/PredictionPanel.tsx)

展开每条预测结果可查看：

- 综合评分进度条
- 预测关系类型
- 7 种算法的详细得分
- 自动生成的预测说明
- 候选节点总数和预测耗时

### 图结构缓存

- 图邻接表缓存：5 分钟 TTL
- GNN 嵌入计算缓存：随图结构自动失效
- 首次预测加载图结构约需 1-2 秒（取决于图大小）
- 后续预测直接使用缓存，响应时间 < 100ms

---

## 文件索引

### 后端核心文件

| 功能 | 文件路径 |
|------|---------|
| FastAPI 应用入口 | [main.py](file:///e:/soloM/m39/backend/app/main.py) |
| 威胁情报 API 路由 | [threat.py](file:///e:/soloM/m39/backend/app/routers/threat.py) |
| 图谱查询服务（含性能优化） | [graph_service.py](file:///e:/soloM/m39/backend/app/services/graph_service.py) |
| 链路预测服务（GNN + 7种算法） | [link_prediction.py](file:///e:/soloM/m39/backend/app/services/link_prediction.py) |
| Neo4j 数据库连接 | [database.py](file:///e:/soloM/m39/backend/app/database.py) |
| 数据模型定义 | [models.py](file:///e:/soloM/m39/backend/app/models.py) |
| 配置管理 | [config.py](file:///e:/soloM/m39/backend/app/config.py) |
| Python 依赖清单 | [requirements.txt](file:///e:/soloM/m39/backend/requirements.txt) |
| 示例数据导入脚本 | [seed_data.py](file:///e:/soloM/m39/backend/seed_data.py) |
| 大数据量生成脚本 | [generate_large_data.py](file:///e:/soloM/m39/backend/generate_large_data.py) |
| 性能测试脚本 | [performance_test.py](file:///e:/soloM/m39/backend/performance_test.py) |

### 前端核心文件

| 功能 | 文件路径 |
|------|---------|
| 主应用组件 | [App.tsx](file:///e:/soloM/m39/frontend/src/App.tsx) |
| G6 图谱可视化（含预测高亮） | [GraphCanvas.tsx](file:///e:/soloM/m39/frontend/src/components/GraphCanvas.tsx) |
| 查询与预测控制面板 | [QueryPanel.tsx](file:///e:/soloM/m39/frontend/src/components/QueryPanel.tsx) |
| 预测结果详情面板 | [PredictionPanel.tsx](file:///e:/soloM/m39/frontend/src/components/PredictionPanel.tsx) |
| 图例与节点详情面板 | [LegendPanel.tsx](file:///e:/soloM/m39/frontend/src/components/LegendPanel.tsx) |
| 性能优化工具函数 | [performance.ts](file:///e:/soloM/m39/frontend/src/utils/performance.ts) |
| API 服务封装 | [api.ts](file:///e:/soloM/m39/frontend/src/services/api.ts) |
| 类型定义（含预测类型） | [index.ts](file:///e:/soloM/m39/frontend/src/types/index.ts) |
| 全局样式 | [index.css](file:///e:/soloM/m39/frontend/src/index.css) |
