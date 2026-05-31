$logFile = "..\logs\test.log"

Write-Host "Generating test logs..." -ForegroundColor Green

while ($true) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $random = Get-Random -Minimum 0 -Maximum 10

    if ($random -lt 7) {
        $level = "INFO"
        $message = "Application started successfully"
    } elseif ($random -lt 9) {
        $level = "WARN"
        $message = "Low memory detected"
    } else {
        $level = "ERROR"
        $message = "Database connection failed - Connection refused"
    }

    $logLine = "[$timestamp] [$level] $message"
    Add-Content -Path $logFile -Value $logLine
    Write-Host $logLine

    if ($level -eq "ERROR") {
        Add-Content -Path $logFile -Value "[$timestamp] [ERROR] Exception: NullReferenceException at System.String.Concat()"
    }

    Start-Sleep -Seconds 2
}
