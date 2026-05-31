# 大规模粒子流体物理模拟器 (SPH Fluid Simulator)

一个基于浏览器的物理模拟系统，使用 WebGPU API 和 SPH（光滑粒子流体动力学）算法，可模拟 10 万+ 粒子的流体运动。

## 功能特性

- 🚀 **WebGPU 加速**: 使用最新的 WebGPU API 进行 GPU 并行计算
- 💧 **SPH 算法**: 实现完整的光滑粒子流体动力学算法
- 🎛️ **实时参数调节**: 支持调节粘度、重力、粒子半径等参数
- 📊 **参数服务**: 后端 FastAPI 提供 RESTful API 管理模拟参数
- 💾 **PLY 导出**: 支持将模拟结果导出为 PLY 格式点云文件
- 🎨 **美观 UI**: 现代化的深色主题界面

## 技术栈

### 前端
- TypeScript
- WebGPU API
- WGSL 着色器
- Vite 构建工具

### 后端
- Python 3.8+
- FastAPI
- Uvicorn ASGI 服务器

## 项目结构

```
m99/
├── src/
│   ├── shaders/
│   │   ├── sph_common.wgsl      # 公共定义和核函数
│   │   ├── sph_hash.wgsl        # 空间哈希计算
│   │   ├── sph_density.wgsl     # 密度和压力计算
│   │   ├── sph_force.wgsl       # 力计算和积分
│   │   └── sph_render.wgsl      # 粒子渲染着色器
│   ├── SPHSimulator.ts          # SPH 模拟器核心类
│   ├── types.ts                 # 类型定义
│   ├── api.ts                   # API 客户端
│   ├── main.ts                  # 主入口文件
│   └── style.css                # 样式文件
├── backend/
│   └── main.py                  # FastAPI 后端服务
├── index.html                   # HTML 入口
├── package.json                 # 前端依赖
├── tsconfig.json                # TypeScript 配置
├── vite.config.ts               # Vite 配置
├── requirements.txt             # Python 依赖
└── README.md                    # 项目说明
```

## 快速开始

### 环境要求

- **浏览器**: Chrome 113+ / Edge 113+ (支持 WebGPU)
- **Node.js**: 18+
- **Python**: 3.8+

### 安装依赖

#### 前端依赖
```bash
npm install
```

#### 后端依赖
```bash
pip install -r requirements.txt
```

### 启动服务

#### 启动后端 API 服务
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

后端服务将在 http://localhost:8000 启动

API 文档: http://localhost:8000/docs

#### 启动前端开发服务器
```bash
npm run dev
```

前端服务将在 http://localhost:3000 启动

### 构建生产版本
```bash
npm run build
```

## 使用说明

### 模拟参数

- **粒子数量**: 1,000 - 200,000 个粒子
- **重力**: -20 到 0 (向下为负)
- **粘度**: 0 - 0.5
- **粒子半径**: 0.01 - 0.1
- **静止密度**: 500 - 2000

### 操作按钮

- **开始模拟**: 启动 SPH 流体模拟
- **暂停**: 暂停模拟
- **重置**: 重置所有粒子到初始状态
- **应用参数**: 应用当前设置的参数
- **导出 PLY 点云**: 导出当前状态为 PLY 文件
- **从服务器获取参数**: 从后端 API 获取最新参数

## SPH 算法实现

### 核函数

1. **Poly6 核函数**: 用于密度计算
2. **Spiky 核函数梯度**: 用于压力计算
3. **Viscosity 核函数拉普拉斯**: 用于粘度计算

### 计算流程

每个模拟帧执行以下步骤:

1. **空间哈希**: 将粒子按空间位置哈希排序
2. **密度计算**: 使用 Poly6 核函数计算每个粒子的密度
3. **压力计算**: 根据状态方程计算压力
4. **力计算**: 计算压力、粘度和重力
5. **积分更新**: 更新粒子速度和位置
6. **边界处理**: 处理粒子与边界碰撞
7. **渲染**: 使用实例化渲染绘制所有粒子

## API 接口

### 获取参数
```http
GET /api/params
```

### 设置参数
```http
POST /api/params
Content-Type: application/json

{
  "gravity": -9.8,
  "viscosity": 0.05,
  "particle_radius": 0.025,
  "rest_density": 1000,
  "smoothing_length": 0.1,
  "stiffness": 1000,
  "dt": 0.001
}
```

### 导出 PLY (ASCII)
```http
POST /api/export/ply
Content-Type: application/json

{
  "positions": [[x1,y1,z1], [x2,y2,z2], ...],
  "colors": [[r1,g1,b1], [r2,g2,b2], ...]
}
```

### 导出 PLY (二进制)
```http
POST /api/export/ply-binary
Content-Type: application/json
```

### 健康检查
```http
GET /api/health
```

## 性能说明

- **100,000 粒子**: 在现代 GPU 上可达到 60 FPS
- **优化建议**: 
  - 减少粒子数量以获得更高帧率
  - 调整时间步长 (dt) 控制模拟精度
  - 增大平滑长度减少邻居搜索时间

## 浏览器支持

目前 WebGPU 仅在以下浏览器支持:
- Chrome/Chromium 113+
- Microsoft Edge 113+
- Opera 99+

在 Chrome 中启用 WebGPU:
1. 访问 `chrome://flags/#enable-unsafe-webgpu`
2. 启用该选项
3. 重启浏览器

## 许可证

MIT License
