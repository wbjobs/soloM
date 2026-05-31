@echo off
echo ========================================
echo 手写公式识别系统
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
echo [3/3] 启动后端服务...
echo 服务将在 http://localhost:8001 启动
echo.
echo 请在浏览器中打开 index.html 使用系统
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

python main.py
