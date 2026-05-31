# LAN Share - 局域网共享工具

跨平台（Windows/Mac/Linux）桌面应用，基于 Tauri 框架开发。

## 功能特性

### 🔐 端到端安全加密
- ✅ **RSA-2048 非对称加密**：设备配对时交换公钥
- ✅ **AES-256-GCM 对称加密**：文件和剪贴板内容加密传输
- ✅ **二维码配对**：扫码交换公钥，安全便捷
- ✅ **安全连接标识**：UI 显示 🔐 安全连接标志
- ✅ **未配对设备隔离**：未配对设备无法传输文件

### 🌐 UDP 组播设备自动发现
- ✅ 多网卡支持：在所有网络接口上同时发送/接收组播包
- ✅ 自动检测 WiFi、有线网等多个网络接口
- ✅ 接口级组播绑定，避免路由选择错误

### 📁 HTTP 直连文件传输
- ✅ **断点续传**：传输中断后可从已接收位置继续
- ✅ **分块传输**：1MB 分块，适合大文件
- ✅ **校验和验证**：每块数据校验，确保完整性
- ✅ **进度显示**：实时显示传输进度
- ✅ **临时文件**：传输中保存为 .lanshare_partial_ 前缀的临时文件
- ✅ **加密传输**：已配对设备间自动启用 AES 加密

### 📋 剪贴板同步
- ✅ 多网卡广播支持
- ✅ 内容去重，避免循环同步
- ✅ **加密广播**：已配对设备间剪贴板内容自动加密

## 技术栈

- **前端**: HTML + CSS + JavaScript + Vite
- **后端**: Rust + Tauri
- **网络**:
  - UDP 组播 (239.255.255.250:1900)
  - HTTP 文件传输 (端口 58763)
  - 剪贴板同步 (端口 58764)

## 开发环境要求

### Windows 环境准备
1. **安装 MSVC Build Tools**（推荐）
   - 下载并安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - 勾选 "Desktop development with C++" 工作负载
   
   或使用 winget 安装：
   ```bash
   winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools"
   ```

2. **或安装 MinGW-w64**
   ```bash
   winget install -e --id GnuWin32.Make
   # 或从 https://www.mingw-w64.org/ 下载安装
   ```

### 通用环境要求
1. 安装 Node.js (>= 16)
2. 安装 Rust (>= 1.70)
   ```bash
   # 使用 MSVC 工具链（推荐）
   rustup default stable-x86_64-pc-windows-msvc
   
   # 或使用 GNU 工具链
   rustup default stable-x86_64-pc-windows-gnu
   ```
3. 安装 Tauri CLI:
```bash
npm install -g @tauri-apps/cli
```

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
npm run tauri dev
```

## 构建生产版本

```bash
npm run tauri build
```

## 使用说明

### 1. 设备发现
- 应用启动后会自动通过 UDP 组播在局域网内广播自身信息
- 自动发现同网段内运行本应用的其他设备

### 2. 文件传输
- 拖拽或点击选择文件
- 选择目标设备
- 点击发送
- 接收的文件保存在系统下载目录

### 3. 剪贴板同步
- 点击开关开启剪贴板同步
- 复制的文本内容会自动广播到局域网内其他开启同步的设备
- 收到的内容自动写入本地剪贴板

## 端口说明

| 端口 | 协议 | 用途
|------|------|------
| 58762 | UDP | 设备发现监听
| 58763 | TCP | HTTP 文件传输
| 58764 | UDP | 剪贴板同步

## 核心实现说明

### 双网卡 UDP 组播修复

**问题**：在多网卡环境下（如同时连接 WiFi 和有线网），UDP 组播包可能通过错误的接口发送，导致其他设备无法收到。

**解决方案**：
1. 使用 `local_ip_address::list_afinet_netifas()` 枚举所有网络接口
2. 对每个非回环、非链路本地的 IPv4 地址：
   - 创建独立的 UDP socket 绑定到该接口 IP
   - 使用 `set_multicast_if_v4()` 指定组播发送接口
   - 使用 `join_multicast_v4()` 在指定接口加入组播组
3. 设备发现、剪贴板监听都在所有接口上并行运行

**关键代码**：[main.rs](file:///e:/soloM/m40/src-tauri/src/main.rs#L79-L101) `get_all_local_ips()` 函数

### 断点续传实现

**问题**：大文件传输过程中如果网络中断，需要重新传输整个文件。

**解决方案**：
1. **分块传输**：将文件按 1MB 分块，逐块传输
2. **状态查询**：`GET /status?filename=xxx&file_size=xxx` 查询已接收字节数
3. **断点续传**：从已接收的偏移位置继续传输
4. **校验和验证**：每块数据计算校验和，确保传输完整性
5. **临时文件**：传输中保存为 `.lanshare_partial_文件名`，完成后重命名
6. **元数据持久化**：传输进度保存在 `.lanshare_partial_文件名.info` JSON 文件中

**API 接口**：
- `GET /status` - 查询文件传输状态
- `POST /receive` - 接收文件块（支持 offset 参数）

**关键代码**：
- [main.rs](file:///e:/soloM/m40/src-tauri/src/main.rs#L514-L566) `get_file_status()` 和 `send_file_chunk()` 命令
- [index.html](file:///e:/soloM/m40/index.html#L505-L575) `sendFileWithResume()` 前端实现

### 安全加密与二维码配对

**设计思路**：
1. **RSA 密钥对**：应用启动时自动生成 RSA-2048 密钥对
2. **公钥交换**：通过二维码/手动输入方式交换设备公钥
3. **混合加密**：
   - 使用对方公钥 RSA 加密随机生成的 AES-256 密钥
   - 使用 AES-256-GCM 加密实际传输的数据
   - 随数据发送加密后的 AES 密钥和随机 nonce
4. **接收解密**：用私钥解密得到 AES 密钥，再解密数据

**配对流程**：
```
设备 A                          设备 B
   |                              |
   |---- 生成二维码 ------------> |  扫码获取 A 的公钥
   |                              |  保存 A 的公钥
   |                              |---- 发送 B 的公钥 ----|
   |<--------------------------- |                      |
   | 保存 B 的公钥                                         |
   |<-------------------------------------- 双向配对完成 ->|
```

**关键代码**：
- [crypto.rs](file:///e:/soloM/m40/src-tauri/src/crypto.rs) 加密核心模块（RSA+AES）
- [main.rs](file:///e:/soloM/m40/src-tauri/src/main.rs#L590-L625) `get_qr_code_data()` 和 `pair_with_device()` 命令
- [main.rs](file:///e:/soloM/m40/src-tauri/src/main.rs#L320-L388) `/pair` HTTP 配对接口

## 常见问题

### 编译时提示 `link.exe` 或 `dlltool.exe` 未找到

这是因为缺少 C++ 编译工具链。请安装：
- **Windows**: MSVC Build Tools 或 MinGW-w64
- **Linux**: `sudo apt install build-essential`
- **Mac**: `xcode-select --install`

### 设备无法互相发现

1. 确保两台设备在同一局域网
2. 检查防火墙是否允许 UDP 端口 58762、58764
3. 确保路由器支持组播（多数家用路由器默认支持）
4. 多网卡环境下会自动在所有接口广播

### 断点续传不生效

1. 确保接收方的临时文件（`.lanshare_partial_*`）未被删除
2. 确保文件名和文件大小完全一致
3. 临时文件默认保存在系统临时目录
