# 金融高频交易订单簿实时分析看板

基于 Rust 的高性能数据清洗服务和 React + D3.js 的实时可视化前端看板，用于加密货币订单簿的深度分析和行情监控。

## 项目架构

```
├── frontend/              # React + D3.js 前端
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   ├── hooks/          # React Hooks
│   │   ├── store/          # Zustand 状态管理
│   │   ├── types/          # TypeScript 类型定义
│   │   ├── utils/          # D3.js 辅助函数
│   │   └── pages/          # 页面组件
│   └── package.json
│
└── orderbook-service/     # Rust 后端服务
    ├── src/
    │   ├── models/         # 数据模型
    │   ├── exchange/       # 交易所客户端
    │   ├── orderbook/      # 订单簿引擎
    │   ├── metrics/        # 指标计算
    │   └── websocket/      # WebSocket 服务
    └── Cargo.toml
```

## 技术栈

### 后端（Rust）
- **异步运行时**: Tokio 1.35
- **Web 框架**: Actix-web 4.4
- **WebSocket**: tokio-tungstenite
- **序列化**: serde + serde_json
- **高精度计算**: rust_decimal
- **配置管理**: config-rs
- **日志**: tracing + tracing-subscriber

### 前端（React）
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **图表库**: D3.js 7.8
- **状态管理**: Zustand
- **样式**: TailwindCSS 3
- **WebSocket**: reconnecting-websocket

## 功能特性

### 核心功能
1. **实时行情看板**: 最新成交价、24h涨跌幅、24h成交量
2. **订单簿深度图**: 买卖盘深度可视化、阶梯式显示、鼠标悬停详情
3. **K线走势图**: 1分钟/5分钟/15分钟/1小时多周期K线，MA均线
4. **交易记录**: 最新成交记录实时滚动显示
5. **市场指标**: 买卖价差、深度比值、流动性指数实时计算

### 数据指标
- 买卖价差（绝对/百分比/BPS）
- 买盘/卖盘深度（10档累计）
- 深度比值（买/卖）
- 中间价
- 滑点估算

## 快速开始

### 前置要求
- Rust 1.75+ (建议使用 stable-x86_64-pc-windows-gnu 工具链)
- Node.js 18+ 和 npm
- （可选）Visual Studio Build Tools 或 MinGW-w64

### 启动后端服务

```powershell
cd orderbook-service

# 环境检查（推荐首次运行）
.\check-env.ps1

# 使用脚本启动（推荐）
.\start-dev.ps1

# 或手动启动
cargo run          # 开发模式
cargo run --release  # 发布模式
```

配置文件位于 `config.yaml`，可设置：
- 服务器端口
- 交易所连接（默认使用模拟数据）
- 订单簿深度档位
- 指标更新频率

### 启动前端服务

```powershell
cd frontend

# 使用脚本启动（推荐）
.\start-dev.ps1

# 或手动启动
npm install        # 安装依赖（首次运行）
npm run dev        # 开发模式

# 生产构建
npm run build
```

访问 http://localhost:3000 查看看板

## WebSocket 协议

### 客户端订阅消息
```json
{
  "type": "subscribe",
  "symbol": "btcusdt",
  "channels": ["trade", "depth", "kline", "ticker", "metrics"],
  "klineInterval": "1m"
}
```

### 服务器推送消息

**行情快照**:
```json
{
  "type": "ticker",
  "data": {
    "symbol": "btcusdt",
    "price": "50000.00",
    "priceChange": "100.00",
    "priceChangePercent": "0.20",
    "high24h": "51000.00",
    "low24h": "49000.00",
    "volume24h": "1000.50",
    "quoteVolume24h": "50000000.00",
    "timestamp": 1700000000000
  }
}
```

**订单簿深度**:
```json
{
  "type": "depth",
  "data": {
    "symbol": "btcusdt",
    "lastUpdateId": 123456,
    "bids": [["50000.00", "1.5000"], ["49999.90", "2.3000"]],
    "asks": [["50000.10", "1.2000"], ["50000.20", "3.1000"]],
    "timestamp": 1700000000000
  }
}
```

