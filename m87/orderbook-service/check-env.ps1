# 环境检查脚本
Write-Host "=== 金融高频交易订单簿服务 - 环境检查 ===" -ForegroundColor Cyan
Write-Host ""

$errors = 0

# 检查 Rust
Write-Host "[1/5] 检查 Rust 安装..." -ForegroundColor Yellow
try {
    $rustVersion = rustc --version 2>&1
    Write-Host "  ✓ Rust: $rustVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Rust 未安装，请访问 https://rustup.rs/ 安装" -ForegroundColor Red
    $errors++
}

# 检查 Rust 工具链
Write-Host "[2/5] 检查 Rust 工具链..." -ForegroundColor Yellow
try {
    $toolchain = rustup show active-toolchain 2>&1
    Write-Host "  ✓ 当前工具链: $toolchain" -ForegroundColor Green
    if ($toolchain -match "gnu") {
        Write-Host "    提示: GNU 工具链需要 MinGW-w64 (gcc, dlltool)" -ForegroundColor Gray
    } elseif ($toolchain -match "msvc") {
        Write-Host "    提示: MSVC 工具链需要 Visual Studio Build Tools" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ✗ 无法获取工具链信息" -ForegroundColor Red
    $errors++
}

# 检查 GCC (GNU 工具链需要)
Write-Host "[3/5] 检查 MinGW-w64 (GNU 工具链需要)..." -ForegroundColor Yellow
$gccPath = Get-Command gcc -ErrorAction SilentlyContinue
$dlltoolPath = Get-Command dlltool -ErrorAction SilentlyContinue
if ($gccPath -and $dlltoolPath) {
    Write-Host "  ✓ MinGW-w64 已安装" -ForegroundColor Green
    Write-Host "    gcc: $($gccPath.Source)" -ForegroundColor Gray
    Write-Host "    dlltool: $($dlltoolPath.Source)" -ForegroundColor Gray
} else {
    Write-Host "  ⚠ MinGW-w64 未安装" -ForegroundColor Yellow
    Write-Host "    安装方法:" -ForegroundColor Gray
    Write-Host "    1. 使用 Chocolatey: choco install mingw" -ForegroundColor Gray
    Write-Host "    2. 使用 WinLibs: 下载 https://winlibs.com/ 并添加到 PATH" -ForegroundColor Gray
    Write-Host "    3. 或切换到 MSVC 工具链: rustup default stable-x86_64-pc-windows-msvc" -ForegroundColor Gray
    $errors++
}

# 检查 cargo
Write-Host "[4/5] 检查 Cargo..." -ForegroundColor Yellow
try {
    $cargoVersion = cargo --version 2>&1
    Write-Host "  ✓ Cargo: $cargoVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Cargo 未安装" -ForegroundColor Red
    $errors++
}

# 检查配置文件
Write-Host "[5/5] 检查配置文件..." -ForegroundColor Yellow
if (Test-Path "config.yaml") {
    Write-Host "  ✓ config.yaml 存在" -ForegroundColor Green
} else {
    Write-Host "  ✗ config.yaml 不存在" -ForegroundColor Red
    $errors++
}

Write-Host ""
Write-Host "=== 检查完成 ===" -ForegroundColor Cyan
if ($errors -gt 0) {
    Write-Host "发现 $errors 个问题，请修复后重新运行。" -ForegroundColor Red
} else {
    Write-Host "环境检查通过，可以运行 cargo build 或 cargo run" -ForegroundColor Green
}
Write-Host ""
