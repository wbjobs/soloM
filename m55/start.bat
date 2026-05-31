@echo off
echo ========================================
echo  图像隐写平台 - 一键启动脚本
echo ========================================
echo.

echo [1/3] 检查 Python 依赖...
cd backend
if not exist venv (
    echo 创建 Python 虚拟环境...
    python -m venv venv
)
call venv\Scripts\activate
pip install -r requirements.txt
cd ..

echo.
echo [2/3] 安装前端依赖...
cd frontend
if not exist node_modules (
    npm install
)
cd ..

echo.
echo [3/3] 启动服务...
echo.
echo 启动后端服务 (端口 8000)...
start "后端服务" cmd /k "cd backend && call venv\Scripts\activate && uvicorn main:app --reload"

echo 启动前端开发服务器 (端口 5173)...
start "前端服务" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo  服务启动完成！
echo  前端: http://localhost:5173
echo  后端 API: http://localhost:8000
echo  API 文档: http://localhost:8000/docs
echo ========================================
pause
