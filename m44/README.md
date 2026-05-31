# 二维流体动力学（Navier-Stokes）模拟可视化平台

一个基于稳定流体方法的交互式二维流体动力学模拟平台。

## 功能特性

### 障碍物系统

支持在 Canvas 上绘制黑色静态障碍物，流体能够绕过障碍物流动：

- **绘制方式**：
  - 鼠标右键直接绘制障碍物
  - 或勾选"障碍物绘制模式"后左键绘制
- **障碍物边界条件**：
  - 障碍物区域速度和密度设为 0
  - 障碍物边界应用反弹边界条件，流体无法穿透
  - 障碍物会影响扩散、投影、平流等所有流体计算步骤
- **控制按钮**：
  - 清除障碍物：只清除障碍物，保留流体
  - 全部重置：清除障碍物和流体
  - 障碍物大小：可调节绘制半径
- **预设场景**：
  - 溃坝模拟：带障碍物的经典溃坝流体测试

### 修复记录

### 问题修复 (2026-05-30)

#### 1. 高分辨率（512x512）内存溢出问题

**问题原因**：
- 原始代码中 `project()` 函数错误地将 `Vx/Vy` 速度数组用作临时缓冲区 `p` 和 `div`
- 这导致数据在计算过程中被覆盖，引发内存访问错误和崩溃
- Emscripten 初始内存配置不足

