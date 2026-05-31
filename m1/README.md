# DICOM 医学影像处理系统

基于 Rust/WebAssembly + Go 的医学影像处理系统，支持 DICOM 格式解析、窗宽窗位调节、脱敏处理和云存储。

## 系统架构

```
┌───────────────────────────────────────────────────────────┐
│                     前端 (浏览器)                          │
│  ┌─────────────────┐     ┌────────────────────────────┐  │
│  │  HTML/CSS/JS    │────▶│  Rust/Wasm 模块            │  │
│  │  (用户界面)     │     │  - DICOM 解析              │  │
│  │                 │     │  - 像素渲染                │  │
│  │                 │     │  - 窗宽窗位调节            │  │
│  │                 │     │  - 脱敏处理                │  │
│  └─────────────────┘     └────────────────────────────┘  │
│                           │                               │
│                           ▼                               │
│                  REST API (/api/images)                  │
└───────────────────────────┬───────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────┐
│                     后端 (Go)                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Gin 框架 RESTful API                              │   │
│  │  - POST   /api/images       (上传影像)              │   │
│  │  - GET    /api/images       (影像列表)              │   │
│  │  - GET    /api/images/:id   (影像详情)              │   │
│  │  - GET    /api/images/:id/download (下载)           │   │
│  │  - DELETE /api/images/:id   (删除影像)              │   │
│  └───────────────────┬────────────────────────────────┘   │
│                      │                                    │
│          ┌───────────┴───────────┐                        │
│          ▼                       ▼                        │
│  ┌──────────────┐      ┌──────────────────┐              │
│  │  PostgreSQL  │      │  MinIO 对象存储  │              │
│  │  (元数据)    │      │  (影像文件)      │              │
│  └──────────────┘      └──────────────────┘              │
└───────────────────────────────────────────────────────────┘
```

## 功能特性

### 前端 (Rust + WebAssembly)
- ✅ DICOM (.dcm) 文件解析
- ✅ 医学影像渲染到 Canvas
- ✅ 窗宽窗位 (Window Level) 实时调节
- ✅ 预设窗宽窗位（肺部、纵隔、骨骼、脑部、腹部）
- ✅ 拖拽调节窗宽窗位
- ✅ 滚轮调节窗宽
- ✅ 脱敏元数据导出（移除患者姓名等敏感信息）
- ✅ PNG 格式导出
- ✅ 多文件管理

### 后端 (Go)
- ✅ RESTful API 接口
- ✅ MinIO 对象存储集成
- ✅ PostgreSQL 元数据存储
- ✅ 影像上传、下载、删除
- ✅ 预签名 URL 访问
- ✅ 脱敏日志记录
- ✅ CORS 跨域支持
- ✅ 优雅关闭

## 技术栈

### 前端
- **Rust** - 系统级编程语言
- **WebAssembly** - 高性能浏览器执行
- **dicom-rs** - DICOM 格式解析库
- **wasm-bindgen** - Rust 与 JS 交互
- **Vite** - 前端构建工具

### 后端
- **Go 1.22+** - 编程语言
- **Gin** - Web 框架
- **PostgreSQL** - 关系型数据库
- **MinIO** - 对象存储
- **lib/pq** - PostgreSQL 驱动
- **minio-go** - MinIO SDK

### 基础设施
- **Docker** - 容器化部署
- **Docker Compose** - 服务编排

## 快速开始

### 前置要求
- Docker Desktop (Windows) 或 Docker Engine
- Go 1.22+
- Rust 1.75+
- Node.js 18+
- wasm-pack (`cargo install wasm-pack`)

### 1. 启动基础设施

```powershell
# Windows PowerShell
.\start-services.ps1
```

或手动执行：

```bash
docker-compose up -d
```

### 2. 启动后端服务

```bash
cd backend
go mod tidy
go run .
```

后端服务将在 `http://localhost:8080` 启动

### 3. 编译并启动前端

```bash
cd frontend

# 编译 Rust 为 WebAssembly
wasm-pack build --target web

# 安装前端依赖
npm install

# 启动开发服务器
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

## API 文档

### 健康检查
```
GET /api/health
```

### 上传影像
```
POST /api/images
Content-Type: multipart/form-data

