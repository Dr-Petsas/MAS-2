# ============================================================================
# FERNSTEUERUNGS-LIVE-WACHE (durchgehend, kurzer Poll statt 5-Minuten-Task)
#
# Ruft die bestehende Single-Shot-Wache remote_chat_watch.ps1 in einer Schleife
# alle paar Sekunden auf. Neue Auftraege werden dadurch fast sofort (~Poll-
# Intervall) aufgenommen statt erst beim naechsten 5-Minuten-Tick.
#
# - Waehrend ein Agent laeuft, blockiert remote_chat_watch.ps1 (WaitForExit),
#   die Schleife macht danach sofort weiter. Die Agent-Sperre in der Wache
#   verhindert doppelte Agenten.
# - Guard: nur EINE Live-Wache gleichzeitig (live.lock mit PID).
#
# Start:  powershell -NoProfile -ExecutionPolicy Bypass -File F:\MAS-2\tools\remote_chat_live.ps1
# Stop:   den PowerShell-Prozess beenden (oder live.lock loeschen + Prozess killen).
# ============================================================================
$ErrorActionPreference = 'Continue'
$root      = 'F:\MAS-2'
$watchDir  = Join-Path $root '.run\remote'
$liveLock  = Join-Path $watchDir 'live.lock'
$watch     = Join-Path $root 'tools\remote_chat_watch.ps1'
$PollSeconds = 6
New-Item -ItemType Directory -Path $watchDir -Force | Out-Null

# --- Guard: laeuft schon eine Live-Wache? ---
if (Test-Path $liveLock) {
    $oldPid = (Get-Content $liveLock -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        Write-Host "Live-Wache laeuft bereits (PID $oldPid) - beende diesen Start."
        exit 0
    }
}
$PID | Out-File $liveLock -Encoding ascii -Force

Write-Host "Live-Wache gestartet (PID $PID), Poll alle $PollSeconds s. Strg+C beendet."
try {
    while ($true) {
        try {
            & 'powershell' -NoProfile -ExecutionPolicy Bypass -File $watch
        } catch {
            Write-Host "Wache-Fehler: $($_.Exception.Message)"
        }
        Start-Sleep -Seconds $PollSeconds
    }
} finally {
    Remove-Item $liveLock -Force -ErrorAction SilentlyContinue
}
