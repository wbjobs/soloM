Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DICOM 医学影像系统 - 启动基础设施" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] 启动 Docker 服务 (PostgreSQL + MinIO)..." -ForegroundColor Yellow
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "错误: Docker 启动失败，请确保 Docker Desktop 已运行" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] 等待服务就绪..." -ForegroundColor Yellow
$attempts = 0
$maxAttempts = 30

while ($attempts -lt $maxAttempts) {
    $pgReady = docker exec dicom-postgres pg_isready -U dicom_user -d dicom_db 2>$null
    $minioReady = docker exec dicom-minio curl -f http://localhost:9000/minio/health/live 2>$null

    if ($LASTEXITCODE -eq 0 -and $minioReady) {
        Write-Host "所有服务已就绪！" -ForegroundColor Green
        break
    }

    $attempts++
    Write-Progress -Activity "等待服务启动" -Status "尝试 $attempts/$maxAttempts" -PercentComplete ($attempts / $maxAttempts * 100)
    Start-Sleep -Seconds 2
}

if ($attempts -ge $maxAttempts) {
    Write-Host "警告: 服务启动超时，请手动检查容器状态" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3/3] 服务信息：" -ForegroundColor Green
Write-Host "  PostgreSQL: localhost:5432" -ForegroundColor White
Write-Host "  MinIO API:  localhost:9000" -ForegroundColor White
Write-Host "  MinIO 控制台: http://localhost:9001" -ForegroundColor White
Write-Host "    用户名: minio_admin" -ForegroundColor Gray
Write-Host "    密码: minio_password" -ForegroundColor Gray
Write-Host ""
Write-Host "服务启动完成！" -ForegroundColor Green
Write-Host ""
Write-Host "下一步操作：" -ForegroundColor Cyan
Write-Host "  1. 编译后端: cd backend ; go mod tidy ; go run ." -ForegroundColor White
Write-Host "  2. 编译前端: cd frontend ; wasm-pack build --target web" -ForegroundColor White
Write-Host "  3. 启动前端: cd frontend ; npm install ; npm run dev" -ForegroundColor White