参数:
- file: PNG 图像文件
- metadata: JSON 格式的元数据
```

### 获取影像列表
```
GET /api/images?limit=20&offset=0
```

### 获取影像详情
```
GET /api/images/:id
```

### 下载影像
```
GET /api/images/:id/download
```

### 获取预签名 URL
```
GET /api/images/:id/url
```

### 删除影像
```
DELETE /api/images/:id
```

## 窗宽窗位说明

### 预设值
| 预设 | 窗位 (WC) | 窗宽 (WW) | 适用部位 |
|------|----------|----------|---------|
| 肺部 | -600 | 1500 | 肺组织 |
| 纵隔 | 40 | 400 | 纵隔结构 |
| 骨骼 | 400 | 1800 | 骨骼系统 |
| 脑部 | 40 | 80 | 脑组织 |
| 腹部 | 60 | 400 | 腹部器官 |

### 操作方式
- **滑块调节**: 使用左侧面板的滑块
- **数值输入**: 直接输入精确数值
- **画布拖拽**: 在画布上水平拖动调节窗位，垂直拖动调节窗宽
- **滚轮调节**: 在画布上滚动鼠标滚轮调节窗宽

## 项目结构

```
.
├── docker-compose.yml          # Docker 服务编排
├── start-services.ps1          # Windows 启动脚本
├── README.md                   # 项目文档
├── .gitignore                  # Git 忽略配置
├── frontend/                   # 前端项目
│   ├── Cargo.toml             # Rust 依赖配置
│   ├── package.json           # Node 依赖配置
│   ├── vite.config.js         # Vite 配置
│   ├── index.html             # HTML 入口
│   ├── styles.css             # 样式文件
│   ├── main.js                # JavaScript 入口
│   └── src/
│       └── lib.rs             # Rust/Wasm 核心代码
└── backend/                    # 后端项目
    ├── go.mod                 # Go 依赖配置
    ├── .env                   # 环境变量
    ├── .env.example           # 环境变量示例
    ├── init.sql               # 数据库初始化脚本
    ├── main.go                # 应用入口
    ├── config/
    │   └── config.go          # 配置管理
    ├── models/
    │   └── image.go           # 数据模型
    ├── db/
    │   └── postgres.go        # 数据库操作
    ├── storage/
    │   └── minio.go           # MinIO 存储操作
    └── handlers/
        └── image.go           # API 处理函数
```

## 数据库表结构

### images 表
存储影像元数据信息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| patient_id | VARCHAR | 患者ID（脱敏后） |
| study_uid | VARCHAR | 检查UID |
| series_uid | VARCHAR | 序列UID |
| sop_instance_uid | VARCHAR | 实例UID |
| modality | VARCHAR | 检查类型（CT/MRI等） |
| body_part_examined | VARCHAR | 检查部位 |
| study_date | DATE | 检查日期 |
| minio_bucket | VARCHAR | MinIO 存储桶 |
| minio_object_name | VARCHAR | MinIO 对象名 |
| file_size | BIGINT | 文件大小（字节） |
| width | INTEGER | 图像宽度 |
| height | INTEGER | 图像高度 |
| bits_allocated | INTEGER | 分配位深 |
| window_center | INTEGER | 窗位 |
| window_width | INTEGER | 窗宽 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### anonymization_logs 表
存储脱敏操作日志

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| image_id | UUID | 关联影像ID |
| original_patient_name | VARCHAR | 原始患者姓名 |
| anonymized_patient_id | VARCHAR | 脱敏后患者ID |
| anonymized_at | TIMESTAMP | 脱敏时间 |
| anonymized_by | VARCHAR | 脱敏操作者 |

## 数据安全

### 脱敏处理
- 前端在上传前移除患者姓名等敏感信息
- 仅保留必要的医学元数据
- 所有脱敏操作记录日志

### 存储安全
- MinIO 支持 SSL/TLS 加密传输
- 可配置预签名 URL 实现安全访问
- 数据库连接支持 SSL 模式

## 常见问题

### Q: DICOM 文件加载失败？
A: 确保文件格式正确（.dcm 后缀），检查浏览器控制台的错误信息。

### Q: 服务连接失败？
A: 确认 Docker 容器正常运行，检查端口 5432（PostgreSQL）和 9000/9001（MinIO）是否被占用。

### Q: 编译 Wasm 出错？
A: 确保已安装 wasm-pack：`cargo install wasm-pack`，并使用最新的 Rust 稳定版。

### Q: 上传文件大小限制？
A: 默认最大 50MB，可在 `backend/.env` 中修改 `MAX_UPLOAD_SIZE` 配置。

## 许可证

MIT License
