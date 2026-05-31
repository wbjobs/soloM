# eBPF 系统调用监控与可视化审计平台

基于 eBPF 技术的内核级系统调用监控与可视化审计平台，通过在内核层实时捕获进程行为，为系统安全审计、性能分析和入侵检测提供直观的数据可视化支持。

## 功能特性

- 🔥 **系统调用热力图**：按时间/调用类型三维展示系统调用频率分布
- 🌲 **进程树可视化**：实时展示进程层级关系和调用链
- 📜 **实时日志流**：终端风格的系统调用日志，支持过滤和搜索
- 📊 **统计仪表盘**：实时显示调用次数、活跃进程、每秒调用速率等关键指标
- ⚙️ **灵活配置**：支持自定义监控的系统调用、进程过滤规则
- 🎨 **赛博朋克风格**：深色科技感 UI，发光边框和数据流动画

## 技术架构

### 数据采集层
- **eBPF + BCC**：内核态系统调用捕获，支持 open, execve, read, write 等
- **Python**：BCC 绑定、数据预处理、Unix Socket 客户端
- **Perf Buffer**：高性能内核态到用户态数据传输

### 传输层
- **Unix Domain Socket**：Python 与 Node.js 间的高性能 IPC
- **NDJSON 协议**：JSON 换行分隔符，支持流式传输

### 应用层
- **Electron 28**：跨平台桌面应用容器
- **React 18**：现代化 UI 框架
- **Zustand**：轻量级状态管理
- **TailwindCSS 3**：原子化 CSS 框架
- **Canvas API**：高性能热力图渲染

## 项目结构

```
m36/
├── .trae/documents/          # 项目文档
│   ├── PRD-系统调用监控平台.md
│   └── TECH-系统调用监控平台.md
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.ts          # 主进程入口
│   │   ├── preload.ts        # 预加载脚本
│   │   ├── socket.ts         # Unix Socket 服务端
│   │   ├── pythonManager.ts  # Python 进程管理
│   │   ├── dataAggregator.ts # 数据聚合器
│   │   └── ipcHandlers.ts    # IPC 处理器
│   ├── renderer/             # React 渲染进程
│   │   ├── main.tsx          # React 入口
│   │   ├── App.tsx           # 主应用组件
│   │   ├── index.css         # 全局样式
│   │   ├── store/            # Zustand 状态管理
│   │   ├── hooks/            # 自定义 Hooks
│   │   ├── components/       # UI 组件
│   │   │   ├── Header/       # 顶部导航
│   │   │   ├── Dashboard/    # 仪表盘
│   │   │   ├── Heatmap/      # 热力图
│   │   │   ├── ProcessTree/  # 进程树
│   │   │   ├── StatsCard/    # 统计卡片
│   │   │   ├── LogStream/    # 日志流
│   │   │   ├── ConfigPanel/  # 配置面板
│   │   │   └── EventDetail/  # 事件详情
│   │   ├── types/            # TypeScript 类型
│   │   └── utils/            # 工具函数
│   └── shared/               # 共享类型定义
├── ebpf/                     # eBPF 相关
│   ├── collector.py          # Python 采集程序
│   ├── bpf_program.c         # BPF C 代码
│   └── requirements.txt      # Python 依赖
├── vite.config.ts            # Vite 配置
├── tailwind.config.js        # Tailwind 配置
├── tsconfig.json             # TypeScript 配置
└── package.json              # 项目依赖
```

## 快速开始

### 环境要求

- **操作系统**：Linux（eBPF 需要 Linux 内核 4.15+）
- **Node.js**：>= 18.x
- **Python**：>= 3.10
- **BCC**：最新版本

### 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# 安装 Python 依赖
cd ebpf
pip install -r requirements.txt
```

### 开发模式

```bash
# 启动开发服务器（含热重载）
npm run dev
```

### 构建生产版本

```bash
# 构建桌面应用
npm run build
```

### 演示模式

如果不在 Linux 环境或没有安装 BCC，应用会自动切换到演示模式，使用模拟数据展示所有功能。

## 支持的系统调用

默认监控的系统调用包括：

| 调用类型 | 说明 |
|---------|------|
| `open` / `openat` | 文件打开 |
| `execve` / `execveat` | 程序执行 |
| `read` / `write` | 文件读写 |
| `close` | 文件关闭 |
| `fork` / `vfork` / `clone` | 进程创建 |
| `connect` / `accept` / `bind` / `listen` | 网络操作 |

## 数据格式

### 系统调用事件

```typescript
interface SyscallEvent {
  timestamp: number;      // 时间戳 (ms)
  syscall: string;        // 系统调用名称
  pid: number;            // 进程 ID
  ppid: number;           // 父进程 ID
  comm: string;           // 进程名
  uid: number;            // 用户 ID
  gid: number;            // 组 ID
  args: Record<string, any>;  // 系统调用参数
  retval: number;         // 返回值
  duration: number;       // 执行耗时 (ns)
}
```

## 安全说明

- eBPF 数据采集需要 root 权限
- 应用仅在本地运行，数据不会上传到任何服务器
- 支持进程白名单/黑名单过滤，保护隐私敏感进程

## License

MIT
