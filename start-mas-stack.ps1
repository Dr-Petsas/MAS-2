# Startet den kompletten MAS-Stack (idempotent: bereits laufende Teile werden
# übersprungen). Wird beim Windows-Login automatisch ausgeführt (HKCU-Run-Key
# "PickadocMasStack"), kann aber jederzeit auch manuell gestartet werden.
#
# Komponenten:
#   1. MAS-2 Backend      (node, Port 4000)  - Tools/Brain/Mail-API
#   2. ngrok-Tunnel       (Port 4000 -> https://faceable-darnell-nondiastatic.ngrok-free.dev)
#   3. LiveKit SFU        (Port 7880)        - Audio-Transport fuer Clara Voice
#   4. Clara Voice Worker (Port 8091)        - STT/LLM/TTS-Pipeline
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

# --- 2) ngrok-Tunnel (statische Domain, macht das Backend fuer die Live-Seite erreichbar) ---
if (Get-Process -Name 'ngrok' -ErrorAction SilentlyContinue) {
    Write-StackLog "ngrok: laeuft bereits"
} else {
    Write-StackLog "ngrok: starte Tunnel..."
    Start-Process -FilePath 'ngrok' `
        -ArgumentList 'http', '--url=faceable-darnell-nondiastatic.ngrok-free.dev', '4000', '--log=stdout' `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "ngrok_$Stamp.log") `
        -RedirectStandardError  (Join-Path $LogDir "ngrok_$Stamp.err.log")
    Start-Sleep -Seconds 3
    Write-StackLog "ngrok: $(if (Get-Process -Name 'ngrok' -ErrorAction SilentlyContinue) { 'OK' } else { 'FEHLER - siehe Log' })"
}

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

# --- 4) Clara Voice Worker (Health-Port 8091) ---
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

Write-StackLog "=== MAS-Stack Start fertig ==="
