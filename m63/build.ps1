Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  图像频域滤波器 - WebAssembly 编译脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "[1/5] 检查 Rust 环境..." -ForegroundColor Yellow
try {
    $rustcVersion = rustc --version
    Write-Host "✅ Rust 已安装: $rustcVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Rust 未安装，请从 https://rustup.rs/ 安装" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/5] 检查 wasm-pack..." -ForegroundColor Yellow
try {
    $wasmPackVersion = wasm-pack --version
    Write-Host "✅ wasm-pack 已安装: $wasmPackVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️  wasm-pack 未安装，正在安装..." -ForegroundColor Yellow
    cargo install wasm-pack
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ wasm-pack 安装失败" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "[3/5] 检查 wasm-bindgen-cli..." -ForegroundColor Yellow
try {
    $wasmBindgenVersion = wasm-bindgen --version
    Write-Host "✅ wasm-bindgen-cli 已安装" -ForegroundColor Green
} catch {
    Write-Host "⚠️  wasm-bindgen-cli 未安装，正在安装..." -ForegroundColor Yellow
    cargo install wasm-bindgen-cli
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ wasm-bindgen-cli 安装失败" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "[4/5] 添加 wasm32-unknown-unknown 目标..." -ForegroundColor Yellow
rustup target add wasm32-unknown-unknown
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 添加 wasm32 目标失败" -ForegroundColor Red
    exit 1
}
Write-Host "✅ wasm32 目标已配置" -ForegroundColor Green

Write-Host ""
Write-Host "[5/5] 编译 WebAssembly 模块 (Release 模式)..." -ForegroundColor Yellow
Write-Host ""

wasm-pack build --release --target web --out-dir pkg

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ 编译失败！" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ 编译成功！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "输出文件位于: $scriptDir\pkg\" -ForegroundColor Cyan
Write-Host ""
Write-Host "使用方式:" -ForegroundColor White
Write-Host "  1. 在当前目录运行: python -m http.server 8080" -ForegroundColor Gray
Write-Host "  2. 或者使用任何本地 Web 服务器" -ForegroundColor Gray
Write-Host "  3. 在浏览器中访问: http://localhost:8080" -ForegroundColor Gray
Write-Host ""
