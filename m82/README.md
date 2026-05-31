# Raft KV Gateway

一个支持 Raft 协议的分布式 KV 存储网关，使用 Go 语言实现。

## 架构

```
┌─────────────┐
│   API       │
│   Gateway   │
└──────┬──────┘
       │ 一致性哈希
       │
┌──────▼─────────┬──────────┬──────────┐
│   Node1     │  Node2    │  Node3    │
│  (Raft)    │  (Raft)   │  (Raft)   │
│  LevelDB    │  LevelDB   │  LevelDB   │
└─────────────┴───────────┴───────────┘
```

## 功能特性

- **API 网关层**
  - HTTP RESTful API 接口
  - 一致性哈希请求分发
  - 自动 Leader 发现与转发
  - 动态节点管理

- **存储节点层**
  - Raft 一致性协议
  - LevelDB 持久化存储
  - 支持 GET/PUT/DELETE 操作
  - 节点动态加入/离开集群

## 目录结构

```
.
├── cmd/
│   ├── gateway/        # 网关入口
│   └── node/          # 存储节点入口
├── gateway/            # 网关核心代码
├── storage/            # 存储节点核心代码
├── pkg/
│   └── consistenthash/  # 一致性哈希算法
├── config/           # 配置文件
└── scripts/          # 启动脚本
```

## 快速开始

### 1. 编译项目

```bash
go build ./cmd/node
go build ./cmd/gateway
```

### 2. 启动集群（Windows）

```bash
# 启动第一个节点（引导集群）
go run ./cmd/node --id node1 --http :8001 --raft :9001 --data ./data/node1 --bootstrap

# 启动第二个节点
go run ./cmd/node --id node2 --http :8002 --raft :9002 --data ./data/node2

# 启动第三个节点
go run ./cmd/node --id node3 --http :8003 --raft :9003 --data ./data/node3

# 将节点加入集群
curl -X POST -H "Content-Type: application/json" -d "{\"node_id\":\"node2\",\"addr\":\"localhost:9002\"}" http://localhost:8001/join
curl -X POST -H "Content-Type: application/json" -d "{\"node_id\":\"node3\",\"addr\":\"localhost:9003\"}" http://localhost:8001/join

# 启动网关
go run ./cmd/gateway --addr :7000 --nodes ./config/nodes.json
```

或者使用批处理脚本：

```bash
scripts\start-cluster.bat
```

## API 接口

### 网关 API

#### 写入数据
```bash
curl -X PUT -d "value" http://localhost:7000/kv/mykey
```

#### 读取数据
```bash
curl http://localhost:7000/kv/mykey
```

#### 删除数据
```bash
curl -X DELETE http://localhost:7000/kv/mykey
```

#### 查看节点列表
```bash
curl http://localhost:7000/nodes
```

#### 健康检查
```bash
curl http://localhost:7000/health
```

### 存储节点 API

#### 节点状态
```bash
curl http://localhost:8001/status
```

#### 加入节点
```bash
curl -X POST -H "Content-Type: application/json" -d "{\"node_id\":\"node2\",\"addr\":\"localhost:9002\"}" http://localhost:8001/join
```

#### 移除节点
```bash
curl -X POST -H "Content-Type: application/json" -d "{\"node_id\":\"node2\"}" http://localhost:8001/leave
```

## 配置参数

### 存储节点参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--id` | node1 | 节点 ID |
| `--http` | :8001 | HTTP 服务地址 |
| `--raft` | :9001 | Raft 协议地址 |
| `--data` | ./data/node1 | 数据目录 |
| `--bootstrap` | false | 是否引导集群 |

### 网关参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--addr` | :7000 | 网关 HTTP 地址 |
| `--nodes` | - | 节点配置文件路径 |

## 技术栈

- **Raft 协议**: [hashicorp/raft](https://github.com/hashicorp/raft)
- **存储引擎**: [LevelDB](https://github.com/syndtr/goleveldb)
- **一致性哈希**: 自定义实现
