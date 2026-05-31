@echo off
echo ========================================
echo   网络拓扑生成器 - 前端服务启动
echo ========================================
echo.

echo [1/2] 检查依赖...
if not exist node_modules (
    echo 安装 npm 依赖...
    npm install
)

echo [2/2] 启动开发服务器...
echo.
echo 服务地址: http://localhost:3000
echo 后端代理: /api -> http://localhost:5000
echo.
echo 请确保后端服务已启动!
echo 按 Ctrl+C 停止服务
echo.

npm run dev

pause
