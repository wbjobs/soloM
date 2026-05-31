#!/usr/bin/env pwsh
param(
    [switch]$Release = $false,
    [switch]$Setup = $false,
    [switch]$Clean = $false
)

$ErrorActionPreference = "Stop"

Write-Host "=== Dungeon Generator Build Script ===" -ForegroundColor Cyan

if ($Clean) {
    Write-Host "`nCleaning build artifacts..." -ForegroundColor Yellow
    if (Test-Path "target") {
        Remove-Item -Recurse -Force "target"
        Write-Host "  Removed target directory"
    }
    if (Test-Path "Cargo.lock") {
        Remove-Item "Cargo.lock"
        Write-Host "  Removed Cargo.lock"
    }
    Write-Host "Clean complete!" -ForegroundColor Green
}

if ($Setup) {
    Write-Host "`nSetting up build environment..." -ForegroundColor Yellow
    
    $rustc = Get-Command rustc -ErrorAction SilentlyContinue
    if (-not $rustc) {
        Write-Error "Rust is not installed. Please install from https://rustup.rs/"
        exit 1
    }
    Write-Host "  Rust version: $(rustc --version)"
    
    $cargo = Get-Command cargo -ErrorAction SilentlyContinue
    if (-not $cargo) {
        Write-Error "Cargo is not installed."
        exit 1
    }
    Write-Host "  Cargo version: $(cargo --version)"
    
    $toolchain = rustup default
    Write-Host "  Default toolchain: $toolchain"
    
    if ($toolchain -match "msvc") {
        $link = Get-Command link.exe -ErrorAction SilentlyContinue
        if (-not $link) {
            Write-Host "  MSVC linker not found, trying MinGW..." -ForegroundColor Yellow
            rustup default stable-x86_64-pc-windows-gnu
            Write-Host "  Switched to GNU toolchain"
        }
    }
    
    Write-Host "Environment setup complete!" -ForegroundColor Green
}

Write-Host "`nBuilding project..." -ForegroundColor Yellow
$buildArgs = @("build")
if ($Release) {
    $buildArgs += "--release"
    Write-Host "  Build type: Release"
} else {
    Write-Host "  Build type: Debug"
}

try {
    cargo @buildArgs
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nBuild successful!" -ForegroundColor Green
        
        $exePath = if ($Release) {
            "target\release\dungeon-generator.exe"
        } else {
            "target\debug\dungeon-generator.exe"
        }
        
        if (Test-Path $exePath) {
            $fileInfo = Get-Item $exePath
            $sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
            Write-Host "  Binary: $exePath"
            Write-Host "  Size: $sizeMB MB"
        }
        
        Write-Host "`nTo run the server:" -ForegroundColor Cyan
        Write-Host "  cargo run --release -- serve"
        Write-Host "`nTo generate a dungeon:" -ForegroundColor Cyan
        Write-Host "  cargo run --release -- generate --width 64 --height 64 --print"
        Write-Host "`nTo run benchmarks:" -ForegroundColor Cyan
        Write-Host "  cargo run --release -- benchmark"
    } else {
        Write-Error "Build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} catch {
    Write-Error "Build failed: $_"
    exit 1
}
