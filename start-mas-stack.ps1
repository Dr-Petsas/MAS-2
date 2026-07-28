# Startet den kompletten MAS-Stack (idempotent: bereits laufende Teile werden
# übersprungen). Wird beim Windows-Login automatisch ausgeführt (HKCU-Run-Key
# "PickadocMasStack"), kann aber jederzeit auch manuell gestartet werden.
#
# Komponenten:
#   1. MAS-2 Backend      (node, Port 4000)  - Tools/Brain/Mail-API
#   2. Cloudflare-Tunnel  (Port 4000 -> https://<zufall>.trycloudflare.com, siehe logs\tunnel-url.txt)
#   3. LiveKit SFU        (Port 7880)        - Audio-Transport fuer Clara Voice
#   4. Lena-STT           (Port 8140)        - med. STT fuer Behandlungsdoku (Arzt-Tee + Browser-Lena)
#   5. Clara Voice Worker (Port 8091)        - STT/LLM/TTS-Pipeline (CLARA_LENA_TEE=1 -> tee'd zu Lena-STT)
#   (Ollama startet sich selbst ueber die Ollama-App.)

$ErrorActionPreference = 'Continue'
$LogDir = 'F:\MAS-2\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'

function Test-PortListening([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Write-StackLog([string]$Msg) {
    $line = "$(Get-Date -Format 'HH:mm:ss') $Msg"
    Write-Host $line
    Add-Content -Path (Join-Path $LogDir 'stack.log') -Value $line
}

Write-StackLog "=== MAS-Stack Start ($Stamp) ==="

# --- 1) MAS-2 Backend (Port 4000) ---
if (Test-PortListening 4000) {
    Write-StackLog "Backend: laeuft bereits (Port 4000)"
} else {
    Write-StackLog "Backend: starte..."
    Start-Process -FilePath 'node' -ArgumentList 'src/server.js' `
        -WorkingDirectory 'F:\MAS-2\backend' -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "backend_$Stamp.log") `
        -RedirectStandardError  (Join-Path $LogDir "backend_$Stamp.err.log")
    Start-Sleep -Seconds 8
    Write-StackLog "Backend: $(if (Test-PortListening 4000) { 'OK' } else { 'FEHLER - siehe Log' })"
}

# --- 2) Cloudflare-Tunnel (macht das Backend fuer Handy/Live-Seite erreichbar) ---
# Startet cloudflared, schreibt die URL in backend\.env (PUBLIC_BASE_URL) und
# startet das Backend bei URL-Wechsel neu. Aktuelle URL: logs\tunnel-url.txt
& 'F:\MAS-2\start-cloudflare-tunnel.ps1'

# --- 3) LiveKit SFU (Port 7880, Audio-Transport fuer Clara) ---
if (Test-PortListening 7880) {
    Write-StackLog "LiveKit SFU: laeuft bereits (Port 7880)"
} else {
    Write-StackLog "LiveKit SFU: starte..."
    Start-Process -FilePath 'F:\Clara-Voice\deploy\livekit\livekit-server.exe' `
        -ArgumentList '--config', 'F:\Clara-Voice\deploy\livekit\livekit.yaml' `
        -WorkingDirectory 'F:\Clara-Voice\deploy\livekit' -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "livekit_$Stamp.log") `
        -RedirectStandardError  (Join-Path $LogDir "livekit_$Stamp.err.log")
    Start-Sleep -Seconds 3
    Write-StackLog "LiveKit SFU: $(if (Test-PortListening 7880) { 'OK' } else { 'FEHLER - siehe Log' })"
}

# --- 4) Lena-STT (Port 8140, med. STT fuer Behandlungsdoku) ---
# Eigenes idempotentes Skript (eigener GPU-venv, eigenes Modell). Der Clara-Worker
# tee't waehrend einer Aufnahme/eines Diktats die Arzt-Stimme hierher (CLARA_LENA_TEE=1),
# und die Browser-Lena-Seite nutzt die per -Tunnel veroeffentlichte wss-Adresse.
# Non-fatal: faellt Lena-STT aus, laeuft der Rest des Stacks normal weiter.
if (Test-PortListening 8140) {
    Write-StackLog "Lena-STT: laeuft bereits (Port 8140)"
} else {
    Write-StackLog "Lena-STT: starte (Modell-Load dauert, siehe logs\lena_stt_*.log)..."
    try {
        # Cutover 23.07.2026: lena_stt lebt im eigenen Repo F:\Lena-Voice.
        & 'powershell' -NoProfile -ExecutionPolicy Bypass -File 'F:\Lena-Voice\lena_stt\start-lena-stt.ps1' -Tunnel
        Write-StackLog "Lena-STT: $(if (Test-PortListening 8140) { 'OK (Port 8140)' } else { 'noch nicht bereit - Modell laedt evtl. weiter' })"
    } catch {
        Write-StackLog "Lena-STT: Start fehlgeschlagen: $($_.Exception.Message)"
    }
}

# --- 5) Clara Voice Worker (Health-Port 8091) ---
if (Test-PortListening 8091) {
    Write-StackLog "Clara Worker: laeuft bereits (Port 8091)"
} else {
    Write-StackLog "Clara Worker: starte..."
    Start-Process -FilePath 'powershell' `
        -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'F:\Clara-Voice\start-clara.ps1' `
        -WorkingDirectory 'F:\Clara-Voice' -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "clara_$Stamp.log") `
        -RedirectStandardError  (Join-Path $LogDir "clara_$Stamp.err.log")
    # Worker laedt STT-Modell, das dauert - kein harter Check hier.
    Write-StackLog "Clara Worker: gestartet (Modell-Load dauert ~30-60s, Log: clara_$Stamp.log)"
}

# --- 6) Selbsttest: nach dem Start pruefen, dass Clara WIRKLICH antwortet ----
# Der Worker braucht ~30-60s fuer STT-Modell-Load + LiveKit-Registrierung.
# Wir warten darauf (max. 90s) und lassen dann clara-smoke.ps1 laufen, das pro
# Komponente GRUEN/ROT meldet - inkl. Tool-Calling (der 1011c18-Fehler waere
# hier sofort als ROT sichtbar gewesen). So muss nie wieder von Hand gesucht
# werden, was kaputt ist.
Write-StackLog "Selbsttest: warte auf Worker-Registrierung (max. 90s)..."
$workerReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 3
    if (Test-PortListening 8091) {
        $wlog = Get-ChildItem 'F:\MAS-2\logs\clara_*.err.log','F:\Clara-Voice\_worker*.err.log' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($wlog -and (Select-String -Path $wlog.FullName -Pattern 'registered worker' -ErrorAction SilentlyContinue | Select-Object -First 1)) {
            $workerReady = $true; break
        }
    }
}
$workerMsg = 'NICHT bestaetigt (Smoke laeuft trotzdem)'
if ($workerReady) { $workerMsg = 'registriert' }
Write-StackLog ("Selbsttest: Worker " + $workerMsg)

$smokeLog = Join-Path $LogDir ("smoke_" + $Stamp + ".log")
& 'powershell' -NoProfile -ExecutionPolicy Bypass -File 'F:\MAS-2\clara-smoke.ps1' *>&1 | Tee-Object -FilePath $smokeLog | Out-Null
$smokeCode = $LASTEXITCODE
if ($smokeCode -eq 0) {
    Write-StackLog "Selbsttest: GRUEN - Clara ist startklar."
} else {
    Write-StackLog ("Selbsttest: ROT - Details in " + $smokeLog + " (oder clara-smoke.ps1 erneut laufen lassen).")
}

Write-StackLog "=== MAS-Stack Start fertig ==="
