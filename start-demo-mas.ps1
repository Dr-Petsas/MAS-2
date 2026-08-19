# Eigener MAS nur fuer die Erlebnis-Demo (Chef 19.08.2026).
# Startet NICHT die Haupt-Clara, NICHT Port 4000, NICHT Clara-Voice / Clara-Voice-dev.
param()
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
Write-Host ""
Write-Host "  Demo-MAS  (nur /demo, Port 4010)" -ForegroundColor Cyan
Write-Host "  Clara v7 live/dev werden nicht gestartet." -ForegroundColor Cyan
Write-Host ""
Set-Location $Backend
$env:DEMO_MAS_PORT = "4010"
node src/demo-server.js
