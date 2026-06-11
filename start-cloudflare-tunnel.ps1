# Cloudflare-Tunnel fuer das MAS-2 Backend (Port 4000). Ersetzt ngrok.
#
# Quick-Tunnel (kein Cloudflare-Konto noetig): cloudflared vergibt bei jedem
# Tunnel-Start eine NEUE https://<zufall>.trycloudflare.com-URL. Dieses Skript
#   1. beendet einen evtl. laufenden ngrok (abgeloest),
#   2. startet cloudflared (falls nicht schon aktiv),
#   3. liest die oeffentliche URL aus dem Log,
#   4. schreibt sie als PUBLIC_BASE_URL in backend\.env,
#   5. startet das Backend neu, wenn sich die URL geaendert hat.
# Die aktuelle URL steht danach in logs\tunnel-url.txt.
#
# ACHTUNG: Nach jedem Tunnel-Neustart aendert sich die URL -> Handy muss neu
# gekoppelt werden (QR neu scannen). Fuer eine DAUERHAFTE URL braucht es einen
# Named Tunnel mit eigener Domain (Cloudflare-Konto, z. B. mas.pickadoc.de).

$ErrorActionPreference = 'Continue'
$LogDir  = 'F:\MAS-2\logs'
$EnvFile = 'F:\MAS-2\backend\.env'
$UrlFile = Join-Path $LogDir 'tunnel-url.txt'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'

function Write-TunnelLog([string]$Msg) {
    $line = "$(Get-Date -Format 'HH:mm:ss') $Msg"
    Write-Host $line
    Add-Content -Path (Join-Path $LogDir 'stack.log') -Value $line
}

# --- 1) ngrok beenden (durch Cloudflare ersetzt) ---
$ngrok = Get-Process -Name 'ngrok' -ErrorAction SilentlyContinue
if ($ngrok) {
    Write-TunnelLog "cloudflare: beende alten ngrok-Tunnel (PID $($ngrok.Id -join ','))"
    $ngrok | Stop-Process -Force
}

# --- 2) cloudflared starten (idempotent) ---
$cfLog = Join-Path $LogDir "cloudflared_$Stamp.log"
if (Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue) {
    Write-TunnelLog "cloudflare: laeuft bereits"
    # juengstes Log wiederverwenden, um die URL zu lesen
    $existing = Get-ChildItem $LogDir -Filter 'cloudflared_*.log' |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($existing) { $cfLog = $existing.FullName }
} else {
    Write-TunnelLog "cloudflare: starte Quick-Tunnel..."
    # --edge-ip-version 4: die Quick-Tunnel-API haengt sonst auf diesem Anschluss
    # im IPv6-Timeout ("context deadline exceeded").
    Start-Process -FilePath 'cloudflared' `
        -ArgumentList 'tunnel', '--url', 'http://127.0.0.1:4000', '--no-autoupdate', '--edge-ip-version', '4' `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "cloudflared_$Stamp.out.log") `
        -RedirectStandardError $cfLog
}

# --- 3) oeffentliche URL aus dem Log lesen (cloudflared schreibt sie auf stderr) ---
# Negative Lookahead: api.trycloudflare.com ist Cloudflares API-Host (taucht in
# Fehlermeldungen auf), NICHT die Tunnel-URL.
$urlPattern = 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com'
$publicUrl = ''
for ($attempt = 1; $attempt -le 3 -and -not $publicUrl; $attempt++) {
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $cfLog) {
            $m = Select-String -Path $cfLog -Pattern $urlPattern -AllMatches |
                ForEach-Object { $_.Matches } | Select-Object -Last 1
            if ($m) { $publicUrl = $m.Value; break }
            # Prozess tot + Fehler im Log -> neu versuchen
            if (-not (Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue)) { break }
        }
    }
    if (-not $publicUrl -and $attempt -lt 3) {
        Write-TunnelLog "cloudflare: kein Tunnel (Versuch $attempt) - starte neu..."
        Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 2
        $cfLog = Join-Path $LogDir "cloudflared_${Stamp}_retry$attempt.log"
        Start-Process -FilePath 'cloudflared' `
            -ArgumentList 'tunnel', '--url', 'http://127.0.0.1:4000', '--no-autoupdate', '--edge-ip-version', '4' `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $LogDir "cloudflared_${Stamp}_retry$attempt.out.log") `
            -RedirectStandardError $cfLog
    }
}
if (-not $publicUrl) {
    Write-TunnelLog "cloudflare: FEHLER - keine Tunnel-URL gefunden (Log: $cfLog)"
    exit 1
}
Set-Content -Path $UrlFile -Value $publicUrl
Write-TunnelLog "cloudflare: Tunnel-URL = $publicUrl"

# --- 4) PUBLIC_BASE_URL in backend\.env aktualisieren ---
$envText = Get-Content $EnvFile -Raw
$old = ($envText | Select-String -Pattern 'PUBLIC_BASE_URL=(\S+)').Matches
$oldUrl = if ($old.Count -gt 0) { $old[0].Groups[1].Value } else { '' }
if ($oldUrl -eq $publicUrl) {
    Write-TunnelLog "cloudflare: PUBLIC_BASE_URL unveraendert - kein Backend-Neustart noetig"
    exit 0
}
$envText = $envText -replace 'PUBLIC_BASE_URL=\S+', "PUBLIC_BASE_URL=$publicUrl"
Set-Content -Path $EnvFile -Value $envText -NoNewline
Write-TunnelLog "cloudflare: PUBLIC_BASE_URL aktualisiert ($oldUrl -> $publicUrl)"

# --- 5) Backend neu starten, damit die neue URL aktiv wird ---
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
