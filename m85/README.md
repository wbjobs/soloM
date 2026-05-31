# ECS 程序化地牢生成器

基于 ECS (实体组件系统) 架构的程序化地牢生成器，使用 Rust 编写后端服务，支持通过 TCP 协议流式传输地图块数据给前端渲染客户端。

## 项目架构

```
┌─────────────────────────────────────────────────────────┐
│                     后端服务 (Rust)                     │
├─────────────────┬─────────────────┬─────────────────────┤
│   ECS 世界      │  生成系统       │   TCP 服务器        │
│  (Legion)      │  (BSP/CA)       │  (Tokio)           │
├─────────────────┼─────────────────┼─────────────────────┤
│  Components:   │  - BSP 树分块    │  - 消息帧协议       │
│  - Position    │  - 元胞自动机    │  - bincode/JSON     │
│  - Tile        │  - 房间连接      │  - 流式传输         │
│  - MapChunk    │  - 走廊生成      │  - 块缓存           │
│  - Room        │                 │                     │
└─────────────────┴─────────────────┴─────────────────────┘
                              │
                              │ TCP
                              ▼
┌─────────────────────────────────────────────────────────┐
│                  前端客户端 (Python)                    │
├─────────────────────────────────────────────────────────┤
│  - 异步 TCP 客户端                                      │
│  - Tkinter GUI 可视化                                   │
│  - 缩放、拖拽、漫游                                     │
│  - 控制台模式                                           │
└─────────────────────────────────────────────────────────┘
```

## 核心特性

### ECS 架构
- 使用 **Legion** ECS 库实现高性能的数据导向设计
- 组件：`Position`, `Tile`, `MapChunk`, `Room`, `ChunkCoord`, `Player`
- 系统：`generate_world`, `generate_chunk`
- 资源：`DungeonConfig`, `ChunkCache`

### 程序化生成算法

#### 1. BSP (二叉空间分割) 树算法
- 递归分割地图空间为叶节点
- 在每个叶节点中生成随机大小的房间
- 使用 L 形走廊连接相邻房间
- 自动放置上下楼梯

#### 2. 元胞自动机 (Cellular Automata)
- 初始化随机噪声（45% 墙，55% 地板）
- 5 次迭代，根据邻居数量更新瓦片状态
- 规则：≥5 个邻居墙 → 墙，≤3 个邻居墙 → 地板

### 网络传输
- **TCP 协议**，支持多客户端并发连接
- **消息帧格式**：4 字节小端长度前缀 + 消息体
- **序列化格式**：
  - Bincode (高性能二进制格式)
  - JSON (人类可读，便于调试)
- **流式传输**：按需请求地图块，支持懒加载
- **缓存机制**：已生成的块自动缓存，避免重复计算

### 地图块系统
- 地图被分割为固定大小的块（默认 32x32）
- 每个块使用基于坐标的种子独立生成
- 支持无限大地图（理论上）
- 块坐标到世界坐标的自动转换

## 目录结构

```
m85/
├── Cargo.toml              # Rust 项目配置
├── README.md               # 项目说明
├── src/
│   ├── main.rs             # 主程序入口
│   ├── lib.rs              # 库入口
│   ├── components.rs       # ECS 组件定义
│   ├── systems.rs          # ECS 系统与生成算法
│   └── network.rs          # 网络服务与序列化
└── client/
    └── dungeon_client.py   # Python 前端客户端
```

## 快速开始

### 前置要求

#### 后端 (Rust)
- Rust 1.70+ 工具链
- MSVC Build Tools 或 MinGW

#### 前端 (Python)
- Python 3.8+
- Tkinter (通常随 Python 安装)

### 构建后端

```bash
# 构建发布版本
cargo build --release

# 或者构建调试版本
cargo build
```

### 使用方式

#### 1. 生成地牢地图

```bash
# 使用 BSP 算法生成 64x64 地图并打印
cargo run --release -- generate --width 64 --height 64 --algorithm bsp --print

# 使用元胞自动机算法
cargo run --release -- generate --width 64 --height 64 --algorithm cellular --print

# 指定随机种子
cargo run --release -- generate --seed 12345 --print
```

#### 2. 启动 TCP 服务器

```bash
# 默认配置 (127.0.0.1:8080, 256x256 地图, 32x32 块, BSP 算法)
cargo run --release -- serve

# 自定义配置
cargo run --release -- serve \
  --addr 0.0.0.0:8080 \
  --width 512 --height 512 \
  --chunk-size 64 \
  --algorithm cellular \
  --format bincode

# 使用 JSON 序列化格式（便于调试）
cargo run --release -- serve --format json
```

#### 3. 性能基准测试

```bash
# 10 次迭代，每次生成 256x256 地图
cargo run --release -- benchmark --iterations 10

# 更大的地图
cargo run --release -- benchmark --iterations 5 --width 512 --height 512
```

### 使用 Python 客户端

#### GUI 可视化模式

```bash
# 启动 GUI 客户端
python client/dungeon_client.py

# 连接到自定义服务器
python client/dungeon_client.py --host 192.168.1.100 --port 8080

# 使用 JSON 格式
python client/dungeon_client.py --json
```

