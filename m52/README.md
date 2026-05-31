# 高频传感器数据处理平台

一个完整的物联网传感器数据处理平台，包含后端服务（Go + Gin + MQTT + TimescaleDB）和前端可视化（Vue3 + ECharts）。

## 系统架构

```
┌─────────────────┐      MQTT      ┌─────────────────┐
│   传感器设备     │ ─────────────> │  MQTT Broker    │
└─────────────────┘                └────────┬────────┘
                                            │
                                            ▼
┌─────────────────┐      HTTP      ┌─────────────────┐
│   前端界面      │ <────────────> │  Go (Gin) 后端  │
└─────────────────┘                └────────┬────────┘
                                            │
                                            ▼
                                  ┌─────────────────┐
                                  │  TimescaleDB    │
                                  │  (时序数据库)    │
                                  └─────────────────┘
```

## 功能特性

### 后端功能

- **设备注册模块**：设备的 CRUD 管理，支持设备状态监控
- **MQTT 消息中间件**：订阅 MQTT 主题，实时接收传感器数据，自动解析入库
- **时序数据存储**：基于 TimescaleDB 的高效时序数据存储和查询
- **时间窗口异常检测**：支持基于时间窗口的异常检测（如连续 5 秒温度超阈值）
- **数据聚合 API**：支持按时间桶（time_bucket）聚合查询

### 前端功能

- **仪表盘**：设备总览、实时监控、异常告警
- **设备管理**：设备注册、编辑、删除，设备列表管理
- **实时波形图**：基于 ECharts 的温度、湿度实时趋势图
- **异常检测界面**：配置阈值、时间窗口，进行异常检测和历史记录查看
- **设备详情**：实时数据展示、历史数据查询

## 技术栈

### 后端

- **语言**: Go 1.21+
- **Web框架**: Gin
- **MQTT客户端**: Eclipse Paho MQTT
- **数据库**: PostgreSQL + TimescaleDB
- **ORM**: GORM

### 前端

- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite
- **UI组件**: Element Plus
- **图表库**: ECharts
- **HTTP客户端**: Axios
- **路由**: Vue Router

## 快速开始

### 前置要求

- Docker & Docker Compose
- Go 1.21+
- Node.js 18+

### 1. 启动基础设施

```bash
docker-compose up -d
```

这将启动：
- TimescaleDB (PostgreSQL 15) - 端口 5432
- Mosquitto MQTT Broker - 端口 1883, 9001 (WebSocket)

### 2. 启动后端服务

```bash
cd backend
go mod download
go run main.go
```

后端服务将在 `http://localhost:8080` 启动

### 3. 启动前端服务

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

## API 文档

### 设备管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/devices` | 获取设备列表 |
| GET | `/api/devices/:id` | 获取设备详情 |
| POST | `/api/devices` | 创建设备 |
| PUT | `/api/devices/:id` | 更新设备 |
| DELETE | `/api/devices/:id` | 删除设备 |

### 传感器数据

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/sensor/:deviceId/data` | 获取传感器数据 |
| GET | `/api/sensor/:deviceId/latest` | 获取最新数据 |
| GET | `/api/sensor/:deviceId/aggregated` | 获取聚合数据 |

### 异常检测

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/anomaly/detect` | 批量异常检测 |
| GET | `/api/anomaly/:deviceId/realtime` | 实时异常检测 |
| GET | `/api/anomaly/:deviceId/records` | 获取异常记录 |

## MQTT 消息格式

传感器通过 MQTT 发布数据，主题格式为：
```
sensors/{device_id}
```

消息负载格式（JSON）：

```json
{
  "device_id": "uuid-string",
  "type": "temperature",
  "value": 25.5,
  "unit": "C",
  "time": "2024-01-01T00:00:00Z"
}
```

字段说明：
- `device_id`: 设备唯一标识（可选，可从主题中提取）
- `type`: 数据类型（temperature/humidity/pressure等）
- `value`: 数值
- `unit`: 单位
- `time`: 时间戳（可选，默认为接收时间）

