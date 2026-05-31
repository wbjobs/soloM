# 高并发性能优化方案

针对 1000 QPS 高并发写入场景下的连接池耗尽、504 超时、前端数据断点等问题，实施了以下系统性优化：

## 问题分析

### 原始系统瓶颈

1. **数据库连接池耗尽**：每条 MQTT 消息单独创建数据库连接，高并发下连接数瞬间达到上限
2. **单条写入低效**：每条数据执行一次 INSERT，数据库往返次数过多
3. **同步阻塞**：MQTT 消息处理和数据库写入在同一线程，导致消息队列阻塞
4. **无缓冲机制**：流量突发时没有削峰填谷的缓冲层
5. **前端频繁轮询**：每 2 秒全量拉取数据，增加后端压力

---

## 优化方案总览

| 优化层级 | 优化措施 | 预期效果 |
|---------|---------|---------|
| 数据库层 | 连接池调优 + 批量写入 | 连接数减少 90%，写入吞吐提升 10 倍 |
| 消息处理 | Worker Pool + 异步队列 | 处理能力提升至 10000+ QPS |
| 写入缓冲 | 内存队列 + 批量刷盘 | 支持 50000 条突发缓冲 |
| 前端优化 | WebSocket 推送 + 增量更新 | 前端请求减少 80% |
| 实时查询 | 环形缓存 + 内存查询 | 查询延迟从 100ms 降至 <1ms |

---

## 详细优化措施

### 1. 数据库连接池优化

