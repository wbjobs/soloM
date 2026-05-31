$env:DATABASE_URL = "postgresql://drift:drift123@localhost:5432/drift_db"

Write-Host "=== GitOps Drift Detection - Local Development Setup ===" -ForegroundColor Cyan

Write-Host "`n[1/3] Starting PostgreSQL and Backend..." -ForegroundColor Yellow
docker compose up -d postgres backend

Write-Host "`n[2/3] Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "`n[3/3] Services running:" -ForegroundColor Yellow
Write-Host "  - Dashboard:    http://localhost:8000" -ForegroundColor Green
Write-Host "  - API Docs:     http://localhost:8000/docs" -ForegroundColor Green
Write-Host "  - PostgreSQL:   localhost:5432" -ForegroundColor Green

Write-Host "`nTo run a drift scan:" -ForegroundColor Cyan
Write-Host "  cd cli" -ForegroundColor White
Write-Host "  pip install -r requirements.txt" -ForegroundColor White
Write-Host "  python main.py scan --git-repo <YOUR_REPO_URL> --backend-url http://localhost:8000" -ForegroundColor White

Write-Host "`nTo run drift detection as a daemon (every 5 min):" -ForegroundColor Cyan
Write-Host "  python main.py daemon --git-repo <YOUR_REPO_URL> --backend-url http://localhost:8000 --interval 300" -ForegroundColor White
