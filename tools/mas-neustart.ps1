# MAS-Backend (Port 4000) neu starten - NUR wenn Ruhe ist. Bricht sonst selbst ab (Exit 2).
#
#   powershell -File F:\MAS-2\tools\mas-neustart.ps1            # pruefen und neu starten
#   powershell -File F:\MAS-2\tools\mas-neustart.ps1 -NurPruefen # nur die Ruhe-Pruefung
#
# Ruhe heisst (Vorfall 26.11.2026: Neustart 6 s nach einem Anruf, Pruefung lief, wurde aber nicht
# ausgewertet):
#   1. Kein offener Gespraechsraum bei Clara V8 (LiveKit).
#   1b. Bianca V8 meldet "laeuft: false" (kein Anruf auf der Leitung, keiner im Abschluss).
#       Antwortet sie nicht, ist der Stand unbekannt: kein Neustart.
#   2. In den letzten -RuheMinuten kam bei MAS nichts ausser den Dauerabfragen der offenen Seiten an
#      (kein Anruf-Kontext, kein Werkzeug, kein Eintrag ins Praxisgedaechtnis).
# Die Pruefung laeuft zweimal im Abstand von 20 s; beide muessen ruhig sein.
param([int]$RuheMinuten = 3, [switch]$NurPruefen, [string]$BiancaServer = 'pickadoc1')
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

# Bianca V8 (pickadoc1) sagt selbst, ob ein Anruf auf der Leitung ist oder noch abschliesst
# (Meldung ans MAS). Gibt 'frei' zurueck, sonst den Grund. Keine oder unlesbare Antwort ist
# "Stand unbekannt" und damit KEINE Ruhe (Vorfall 27.11.2026 11:45: der Abschluss eines Gespraechs
# fiel in den Neustart, das Ereignis kam nicht an).
function Bianca {
    try {
        $aus = & ssh -o BatchMode=yes -o ConnectTimeout=5 $BiancaServer 'curl -s -m 5 http://127.0.0.1:40103/laeuft' 2>$null
        if ($LASTEXITCODE -ne 0) { return "Stand unbekannt (keine Antwort, Code $LASTEXITCODE)" }
        $j = ($aus -join '') | ConvertFrom-Json
    } catch { return 'Stand unbekannt (keine lesbare Antwort)' }
    if ($null -eq $j -or $j.laeuft -isnot [bool]) { return 'Stand unbekannt (Antwort ohne "laeuft")' }
    if ($j.laeuft) { return "Gespraeche $($j.gespraeche), im Abschluss $($j.abschluss)" }
    return 'frei'
}

function Pruefen([string]$name) {
    $r = Raeume
    $b = @(Betrieb)
    $bi = Bianca
    Write-Host "[$name $(Get-Date -Format HH:mm:ss)] Gespraechsraeume: $r | Bianca V8: $bi | Betrieb in $RuheMinuten min: $($b.Count)"
    if ($bi -ne 'frei') { Write-Host "  KEINE RUHE: Bianca V8 = $bi"; return $false }
    if ($r -ne '0') { Write-Host "  KEINE RUHE: Gespraechsraeume = $r"; return $false }
    if ($b.Count) { $b | Select-Object -Last 8 | ForEach-Object { Write-Host "  KEINE RUHE: $_" }; return $false }
    return $true
}

if (-not (Pruefen 'Pruefung 1')) { Write-Host 'ABBRUCH: kein Neustart.'; exit 2 }
Start-Sleep -Seconds 20
if (-not (Pruefen 'Pruefung 2')) { Write-Host 'ABBRUCH: kein Neustart.'; exit 2 }
if ($NurPruefen) { Write-Host 'Ruhe. (Nur geprueft, kein Neustart.)'; exit 0 }

# Zwischen Pruefung 2 und dem Beenden vergehen Sekunden: Bianca direkt davor noch einmal fragen.
$bi = Bianca
if ($bi -ne 'frei') { Write-Host "  KEINE RUHE: Bianca V8 = $bi"; Write-Host 'ABBRUCH: kein Neustart.'; exit 2 }

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
