Write-Host "Starting NATS server..." -ForegroundColor Green
docker run -d --name log-nats -p 4222:4222 -p 8222:8222 nats:2.10-alpine -m 8222
Write-Host "NATS server started on port 4222" -ForegroundColor Green
Write-Host "Monitoring available at http://localhost:8222" -ForegroundColor Cyan
