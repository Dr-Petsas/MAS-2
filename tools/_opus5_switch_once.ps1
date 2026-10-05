# Einmaliger, verzoegerter + sicherer Neustart des Fernsteuerungs-Waechters auf
# Opus 5 (Dr. Petsas 03.08.2026, voruebergehend). Wartet erst, damit die aktuelle
# Chat-Antwort noch vom alten Lauf zugestellt wird, beendet dann den alten
# Waechter und startet GENAU EINEN neuen (der das neue Standardmodell = Opus 5
# liest und ins .model-File schreibt).
$ErrorActionPreference = 'Continue'
$RunDir = 'F:\MAS-2\.run'
$log = Join-Path $RunDir 'opus5_switch.log'
function L($m) { Add-Content -Path $log -Value ((Get-Date).ToString('HH:mm:ss') + '  ' + $m) }
L 'Warte 25s, damit die Bestaetigung noch raus geht...'
Start-Sleep -Seconds 25
L 'Beende alte Waechter (remote_chat_watch.ps1)...'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*remote_chat_watch.ps1*' } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force; L ('gekillt PID ' + $_.ProcessId) } catch {} }
Start-Sleep -Seconds 2
Remove-Item (Join-Path $RunDir 'remote_chat_watch.hb') -ErrorAction SilentlyContinue
Start-Process -FilePath 'powershell.exe' `
  -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'F:\MAS-2\tools\remote_chat_watch.ps1' `
  -WindowStyle Minimized
L 'Neuer Waechter gestartet, warte auf Heartbeat...'
$ok = $false
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Seconds 3
  if (Test-Path (Join-Path $RunDir 'remote_chat_watch.hb')) { $ok = $true; break }
}
$mf = Join-Path $RunDir 'remote_chat_watch.model'
$model = if (Test-Path $mf) { (Get-Content $mf -Raw).Trim() } else { '?' }
L ("Fertig. Heartbeat=$ok  Modell=$model")
