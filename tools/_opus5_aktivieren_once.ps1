# Einmaliger, SICHERER Neustart des Fernsteuerungs-Waechters auf Opus 5
# (Dr. Petsas 03.08.2026, voruebergehend - morgen zurueck auf Opus 4.8).
#
# Warum verzoegert: Wird der Waechter gekillt, waehrend er gerade eine Nachricht
# bearbeitet, geht die Antwort verloren und die Nachricht wird erneut ausgefuehrt.
# Deshalb wartet dieses Skript, bis im Waechter-Protokoll eine NEUE Zeile
# "Beantwortet ..." steht (= Antwort zugestellt und quittiert), und startet erst
# dann neu. Der neue Lauf liest das korrigierte Skript (Fehlalarm-Schutz, Commit
# a29a897) und startet direkt auf Opus 5.
$ErrorActionPreference = 'Continue'
$RunDir = 'F:\MAS-2\.run'
$Log = Join-Path $RunDir 'opus5_aktivieren.log'
$WatchLog = Join-Path $RunDir 'remote_chat_watch.log'
function L($m) { Add-Content -Path $Log -Value ((Get-Date).ToString('HH:mm:ss') + '  ' + $m) }

L 'Warte auf Zustellung der aktuellen Antwort (neue "Beantwortet"-Zeile)...'
$before = 0
if (Test-Path $WatchLog) { $before = @(Select-String -Path $WatchLog -Pattern 'Beantwortet ' -ErrorAction SilentlyContinue).Count }
$delivered = $false
for ($i = 0; $i -lt 120; $i++) {   # max ca. 10 Minuten
  Start-Sleep -Seconds 5
  $now = 0
  if (Test-Path $WatchLog) { $now = @(Select-String -Path $WatchLog -Pattern 'Beantwortet ' -ErrorAction SilentlyContinue).Count }
  if ($now -gt $before) { $delivered = $true; break }
}
L ("Zustellung erkannt: " + $delivered + " - warte 8s Nachlauf")
Start-Sleep -Seconds 8

L 'Beende alten Waechter...'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*remote_chat_watch.ps1*' } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force; L ('gekillt PID ' + $_.ProcessId) } catch {} }
Start-Sleep -Seconds 2

# Fehlalarm-Sperre entfernen: sie stammt aus dem Selbstblockade-Vorfall, nicht aus
# einem echten Konto-Problem (der Opus-5-Test um 22:39 lief sauber durch).
Remove-Item (Join-Path $RunDir 'opus_billing_block.txt') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $RunDir 'remote_chat_watch.hb') -ErrorAction SilentlyContinue

Start-Process -FilePath 'powershell.exe' `
  -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'F:\MAS-2\tools\remote_chat_watch.ps1' `
  -WindowStyle Minimized
L 'Neuer Waechter gestartet, warte auf Lebenszeichen...'
$hb = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 3
  if (Test-Path (Join-Path $RunDir 'remote_chat_watch.hb')) { $hb = $true; break }
}
$mf = Join-Path $RunDir 'remote_chat_watch.model'
$model = if (Test-Path $mf) { (Get-Content $mf -Raw).Trim() } else { '?' }
L ("Fertig. Lebenszeichen=$hb  Modell=$model")

# Ergebnis auch aufs Handy melden, damit der Chef die Umschaltung schwarz auf
# weiss sieht, ohne nachfragen zu muessen.
try {
  $tok = ((Get-Content 'F:\MAS-2\backend\.env' | Where-Object { $_ -match '^REMOTE_CHAT_TOKEN=' } | Select-Object -First 1) -split '=', 2)[1].Trim()
  $txt = if ($model -match 'opus-5') { "Umschaltung fertig: Ich laufe jetzt auf Claude Opus 5. Morgen sage einfach Bescheid, dann stelle ich zurueck auf Opus 4.8." }
         else { "Achtung: Die Umschaltung auf Opus 5 hat nicht gegriffen, aktuell laeuft: $model. Bitte kurz Bescheid geben, ich sehe es mir an." }
  $body = @{ role = 'agent'; text = $txt; token = $tok } | ConvertTo-Json -Depth 4
  Invoke-RestMethod -Uri 'http://127.0.0.1:4000/remote/message' -Method Post -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 20 | Out-Null
  L 'Meldung ans Handy geschickt.'
} catch { L ('Meldung ans Handy fehlgeschlagen: ' + $_.Exception.Message) }