**文件**: [config/database.go](file:///e:/soloM/m52/backend/config/database.go#L14-L55)

```go
// 核心配置
DB_MAX_OPEN_CONNS = 100    // 最大打开连接数
DB_MAX_IDLE_CONNS = 50     // 最大空闲连接数
DB_CONN_MAX_LIFETIME = 3600 // 连接生命周期(秒)
```

**优化点**:
- 从默认的无限制改为明确的连接池管理
- 空闲连接复用，减少连接建立开销
- 连接生命周期管理，避免无效连接

---

### 2. 批量写入机制

**文件**: [storage/buffer.go](file:///e:/soloM/m52/backend/storage/buffer.go#L129-L152)

**核心实现**:
```go
// 单次 INSERT 批量写入 500 条数据
func (wb *WriteBuffer) batchInsert(data []models.SensorData) error {
    // 构建 $1, $2, $3, $4, $5),($6, $7, $8, $9, $10)...
    // 单条 SQL 完成批量写入
}
```

**配置参数**:
```env
WRITE_BATCH_SIZE = 500          # 每批 500 条
WRITE_FLUSH_INTERVAL_MS = 100    # 每 100ms 强制刷盘
WRITE_WORKER_COUNT = 8           # 8 个写入 worker
```

**性能提升**:
- 数据库往返次数: 1000次/秒 → 2次/秒
- 单次写入开销: 分摊到 500 条数据

---

### 3. 内存缓冲队列

**文件**: [storage/buffer.go](file:///e:/soloM/m52/backend/storage/buffer.go)

**架构**:
```
MQTT 消息 → 消息队列(10万条) → Worker Pool(16个) → 写入缓冲 → 批量写入 DB
```

**配置**:
```env
WRITE_BUFFER_SIZE = 50000    # 5万条缓冲能力
MQTT_QUEUE_SIZE = 100000     # MQTT 消息队列
MQTT_WORKER_COUNT = 16       # 16 个消息处理 worker
```

**特性**:
- 非阻塞写入，消息快速返回
- 自动重试机制（3次重试）
- 队列满时优雅降级（日志记录）
- 实时统计监控

---

### 4. 实时环形缓存

**文件**: [storage/realtime_cache.go](file:///e:/soloM/m52/backend/storage/realtime_cache.go)

**实现**:
- 使用 `container/ring` 实现固定大小环形缓冲区
- 每个设备维护独立的缓存环
- 读写锁保护，支持高并发访问

**配置**:
```env
REALTIME_CACHE_SIZE = 1000    # 每设备缓存 1000 条
```

**性能**:
- 查询延迟: <1ms（内存查询 vs 数据库查询 ~100ms）
- 支持增量查询（since 时间戳）
- 不占用数据库连接

---

### 5. WebSocket 实时推送

**文件**: [websocket/server.go](file:///e:/soloM/m52/backend/websocket/server.go)

**架构**:
```
后端数据 → 环形缓存 → 广播器(500ms间隔) → WebSocket → 前端增量更新
```

**优势**:
- 前端无需轮询，减少 80% HTTP 请求
- 增量推送，仅传输新增数据点
- 支持多客户端同时连接
- 自动心跳保活

---

### 6. MQTT 消息处理优化

**文件**: [mqtt/client.go](file:///e:/soloM/m52/backend/mqtt/client.go#L25-L81)

**优化前**:
```go
// 单线程同步处理
messageHandler = func(...) {
    parseJSON()
    db.Create()  // 阻塞直到写入完成
}
```

**优化后**:
```go
// Worker Pool 异步处理
messageHandler = func(...) {
    msgPool.Submit(msg)  // 非阻塞提交
}

// 16 个 worker 并行处理
func (p *MessagePool) worker(id int) {
    for msg := range p.taskQueue {
        processMessage(msg)
    }
}
```

---

## 新增 API 接口

### 实时缓存查询
```http
GET /api/sensor/:deviceId/realtime?type=temperature&limit=100
```

### 增量查询
```http
GET /api/sensor/:deviceId/incremental?since=2024-01-01T00:00:00Z
```

### 缓冲状态监控
```http
GET /api/sensor/buffer/stats
```

响应示例:
```json
{
    "received": 123456,
    "flushed": 123400,
    "dropped": 0,
    "errors": 0,
    "queue_len": 56,
    "queue_cap": 50000
}
```

### WebSocket 连接
```
ws://localhost:8080/ws
```

推送消息格式:
```json
{
    "type": "sensor_batch",
    "device_id": "device-001:temperature",
    "data": [
        {"timestamp": "...", "value": 25.5}
    ]
}
```

---

## 性能测试

### 测试工具

**文件**: [stress_test/mqtt_stress.go](file:///e:/soloM/m52/backend/stress_test/mqtt_stress.go)

**使用方法**:
```bash
cd backend/stress_test
go run mqtt_stress.go -devices=50 -qps=20 -duration=60
# 50 设备 × 20 QPS × 2 数据类型 = 2000 QPS
```

### 预期测试结果

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 支持 QPS | ~100 | >2000 | +20x |
| 数据库连接数 | ~100+ | ~20 | -80% |
| 写入延迟 | ~50ms | <5ms | -90% |
| 前端请求数 | 30次/分 | 0次/分 | -100% |
| 突发承载能力 | 0 | 50000 | ∞ |

---

## 监控与调优建议

### 关键监控指标

1. **缓冲队列长度**
   ```bash
   curl http://localhost:8080/api/sensor/buffer/stats | jq .queue_len
   ```
   - 持续增长 = 写入速度跟不上，需增加 worker

2. **数据库连接使用率**
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```
   - 接近 max_connections = 需调整连接池

3. **消息丢失率**
   ```
   dropped / received < 0.1% 为正常
   ```

### 参数调优指南

| 场景 | 调整参数 | 建议值 |
|------|---------|--------|
| 写入密集型 | WRITE_BATCH_SIZE | 1000 |
| 突发流量大 | WRITE_BUFFER_SIZE | 100000 |
| 数据库慢 | WRITE_WORKER_COUNT | 4 |
| 设备数量多 | REALTIME_CACHE_SIZE | 500 |
| 前端客户端多 | WS_BROADCAST_INTERVAL_MS | 1000 |

---

## 架构升级前后对比

### 优化前
```
MQTT → 同步处理 → 单条 INSERT → DB
                        ↘ 查询 ↗
前端 ← HTTP 轮询 ← API 查询
```

### 优化后
```
                        ┌→ 环形缓存 ← WebSocket 推送 → 前端
                        │
MQTT → Worker Pool → 写入缓冲 → 批量 INSERT → DB
    (16个)        (5万条)      (500条/批)
```

---

## 未来扩展方向

1. **更高并发**: 引入 Kafka 作为持久化消息队列
2. **数据降采样**: 按时间粒度自动降采样历史数据
3. **读写分离**: 主库写入，从库查询
4. **集群部署**: 多实例水平扩展
5. **数据分片**: 按设备/时间分片
