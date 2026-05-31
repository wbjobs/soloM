# 开发启动脚本
Write-Host "=== 启动订单簿后端服务 (开发模式) ===" -ForegroundColor Cyan
Write-Host ""

# 检查配置文件
if (-not (Test-Path "config.yaml")) {
    Write-Host "错误: 找不到 config.yaml 文件" -ForegroundColor Red
    exit 1
}

# 显示当前配置
Write-Host "当前配置:" -ForegroundColor Yellow
Get-Content config.yaml | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host ""

# 启动服务
Write-Host "正在启动服务..." -ForegroundColor Yellow
Write-Host "服务地址: http://127.0.0.1:8080" -ForegroundColor Cyan
Write-Host "WebSocket: ws://127.0.0.1:8080/ws" -ForegroundColor Cyan
Write-Host "健康检查: http://127.0.0.1:8080/api/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host ""

cargo run
