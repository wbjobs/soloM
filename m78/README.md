# git-commit-ai

私有化 Git Commit Message 自动生成 CLI 工具，基于本地部署的 LLM（如 Ollama）生成符合 Conventional Commits 规范的 Commit Message。

## 功能特性

- 🔒 **私有化部署** - 所有数据本地处理，不依赖外部 API
- 🤖 **智能生成** - 基于代码变更自动分析并生成 Commit Message
- ✅ **规范验证** - 严格遵循 Conventional Commits 规范
- 🚀 **本地 LLM 支持** - 支持 Ollama 及 OpenAI 兼容接口
- 🎯 **交互式操作** - 生成后可编辑、确认后提交
- 🔗 **Git Hook 集成** - 可选安装 Git Hook 自动触发

## 安装

### 前置要求

- Node.js >= 16.0.0
- Git
- 本地部署的 LLM 服务（推荐 Ollama + Llama3）

### 安装步骤

1. 克隆或下载本项目到本地

2. 安装依赖：
```bash
npm install
```

3. 全局链接（可选，方便在任意目录使用）：
```bash
npm link
```

## 快速开始

### 1. 配置 LLM 服务

初始化配置文件：
```bash
git-commit-ai config --init
```

生成的配置文件 `.git-commit-ai.json`：
```json
{
  "llm": {
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "llama3",
    "options": {
      "temperature": 0.7,
      "top_p": 0.9
    }
  },
  "commit": {
    "maxLength": 72,
    "language": "zh-CN",
    "types": ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"]
  }
}
```

### 2. 安装 Ollama 和 Llama3（如未安装）

```bash
# 安装 Ollama: https://ollama.ai/

# 拉取 Llama3 模型
ollama pull llama3
```

### 3. 使用工具

```bash
# 1. 添加文件到暂存区
git add .

# 2. 生成 Commit Message
git-commit-ai

# 或使用短命令
gca
```

## 命令说明

### 生成 Commit Message（默认命令）

```bash
git-commit-ai [generate] [options]
```

选项：
- `-y, --yes` - 自动确认并提交，不进行询问
- `-e, --edit` - 生成后允许编辑 Commit Message
- `-c, --config <path>` - 指定配置文件路径

示例：
```bash
# 直接生成并提交（无需确认）
git-commit-ai -y

# 生成后可编辑
git-commit-ai -e
```

### 配置管理

```bash
# 初始化项目配置文件
git-commit-ai config --init

# 显示当前配置
git-commit-ai config --show
```

### Git Hook 管理

```bash
# 安装 prepare-commit-msg hook
git-commit-ai hook --install

# 卸载 hook
git-commit-ai hook --uninstall
```

## Conventional Commits 规范

生成的 Commit Message 遵循以下格式：

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Type 类型说明

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响代码运行） |
| `refactor` | 重构（既不是新增功能，也不是修改 bug） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `build` | 构建系统或外部依赖变更 |
| `ci` | CI 配置变更 |
| `chore` | 其他不修改 src 或 test 的变更 |
| `revert` | 回滚提交 |

## 配置说明

### LLM 配置

#### Ollama（默认）
```json
{
  "llm": {
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "llama3",
    "options": {
      "temperature": 0.7,
      "top_p": 0.9
    }
  }
}
```

#### OpenAI 兼容接口
```json
{
  "llm": {
    "provider": "openai-compatible",
    "baseUrl": "http://your-api-endpoint",
    "apiKey": "your-api-key",
    "model": "your-model-name",
    "options": {
      "temperature": 0.7
    }
  }
}
```

### Commit 配置

```json
{
  "commit": {
    "maxLength": 72,
    "language": "zh-CN",
    "types": ["feat", "fix", "..."]
  }
}
```

- `maxLength`: 标题最大长度
- `language`: 语言设置 (`zh-CN` 或 `en`)
- `types`: 允许的 type 类型列表

## 配置文件优先级

1. 命令行指定的配置文件 (`-c, --config`)
2. 项目目录配置文件 (`.git-commit-ai.json`)
3. 用户目录配置文件 (`~/.git-commit-ai.json`)
4. 默认配置

## 项目结构

```
.
├── src/
│   ├── cli.js              # CLI 入口
│   ├── commit-generator.js # Commit Message 生成器
│   ├── config.js           # 配置管理
│   ├── git-utils.js        # Git 操作工具
│   ├── llm-client.js       # LLM API 客户端
│   └── prompts.js          # 交互式提示
├── scripts/
│   ├── install-git-hook.js   # 安装 Git Hook
│   └── uninstall-git-hook.js # 卸载 Git Hook
├── package.json
└── README.md
```

## 常见问题

### Q: 无法连接到 Ollama 服务？

A: 请确保 Ollama 服务已启动：
```bash
ollama serve
```

### Q: 如何更换模型？

A: 修改配置文件中的 `llm.model` 字段，支持 Ollama 的所有模型。

### Q: 如何调试？

A: 设置环境变量 DEBUG 查看详细错误：
```bash
DEBUG=1 git-commit-ai
```

## License

MIT
