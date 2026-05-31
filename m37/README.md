# 分布式网络拓扑自动生成与交互式沙盘

一个功能完整的网络工程辅助工具，支持：
- 后端（Python Flask）接收 JSON 格式的网络设备清单
- 利用 Graphviz 或自定义 3D 力导向算法计算最佳布局坐标
- 前端（Vue3 + Three.js）在 3D 空间中渲染网络拓扑图
- 支持点击节点查看设备详情、连接关系等

---

## 功能特性

### 后端特性
- **双布局算法**：
  - 3D 力导向布局算法（默认）：自定义物理模拟，支持按设备类型分层展示
  - Graphviz 布局：支持 dot/neato/fdp/sfdp/twopi/circo 等经典算法，2D 投影到 3D
- **完整的数据验证**：校验设备 ID、类型、连接关系等
- **RESTful API**：健康检查、算法查询、设备类型、示例数据、拓扑生成
- **内置示例数据**：小型（9 设备）、中型（50 设备）、大型（190+ 设备）网络

### 前端特性
- **3D 可视化**：基于 Three.js 的沉浸式拓扑展示
- **丰富的动画效果**：
  - 节点浮动动画
  - 脉冲发光效果
  - 连接线数据流动画
  - 点击/悬停高亮动画
- **设备差异化渲染**：
  - 不同设备类型使用不同几何体（立方体、球体、圆柱体）
  - 不同颜色编码区分设备类型
  - 按带宽动态调整连接线粗细
- **交互功能**：
  - 左键拖拽旋转视角
  - 右键拖拽平移
  - 滚轮缩放
  - 悬停显示设备信息
  - 点击查看设备详情面板
  - 高亮选中设备及其连接
- **显示控制**：自动旋转、网格显示、坐标轴显示切换

---

## 项目结构

```
m37/
├── backend/                 # Python 后端
│   ├── app/
│   │   ├── __init__.py      # Flask 应用工厂
│   │   ├── __main__.py      # 入口文件
│   │   ├── api/             # API 路由
│   │   │   ├── __init__.py
│   │   │   └── routes.py    # 路由定义
│   │   ├── layout/          # 布局算法
│   │   │   ├── __init__.py
│   │   │   ├── manager.py   # 布局管理器
│   │   │   ├── force_directed.py  # 3D 力导向算法
│   │   │   └── graphviz_layout.py # Graphviz 适配器
│   │   └── validators.py    # 数据验证
│   ├── tests/               # 测试脚本
│   │   ├── test_layout.py
│   │   └── test_api.py
│   ├── examples/            # 示例数据
│   │   └── sample_topology.json
│   └── requirements.txt     # Python 依赖
│
├── frontend/                # Vue3 前端
│   ├── src/
│   │   ├── components/      # Vue 组件
│   │   │   ├── App.vue              # 主应用组件
│   │   │   ├── ControlPanel.vue     # 控制面板
│   │   │   ├── DeviceDetailPanel.vue # 设备详情面板
│   │   │   └── LoadingOverlay.vue   # 加载遮罩
│   │   ├── engine/          # 3D 渲染引擎
│   │   │   ├── index.ts
│   │   │   ├── TopologyRenderer.ts   # 主渲染器
│   │   │   ├── SceneManager.ts       # 场景管理
│   │   │   ├── NodeFactory.ts        # 节点工厂
│   │   │   ├── EdgeFactory.ts        # 连接线工厂
│   │   │   └── InteractionManager.ts # 交互管理
│   │   ├── api/             # API 服务
│   │   │   └── topology.ts
│   │   ├── config/          # 配置
│   │   │   └── deviceConfig.ts
│   │   ├── types/           # TypeScript 类型
│   │   │   └── index.ts
│   │   ├── styles/          # 样式
│   │   │   └── global.css
│   │   ├── main.ts          # 入口
│   │   └── vite-env.d.ts
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
└── README.md
```

---

## 快速开始

### 1. 启动后端服务

