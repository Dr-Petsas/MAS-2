# Cloudflare-NAMED-Tunnel fuer das MAS-2 Backend (Port 4000).
#
# Seit 16.07.2026: FESTE Adresse ueber benannten Tunnel + eigene Domain
#   -> https://mas.pickadoc-tunnel.com  (Tunnel "pickadoc-mas")
# Die URL aendert sich NIE mehr. Kein Neu-Koppeln, Home-Bildschirm-App bleibt
# gueltig. Ersetzt den alten Quick-Tunnel (zufaellige *.trycloudflare.com-URL,
# die bei jedem Neustart rotierte und QR-Codes/Lesezeichen ungueltig machte).
#
# Dieses Skript (idempotent, vom Waechter tunnel_watch.ps1 aufgerufen):
#   1. stellt sicher, dass der benannte cloudflared-Tunnel laeuft,
#   2. schreibt die feste URL nach logs\tunnel-url.txt,
#   3. haelt PUBLIC_BASE_URL in backend\.env auf der festen URL,
#   4. startet das Backend nur neu, wenn sich PUBLIC_BASE_URL geaendert hat.
#
# Voraussetzung (einmalig eingerichtet): cloudflared login + Tunnel + DNS-Route,
# Config unter %USERPROFILE%\.cloudflared\config.yml.

$ErrorActionPreference = 'Continue'
$LogDir     = 'F:\MAS-2\logs'
$EnvFile    = 'F:\MAS-2\backend\.env'
$UrlFile    = Join-Path $LogDir 'tunnel-url.txt'
$CfConfig   = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
$TunnelName = 'pickadoc-mas'
$PublicUrl  = 'https://mas.pickadoc-tunnel.com'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'

function Write-TunnelLog([string]$Msg) {
    $line = "$(Get-Date -Format 'HH:mm:ss') $Msg"
    Write-Host $line
    Add-Content -Path (Join-Path $LogDir 'stack.log') -Value $line
}

# --- 1) alten ngrok beenden (durch Cloudflare ersetzt) ---
Get-Process -Name 'ngrok' -ErrorAction SilentlyContinue | Stop-Process -Force

# --- 2) benannten Tunnel sicherstellen (idempotent) ---
if (Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue) {
    Write-TunnelLog "cloudflare: cloudflared laeuft bereits (benannter Tunnel $TunnelName)"
} else {
    if (-not (Test-Path $CfConfig)) {
        Write-TunnelLog "cloudflare: FEHLER - Config fehlt ($CfConfig). Named-Tunnel nicht eingerichtet."
        exit 1
    }
    Write-TunnelLog "cloudflare: starte benannten Tunnel $TunnelName..."
    Start-Process -FilePath 'cloudflared' `
        -ArgumentList '--config', $CfConfig, 'tunnel', 'run' `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "cloudflared_$Stamp.out.log") `
        -RedirectStandardError  (Join-Path $LogDir "cloudflared_$Stamp.log")
    Start-Sleep -Seconds 3
}

# --- 3) feste URL festhalten ---
Set-Content -Path $UrlFile -Value $PublicUrl
Write-TunnelLog "cloudflare: feste Tunnel-URL = $PublicUrl"

# --- 4) PUBLIC_BASE_URL in backend\.env auf feste URL halten ---
$envText = Get-Content $EnvFile -Raw
$old = ($envText | Select-String -Pattern 'PUBLIC_BASE_URL=(\S+)').Matches
$oldUrl = if ($old.Count -gt 0) { $old[0].Groups[1].Value } else { '' }
if ($oldUrl -eq $PublicUrl) {
    Write-TunnelLog "cloudflare: PUBLIC_BASE_URL unveraendert - kein Backend-Neustart noetig"
    exit 0
}
if ($oldUrl) {
    $envText = $envText -replace 'PUBLIC_BASE_URL=\S+', "PUBLIC_BASE_URL=$PublicUrl"
} else {
    $envText = $envText.TrimEnd() + "`nPUBLIC_BASE_URL=$PublicUrl`n"
}
Set-Content -Path $EnvFile -Value $envText -NoNewline
Write-TunnelLog "cloudflare: PUBLIC_BASE_URL aktualisiert ($oldUrl -> $PublicUrl)"

# --- 5) Backend neu starten, damit die feste URL aktiv wird ---
$conn = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    Write-TunnelLog "cloudflare: starte Backend neu (PID $($conn.OwningProcess))"
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}
Start-Process -FilePath 'node' -ArgumentList 'src/server.js' `
    -WorkingDirectory 'F:\MAS-2\backend' -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir "backend_$Stamp.log") `
    -RedirectStandardError  (Join-Path $LogDir "backend_$Stamp.err.log")
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) { break }
}
$up = [bool](Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue)
Write-TunnelLog "cloudflare: Backend $(if ($up) { 'OK' } else { 'FEHLER - siehe Log' })"
