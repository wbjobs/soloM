# 多源日志实时聚合与异常告警系统

一个基于 Go + NATS 的实时日志监控与告警系统，支持多源日志收集、实时传输和异常告警通知。

## 系统架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   日志文件      │────▶│   Log Shipper   │────▶│   NATS Broker   │
│  (多个 .log)    │     │   (Go 编写)     │     │   消息中间件    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                  ┌─────────────────┐
                                                  │  Alert Service  │
                                                  │  (消费消息)     │
                                                  │  正则匹配       │
                                                  │  Webhook 告警   │
                                                  └─────────────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │  钉钉 / 飞书 Webhook │
                                              └─────────────────────┘
```

## 功能特性

- **Log Shipper**
  - 监听指定目录下的 `.log` 文件
  - 实时追踪文件新增行
  - 自动发现新创建的日志文件
  - 通过 NATS 发送日志消息

- **Message Broker (NATS)**
  - 高性能消息中间件
  - 支持发布/订阅模式
  - 轻量级、易于部署

- **Alert Service**
  - 消费 NATS 日志消息
  - 正则匹配 "ERROR"、"Exception" 等关键词
  - 支持钉钉 Webhook 告警
  - 支持飞书 Webhook 告警

## 目录结构

```
m69/
├── log-shipper/          # 日志采集服务
│   ├── main.go          # 主程序
│   ├── go.mod           # Go 依赖
│   └── Dockerfile       # Docker 构建文件
├── alert-service/        # 告警服务
│   ├── main.go          # 主程序
│   ├── go.mod           # Go 依赖
│   └── Dockerfile       # Docker 构建文件
├── config/               # 配置文件
│   └── config.yaml      # 系统配置
├── logs/                 # 日志文件目录（监控目录）
├── scripts/              # 辅助脚本
│   ├── build.ps1        # 编译脚本
│   ├── start-nats.ps1   # 启动 NATS
│   └── generate-test-logs.ps1 # 生成测试日志
├── docker-compose.yml    # Docker Compose 配置
└── README.md            # 本文档
```

## 快速开始

### 方式一：本地运行（推荐开发调试）

#### 1. 前置要求

- Go 1.21+
- Docker（用于运行 NATS）

#### 2. 启动 NATS

```powershell
cd scripts
.\start-nats.ps1
```

或者使用 Docker 命令：

```bash
docker run -d --name log-nats -p 4222:4222 -p 8222:8222 nats:2.10-alpine -m 8222
```

#### 3. 编译服务

```powershell
cd scripts
.\build.ps1
```

或者手动编译：

```bash
cd log-shipper
go mod tidy
go build -o log-shipper.exe .

cd ../alert-service
go mod tidy
go build -o alert-service.exe .
```

#### 4. 启动 Log Shipper

```bash
cd log-shipper
.\log-shipper.exe
```

#### 5. 启动 Alert Service

打开新终端：

```bash
cd alert-service
.\alert-service.exe
```

#### 6. 测试系统

生成测试日志（新终端）：

```powershell
cd scripts
.\generate-test-logs.ps1
```

观察 Alert Service 终端输出，当检测到 ERROR 或 Exception 时会触发告警。

### 方式二：Docker Compose 运行

```bash
docker-compose up -d
```

## 配置说明

编辑 `config/config.yaml` 进行配置：

```yaml
nats:
  url: "nats://localhost:4222"    # NATS 服务地址
  subject: "logs"                  # 消息主题

log_shipper:
  watch_dir: "./logs"              # 监控目录
  file_pattern: "*.log"            # 文件匹配模式
  scan_interval: 1                 # 扫描间隔（秒）

alert_service:
  patterns:                         # 匹配规则（正则）
    - "ERROR"
    - "Exception"
    - "exception"
    - "Error"
  webhook:
    dingtalk:                       # 钉钉配置
      enabled: false
      url: "https://oapi.dingtalk.com/robot/send?access_token=XXX"
      secret: "your-secret-key"     # 加签密钥（可选）
    feishu:                         # 飞书配置
      enabled: false
      url: "https://open.feishu.cn/open-apis/bot/v2/hook/XXX"
      secret: ""
```

## Webhook 配置

### 钉钉机器人

1. 在钉钉群中添加「自定义机器人」
2. 选择「加签」安全设置
3. 复制 Webhook URL 和 加签密钥
4. 填入配置文件

### 飞书机器人

1. 在飞书群中添加「自定义机器人」
2. 复制 Webhook URL
3. 填入配置文件

## 消息格式

Log Shipper 发送的消息格式：

```
timestamp|hostname|filename|message
```

例如：

```
2024-01-15T10:30:00+08:00|DESKTOP-XXX|app.log|[ERROR] Database connection failed
```

## 监控

NATS 监控面板：http://localhost:8222

## 常见问题

### Q: Log Shipper 为什么没有检测到新文件？

A: 确保日志文件放在 `logs` 目录下，并且后缀是 `.log`。

### Q: 告警没有触发？

A: 
1. 检查 NATS 是否正常运行
2. 检查配置文件中的匹配规则
3. 查看服务日志确认消息是否正常消费

### Q: 如何添加更多匹配规则？

A: 在 `config.yaml` 的 `alert_service.patterns` 中添加正则表达式。

## 技术栈

- **语言**: Go 1.21
- **消息中间件**: NATS 2.10
- **配置**: YAML
- **部署**: Docker / Docker Compose

## License

MIT