```powershell
# 进入后端目录
cd backend

# 创建虚拟环境（推荐）
python -m venv venv
.\venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m app
```

后端服务将在 `http://localhost:5000` 启动

### 2. 启动前端服务

```powershell
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

### 3. 访问应用

打开浏览器访问 `http://localhost:3000`

---

## API 文档

### 健康检查
```
GET /api/health
```

### 获取支持的算法
```
GET /api/algorithms
```

### 获取设备类型
```
GET /api/device-types
```

### 获取示例数据
```
GET /api/sample?type=small|medium|large
```

### 生成拓扑
```
POST /api/generate
Content-Type: application/json

{
  "devices": [
    {"id": "r1", "type": "router", "name": "Router 1", "ip": "192.168.1.1"},
    {"id": "sw1", "type": "switch", "name": "Switch 1"},
    {"id": "pc1", "type": "host", "name": "PC 1"}
  ],
  "connections": [
    {"from": "r1", "to": "sw1", "bandwidth": 10, "type": "fiber"},
    {"from": "sw1", "to": "pc1", "bandwidth": 1, "type": "ethernet"}
  ],
  "algorithm": "force3d",
  "options": {
    "iterations": 500
  }
}
```

---

## 数据格式说明

### 设备（Device）字段
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 设备唯一标识 |
| type | string | ✅ | 设备类型：router/firewall/core_switch/switch/server/host/client |
| name | string | - | 设备名称 |
| ip | string | - | IP 地址 |
| model | string | - | 设备型号 |
| os | string | - | 操作系统 |
| location | string | - | 位置信息 |
| description | string | - | 描述信息 |

### 连接（Connection）字段
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| from | string | ✅ | 源设备 ID |
| to | string | ✅ | 目标设备 ID |
| bandwidth | number | - | 带宽（Gbps），影响连接线粗细 |
| type | string | - | 连接类型：fiber/ethernet/wireless，影响颜色 |
| description | string | - | 描述信息 |

---

## 运行测试

### 后端测试

```powershell
# 布局算法测试
python tests/test_layout.py

# API 测试
python tests/test_api.py
```

---

## 设备类型颜色编码

| 设备类型 | 颜色 | 几何体 |
|---------|------|--------|
| Router (路由器) | 🟢 绿色 | 立方体 |
| Firewall (防火墙) | 🔴 红色 | 立方体 |
| Core Switch (核心交换机) | 🟣 紫色 | 圆柱体 |
| Switch (交换机) | 🔵 蓝色 | 圆柱体 |
| Server (服务器) | 🟠 橙色 | 立方体 |
| Host/Client (主机/客户端) | ⚫ 灰蓝色 | 球体 |

---

## 技术栈

### 后端
- **Python 3.9+**
- **Flask 3.0** - Web 框架
- **NetworkX** - 图数据结构
- **NumPy** - 数值计算
- **Graphviz + pydot** - 图布局（可选）

### 前端
- **Vue 3.4** - 渐进式框架
- **TypeScript 5.3** - 类型安全
- **Vite 5.0** - 构建工具
- **Three.js 0.160** - 3D 渲染
- **Tween.js** - 动画库

---

## 交互说明

| 操作 | 功能 |
|------|------|
| 左键拖拽 | 旋转 3D 视角 |
| 右键拖拽 | 平移视角 |
| 鼠标滚轮 | 缩放视图 |
| 悬停节点 | 显示设备信息提示 |
| 点击节点 | 选中设备，显示详情面板，高亮连接 |
| 点击空白处 | 取消选中 |

---

## 常见问题

### Graphviz 布局不可用？
Graphviz 布局需要安装系统级的 Graphviz 软件：
- Windows: 从 https://graphviz.org/download/ 下载安装
- 确保 Graphviz 的 `bin` 目录在系统 PATH 中

如果未安装 Graphviz，系统会自动使用 3D 力导向布局算法（推荐）。

### 大型网络加载慢？
- 超过 200 个设备时，建议减少迭代次数（options.iterations = 200）
- 关闭不必要的动画效果

---

## License
MIT