**修复方案**：
- 在 [fluid_solver.h](file:///e:/soloM/m44/cpp/fluid_solver.h#L44-L45) 中添加独立的 `p` 和 `div` 成员数组
- 在 [fluid_solver.cpp](file:///e:/soloM/m44/cpp/fluid_solver.cpp#L7-L8) 构造函数中初始化这些数组
- 更新 [CMakeLists.txt](file:///e:/soloM/m44/cpp/CMakeLists.txt#L16) 配置，增加初始内存到 64MB，最大内存到 512MB
- 动态调整迭代次数：≤128分辨率20次迭代，≤256分辨率15次迭代，>256分辨率10次迭代
- JavaScript 版本同步修复：[app.js](file:///e:/soloM/m44/public/app.js#L16-L17)

**内存使用**：
| 分辨率 | 网格大小 | 总内存 | 预计FPS |
|--------|----------|--------|---------|
| 128x128 | 16,900 | 0.52 MB | ~57 FPS |
| 256x256 | 66,564 | 2.03 MB | ~22 FPS |
| 384x384 | 148,996 | 4.55 MB | ~14 FPS |
| 512x512 | 264,196 | 8.06 MB | ~9 FPS |

#### 2. 速度场与密度场颜色映射不匹配（流体"倒流"）

**问题原因**：
- Canvas 坐标系的 y 轴向下为正，而流体解算器的 y 轴向上为正
- 密度场渲染、速度场渲染和鼠标交互使用了不一致的坐标映射
- 导致视觉上流体流动方向与实际方向相反

**修复方案**：
- 密度场渲染：在 [render()](file:///e:/soloM/m44/public/app.js#L478-L479) 中添加 y 轴反转 `fluidY = N - 1 - Math.floor(y / scale)`
- 速度场渲染：在 [renderVelocity()](file:///e:/soloM/m44/public/app.js#L526-L536) 中同步 y 轴坐标映射，并反转 y 速度分量
- 鼠标交互：在 [initMouse()](file:///e:/soloM/m44/public/app.js#L299) 中反转 y 坐标映射
- 添加箭头指示器，使速度方向更清晰可见

#### 3. 性能优化

- 使用颜色查找表预计算 HSV 到 RGB 的转换，减少每帧重复计算
- 缓存行基准索引 `rowBase = fy * N_plus_2`，减少重复的数组索引计算
- 优化速度场步长，根据分辨率动态调整 `step = max(8, N/32)`
- 添加高分辨率确认对话框，防止性能意外下降

## 项目结构

```
m44/
├── cpp/                          # C++ 核心解算模块
│   ├── fluid_solver.h           # 流体解算器头文件
│   ├── fluid_solver.cpp         # 流体解算器实现
│   ├── main.cpp                 # Emscripten 绑定
│   ├── CMakeLists.txt           # CMake 配置
│   └── build.sh                 # 编译脚本
├── public/                       # 前端文件
│   ├── index.html               # 主页面
│   ├── styles.css               # 样式文件
│   └── app.js                   # 前端逻辑（包含JS版解算器）
├── server/                       # Python 后端服务
│   ├── app.py                   # Flask 应用
│   ├── requirements.txt         # Python 依赖
│   ├── configs/                 # 配置存储目录
│   └── thumbnails/              # 缩略图存储目录
└── README.md                    # 项目说明
```

## 功能特性

### 1. C++ 核心解算模块
- 基于 Jos Stam 的稳定流体方法
- 实现三大核心算法：
  - **扩散 (Diffusion)**：速度和密度的扩散
  - **投影 (Projection)**：保证流体不可压缩
  - **平流 (Advection)**：物质的输运

### 2. 前端交互层
- HTML5 Canvas 实时渲染流体场
- 鼠标/触摸拖动产生速度和密度
- 可调节参数：
  - 粘度 (Viscosity)
  - 扩散率 (Diffusion)
  - 时间步长 (Time Step)
  - 分辨率 (Resolution)
- 显示选项：
  - 速度场可视化
  - 彩色/灰度模式
- 预设场景：
  - 喷射流
  - 漩涡
  - 爆炸
- 支持保存配置和截图

### 3. Python 后端服务
- 记录流体模拟的参数配置
- 存储和管理模拟结果的缩略图
- RESTful API 接口

## 快速开始

### 前端（直接运行）

项目包含 JavaScript 版本的流体解算器，可以直接在浏览器中运行：

1. 进入 `public` 目录
2. 使用任意 HTTP 服务器启动：

```bash
# 使用 Python
cd public
python -m http.server 8000

# 或使用 Node.js (http-server)
cd public
npx http-server -p 8000
```

3. 在浏览器中访问 `http://localhost:8000`

### C++ WebAssembly 版本（可选）

如果需要使用 C++ 编译的 WebAssembly 版本：

1. 安装 Emscripten SDK：
```bash
# 下载 Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

2. 编译 C++ 代码：
```bash
cd cpp
chmod +x build.sh
./build.sh
```

3. 修改 `public/app.js` 以使用 WebAssembly 模块

### Python 后端服务

1. 安装依赖：
```bash
cd server
pip install -r requirements.txt
```

2. 启动服务：
```bash
python app.py
```

服务将在 `http://localhost:5000` 启动

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/config` | 保存配置 |
| GET | `/api/configs` | 获取所有配置列表 |
| GET | `/api/config/<filename>` | 获取单个配置 |
| POST | `/api/thumbnail` | 保存缩略图 |
| GET | `/api/thumbnails` | 获取所有缩略图列表 |
| GET | `/thumbnails/<filename>` | 获取缩略图文件 |

## 使用说明

1. **鼠标交互**：按住鼠标左键在画布上拖动，会产生流体的速度和密度
2. **参数调节**：使用右侧控制面板调整模拟参数
3. **预设场景**：点击预设按钮快速加载不同的流体效果
4. **保存配置**：点击"保存配置"将当前参数发送到后端
5. **截图**：点击"截图"保存当前画面为 PNG 图片

## 算法原理

本项目基于 Jos Stam 在 1999 年 SIGGRAPH 论文 "Stable Fluids" 中提出的方法：

1. **添加外力**：通过鼠标交互添加速度和密度
2. **扩散**：使用隐式方法求解粘性扩散
3. **投影**：使用 Hodge 分解保证速度场无散度
4. **平流**：使用半拉格朗日方法进行物质输运

## 技术栈

- **核心算法**：C++ / JavaScript
- **WebAssembly**：Emscripten
- **前端渲染**：HTML5 Canvas
- **后端服务**：Python + Flask
- **图像处理**：Pillow
