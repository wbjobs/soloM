$totalRequests = 200
$metricName = "concurrency_test"
$maxThreads = 50

Write-Host "Starting concurrent test with $totalRequests requests..."
Write-Host "Metric name: $metricName"
Write-Host "Max threads: $maxThreads"
Write-Host ""

$runspacePool = [runspacefactory]::CreateRunspacePool(1, $maxThreads)
$runspacePool.Open()

$jobs = @()

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

for ($i = 1; $i -le $totalRequests; $i++) {
    $powerShell = [powershell]::Create().AddScript({
        param($id, $metric, $baseUrl)
        
        $body = @{
            metric = $metric
            value = $id / 10.0
            labels = @{host = "server_$($id % 5)"; instance = "inst_$id"}
        } | ConvertTo-Json -Compress
        
        try {
            $result = Invoke-RestMethod -Uri "$baseUrl/push" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10
            return @{Success = $true; Id = $id}
        } catch {
            return @{Success = $false; Id = $id; Error = $_.Exception.Message}
        }
    }).AddArgument($i).AddArgument($metricName).AddArgument("http://localhost:8081")
    
    $powerShell.RunspacePool = $runspacePool
    $jobs += [PSCustomObject]@{
        PowerShell = $powerShell
        Result = $powerShell.BeginInvoke()
    }
}

$successfulRequests = 0
$failedRequests = 0

foreach ($job in $jobs) {
    $result = $job.PowerShell.EndInvoke($job.Result)
    if ($result[0].Success) {
        $successfulRequests++
    } else {
        $failedRequests++
        Write-Host "Request $($result[0].Id) failed: $($result[0].Error)"
    }
    $job.PowerShell.Dispose()
}

$runspacePool.Close()
$runspacePool.Dispose()

$stopwatch.Stop()
$elapsed = $stopwatch.ElapsedMilliseconds

Write-Host ""
Write-Host "=== Test Results ==="
Write-Host "Total requests: $totalRequests"
Write-Host "Successful: $successfulRequests"
Write-Host "Failed: $failedRequests"
Write-Host "Total time: $elapsed ms"
Write-Host "Throughput: $([math]::Round($totalRequests * 1000 / $elapsed, 2)) requests/sec"
Write-Host ""

Start-Sleep -Seconds 3

Write-Host "=== Queue Status ==="
$status = Invoke-RestMethod -Uri "http://localhost:8081/status"
$status | ConvertTo-Json
Write-Host ""

Write-Host "=== Sample Data (last 10 points) ==="
$data = Invoke-RestMethod -Uri "http://localhost:8081/query?metric=$metricName"
$data | Format-Table metric, value, timestamp
Write-Host ""

if ($successfulRequests -eq $totalRequests) {
    Write-Host "SUCCESS: All requests completed!" -ForegroundColor Green
} else {
    Write-Host "WARNING: Some requests failed" -ForegroundColor Yellow
}
