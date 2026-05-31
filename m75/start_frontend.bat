@echo off
echo ========================================
echo 分子结构3D可视化 - 启动前端
echo ========================================
echo.

echo 正在启动简单 HTTP 服务器...
echo.
echo 前端地址: http://localhost:8080
echo.
echo 请确保后端已在另一个终端启动 (start_backend.bat)
echo.

python -m http.server 8080

pause