**市场指标**:
```json
{
  "type": "metrics",
  "data": {
    "symbol": "btcusdt",
    "midPrice": "50000.05",
    "spread": "0.10",
    "spreadBps": 2,
    "bidDepth10": "25.5000",
    "askDepth10": "30.2000",
    "depthRatio": "0.84",
    "timestamp": 1700000000000
  }
}
```

## 订单簿引擎

### 核心数据结构
```rust
pub struct OrderBook {
    pub symbol: String,
    pub last_update_id: u64,
    pub bids: BTreeMap<Decimal, Decimal>,  // 价格 -> 数量
    pub asks: BTreeMap<Decimal, Decimal>,
}
```

### 深度计算
- 使用 `BTreeMap` 维护有序的买卖盘
- 支持累计深度计算（从最优档到指定档位）
- 深度比值 = 买盘深度 / 卖盘深度

### 价差计算
- 绝对价差 = 卖一价 - 买一价
- 百分比价差 = (绝对价差 / 中间价) * 100
- BPS 价差 = 百分比价差 * 100

## 可视化组件

### 深度图 (DepthChart)
- 基于 D3.js 的阶梯式面积图
- 绿色买单 / 红色卖单，渐变填充
- 中间价虚线标注
- 鼠标十字线悬停显示档位详情
- 实时数据平滑过渡动画

### K线图 (KlineChart)
- 蜡烛图 + 成交量柱状图
- MA5/MA10/MA20 均线叠加
- 支持多周期切换（1m/5m/15m/1h）
- 鼠标悬停显示K线详情

## 数据源配置

### 模拟数据模式
默认启用模拟数据模式（`use_mock: true`），无需连接真实交易所即可体验完整功能。

### 币安真实数据
修改 `config.yaml`:
```yaml
exchange:
  use_mock: false
  ws_url: "wss://stream.binance.com:9443/ws"
```

## 性能优化

### 后端优化
- 使用 `BTreeMap` 维护有序订单簿，O(log n) 插入和查找
- `rust_decimal` 确保高精度计算，避免浮点数误差
- Tokio 异步运行时，支持高并发连接
- 广播通道（broadcast channel）实现多客户端高效数据分发

### 前端优化
- D3.js 增量更新，避免全量重绘
- Zustand 状态管理，减少不必要的重渲染
- WebSocket 自动重连机制
- 数据节流，确保 UI 流畅

## 配置说明

### 后端配置 (config.yaml)
```yaml
server:
  host: "127.0.0.1"
  port: 8080

exchange:
  name: "binance"
  ws_url: "wss://stream.binance.com:9443/ws"
  symbols: ["btcusdt"]
  use_mock: true

orderbook:
  max_levels: 20
  depth_calculation_levels: 10

metrics:
  update_interval_ms: 100

logging:
  level: "info"
```

### 前端环境变量 (.env)
```
VITE_WS_URL=ws://localhost:8080/ws
VITE_EXCHANGE_NAME=模拟数据
```

## 开发说明

### 目录结构

#### 后端模块
- `src/main.rs`: 服务入口
- `src/config.rs`: 配置管理
- `src/models/mod.rs`: 数据模型定义
- `src/exchange/binance.rs`: 币安 WebSocket 客户端
- `src/exchange/mock.rs`: 模拟数据生成器
- `src/orderbook/book.rs`: 订单簿核心逻辑
- `src/orderbook/calculator.rs`: 深度计算工具
- `src/metrics/spread.rs`: 价差指标计算
- `src/metrics/depth.rs`: 深度指标计算
- `src/websocket/session.rs`: WebSocket 会话管理
- `src/websocket/broker.rs`: 消息分发代理

#### 前端模块
- `src/components/DepthChart.tsx`: 深度图组件
- `src/components/KlineChart.tsx`: K线图组件
- `src/components/PriceTicker.tsx`: 行情显示组件
- `src/components/TradeList.tsx`: 成交记录列表
- `src/components/MetricsCard.tsx`: 指标卡片
- `src/hooks/useWebSocket.ts`: WebSocket 连接 Hook
- `src/hooks/useOrderBook.ts`: 订单簿数据处理 Hook
- `src/store/marketStore.ts`: Zustand 状态管理
- `src/utils/d3Helpers.ts`: D3.js 辅助函数
- `src/pages/Dashboard.tsx`: 主看板页面

## License

MIT
