# eBPF 系统调用可视化监控仪表盘

一个基于 eBPF 的 Linux 系统监控工具，实时追踪 `openat` 和 `execve` 系统调用，并通过 Web 界面可视化展示。

## 项目架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Web 前端 (Vue3 + ECharts)               │
│  ┌──────────────────┐   ┌──────────────────────────────┐   │
│  │  进程火焰图      │   │   系统调用频率热力图          │   │
│  │  (FlameGraph)    │   │   (HeatMap)                  │   │
│  └──────────────────┘   └──────────────────────────────┘   │
│                      ↑ WebSocket (实时推送)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Go 后端服务                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  HTTP/WebSocket 服务 (gorilla/websocket)             │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  RingBuffer 数据读取 + 统计聚合                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                      ↑ RingBuffer                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 eBPF 内核空间                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  tracepoint: sys_enter_openat / sys_enter_execve     │   │
│  │  采集进程名、PID、调用参数                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 项目结构

```
m92/
├── ebpf/
│   └── syscall_trace.c          # eBPF C 代码 - 系统调用钩子
├── backend/
│   ├── main.go                  # Go 后端入口
│   ├── go.mod
│   ├── go.sum
│   ├── types/
│   │   └── types.go             # 数据类型定义
│   ├── ebpf/
│   │   └── loader.go            # eBPF 程序加载器
│   ├── server/
│   │   └── server.go            # HTTP/WebSocket 服务
│   └── ebpf/
│       └── bpf_bpfel.o          # 编译后的 eBPF 对象文件 (需生成)
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js              # Vue 入口
│       ├── App.vue              # 主应用组件
│       ├── components/
│       │   ├── FlameGraph.vue   # 火焰图组件
│       │   └── HeatMap.vue      # 热力图组件
│       └── utils/
│           └── websocket.js     # WebSocket 客户端
└── README.md
```

## 功能特性

### 1. eBPF 数据采集
- 钩住 `sys_enter_openat` (syscall #257) 和 `sys_enter_execve` (syscall #59)
- 采集信息：进程名 (comm)、PID/TGID、时间戳、文件名、调用参数
- 通过 **RingBuffer** (16MB) 高性能推送数据到用户空间

### 2. Go 后端服务
- 使用 `cilium/ebpf` 库加载和管理 eBPF 程序
- 实时读取 RingBuffer 数据并聚合统计
- WebSocket 服务 (`ws://localhost:8080/ws`) 每秒推送统计数据
- 内置 Mock 模式，无需 Linux 环境也可开发测试
- REST API:
  - `GET /api/health` - 健康检查
  - `GET /api/stats` - 获取完整统计数据

### 3. 前端可视化
- **进程调用火焰图**：径向树状图展示 `root → 进程名 → PID → 系统调用` 的层级关系
- **系统调用频率热力图**：X轴系统调用类型，Y轴进程，颜色深浅表示调用频率
- 实时统计面板：总调用次数、活跃进程数、调用速率
- 自动重连机制、响应式布局、深色主题

## 环境要求

### 运行真实 eBPF 数据采集
- Linux Kernel >= 5.8 (支持 BPF CO-RE)
- 内核开启 `CONFIG_DEBUG_INFO_BTF=y`
- Go >= 1.21
- clang/llvm >= 12 (编译 eBPF)
- Root 权限 (CAP_BPF, CAP_PERFMON)

### 开发测试 (Mock 模式)
- Go >= 1.21
- Node.js >= 18
- 任意操作系统 (Windows/macOS/Linux)

## 快速开始

### 1. 编译 eBPF 程序 (Linux 环境)

```bash
cd backend/ebpf
go generate ./...
# 这将执行: go run github.com/cilium/ebpf/cmd/bpf2go -cc clang bpf ../../ebpf/syscall_trace.c
# 生成 bpf_bpfel.o 和 bpf_bpfel.go
```

### 2. 启动后端服务

#### Mock 模式 (推荐用于开发测试)
```bash
cd backend
go mod download
go run . --mock
```

#### 真实 eBPF 模式 (需 Linux + Root)
```bash
cd backend
go mod download
sudo go run .
```

服务启动后访问:
- WebSocket: `ws://localhost:8080/ws`
- 健康检查: `http://localhost:8080/api/health`

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 `http://localhost:5173` 查看仪表盘。

## 数据格式

### WebSocket 推送消息

```json
{
  "type": "update",
  "timestamp": 1717234567,
  "flame": {
    "name": "root",
    "value": 15234,
    "children": [
      {
        "name": "bash",
        "value": 3421,
        "children": [
          {
            "name": "12345",
            "value": 1250,
            "children": [
              { "name": "openat", "value": 890 },
              { "name": "execve", "value": 360 }
            ]
          }
        ]
      }
    ]
  },
  "heatmap": [
    {
      "pid": 12345,
      "process": "bash",
      "syscall": "openat",
      "count": 890,
      "lastSeen": 1717234567000000000
    }
  ]
}
```

## eBPF 代码说明

### 关键数据结构

```c
struct event {
    __u32 pid;              // 进程 ID
    __u32 tgid;             // 线程组 ID
    __u64 timestamp;        // 内核时间戳 (ns)
    char comm[16];          // 进程名
    __u32 syscall_id;       // 系统调用号
    char syscall_name[16];  // 系统调用名
    char filename[256];     // 打开/执行的文件名
    char argv[128];         // 执行参数
};
```

### BPF Maps

```c
// RingBuffer: 高性能环形缓冲区，用于 eBPF → 用户空间数据传输
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);  // 16MB
} events SEC(".maps");
```

### Tracepoint 钩子

```c
SEC("tracepoint/syscalls/sys_enter_openat")
int tracepoint_sys_enter_openat(struct trace_event_raw_sys_enter *ctx)
{
    // 从 ctx->args[1] 获取文件名指针
    const char __user *filename = (const char __user *)ctx->args[1];
    bpf_probe_read_user_str(e->filename, sizeof(e->filename), filename);
    // ...
}
```

## 故障排查

### 1. eBPF 加载失败

```
Error: operation not permitted
```
- 确保以 root 权限运行
- 检查内核配置: `zcat /proc/config.gz | grep BPF`
- 确认内核版本 >= 5.8

### 2. BTF 错误

```
Error: failed to find BTF
```
- 安装 `linux-tools-common` 或 `linux-tools-$(uname -r)`
- 确保 `/sys/kernel/btf/vmlinux` 存在

### 3. WebSocket 连接失败

- 确认后端服务已启动
- 检查防火墙是否允许 8080 端口
- 前端 vite 代理配置是否正确

## 性能优化建议

1. **RingBuffer 大小**: 默认 16MB，高负载环境可增大到 64MB (`1 << 26`)
2. **数据采样**: 对于极高频率的系统调用，可考虑采样过滤
3. **批量推送**: 目前每秒推送一次，可根据需求调整频率
4. **进程清理**: 自动清理 60 秒无活动的进程统计

## 扩展功能建议

1. 添加更多系统调用钩子 (`read`, `write`, `connect` 等)
2. 增加系统调用延迟统计
3. 实现数据持久化 (InfluxDB, ClickHouse)
4. 添加告警规则 (异常调用频率、敏感文件访问)
5. 支持按进程名/PID 过滤
6. 增加历史数据回放功能

## 许可证

MIT License
