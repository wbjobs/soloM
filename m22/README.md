# 图片隐写 Web 应用 (LSB Steganography)

基于 Rust + WebAssembly + React + Vite 构建的图片隐写工具，使用 LSB（最低有效位）算法将文本信息隐藏到 PNG 图片中。

## 项目结构

```
m22/
├── steganography-wasm/    # Rust Wasm 模块
│   ├── src/
│   │   └── lib.rs         # LSB 算法实现
│   ├── Cargo.toml         # Rust 项目配置
│   └── target/            # 编译输出
├── frontend/              # React 前端应用
│   ├── src/
│   │   ├── wasm/
│   │   │   ├── steganography.js      # Wasm 绑定
│   │   │   └── steganography_wasm.wasm  # 编译后的 Wasm
│   │   ├── App.jsx        # 主应用组件
│   │   ├── index.css      # 样式文件
│   │   └── main.jsx       # 入口文件
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## 功能特性

- 🔐 **LSB 隐写算法**：将文本信息隐藏到图片像素的最低有效位
- 📝 **编码功能**：上传 PNG 图片，输入文本，生成含隐藏信息的图片
- 🔍 **解码功能**：从包含隐藏信息的图片中提取文本
- ⚡ **高性能**：核心算法使用 Rust 编译为 WebAssembly
- 🎨 **现代 UI**：使用 React 构建的现代化用户界面

## 算法原理

LSB (Least Significant Bit) 最低有效位算法：

1. 每个像素包含 RGBA 四个通道（每个通道 8 位）
2. 将文本信息的每个比特位替换到像素通道的最低位
3. 由于最低位变化对视觉影响极小，人眼无法察觉差异
4. 解码时按相反顺序提取最低位，还原原始文本

## 快速开始

### 启动开发服务器

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000

### 重新编译 Rust Wasm

```bash
cd steganography-wasm
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/steganography_wasm.wasm ../frontend/src/wasm/
```

## 使用说明

### 隐藏信息（编码）

1. 上传一张 PNG 格式的图片
2. 在文本框中输入要隐藏的信息
3. 点击"隐藏信息"按钮
4. 下载处理后的图片，信息已隐藏其中

### 提取信息（解码）

1. 上传包含隐藏信息的 PNG 图片
2. 点击"提取隐藏信息"按钮
3. 查看提取到的隐藏信息

## 技术栈

- **Rust**：核心算法实现，内存安全，高性能
- **WebAssembly**：将 Rust 代码编译为浏览器可执行的二进制格式
- **React 18**：现代化前端框架
- **Vite**：快速的构建工具和开发服务器
- **HTML5 Canvas**：图片像素操作

## 注意事项

- 仅支持 PNG 格式图片（无损压缩）
- 隐藏信息的大小取决于图片尺寸（每个像素可隐藏 4 比特）
- JPEG 等有损压缩格式会破坏隐藏的信息
- 建议使用尺寸较大的图片以隐藏更多信息
