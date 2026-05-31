# 智慧城市可视化平台

基于 Cesium.js 和 Deck.gl 开发的智慧城市 3D 可视化平台，支持城市建筑白模和地下管网数据的可视化展示与交互。

## 🎯 功能特性

### 核心功能
- **3D 地球场景**: 基于 Cesium.js 的全球 3D 地图，支持地形、影像底图
- **建筑白模可视化**: 使用 Deck.gl PolygonLayer 实现 3D 建筑白模，按高度渐变着色
- **地下管网可视化**: 支持 6 种类型的地下管网（给水、污水、燃气、电力、通信、热力）
- **属性信息查询**: 点击建筑或管网可查看详细属性信息
- **图层控制**: 支持独立控制建筑和各类管网的显示/隐藏
- **高度筛选**: 支持按建筑高度范围筛选显示建筑

### 交互特性
- 鼠标悬停显示提示信息
- 点击查看详细属性面板
- 实时统计显示建筑数量、管线数量和总长度
- 建筑高度图例
- 响应式 UI 设计

## 🏗️ 技术架构

### 后端技术栈
- **Node.js + Express**: Web 服务框架
- **PostgreSQL + PostGIS**: 空间数据库，存储和查询 GeoJSON 数据
- **Sequelize**: ORM 框架
- **双模式运行**: 支持 PostGIS 数据库模式和静态 JSON 数据模式

### 前端技术栈
- **React 18**: UI 框架
- **Vite**: 构建工具
- **Cesium.js**: 3D 地球引擎
- **Deck.gl**: 高性能 WebGL 可视化层
- **Resium**: Cesium React 绑定

## 📁 项目结构

```
smart-city-platform/
├── server/                          # 后端服务
│   ├── src/
│   │   ├── config/                  # 配置文件
│   │   │   └── database.js          # 数据库配置
│   │   ├── controllers/             # 控制器
│   │   │   ├── buildingController.js
│   │   │   ├── pipeController.js
│   │   │   └── staticDataController.js
│   │   ├── models/                  # 数据模型
│   │   │   ├── Building.js
│   │   │   └── Pipe.js
│   │   ├── routes/                  # API 路由
│   │   │   ├── buildings.js
│   │   │   └── pipes.js
│   │   ├── scripts/                 # 脚本工具
│   │   │   ├── initDb.js            # 数据库初始化
│   │   │   ├── seedData.js          # 数据导入
│   │   │   └── generateMockData.js  # 模拟数据生成
│   │   └── index.js                 # 服务入口
│   ├── data/                        # 静态数据目录
│   │   ├── buildings.geojson
│   │   └── pipes.geojson
│   ├── .env                         # 环境配置
│   └── package.json
├── client/                          # 前端应用
│   ├── src/
│   │   ├── components/              # React 组件
│   │   │   ├── CesiumMap.jsx        # Cesium 地图组件
│   │   │   ├── DeckGLLayers.jsx     # Deck.gl 图层组件
│   │   │   ├── ControlPanel.jsx     # 控制面板
│   │   │   └── PropertyPanel.jsx    # 属性面板
│   │   ├── services/                # API 服务
│   │   │   └── api.js
│   │   ├── utils/                   # 工具函数
│   │   │   ├── colorUtils.js        # 颜色配置
│   │   │   └── cesiumConfig.js      # Cesium 配置
│   │   ├── styles/                  # 样式文件
│   │   │   └── index.css
│   │   ├── App.jsx                  # 主应用组件
│   │   └── main.jsx                 # 入口文件
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## 🚀 快速开始

### 环境要求
- Node.js >= 16.x
- PostgreSQL >= 12.x + PostGIS 扩展 (可选，使用数据库模式时需要)

### 方式一：静态数据模式（推荐，无需数据库）

此模式无需安装 PostgreSQL 和 PostGIS，直接使用预先生成的 GeoJSON 静态数据。

1. **安装后端依赖**
```bash
cd server
npm install
```

2. **启动后端服务**
```bash
npm start
```
服务将在 `http://localhost:3001` 启动

