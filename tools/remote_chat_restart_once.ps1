<#
  Einmaliger, sauberer Neustart des Fernsteuerungs-Drahts (30.07.2026).
  Zweck: die neue Live-Puls-Funktion in remote_chat_watch.ps1 aktivieren, OHNE
  die gerade laufende Antwort abzuschneiden. Wird von einer einmaligen geplanten
  Aufgabe (MAS-FS-RestartOnce) ~2 Min nach dem Anlegen gestartet.

  Ablauf: 1) warten bis kein Lauf mehr "in_arbeit" ist (Antwort ist raus),
          2) alte Waechter beenden, 3) genau EINEN neuen starten (gleiche
          Startzeile wie der Urlaubs-Waechter), 4) Puls/Heartbeat pruefen,
          5) sich selbst (die geplante Aufgabe) entfernen.
  Sicherheitsnetz: der neue Waechter reiht beim Start verwaiste "in_arbeit"-
  Nachrichten wieder als "neu" ein -> keine Nachricht geht verloren.
#>
$ErrorActionPreference = "Continue"
$RunDir      = "F:\MAS-2\.run"
$WatchScript = "F:\MAS-2\tools\remote_chat_watch.ps1"
$Hb          = Join-Path $RunDir "remote_chat_watch.hb"
$Log         = Join-Path $RunDir "remote_chat_restart_once.log"
function L([string]$m) { try { Add-Content -Path $Log -Value ((Get-Date).ToString("HH:mm:ss") + "  " + $m) } catch {} }

L "Start Einmal-Neustart"

# Token fuer den Idle-Check aus backend\.env
$Token = ""
$envPath = "F:\MAS-2\backend\.env"
if (Test-Path $envPath) {
  $l = Get-Content $envPath | Where-Object { $_ -match "^REMOTE_CHAT_TOKEN=" } | Select-Object -First 1
  if ($l) { $Token = ($l -split "=", 2)[1].Trim() }
}

# 1) Warten bis idle (kein in_arbeit), max ~2 Min
$idle = $false
for ($i = 0; $i -lt 24; $i++) {
  try {
    $st = Invoke-RestMethod -Uri ("http://127.0.0.1:4000/remote/state?limit=20&token=" + [uri]::EscapeDataString($Token)) -TimeoutSec 15
    $busy = @($st.messages | Where-Object { $_.role -eq "user" -and $_.status -eq "in_arbeit" })
    if ($busy.Count -eq 0) { $idle = $true; break }
  } catch { }
  Start-Sleep -Seconds 5
}
L ("idle=" + $idle)

# 2) Alte Waechter beenden (auch Zombies)
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -match "remote_chat_watch\.ps1" } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {}; L ("beendet PID " + $_.ProcessId) }
Start-Sleep -Seconds 2

# 3) Genau EINEN neuen starten (identische Zeile wie watchdog.ps1)
if (Test-Path $WatchScript) {
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",$WatchScript -WindowStyle Minimized
  L "neuer Waechter gestartet"
} else {
  L "FEHLER: Waechter-Skript nicht gefunden"
}

# 4) Heartbeat pruefen (frisch < 30 s)
$ok = $false
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Seconds 3
  if (Test-Path $Hb) {
    try { $ts = [datetime]::Parse((Get-Content $Hb -Raw).Trim()); if (((Get-Date) - $ts).TotalSeconds -lt 30) { $ok = $true; break } } catch {}
  }
}
L ("heartbeat_frisch=" + $ok)

# 5) Diese einmalige Aufgabe entfernen
try { schtasks /delete /tn "MAS-FS-RestartOnce" /f | Out-Null; L "geplante Aufgabe entfernt" } catch {}
L "fertig"
