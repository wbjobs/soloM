@echo off
echo ========================================
echo   分布式网络拓扑交互式沙盘
echo   一站式启动脚本
echo ========================================
echo.

echo 正在启动后端服务（新窗口）...
start "Backend - http://localhost:5000" cmd /k "cd backend && run.bat"

echo 等待后端服务启动...
timeout /t 5 /nobreak >nul

echo 正在启动前端服务（新窗口）...
start "Frontend - http://localhost:3000" cmd /k "cd frontend && run.bat"

echo.
echo ========================================
echo   启动完成!
echo   后端: http://localhost:5000
echo   前端: http://localhost:3000
echo ========================================
echo.
pause
