@echo off
echo ========================================
echo   网络拓扑生成器 - 后端服务启动
echo ========================================
echo.

echo [1/3] 检查虚拟环境...
if not exist venv (
    echo 创建虚拟环境...
    python -m venv venv
)

echo [2/3] 激活虚拟环境并安装依赖...
call venv\Scripts\activate
pip install -r requirements.txt

echo [3/3] 启动 Flask 服务...
echo.
echo 服务地址: http://localhost:5000
echo API 文档: /api/health, /api/algorithms, /api/device-types
echo.
echo 按 Ctrl+C 停止服务
echo.

python -m app

pause
