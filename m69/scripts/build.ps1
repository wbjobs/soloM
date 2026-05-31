Write-Host "Building Log Shipper..." -ForegroundColor Green
Set-Location log-shipper
go build -o log-shipper.exe .
Set-Location ..

Write-Host "Building Alert Service..." -ForegroundColor Green
Set-Location alert-service
go build -o alert-service.exe .
Set-Location ..

Write-Host "Build completed!" -ForegroundColor Green
