## 1. 架构设计

```mermaid
flowchart TB
    subgraph "前端层 (Vite + React)"
        "React UI 组件" --> "cornerstone.js 渲染引擎"
        "React UI 组件" --> "WASM DICOM 解析器"
        "WASM DICOM 解析器" --> "元数据展示"
        "cornerstone.js 渲染引擎" --> "Canvas 影像渲染"
    end
    subgraph "服务端层 (Node.js + Express)"
        "RESTful API" --> "文件上传处理"
        "RESTful API" --> "文件列表查询"
        "文件上传处理" --> "本地磁盘存储"
        "文件列表查询" --> "本地磁盘存储"
    end
    subgraph "WASM 模块 (C → Emscripten)"
        "DICOM 二进制解析" --> "元数据提取"
        "像素数据读取" --> "窗宽窗位计算"
    end
    "前端层" -->|"HTTP 请求"| "服务端层"
    "本地磁盘存储" -->|"二进制数据"| "前端层"
```

## 2. 技术说明

- **前端**：React@18 + TypeScript + TailwindCSS@3 + Vite
- **初始化工具**：Vite (create-vite)
- **后端**：Express@4 + multer（文件上传）+ cors
- **数据库**：无，文件元数据从 DICOM 文件实时解析
- **WASM 模块**：C 语言编写，Emscripten (emcc) 编译为 .wasm + .js 胶水代码
- **影像渲染**：cornerstone-core + cornerstone-wado-image-loader
- **文件存储**：本地磁盘 `server/uploads/` 目录

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| `/` | 影像管理页（文件上传 + 文件列表） |
| `/viewer/:fileId` | 影像查看页（Canvas 渲染 + 窗宽窗位 + 元数据） |

## 4. API 定义

### 4.1 上传 DICOM 文件

```
POST /api/files/upload
Content-Type: multipart/form-data
Body: file (单个 .dcm 文件)

Response 200:
{
  "id": "uuid-string",
  "filename": "original.dcm",
  "size": 524288,
  "uploadedAt": "2026-05-30T10:00:00Z"
}
```

### 4.2 获取文件列表

```
GET /api/files

Response 200:
{
  "files": [
    {
      "id": "uuid-string",
      "filename": "CT_SCAN_001.dcm",
      "size": 524288,
      "uploadedAt": "2026-05-30T10:00:00Z"
    }
  ]
}
```

### 4.3 获取 DICOM 文件二进制数据

```
GET /api/files/:id

Response 200: application/dicom (二进制流)
```

### 4.4 删除 DICOM 文件

```
DELETE /api/files/:id

Response 200:
{
  "success": true
}
```

## 5. 服务端架构图

```mermaid
flowchart LR
    "Router" --> "Upload Controller"
    "Router" --> "File Controller"
    "Upload Controller" --> "FileService"
    "File Controller" --> "FileService"
    "FileService" --> "LocalStorage"
```

## 6. WASM 模块设计

### 6.1 C 源码架构

- `dicom_parser.c`：DICOM Part 10 格式解析主逻辑
  - 读取 128 字节前导 + 4 字节 "DICM" 魔数验证
  - 遍历 Data Elements，按 Tag + VR + Length + Value 结构解析
  - 提取关键标签：PatientName(0010,0010)、SliceThickness(0018,0050)、PixelSpacing(0028,0030)、Rows(0028,0010)、Columns(0028,0011)、BitsAllocated(0028,0100)、WindowCenter(0028,1050)、WindowWidth(0028,1051)、RescaleIntercept(0028,1052)、RescaleSlope(0028,1053)
- `dicom_parser.h`：导出函数声明
- `emscripten_glue.c`：Emscripten 导出包装函数

### 6.2 导出函数

```c
// 解析 DICOM 文件，返回元数据 JSON 字符串指针
char* parse_dicom_metadata(const uint8_t* data, uint32_t length);

// 释放由 parse_dicom_metadata 分配的内存
void free_parsed_result(char* ptr);

// 获取像素数据缓冲区（用于窗宽窗位计算）
uint8_t* get_pixel_buffer();
uint32_t get_pixel_buffer_size();
```

### 6.3 构建命令

```bash
emcc dicom_parser.c emscripten_glue.c \
  -s EXPORTED_FUNCTIONS="['_parse_dicom_metadata','_free_parsed_result','_get_pixel_buffer','_get_pixel_buffer_size']" \
  -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','UTF8ToString','getValue','setValue']" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -o dicom_parser.js
```

### 6.4 JS 回退方案

当 WASM 模块不可用时（如未安装 Emscripten），前端提供纯 JavaScript DICOM 解析器作为降级方案，确保应用始终可用。

## 7. 项目目录结构

```
m71/
├── server/                  # Node.js 后端
│   ├── index.js             # Express 服务器入口
│   ├── routes/              # API 路由
│   ├── services/            # 业务逻辑
│   └── uploads/             # DICOM 文件存储
├── src/                     # Vite 前端
│   ├── main.tsx             # 入口
│   ├── App.tsx              # 路由与布局
│   ├── pages/               # 页面组件
│   ├── components/          # 通用组件
│   ├── wasm/                # WASM 模块及胶水代码
│   ├── lib/                 # 工具库（DICOM 解析回退）
│   └── types/               # TypeScript 类型定义
├── wasm-src/                # C 源码（WASM 编译前）
│   ├── dicom_parser.c
│   ├── dicom_parser.h
│   ├── emscripten_glue.c
│   └── build.bat            # Windows 构建脚本
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```