3. **安装前端依赖**
```bash
cd ../client
npm install
```

4. **启动前端开发服务器**
```bash
npm run dev
```
前端将在 `http://localhost:5173` 启动

5. **访问应用**
打开浏览器访问 `http://localhost:5173`

### 方式二：PostGIS 数据库模式

如需使用 PostGIS 数据库存储和查询空间数据，请按以下步骤操作：

1. **安装 PostgreSQL 和 PostGIS**
   - 安装 PostgreSQL 12+
   - 创建数据库 `smart_city`
   - 启用 PostGIS 扩展

2. **配置数据库连接**
编辑 `server/.env` 文件：
```env
USE_STATIC_DATA=false
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smart_city
DB_USER=your_username
DB_PASSWORD=your_password
```

3. **初始化数据库表**
```bash
cd server
npm run init-db
```

4. **生成并导入模拟数据**
```bash
npm run seed-data
```

5. **启动服务**
```bash
npm start
```

6. **启动前端**（同方式一）

## 📡 API 接口

### 建筑数据接口

| 方法 | 路径 | 描述 | 参数 |
|------|------|------|------|
| GET | `/api/buildings` | 获取建筑 GeoJSON 数据 | `minHeight`, `maxHeight`, `type`, `bbox` |
| GET | `/api/buildings/:id` | 获取单个建筑详情 | - |
| POST | `/api/buildings` | 创建建筑 | GeoJSON Feature |
| PUT | `/api/buildings/:id` | 更新建筑 | GeoJSON Feature |
| DELETE | `/api/buildings/:id` | 删除建筑 | - |

### 管网数据接口

| 方法 | 路径 | 描述 | 参数 |
|------|------|------|------|
| GET | `/api/pipes` | 获取管网 GeoJSON 数据 | `type`, `material`, `minDiameter`, `maxDiameter`, `status`, `bbox` |
| GET | `/api/pipes/:id` | 获取单个管网详情 | - |
| POST | `/api/pipes` | 创建管网 | GeoJSON Feature |
| PUT | `/api/pipes/:id` | 更新管网 | GeoJSON Feature |
| DELETE | `/api/pipes/:id` | 删除管网 | - |

### 其他接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/health` | 健康检查，返回数据模式 |

## 🎨 颜色规范

