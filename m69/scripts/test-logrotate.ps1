Write-Host "=== Logrotate 测试脚本 ===" -ForegroundColor Cyan
Write-Host "这个脚本模拟 logrotate 的行为：重命名旧文件，创建新文件" -ForegroundColor Gray
Write-Host ""

$logDir = "..\logs"
$logFile = Join-Path $logDir "app.log"
$rotatedFile = Join-Path $logDir "app.log.1"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

Write-Host "步骤 1: 创建初始日志文件并写入日志" -ForegroundColor Yellow
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [INFO] Application started" | Out-File -FilePath $logFile -Encoding utf8
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [INFO] Processing request" | Out-File -FilePath $logFile -Append -Encoding utf8
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ERROR] Database connection failed" | Out-File -FilePath $logFile -Append -Encoding utf8
Write-Host "  已写入 3 条日志到 app.log" -ForegroundColor Green

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "步骤 2: 模拟 logrotate - 重命名旧文件" -ForegroundColor Yellow
if (Test-Path $rotatedFile) {
    Remove-Item $rotatedFile -Force
}
Move-Item -Path $logFile -Destination $rotatedFile
Write-Host "  已将 app.log 重命名为 app.log.1" -ForegroundColor Green

Start-Sleep -Seconds 1

Write-Host ""
Write-Host "步骤 3: 模拟 logrotate - 创建新的日志文件" -ForegroundColor Yellow
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [INFO] Log rotated successfully" | Out-File -FilePath $logFile -Encoding utf8
Write-Host "  已创建新的 app.log 文件" -ForegroundColor Green

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "步骤 4: 持续写入新日志（测试重连）" -ForegroundColor Yellow
for ($i = 1; $i -le 5; $i++) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    if ($i % 2 -eq 0) {
        $level = "ERROR"
        $msg = "NullReferenceException at line $i"
    } else {
        $level = "INFO"
        $msg = "Processing batch $i"
    }
    $logLine = "[$timestamp] [$level] $msg"
    Add-Content -Path $logFile -Value $logLine
    Write-Host "  写入: $logLine" -ForegroundColor Gray
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "=== 测试完成 ===" -ForegroundColor Cyan
Write-Host "观察 Log Shipper 日志，应该看到：" -ForegroundColor Yellow
Write-Host "  1. inode changed 消息（检测到文件被替换）" -ForegroundColor Gray
Write-Host "  2. reopening 消息（重新打开文件）" -ForegroundColor Gray
Write-Host "  3. 新文件中的日志被正常采集" -ForegroundColor Gray
Write-Host ""
Write-Host "观察 Alert Service 日志，应该看到：" -ForegroundColor Yellow
Write-Host "  1. 初始的 ERROR 日志被检测到" -ForegroundColor Gray
Write-Host "  2. logrotate 后新写入的 ERROR 日志也被检测到" -ForegroundColor Gray
