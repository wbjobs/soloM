# HotkeyRunner - 快捷键自动化工具

一个基于 Rust + Tauri 开发的桌面应用，支持全局监听用户自定义的快捷键组合，触发预设的 Shell/Python 脚本，并在系统托盘显示执行日志。同时提供 CLI 命令行工具，用于在无 GUI 的服务器上通过配置文件管理这些自动化任务。

## 功能特性

### 🎯 核心功能
- **全局快捷键监听**：支持自定义快捷键组合（Ctrl/Shift/Alt/Meta + 任意键）
- **多脚本类型支持**：同时支持 Shell 脚本和 Python 脚本
- **实时执行日志**：实时捕获脚本输出，支持按任务和级别过滤
- **系统托盘集成**：快速访问常用功能，查看执行状态
- **异步脚本执行**：基于 Tokio 异步运行时，支持任务取消
- **任务管理**：完整的增删改查、启用/禁用功能

### 💻 桌面应用（GUI）
- 深色主题，现代化 UI 设计
- 四个功能面板：快捷键任务、脚本编辑器、执行日志、设置
- 基于 CodeMirror 的代码编辑器，支持 Shell/Python 语法高亮
- 实时通知系统，任务执行状态一目了然

### 🖥️ 命令行工具（CLI）
适合在无 GUI 的服务器上使用，支持以下命令：
- `hotkey-cli list` - 列出所有任务
- `hotkey-cli add <config>` - 添加新任务
- `hotkey-cli remove <name>` - 删除任务
- `hotkey-cli run <name>` - 运行指定任务
- `hotkey-cli start` - 启动快捷键监听服务
- `hotkey-cli stop` - 停止快捷键监听服务
- `hotkey-cli status` - 查看服务状态
- `hotkey-cli logs` - 查看执行日志
- `hotkey-cli config` - 管理配置文件

## 技术栈

### 后端（Rust）
- **Tauri 2.0** - 桌面应用框架
- **Tokio 1.37** - 异步运行时
- **Serde 1.0** - 序列化/反序列化
- **TOML 0.8** - 配置文件解析
- **Clap 4.5** - CLI 参数解析
- **Tracing 0.1** - 日志系统
- **global-hotkey 0.5** - 全局快捷键监听（Tauri 插件）
- **tray-icon 0.19** - 系统托盘

### 前端（React + TypeScript）
- **React 18** - UI 框架
- **TypeScript 5** - 类型安全
- **Zustand** - 状态管理
- **Tailwind CSS 3** - 样式框架
- **CodeMirror 6** - 代码编辑器
- **Lucide React** - 图标库
- **Vite** - 构建工具

## 项目结构

```
├── src/                          # 前端源代码
│   ├── components/               # UI 组件
│   │   ├── Sidebar.tsx           # 侧边栏导航
│   │   ├── HotkeyList.tsx        # 任务列表
│   │   ├── ScriptEditor.tsx      # 脚本编辑器
│   │   ├── LogPanel.tsx          # 日志面板
│   │   ├── Settings.tsx          # 设置面板
│   │   └── ...
│   ├── store/                    # 状态管理
│   ├── types/                    # TypeScript 类型定义
│   ├── utils/                    # 工具函数
│   ├── App.tsx                   # 主应用组件
│   ├── main.tsx                  # 入口文件
│   └── index.css                 # 全局样式
├── src-tauri/                    # Rust 后端代码
│   ├── src/
│   │   ├── cli/                  # CLI 命令行工具
│   │   ├── config/               # 配置管理
│   │   ├── hotkey/               # 快捷键监听
│   │   ├── logger/               # 日志收集
│   │   ├── script/               # 脚本执行引擎
│   │   ├── tray/                 # 系统托盘
│   │   ├── commands.rs           # IPC 命令定义
│   │   ├── lib.rs                # 核心库入口
│   │   └── main.rs               # GUI 入口
│   ├── Cargo.toml                # Rust 依赖配置
│   └── tauri.conf.json           # Tauri 配置
├── .trae/documents/              # 项目文档
│   ├── prd.md                    # 产品需求文档
│   └── tech-arch.md              # 技术架构文档
├── example.config.toml           # 示例配置文件
└── README.md                     # 项目说明
```

## 快速开始

### 环境要求
- Node.js >= 18
- Rust >= 1.77
- Windows / macOS / Linux

### 安装依赖

```bash
# 安装前端依赖
npm install

# Rust 依赖会在构建时自动安装
```

### 开发模式

```bash
# 启动开发服务器（同时启动前端和 Tauri 后端）
npm run tauri dev
```

### 构建生产版本

```bash
# 构建桌面应用
npm run tauri build

# 仅构建 CLI 工具
cd src-tauri
cargo build --release --bin hotkey-cli
```

### CLI 工具使用

```bash
# 查看帮助
hotkey-cli --help

# 列出所有任务
hotkey-cli list

# 运行指定任务
hotkey-cli run "系统信息"

# 启动后台服务
hotkey-cli start

# 查看日志
hotkey-cli logs --task "系统信息"
```

## 配置文件

配置文件使用 TOML 格式，默认位置：
- Windows: `%APPDATA%\HotkeyRunner\config.toml`
- macOS: `~/Library/Application Support/HotkeyRunner/config.toml`
- Linux: `~/.config/HotkeyRunner/config.toml`

示例配置：

```toml
[general]
theme = "dark"
auto_start = false
log_retention_days = 30
log_level = "info"

[[tasks]]
name = "系统信息"
description = "显示系统信息"
hotkey = "Ctrl+Shift+I"
script_type = "python"
script_path = ""
working_dir = "."
enabled = true
script_content = '''
import platform
print(f"系统: {platform.system()}")
'''

[tasks.env]
PATH = "/usr/local/bin:/usr/bin:/bin"
```

更多示例请参考 [example.config.toml](file:///e:/soloM/m6/example.config.toml)

## 快捷键格式

支持以下修饰键：
- `Ctrl` / `Control`
- `Shift`
- `Alt` / `Option`
- `Meta` / `Cmd` / `Command` / `Super` / `Win`

示例：
- `Ctrl+Alt+T`
- `Shift+Ctrl+S`
- `Meta+P`

## 文档

详细文档请参考：
- [产品需求文档 (PRD)](file:///e:/soloM/m6/.trae/documents/prd.md)
- [技术架构文档](file:///e:/soloM/m6/.trae/documents/tech-arch.md)

## 开发计划

- [x] 项目初始化和依赖配置
- [x] 产品需求文档和技术架构设计
- [x] Rust 后端核心模块实现
- [x] 全局快捷键监听
- [x] 脚本执行引擎
- [x] 系统托盘菜单
- [x] CLI 命令行工具
- [x] 前端 UI 界面
- [x] 前后端 IPC 通信
- [ ] 完整的单元测试
- [ ] 跨平台打包和发布

## 许可证

MIT License
