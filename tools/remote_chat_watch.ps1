# ============================================================================
# FERNSTEUERUNGS-WACHE (alle 5 Minuten via Aufgabenplanung "MASFernsteuerung")
#
# Holt neue Auftraege von der Fernsteuerungs-Seite (https://mas-fernsteuerung.web.app)
# ab, die im MAS-2-Backend unter /remote/pending liegen. Gibt es welche, wird
# eine unbeaufsichtigte Cursor-Agent-Session gestartet, die den Auftrag
# ausfuehrt, eine kurze Antwort in den Chat schreibt und das Board (Resuemee +
# Empfehlungen) aktualisiert. Siehe tools/remote_chat_prompt.md.
#
# Laeuft bis 15.07.2026, 08:00 — danach traegt sich der Task selbst aus.
# (Reaktiviert 16.06.2026; Enddatum verlaengert.)
# Token kommt aus backend\.env (REMOTE_CHAT_TOKEN).
# ============================================================================
$ErrorActionPreference = 'Continue'
$root     = 'F:\MAS-2'
$watchDir = Join-Path $root '.run\remote'
$lockFile = Join-Path $watchDir 'agent.lock'
$MasLocal = 'http://127.0.0.1:4000'
New-Item -ItemType Directory -Path $watchDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$logFile = Join-Path $watchDir "lauf_$stamp.log"

function Log([string]$Msg) {
    Add-Content -Path $logFile -Value "$(Get-Date -Format 'HH:mm:ss') $Msg"
}

# Endzeit: 15.07.2026 08:00 — danach Task entfernen und beenden.
$ende = Get-Date -Year 2026 -Month 7 -Day 15 -Hour 8 -Minute 0 -Second 0
if ((Get-Date) -gt $ende) {
    Log 'Endzeit erreicht - Task wird ausgetragen.'
    schtasks /Delete /TN "MASFernsteuerung" /F 2>&1 | Out-Null
    exit 0
}

# Token aus backend\.env lesen.
$tokLine = Get-Content (Join-Path $root 'backend\.env') -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^\s*REMOTE_CHAT_TOKEN\s*=' } | Select-Object -First 1
if (-not $tokLine) { Log 'REMOTE_CHAT_TOKEN fehlt in backend\.env - Abbruch'; exit 1 }
$token = ($tokLine -split '=', 2)[1].Trim()

# Laeuft schon ein Agent? Frische Sperre (<50 min) respektieren, alte aufraeumen.
if (Test-Path $lockFile) {
    $age = (Get-Date) - (Get-Item $lockFile).LastWriteTime
    if ($age.TotalMinutes -lt 50) { Log "Agent-Sperre aktiv ($([int]$age.TotalMinutes) min) - ueberspringe"; exit 0 }
    Log 'Alte Sperre (>50 min) - wird entfernt.'
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}

# Neue Auftraege abholen (lokal; das Backend selbst kuemmert sich um Firestore).
try {
    $pending = Invoke-RestMethod -Uri "$MasLocal/remote/pending?token=$token" -TimeoutSec 30
} catch {
    Log "Backend nicht erreichbar: $($_.Exception.Message)"
    exit 1
}
if (-not $pending.ok -or -not $pending.messages -or $pending.messages.Count -eq 0) {
    # Nichts zu tun - Log-Datei wieder loeschen, damit kein Muell entsteht.
    Remove-Item $logFile -Force -ErrorAction SilentlyContinue
    exit 0
}

Log "$($pending.messages.Count) neue(r) Auftrag/Auftraege gefunden."

# Auftraege als 'in_arbeit' markieren (damit der naechste Tick nicht doppelt zieht)
# und in eine Job-Datei fuer den Agenten schreiben.
$ids = @($pending.messages | ForEach-Object { $_.id })
$ack = @{ token = $token; ids = $ids; status = 'in_arbeit' } | ConvertTo-Json
Invoke-RestMethod -Uri "$MasLocal/remote/ack" -Method Post -ContentType 'application/json; charset=utf-8' `
    -Body $ack -TimeoutSec 30 | Out-Null

$jobFile = Join-Path $watchDir "job_$stamp.txt"
$lines = @("Auftraege von Dr. Petsas ueber die Fernsteuerungs-Seite (aelteste zuerst):", "")
foreach ($m in $pending.messages) {
    $t = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$m.createdAt).ToLocalTime().ToString('dd.MM. HH:mm')
    $lines += "[$t] (id=$($m.id))"
    $lines += $m.text
    $lines += ""
}
$lines | Out-File $jobFile -Encoding utf8

# Sperre setzen und Agent starten.
New-Item -ItemType File -Path $lockFile -Force | Out-Null
$agent = "$env:LOCALAPPDATA\cursor-agent\agent.cmd"
$prompt = "Lies die Datei F:\MAS-2\tools\remote_chat_prompt.md und fuehre den Auftrag darin vollstaendig aus. Die aktuellen Auftraege stehen in $jobFile."

try {
    $proc = Start-Process -FilePath $agent -ArgumentList @(
        '-p', '--force', '--trust',
        '--output-format', 'text',
        "`"$prompt`""
    ) -WorkingDirectory $root -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $watchDir "agent_$stamp.out.log") `
        -RedirectStandardError (Join-Path $watchDir "agent_$stamp.err.log")
    if (-not $proc.WaitForExit(45 * 60 * 1000)) {
        Log 'ZEITUEBERSCHREITUNG nach 45 min - Agent wird beendet.'
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    Log "Agent-Exit-Code: $($proc.ExitCode)"
} finally {
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}

# Sicherheitsnetz: Wenn der Agent keine Antwort in den Chat geschrieben hat
# (Marker FERN-FERTIG fehlt), wenigstens eine Kurzmeldung posten, damit auf
# dem Handy nicht einfach Stille herrscht.
$out = Join-Path $watchDir "agent_$stamp.out.log"
$done = (Test-Path $out) -and ((Get-Content $out -Raw -ErrorAction SilentlyContinue) -match 'FERN-FERTIG')
if (-not $done) {
    $msg = @{ token = $token; role = 'agent'
              text = "Der Lauf $stamp ist nicht sauber durchgelaufen - ich schaue es mir beim naechsten Abruf nochmal an. (Automatische Meldung)" } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "$MasLocal/remote/message" -Method Post `
            -ContentType 'application/json; charset=utf-8' -Body $msg -TimeoutSec 30 | Out-Null
    } catch { Log "Notfall-Antwort fehlgeschlagen: $($_.Exception.Message)" }
    # Auftraege wieder auf 'neu', damit der naechste Lauf sie erneut zieht.
    $requeue = @{ token = $token; ids = $ids; status = 'neu' } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "$MasLocal/remote/ack" -Method Post `
            -ContentType 'application/json; charset=utf-8' -Body $requeue -TimeoutSec 30 | Out-Null
    } catch { }
}
exit 0