## 异常检测算法

系统采用基于时间窗口的异常检测：

1. **滑动窗口检测**：遍历时序数据，识别连续超过阈值的数据段
2. **持续时间判断**：判断异常数据段的持续时间是否超过设定的时间窗口
3. **异常记录**：自动记录异常的开始/结束时间、最大值、平均值等信息
4. **可配置参数**：
   - 阈值（threshold）
   - 时间窗口（window_seconds）
   - 比较类型（高于/低于阈值）

## 数据库设计

### 设备表 (devices)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR | 设备ID (UUID) |
| name | VARCHAR | 设备名称 |
| type | VARCHAR | 设备类型 |
| description | TEXT | 设备描述 |
| status | VARCHAR | 状态 (active/inactive) |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 传感器数据表 (sensor_data)

TimescaleDB 超表，按时间分区：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 自增ID |
| device_id | VARCHAR | 设备ID |
| timestamp | TIMESTAMPTZ | 数据时间（分区键） |
| type | VARCHAR | 数据类型 |
| value | FLOAT | 数值 |
| unit | VARCHAR | 单位 |

### 异常记录表 (anomaly_records)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 自增ID |
| device_id | VARCHAR | 设备ID |
| start_time | TIMESTAMPTZ | 异常开始时间 |
| end_time | TIMESTAMPTZ | 异常结束时间 |
| type | VARCHAR | 数据类型 |
| description | TEXT | 描述 |
| threshold | FLOAT | 检测阈值 |
| duration | FLOAT | 持续时间(秒) |
| created_at | TIMESTAMP | 记录时间 |

## 目录结构

```
├── backend/                    # 后端 Go 项目
│   ├── main.go                # 主入口
│   ├── go.mod                 # 依赖配置
│   ├── .env                   # 环境变量
│   ├── config/                # 配置模块
│   │   └── database.go        # 数据库配置
│   ├── models/                # 数据模型
│   │   └── device.go          # 设备/传感器模型
│   ├── controllers/           # API控制器
│   │   ├── device.go          # 设备管理
│   │   ├── sensor.go          # 传感器数据
│   │   └── anomaly.go         # 异常检测
│   ├── mqtt/                  # MQTT模块
│   │   └── client.go          # MQTT客户端
│   └── routes/                # 路由配置
│       └── routes.go          # API路由
├── frontend/                   # 前端 Vue 项目
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.js            # 入口
│       ├── App.vue            # 根组件
│       ├── api/               # API封装
│       ├── router/            # 路由配置
│       ├── components/        # 组件
│       └── views/             # 页面视图
├── config/                     # 基础设施配置
│   └── mosquitto.conf         # MQTT配置
├── docker-compose.yml          # Docker编排
└── README.md                   # 文档
```

## 使用示例

### 1. 注册设备

```bash
curl -X POST http://localhost:8080/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "name": "温度传感器-001",
    "type": "temp-humidity",
    "description": "车间温湿度传感器"
  }'
```

### 2. 模拟发送传感器数据

使用 mosquitto_pub 或其他 MQTT 客户端：

```bash
mosquitto_pub -t sensors/device-uuid -m '{
  "type": "temperature",
  "value": 36.5,
  "unit": "C"
}'
```

### 3. 查询异常

```bash
curl -X POST http://localhost:8080/api/anomaly/detect \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "device-uuid",
    "sensor_type": "temperature",
    "threshold": 35,
    "window_seconds": 5,
    "comparison_type": "above"
  }'
```

## 开发计划

- [ ] 增加数据降采样策略
- [ ] 支持更多异常检测算法（孤立森林、LSTM等）
- [ ] 增加告警通知（邮件、短信、Webhook）
- [ ] 支持设备OTA升级
- [ ] 增加数据导出功能
- [ ] 用户权限管理

## License

MIT
