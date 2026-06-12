# ============================================================================
# TUNNEL-WAECHTER (alle 6 Stunden via Aufgabenplanung "MAS2TunnelWache")
#
# Prueft, ob der Cloudflare-Tunnel zum MAS-2-Backend noch erreichbar ist.
# Wenn nicht: neuen Quick-Tunnel oeffnen (start-cloudflare-tunnel.ps1 macht
# .env-Update + Backend-Neustart + masRuntime-Publish nach Firestore) und den
# neuen Link per E-Mail an dr.petsas@pickadoc.de schicken (SMS als Fallback).
#
# Solange der Tunnel steht, passiert NICHTS (keine Mail, kein Neustart) -
# nur eine OK-Zeile in logs\tunnel-watch.log.
#
# Manuell:  powershell -ExecutionPolicy Bypass -File F:\MAS-2\tools\tunnel_watch.ps1
# ============================================================================
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LogDir   = 'F:\MAS-2\logs'
$UrlFile  = Join-Path $LogDir 'tunnel-url.txt'
$WatchLog = Join-Path $LogDir 'tunnel-watch.log'
$MasLocal = 'http://127.0.0.1:4000'
$ClientId = 'MEe4ZQHEzOPzLcexyhdT'
$MailTo   = 'dr.petsas@pickadoc.de'
$SmsTo    = '01776004600'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$Msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Msg"
    Write-Host $line
    Add-Content -Path $WatchLog -Value $line
}

function Test-Health([string]$Base, [int]$TimeoutSec = 20) {
    if (-not $Base) { return $false }
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "$Base/health" -TimeoutSec $TimeoutSec
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

# --- 1) Lokales Backend sicherstellen (ohne Backend nuetzt kein Tunnel) ---
if (-not (Test-Health $MasLocal 10)) {
    Log "backend: lokal nicht erreichbar - starte neu"
    $Stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    Start-Process -FilePath 'node' -ArgumentList 'src/server.js' `
        -WorkingDirectory 'F:\MAS-2\backend' -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "backend_$Stamp.log") `
        -RedirectStandardError  (Join-Path $LogDir "backend_$Stamp.err.log")
    for ($i = 0; $i -lt 25 -and -not (Test-Health $MasLocal 5); $i++) { Start-Sleep -Seconds 2 }
    if (-not (Test-Health $MasLocal 10)) {
        Log "backend: Neustart FEHLGESCHLAGEN - Abbruch (Tunnel ohne Backend sinnlos)"
        exit 1
    }
    Log "backend: wieder oben"
}

# --- 2) Tunnel pruefen ---
$oldUrl = (Get-Content $UrlFile -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($oldUrl) { $oldUrl = $oldUrl.Trim() }
if ($oldUrl -and (Test-Health $oldUrl 25)) {
    Log "tunnel: OK ($oldUrl)"
    exit 0
}
Log "tunnel: GEFALLEN ($oldUrl) - oeffne neuen Tunnel"

# --- 3) Neuen Tunnel oeffnen ---
# Alten cloudflared hart beenden: sonst wuerde start-cloudflare-tunnel.ps1 den
# (zombie-)Prozess als "laeuft bereits" werten und die tote URL behalten.
Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
# WICHTIG: Weder Pipeline (& ... | ForEach) noch Start-Process -Wait benutzen!
# Beides wartet auf die vom Start-Skript gestarteten DAEMONS (cloudflared,
# node) mit - die Pipeline ueber geerbte stdout-Handles, -Wait ueber den
# ganzen Prozessbaum. Beobachtet 12.06.: Waechter hing dadurch >9 min.
# WaitForExit() wartet nur auf die eine powershell.exe des Start-Skripts.
$tsOut = Join-Path $LogDir 'tunnel-start-last.log'
$tsProc = Start-Process -FilePath 'powershell' -WindowStyle Hidden -PassThru `
    -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','F:\MAS-2\start-cloudflare-tunnel.ps1' `
    -RedirectStandardOutput $tsOut -RedirectStandardError "$tsOut.err"
if (-not $tsProc.WaitForExit(300000)) {
    Log "tunnel-start: Timeout nach 5 min - breche Start-Skript ab und mache weiter"
    Stop-Process -Id $tsProc.Id -Force -ErrorAction SilentlyContinue
}
Get-Content $tsOut -ErrorAction SilentlyContinue |
    ForEach-Object { Add-Content -Path $WatchLog -Value "  [tunnel-start] $_" }

$newUrl = (Get-Content $UrlFile -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($newUrl) { $newUrl = $newUrl.Trim() }
# Backend wird vom Start-Skript neu gestartet - warten bis es lokal antwortet.
for ($i = 0; $i -lt 25 -and -not (Test-Health $MasLocal 5); $i++) { Start-Sleep -Seconds 2 }
# Frische Quick-Tunnel brauchen z. T. mehrere Minuten, bis die QUIC-Verbindung
# registriert ist (beobachtet: ~3 min) - bis zu 5 min auf Erreichbarkeit warten.
$newOk = $false
if ($newUrl -and $newUrl -ne $oldUrl) {
    for ($i = 0; $i -lt 30; $i++) {
        if (Test-Health $newUrl 15) { $newOk = $true; break }
        Start-Sleep -Seconds 10
    }
}
if ($newOk) { Log "tunnel: NEU und erreichbar ($newUrl)" }
else        { Log "tunnel: Wiederherstellung unsicher (url=$newUrl) - melde trotzdem" }

# --- 4) Link aufs Handy: E-Mail, bei Mail-Fehler SMS ---
$status = if ($newOk) { 'Der neue Tunnel steht und ist getestet.' }
          else { 'ACHTUNG: Wiederherstellung unsicher - bitte Link pruefen.' }
$body = @"
Der Cloudflare-Tunnel zum MAS-Backend war gefallen. $status

Neuer Link (Handy-Lesezeichen aktualisieren):
$newUrl

Die Web-App findet das Backend automatisch wieder (masRuntime in Firestore).
Alter Link (ungueltig): $oldUrl

-- Tunnel-Waechter, automatischer Lauf alle 6 Stunden
"@

$mailOk = $false
try {
    $acc = (Invoke-RestMethod -Uri "$MasLocal/mail/accounts?clientId=$ClientId" -TimeoutSec 30).accounts | Select-Object -First 1
    if ($acc) {
        $payload = @{ accountId = $acc.id; to = @($MailTo); logToBrain = $false
                      subject = "Neuer MAS-Tunnel-Link: $newUrl"; text = $body } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$MasLocal/mail/send?clientId=$ClientId" -Method Post `
            -ContentType 'application/json; charset=utf-8' -Body $payload -TimeoutSec 120
        $mailOk = [bool]$res.ok
    } else { Log "mail: kein Konto konfiguriert" }
} catch { Log "mail: FEHLER $($_.Exception.Message)" }
Log "mail: $(if ($mailOk) { 'verschickt an ' + $MailTo } else { 'NICHT verschickt' })"

if (-not $mailOk) {
    try {
        $payload = @{ phone = $SmsTo; recipientName = 'Dr. Petsas'
                      message = "Neuer MAS-Tunnel-Link: $newUrl (Mail-Versand ging nicht)" } | ConvertTo-Json
        $res = Invoke-RestMethod -Uri "$MasLocal/tools/send-sms?clientId=$ClientId" -Method Post `
            -ContentType 'application/json; charset=utf-8' -Body $payload -TimeoutSec 120
        Log "sms-fallback: $(if ($res.ok) { 'verschickt' } else { 'FEHLER' })"
    } catch { Log "sms-fallback: FEHLER $($_.Exception.Message)" }
}
exit 0
