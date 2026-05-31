param(
  [switch]$SkipDocker
)

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $SkipDocker) {
  Write-Host "[1/4] Starting Docker containers (PostgreSQL + Redis)..." -ForegroundColor Cyan
  docker compose -f "$projectDir\docker-compose.yml" up -d
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker not available. Ensure PostgreSQL and Redis are running manually." -ForegroundColor Yellow
    Write-Host "Required: PostgreSQL on localhost:5432 (user=iot, db=iot_commands)" -ForegroundColor Yellow
    Write-Host "Required: Redis on localhost:6379" -ForegroundColor Yellow
  }
  Start-Sleep -Seconds 3
} else {
  Write-Host "[1/4] Skipping Docker. Using existing PostgreSQL/Redis." -ForegroundColor Yellow
}

Write-Host "[2/4] Installing dependencies..." -ForegroundColor Cyan
Push-Location $projectDir
npm install

Write-Host "[3/4] Initializing database tables..." -ForegroundColor Cyan
node src/shared/init-db.js

Write-Host "[4/4] Starting all services..." -ForegroundColor Cyan
npm run start:all
