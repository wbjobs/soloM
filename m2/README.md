# TSDB - 轻量级时序数据库

基于 LSM-Tree 存储引擎的轻量级时序数据库，支持自定义类 SQL 查询语法。

## 功能特性

- **LSM-Tree 存储引擎**: 包含 MemTable、WAL（预写日志）、SSTable 多层存储
- **类 SQL 查询语法**: 支持 `SELECT mean(value) FROM cpu WHERE time > now() - 1h` 形式的查询
- **gRPC 写入接口**: 高性能数据写入，支持流式写入
- **HTTP 查询接口**: RESTful API 用于数据查询

## 项目结构

```
tsdb/
├── crates/
│   ├── common/          # 公共数据结构
│   ├── storage/         # LSM-Tree 存储引擎
│   ├── query/           # SQL 解析器和查询引擎
│   └── server/          # gRPC 和 HTTP 服务器
├── examples/            # 客户端示例
└── src/main.rs          # 主程序入口
```

## 快速开始

### 编译

```bash
cargo build --release
```

### 运行服务器

```bash
# 使用默认配置启动
cargo run --release

# 指定端口
cargo run --release -- --grpc-port 50051 --http-port 8080 --data-dir ./data
```

### 运行演示

```bash
cargo run --release -- --demo
```

## API 使用

### HTTP 查询接口

```bash
# 健康检查
curl http://localhost:8080/health

# 执行查询
curl -X POST http://localhost:8080/query \
  -H "Content-Type: application/json" \
  -d '{"q": "SELECT mean(value) FROM cpu WHERE time > now() - 1h"}'

# 获取所有 measurements
curl http://localhost:8080/measurements
```

### gRPC 写入接口

```rust
// 使用 gRPC 客户端写入数据
let mut client = WriteServiceClient::connect("http://localhost:50051").await?;

let point = DataPoint {
    measurement: "cpu".to_string(),
    tags: vec![Tag { key: "host".to_string(), value: "server1".to_string() }],
    timestamp: now,
    fields: vec![Field {
        key: "value".to_string(),
        value: Some(FloatValue(45.5)),
    }],
};

client.write(WriteRequest { points: vec![point] }).await?;
```

## 支持的聚合函数

- `mean(field)` - 计算平均值
- `sum(field)` - 计算总和
- `count(field)` - 计数
- `min(field)` - 最小值
- `max(field)` - 最大值
- `first(field)` - 第一个值
- `last(field)` - 最后一个值

## 时间表达式

支持以下时间单位：
- `ms` - 毫秒
- `s` - 秒
- `m` - 分钟
- `h` - 小时
- `d` - 天
- `w` - 周

示例：
- `now() - 1h` - 1小时前
- `now() - 30m` - 30分钟前
- `now() + 1d` - 1天后
