$ErrorActionPreference = "Stop"

$GoBinary = "go"
if (-not (Get-Command $GoBinary -ErrorAction SilentlyContinue)) {
    if (Test-Path ".\go\bin\go.exe") {
        $GoBinary = ".\go\bin\go.exe"
    } elseif (Test-Path "C:\Program Files\Go\bin\go.exe") {
        $GoBinary = "C:\Program Files\Go\bin\go.exe"
    } else {
        Write-Error "未找到Go编译器，请先安装Go"
        exit 1
    }
}

Write-Host "使用Go编译器: $GoBinary"
& $GoBinary version

$env:GOPROXY = "https://goproxy.cn,direct"

Write-Host "正在下载依赖..."
& $GoBinary mod download

Write-Host "正在编译..."
& $GoBinary build -o server-monitor.exe .

if ($LASTEXITCODE -eq 0) {
    Write-Host "编译成功! 可执行文件: server-monitor.exe"
    Write-Host "运行: .\server-monitor.exe"
} else {
    Write-Error "编译失败"
    exit 1
}