**GUI 操作**：
- **鼠标拖拽**：平移视图
- **鼠标滚轮**：缩放
- **方向键**：平移视图
- **+/- 键**：缩放
- **0 键**：重置视图
- **"Load All Chunks" 按钮**：加载整个地图

#### 控制台模式

```bash
# 请求并打印特定块
python client/dungeon_client.py --chunk 0 0 --no-gui

# 请求所有块并显示统计信息
python client/dungeon_client.py --all --no-gui
```

## 网络协议

### 消息类型

1. **RequestChunk (0)** - 请求地图块
   ```
   {
     "type": "RequestChunk",
     "x": 0,
     "y": 0
   }
   ```

2. **ChunkData (1)** - 返回地图块数据
   ```
   {
     "type": "ChunkData",
     "coord": {"x": 0, "y": 0},
     "width": 32,
     "height": 32,
     "tiles": [...],
     "seed": 12345
   }
   ```

3. **MapInfo (3)** - 地图信息（连接后自动发送）
   ```
   {
     "type": "MapInfo",
     "width": 256,
     "height": 256,
     "chunk_size": 32
   }
   ```

4. **Error (4)** - 错误消息
   ```
   {
     "type": "Error",
     "message": "..."
   }
   ```

### 帧格式

```
┌─────────────────┬────────────────────────────┐
│ 4 字节 (u32 LE) │  N 字节序列化消息体        │
│  消息体长度     │   (bincode 或 JSON)        │
└─────────────────┴────────────────────────────┘
```

## 瓦片类型

| 类型       | 值 | 字符 | 颜色       | 可通行 | 遮挡 |
|------------|----|------|------------|--------|------|
| Wall       | 0  | `#`  | `#1a1a2e`  | ❌     | ✅   |
| Floor      | 1  | `.`  | `#16213e`  | ✅     | ❌   |
| Door       | 2  | `+`  | `#e94560`  | ✅     | ❌   |
| Corridor   | 3  | `,`  | `#0f3460`  | ✅     | ❌   |
| StairUp    | 4  | `<`  | `#00ff88`  | ✅     | ❌   |
| StairDown  | 5  | `>`  | `#ffaa00`  | ✅     | ❌   |
| Water      | 6  | `~`  | `#0077be`  | ❌     | ❌   |
| Lava       | 7  | `^`  | `#ff4500`  | ❌     | ❌   |

## 配置选项

### DungeonConfig

| 参数            | 类型    | 默认值 | 说明                     |
|-----------------|---------|--------|--------------------------|
| width           | u32     | 256    | 地图宽度（瓦片数）       |
| height          | u32     | 256    | 地图高度（瓦片数）       |
| chunk_size      | u32     | 32     | 每个块的大小             |
| seed            | u64     | 42     | 随机种子                 |
| algorithm       | Enum    | BSP    | 生成算法 (BSP/Cellular) |
| min_room_size   | i32     | 6      | 最小房间尺寸             |
| max_room_size   | i32     | 15     | 最大房间尺寸             |
| room_padding    | i32     | 2      | 房间间距                 |

## 性能特征

- **生成速度**：~1-3ms 每块 (32x32)，取决于算法和硬件
- **内存占用**：每块约 3KB (32x32x3 字节)
- **网络传输**：每块约 1-3KB (bincode)，约 10KB (JSON)
- **并发处理**：Tokio 异步运行时支持数千并发连接

## 技术栈

### 后端
- **Rust** - 系统级编程语言
- **Legion** - 高性能 ECS 库
- **Tokio** - 异步运行时
- **Serde** - 序列化/反序列化
- **Bincode** - 高效二进制编码
- **Rand** - 随机数生成
- **Tracing** - 日志记录
- **Clap** - 命令行参数解析

### 前端
- **Python 3** - 脚本语言
- **Tkinter** - GUI 工具包
- **Socket** - 网络通信
- **Struct** - 二进制数据处理

## 扩展建议

1. **更多生成算法**：
   - 游走算法 (Drunkard's Walk)
   - 基于图的生成
   - Voronoi 图分割
   - 感知噪声 (Perlin Noise)

2. **功能增强**：
   - 实体（怪物、物品、NPC）生成系统
   - 光照与视场系统
   - 地图标记系统
   - 多层地牢支持

3. **网络优化**：
   - 增量更新
   - 压缩传输 (LZ4, zstd)
   - 预加载预测
   - UDP 快速通道

4. **可视化增强**：
   - 纹理贴图
   - 光照效果
   - 3D 渲染 (WebGL/Unity)
   - 小地图导航

## 故障排除

### 构建错误

**"linker `link.exe` not found"**
- 安装 Visual Studio Build Tools with C++ 支持
- 或使用 MinGW 工具链：`rustup default stable-x86_64-pc-windows-gnu`

**"dlltool.exe: program not found"**
- 安装 MinGW-w64 工具链
- 确保 `mingw64/bin` 在 PATH 中

### 运行错误

**"Address already in use"**
- 更改端口：`--addr 127.0.0.1:8081`
- 或关闭占用端口的程序

**连接超时**
- 检查防火墙设置
- 确认服务器正在运行
- 验证主机地址和端口

## 许可证

MIT License