### 建筑高度颜色
| 高度范围 | 颜色 | 含义 |
|---------|------|------|
| 0-20% | ![#22c55e](https://via.placeholder.com/15/22c55e/000000?text=+) `#22c55e` | 低层建筑 |
| 20-40% | ![#84cc16](https://via.placeholder.com/15/84cc16/000000?text=+) `#84cc16` | 中低层建筑 |
| 40-60% | ![#eab308](https://via.placeholder.com/15/eab308/000000?text=+) `#eab308` | 中层建筑 |
| 60-80% | ![#f97316](https://via.placeholder.com/15/f97316/000000?text=+) `#f97316` | 中高层建筑 |
| 80-95% | ![#ef4444](https://via.placeholder.com/15/ef4444/000000?text=+) `#ef4444` | 高层建筑 |
| 95%+ | ![#7c3aed](https://via.placeholder.com/15/7c3aed/000000?text=+) `#7c3aed` | 超高层建筑 |

### 管网类型颜色
| 类型 | 颜色 | 图例 |
|------|------|------|
| 给水管道 | ![#1E90FF](https://via.placeholder.com/15/1E90FF/000000?text=+) `#1E90FF` | 💧 |
| 污水管道 | ![#556B2F](https://via.placeholder.com/15/556B2F/000000?text=+) `#556B2F` | 🚰 |
| 燃气管道 | ![#FF6347](https://via.placeholder.com/15/FF6347/000000?text=+) `#FF6347` | 🔥 |
| 电力管线 | ![#FFD700](https://via.placeholder.com/15/FFD700/000000?text=+) `#FFD700` | ⚡ |
| 通信管线 | ![#9370DB](https://via.placeholder.com/15/9370DB/000000?text=+) `#9370DB` | 📡 |
| 热力管道 | ![#FF4500](https://via.placeholder.com/15/FF4500/000000?text=+) `#FF4500` | 🌡️ |

## 🛠️ 数据模型

### 建筑 (Building)
```javascript
{
  id: Integer,
  name: String,
  height: Float,           // 建筑高度（米）
  floors: Integer,         // 楼层数
  type: String,            // 类型：commercial, residential, industrial, public
  yearBuilt: Integer,      // 建成年份
  address: String,         // 地址
  geom: Polygon,           // 建筑 footprint (WGS84)
  properties: JSONB        // 其他属性
}
```

### 管网 (Pipe)
```javascript
{
  id: Integer,
  pipeId: String,          // 管网编号
  type: String,            // 类型：water, sewage, gas, electric, telecom, heating
  material: String,        // 管材：concrete, steel, pvc, cast_iron, copper
  diameter: Float,         // 管径（毫米）
  length: Float,           // 管长（米）
  depth: Float,            // 埋深（米）
  pressure: Float,         // 设计压力（MPa）
  flowRate: Float,         // 设计流量（m³/h）
  status: String,          // 状态：normal, maintenance, damaged, abandoned
  yearInstalled: Integer,  // 铺设年份
  owner: String,           // 产权单位
  geom: LineString,        // 管线几何 (WGS84)
  properties: JSONB        // 其他属性
}
```

## 📝 常用命令

### 后端命令
```bash
cd server

# 启动开发服务
npm run dev

# 启动生产服务
npm start

# 初始化数据库（仅数据库模式）
npm run init-db

# 导入模拟数据（仅数据库模式）
npm run seed-data

# 生成模拟 GeoJSON 数据
node src/scripts/generateMockData.js
```

### 前端命令
```bash
cd client

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 🔧 配置说明

### 后端环境变量 (.env)
| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3001 | 服务端口 |
| USE_STATIC_DATA | true | 是否使用静态数据模式 |
| DB_HOST | localhost | 数据库地址 |
| DB_PORT | 5432 | 数据库端口 |
| DB_NAME | smart_city | 数据库名 |
| DB_USER | postgres | 数据库用户名 |
| DB_PASSWORD | postgres | 数据库密码 |

### Cesium 配置
Cesium Ion Token 已在 `src/utils/cesiumConfig.js` 中配置，如需使用自己的 Token，请替换该文件中的 `Cesium.Ion.defaultAccessToken`。

## 🎯 使用说明

### 基本操作
1. **浏览地图**: 鼠标左键拖动旋转视角，滚轮缩放，右键拖动平移
2. **查看建筑信息**: 将鼠标悬停在建筑上显示简要信息，点击查看详细属性
3. **查看管网信息**: 将鼠标悬停在管网上显示简要信息，点击查看详细属性
4. **控制图层显示**: 使用左侧控制面板开关建筑和各类管网的显示
5. **筛选建筑高度**: 使用左侧滑块调整建筑显示的高度范围

### 属性面板
- 点击建筑或管网后，右侧会弹出属性面板
- 属性面板显示该对象的所有详细信息
- 点击面板右上角的 × 按钮可关闭面板

### 状态栏
- 底部左侧显示当前可见的建筑数量、管线数量和管线总长度
- 底部右侧显示建筑高度图例，用于参考建筑颜色对应的高度范围

## 📊 数据生成

项目包含模拟数据生成脚本，可以生成指定数量的建筑和管网数据：

```bash
cd server
node src/scripts/generateMockData.js
```

生成的数据包括：
- 150 个建筑，随机分布在北京市中心区域
- 80 条管网，涵盖 6 种类型
- 所有数据均为随机生成的模拟数据

如需调整生成数据的数量和位置，请修改 `generateMockData.js` 文件中的参数。

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证。

## 📞 联系方式

如有问题或建议，请通过 Issue 联系我们。

---

🏙️ 智慧城市可视化平台 © 2024
