# 分子结构3D可视化与性质计算器

基于 WebGL 的分子结构 3D 交互可视化应用，支持加载和展示 .pdb (Protein Data Bank) 格式的分子结构文件，并提供原子性质计算功能。

## 功能特性

- 🧬 **PDB 文件解析** - 支持上传和解析标准 PDB 格式文件
- 🔬 **3D 球棍模型** - 使用 Three.js 实现高质量的 WebGL 3D 渲染
- 🖱️ **交互式操作** - 支持旋转、平移、缩放等视角控制
- 👆 **原子选择** - 点击选中/取消选中原子
- ⚖️ **质量计算** - 通过 Python 后端计算选中原子的平均相对原子质量

## 技术栈

- **前端**: HTML5, JavaScript, Three.js (WebGL)
- **后端**: Python 3.8+, FastAPI
- **通信**: RESTful API

## 快速开始

### 方法一：使用启动脚本（推荐）

1. **启动后端服务**
   - 双击运行 `start_backend.bat`
   - 等待依赖安装完成
   - 后端将在 `http://localhost:8000` 启动

2. **启动前端服务**
   - 双击运行 `start_frontend.bat`
   - 前端将在 `http://localhost:8080` 启动

3. **打开浏览器**
   - 访问 `http://localhost:8080` 开始使用

### 方法二：手动启动

1. **安装 Python 依赖**
   ```bash
   pip install -r requirements.txt
   ```

2. **启动后端**
   ```bash
   python main.py
   ```

3. **启动前端（在新终端）**
   ```bash
   python -m http.server 8080
   ```

4. **访问应用**
   - 在浏览器中打开 `http://localhost:8080`

## 使用说明

### 加载分子结构

1. **上传 PDB 文件**
   - 点击左侧面板的文件上传区域
   - 或直接拖拽 .pdb 文件到上传区域

2. **加载示例分子**
   - 点击 "加载示例分子" 按钮快速体验

### 3D 交互控制

- **左键拖动** - 旋转分子模型
- **右键拖动** - 平移视角
- **鼠标滚轮** - 缩放视图
- **点击原子** - 选中/取消选中原子

### 计算平均质量

1. 在 3D 视图中点击选中一个或多个原子
2. 点击右侧面板的 "计算平均相对原子质量" 按钮
3. 查看计算结果

### 显示设置

- 调整 **原子大小** 滑块改变原子球的大小
- 调整 **棍粗细** 滑块改变化学键的粗细
- 点击 "重置视角" 恢复默认视角

## API 接口

### 计算平均原子质量

```
POST /api/calculate-mass
```

**请求体:**
```json
{
  "atom_ids": [0, 1, 2],
  "atoms_data": [...]
}
```

**响应:**
```json
{
  "selected_count": 3,
  "total_mass": 42.081,
  "average_mass": 14.027,
  "atom_details": [...]
}
```

### 获取原子量数据

```
GET /api/atomic-weights
```

### 获取原子颜色数据

```
GET /api/atom-colors
```

## 文件结构

```
m75/
├── main.py              # FastAPI 后端服务
├── requirements.txt     # Python 依赖
├── index.html           # 前端界面
├── start_backend.bat    # 后端启动脚本
├── start_frontend.bat   # 前端启动脚本
└── examples/
    └── methane.pdb      # 示例 PDB 文件
```

## 支持的元素颜色

| 元素 | 颜色 | 元素 | 颜色 |
|------|------|------|------|
| H | 白色 | C | 灰色 |
| N | 蓝色 | O | 红色 |
| F/Cl | 绿色 | Br | 深红 |
| P | 橙色 | S | 黄色 |

## 注意事项

- 确保 8000 和 8080 端口未被占用
- 后端服务必须在前端之前启动
- 建议使用 Chrome 或 Firefox 浏览器获得最佳体验
- PDB 文件必须符合标准格式规范
