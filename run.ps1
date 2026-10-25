# Starts Bionic Passport locally at http://127.0.0.1:8000 (no internet needed).
Set-Location -Path $PSScriptRoot

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Bionic Passport: Medical Decision Support for Space" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Free port 8000 if a previous instance is lingering
$occupied = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
if ($occupied) {
    Write-Host "[Info] Releasing port 8000 from previous instance (PID $($occupied.OwningProcess))..." -ForegroundColor Yellow
    Stop-Process -Id $occupied.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
}

# Ensure Python environment
$pythonExe = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "[Warning] Virtual environment not found. Setting up .venv..." -ForegroundColor Yellow
    py -3.12 -m venv .venv
    & $pythonExe -m pip install -r requirements.txt
}

Write-Host "[1/2] Launching browser at http://127.0.0.1:8000 ..." -ForegroundColor Green
Start-Process "http://127.0.0.1:8000/"

Write-Host "[2/2] Starting FastAPI server on http://127.0.0.1:8000 ..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

& $pythonExe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
