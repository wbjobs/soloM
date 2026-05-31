# 前端开发启动脚本
Write-Host "=== 启动订单簿前端看板 (开发模式) ===" -ForegroundColor Cyan
Write-Host ""

# 检查依赖
if (-not (Test-Path "node_modules")) {
    Write-Host "正在安装依赖..." -ForegroundColor Yellow
    npm install
}

# 检查环境变量
if (-not (Test-Path ".env")) {
    Write-Host "创建默认 .env 文件..." -ForegroundColor Yellow
    "VITE_WS_URL=ws://localhost:8080/ws" | Out-File -FilePath ".env" -Encoding utf8
    "VITE_EXCHANGE_NAME=模拟数据" | Out-File -FilePath ".env" -Encoding utf8 -Append
}

Write-Host "当前配置:" -ForegroundColor Yellow
Get-Content .env | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host ""

# 启动开发服务器
Write-Host "正在启动开发服务器..." -ForegroundColor Yellow
Write-Host "访问地址: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host ""

npm run dev
