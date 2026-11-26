# MAS-Backend (Port 4000) neu starten - NUR wenn Ruhe ist. Bricht sonst selbst ab (Exit 2).
#
#   powershell -File F:\MAS-2\tools\mas-neustart.ps1            # pruefen und neu starten
#   powershell -File F:\MAS-2\tools\mas-neustart.ps1 -NurPruefen # nur die Ruhe-Pruefung
#
# Ruhe heisst (Vorfall 26.11.2026: Neustart 6 s nach einem Anruf, Pruefung lief, wurde aber nicht
# ausgewertet):
#   1. Kein offener Gespraechsraum bei Clara V8 (LiveKit).
#   2. In den letzten -RuheMinuten kam bei MAS nichts ausser den Dauerabfragen der offenen Seiten an
#      (kein Anruf-Kontext, kein Werkzeug, kein Eintrag ins Praxisgedaechtnis).
# Die Pruefung laeuft zweimal im Abstand von 20 s; beide muessen ruhig sein.
param([int]$RuheMinuten = 3, [switch]$NurPruefen)
$ErrorActionPreference = 'Stop'
$LogDir = 'F:\MAS-2\logs'
# Dauerabfragen offener Seiten und reine Leseseiten - zaehlen nicht als Betrieb.
$Leerlauf = @('/clara/devices', '/remote/pending', '/health', '/planr/berechtigung', '/planr/hkp', '/planr/entwuerfe',
              '/clara/qm/calendar', '/brain/tagesliste', '/clara-switch/status')

function Raeume {
    $py = 'F:\Clara-V8\.venv\Scripts\python.exe'
    if (-not (Test-Path $py)) { return 'unbekannt (Clara V8 nicht gefunden)' }
    $code = @'
import asyncio
from v8 import konfig
from livekit import api
async def m():
    a = api.LiveKitAPI(konfig.LIVEKIT_URL.replace("ws", "http", 1), konfig.LIVEKIT_SCHLUESSEL, konfig.LIVEKIT_GEHEIMNIS)
    r = await a.room.list_rooms(api.ListRoomsRequest())
    print("RAEUME=" + str(len(r.rooms)))
    await a.aclose()
asyncio.run(m())
'@
    Push-Location 'F:\Clara-V8'
    try { $aus = $code | & $py - 2>$null } finally { Pop-Location }
    $z = $aus | Where-Object { $_ -like 'RAEUME=*' } | Select-Object -Last 1
    if (-not $z) { return 'unbekannt (LiveKit antwortet nicht)' }
    return $z.Substring(7)
}

function Betrieb {
    $log = Get-ChildItem $LogDir -Filter 'backend_*.log' | Where-Object { $_.Name -notlike '*.err.log' } |
        Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $log) { return @('kein Backend-Log gefunden') }
    $grenze = (Get-Date).ToUniversalTime().AddMinutes(-$RuheMinuten).ToString('yyyy-MM-ddTHH:mm:ss')
    $treffer = @()
    foreach ($z in (Get-Content $log.FullName -Tail 6000)) {
        $i = $z.IndexOf('"ts":"'); if ($i -lt 0) { continue }
        $ts = $z.Substring($i + 6, 19); if ($ts -le $grenze) { continue }
        $p = $z.IndexOf('"path":"'); if ($p -lt 0) { continue }
        $pfad = $z.Substring($p + 8); $pfad = $pfad.Substring(0, $pfad.IndexOf('"'))
        if ($Leerlauf -contains $pfad) { continue }
        $treffer += "$($ts.Substring(11))Z $pfad"
    }
    # Laeuft das Backend erst seit kurzem, sagt sein Log zu wenig: dann gilt es nicht als ruhig.
    if (((Get-Date) - $log.CreationTime).TotalMinutes -lt $RuheMinuten) { $treffer += "Backend laeuft erst seit $([int]((Get-Date) - $log.CreationTime).TotalSeconds) s" }
    return $treffer
}

function Pruefen([string]$name) {
    $r = Raeume
    $b = @(Betrieb)
    Write-Host "[$name $(Get-Date -Format HH:mm:ss)] Gespraechsraeume: $r | Betrieb in $RuheMinuten min: $($b.Count)"
    if ($r -ne '0') { Write-Host "  KEINE RUHE: Gespraechsraeume = $r"; return $false }
    if ($b.Count) { $b | Select-Object -Last 8 | ForEach-Object { Write-Host "  KEINE RUHE: $_" }; return $false }
    return $true
}

if (-not (Pruefen 'Pruefung 1')) { Write-Host 'ABBRUCH: kein Neustart.'; exit 2 }
Start-Sleep -Seconds 20
if (-not (Pruefen 'Pruefung 2')) { Write-Host 'ABBRUCH: kein Neustart.'; exit 2 }
if ($NurPruefen) { Write-Host 'Ruhe. (Nur geprueft, kein Neustart.)'; exit 0 }

$alt = (Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1
if ($alt) { Stop-Process -Id $alt -Force; Start-Sleep -Seconds 2 }
$st = Get-Date -Format yyyyMMdd_HHmmss
Start-Process -FilePath 'node' -ArgumentList 'src/server.js' -WorkingDirectory 'F:\MAS-2\backend' -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir "backend_$st.log") -RedirectStandardError (Join-Path $LogDir "backend_$st.err.log")
$ok = $false
foreach ($n in 1..20) {
    Start-Sleep -Seconds 2
    try { Invoke-WebRequest 'http://127.0.0.1:4000/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; $ok = $true; break } catch { }
}
if (-not $ok) { Write-Host "FEHLER: MAS antwortet nach dem Neustart nicht (Log backend_$st.err.log)."; exit 1 }
Write-Host "MAS neu gestartet um $(Get-Date -Format HH:mm:ss), Log backend_$st.log"
exit 0
