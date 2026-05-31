@echo off
echo ========================================
echo 分子结构3D可视化 - 启动后端
echo ========================================
echo.

echo [1/3] 检查 Python 环境...
python --version
if errorlevel 1 (
    echo 错误: 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

echo.
echo [2/3] 安装依赖...
pip install -r requirements.txt

echo.
echo [3/3] 启动 FastAPI 服务器...
echo.
echo 服务器将在 http://localhost:8000 启动
echo API 文档: http://localhost:8000/docs
echo.
python main.py

pause
