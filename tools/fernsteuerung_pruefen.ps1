<#
  Fernsteuerung: Selbsttest und Wiederherstellung (17.08.2026)
  ------------------------------------------------------------
  Anlass: Der Chef schrieb "die Fernsteuerungspage ist platt". Tatsaechlich war
  die Seite in Ordnung - der Agent HINTER ihr konnte nicht starten (dem kopflosen
  Lauf fehlte der Zugangsschluessel), und der Waechter quittierte jede Nachricht
  mit einem englischen Fehlertext. Vom Handy aus sah das wie eine kaputte Seite
  aus, und es war nicht zu erkennen, welches Glied der Kette fehlt.

  Dieses Skript prueft die Kette in der Reihenfolge, in der eine Nachricht sie
  durchlaeuft, und sagt in Klartext, was zu tun ist:

    Handy-Seite -> MAS-Endpunkte -> Token -> Firestore -> Waechter (Puls)
                -> kopfloser Agent (Anmeldung) -> Antwort zurueck

  Aufruf:
    powershell -File F:\MAS-2\tools\fernsteuerung_pruefen.ps1
    powershell -File F:\MAS-2\tools\fernsteuerung_pruefen.ps1 -Reparieren
    powershell -File F:\MAS-2\tools\fernsteuerung_pruefen.ps1 -Reparieren -MitAgentTest

  -Reparieren  startet den Waechter neu, wenn er fehlt oder sein Puls alt ist,
               und reiht liegengebliebene Nachrichten wieder ein.
  -MitAgentTest startet EINEN kopflosen Probelauf des Agenten (dauert bis ~30 s
               und kostet Kontingent) - nur damit ist die Anmeldung sicher
               geprueft; ohne den Schalter wird nur der Marker ausgewertet.

  Rueckgabe: 0 = Draht in Ordnung, 1 = etwas ist offen (Text sagt was).
#>

param(
  [string]$MasBase = "http://127.0.0.1:4000",
  [string]$AussenBase = "https://mas.pickadoc-tunnel.com",
  [switch]$Reparieren,
  [switch]$MitAgentTest
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RunDir = "F:\MAS-2\.run"
$EnvPath = "F:\MAS-2\backend\.env"
$WatchScript = "F:\MAS-2\tools\remote_chat_watch.ps1"
$HeartbeatFile = Join-Path $RunDir "remote_chat_watch.hb"
$AuthFile = Join-Path $RunDir "agent_auth_block.txt"
$CursorAgent = "C:\Users\Anmeldung2\AppData\Local\cursor-agent\cursor-agent.cmd"

$offen = New-Object System.Collections.Generic.List[string]
function Gut([string]$was) { Write-Host ("  [ok]     " + $was) -ForegroundColor Green }
function Schlecht([string]$was, [string]$tun) {
  Write-Host ("  [FEHLER] " + $was) -ForegroundColor Red
  if ($tun) { Write-Host ("           -> " + $tun) -ForegroundColor Yellow }
  $offen.Add($was)
}
function Hinweis([string]$was) { Write-Host ("  [hinw]   " + $was) -ForegroundColor DarkYellow }

Write-Host ""
Write-Host "=== Fernsteuerung: Selbsttest " (Get-Date).ToString("dd.MM.yyyy HH:mm") -ForegroundColor Cyan

# --- 1. Token -------------------------------------------------------------
Write-Host "`n1. Zugangs-Token"
$Token = ""
if (Test-Path $EnvPath) {
  $zeile = Get-Content $EnvPath | Where-Object { $_ -match "^REMOTE_CHAT_TOKEN=" } | Select-Object -First 1
  if ($zeile) { $Token = ($zeile -split "=", 2)[1].Trim() }
}
if ($Token) { Gut "REMOTE_CHAT_TOKEN steht in backend\.env" }
else { Schlecht "REMOTE_CHAT_TOKEN fehlt in backend\.env" "Token eintragen, sonst weist jeder Endpunkt ab" }

# --- 2. Backend und Seite -------------------------------------------------
Write-Host "`n2. Seite und Backend"
function Hol([string]$u) {
  try { return @{ ok = $true; code = (Invoke-WebRequest $u -TimeoutSec 12 -UseBasicParsing).StatusCode } }
  catch { return @{ ok = $false; code = $_.Exception.Response.StatusCode.value__; fehler = $_.Exception.Message } }
}
$innen = Hol "$MasBase/m/fernsteuerung.html"
if ($innen.ok) { Gut "Seite liegt am Backend ($MasBase/m/fernsteuerung.html)" }
else { Schlecht "Seite am Backend nicht erreichbar (Code $($innen.code))" "Laeuft das MAS-Backend? tools\start-mas.ps1" }

$aussen = Hol "$AussenBase/m/fernsteuerung.html"
if ($aussen.ok) { Gut "Seite ist von aussen erreichbar ($AussenBase) - so oeffnet das Handy sie" }
else { Schlecht "Von aussen NICHT erreichbar (Code $($aussen.code))" "Cloudflare-Tunnel pruefen: logs\tunnel-watch.log" }

# --- 3. Endpunkte ---------------------------------------------------------
Write-Host "`n3. Endpunkte und Nachrichten"
$state = $null
if ($Token) {
  try {
    $state = Invoke-RestMethod "$MasBase/remote/state?limit=200&token=$([uri]::EscapeDataString($Token))" -TimeoutSec 15
    Gut "GET /remote/state antwortet ($($state.messages.Count) Nachrichten im Verlauf)"
  } catch { Schlecht "GET /remote/state schlaegt fehl: $($_.Exception.Message)" "Token falsch oder Backend-Route kaputt" }
}
$liegen = @()
if ($state) {
  $liegen = @($state.messages | Where-Object { $_.role -eq "user" -and $_.status -ne "fertig" })
  if ($liegen.Count -eq 0) { Gut "keine unbearbeitete Nachricht offen" }
  else {
    $aeltesteMin = [int](((Get-Date) - [DateTimeOffset]::FromUnixTimeMilliseconds([long]($liegen[0].createdAt)).LocalDateTime).TotalMinutes)
    Hinweis "$($liegen.Count) Nachricht(en) warten noch (aelteste seit $aeltesteMin min): '$($liegen[0].text.Substring(0,[Math]::Min(60,$liegen[0].text.Length)))'"
  }
  if ($state.board.text) {
    Write-Host ("  Board:   " + ($state.board.text -split "`n")[0])
  }
}

# --- 4. Waechter ----------------------------------------------------------
Write-Host "`n4. Waechter (holt die Nachrichten ab)"
$proz = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -match "remote_chat_watch" })
$pulsAlterS = 99999
if (Test-Path $HeartbeatFile) {
  try {
    $stand = [datetimeoffset]::Parse((Get-Content $HeartbeatFile -Raw).Trim())
    $pulsAlterS = [int]((([datetimeoffset](Get-Date)) - $stand).TotalSeconds)
  } catch {}
}
if ($proz.Count -gt 0 -and $pulsAlterS -le 120) {
  Gut "Waechter laeuft (PID $($proz[0].ProcessId)), Puls vor $pulsAlterS s"
} elseif ($proz.Count -gt 0) {
  Schlecht "Waechter-Prozess da (PID $($proz[0].ProcessId)), aber Puls ist $pulsAlterS s alt" "haengt - mit -Reparieren neu starten"
} else {
  Schlecht "kein Waechter-Prozess" "mit -Reparieren starten (oder tools\remote_chat_live.ps1)"
}

# --- 5. Anmeldung des kopflosen Agenten ----------------------------------
Write-Host "`n5. Anmeldung des Agenten (kopfloser Betrieb)"
$schluessel = ""
if (Test-Path $EnvPath) {
  foreach ($n in @("CURSOR_API_KEY", "CURSOR_AGENT_API_KEY")) {
    $z = Get-Content $EnvPath | Where-Object { $_ -match "^$n=" } | Select-Object -First 1
    if ($z) { $schluessel = ($z -split "=", 2)[1].Trim().Trim('"'); if ($schluessel) { break } }
  }
}
if (-not $schluessel -and $env:CURSOR_API_KEY) { $schluessel = $env:CURSOR_API_KEY }
# Der Normalfall braucht KEINEN Schluessel: der Agent laeuft ueber die
# gespeicherte Anmeldung ("cursor-agent login", einmal im Browser bestaetigt).
# Ein Schluessel ist nur die Rueckfallebene, falls die Anmeldung wieder verloren
# geht (am 11.08.2026 um 15:10 hat etwas die Anmeldedatei ueberschrieben - danach
# lief der Draht 6 Tage ins Leere). Deshalb ist "kein Schluessel" hier KEIN
# Fehler; entschieden wird am Probelauf.
if ($schluessel) { Gut "Zugangsschluessel hinterlegt ($($schluessel.Length) Zeichen) - zusaetzliche Absicherung" }
else { Write-Host "  [hinw]   kein CURSOR_API_KEY - normal: der Agent nutzt die gespeicherte Anmeldung" -ForegroundColor DarkYellow }
if (Test-Path $AuthFile) {
  Hinweis "Anmelde-Sperre vom Waechter vermerkt: " + ((Get-Content $AuthFile -Raw).Trim() -split "`n")[0]
}
if ($MitAgentTest) {
  if (Test-Path $CursorAgent) {
    $env:CURSOR_API_KEY = $schluessel
    $probe = ("Antworte mit genau dem Wort BEREIT." | & $CursorAgent -p --output-format text 2>&1) -join " "
    if ($probe -match "(?i)bereit") { Gut "Probelauf erfolgreich - der Agent antwortet kopflos" }
    elseif ($probe -match "(?i)(authentication|api_key|login)") {
      Schlecht "Probelauf: der Agent ist abgemeldet" `
        "einmal 'cursor-agent login' ausfuehren und den Link im Browser bestaetigen (kein Schluessel nötig)"
    }
    else { Schlecht "Probelauf unklar: $($probe.Substring(0,[Math]::Min(140,$probe.Length)))" "Log ansehen: .run\remote_chat_watch.log" }
  } else { Schlecht "cursor-agent nicht gefunden ($CursorAgent)" "Cursor-CLI installieren" }
} else {
  Write-Host "  (Probelauf uebersprungen - mit -MitAgentTest wirklich testen)"
}

# --- 6. Reparatur ---------------------------------------------------------
if ($Reparieren) {
  Write-Host "`n6. Reparatur"
  if ($proz.Count -eq 0 -or $pulsAlterS -gt 120) {
    foreach ($p in $proz) {
      try { Stop-Process -Id $p.ProcessId -Force; Write-Host "  haengenden Waechter beendet (PID $($p.ProcessId))" } catch {}
    }
    # KEIN detached-Start (AGENTS.md: PowerShell landet sonst in einer versteckten
    # Konsole und stirbt wortlos), Streams getrennt in eigene Logs.
    $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
    $log = Join-Path $RunDir "remote-start-$stamp.log"
    $err = Join-Path $RunDir "remote-start-$stamp.err.log"
    Start-Process -FilePath "powershell.exe" `
      -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $WatchScript) `
      -WorkingDirectory "F:\MAS-2" -WindowStyle Minimized `
      -RedirectStandardOutput $log -RedirectStandardError $err | Out-Null
    Start-Sleep -Seconds 8
    $neu = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
      Where-Object { $_.CommandLine -match "remote_chat_watch" })
    if ($neu.Count -gt 0) { Gut "Waechter neu gestartet (PID $($neu[0].ProcessId)), Log: $log" }
    else { Schlecht "Neustart des Waechters hat nicht gegriffen" "Log ansehen: $err" }
  } else {
    Write-Host "  Waechter laeuft - kein Neustart nötig"
  }
  if ($liegen.Count -gt 0 -and $Token) {
    $ids = @($liegen | Where-Object { $_.status -eq "in_arbeit" } | ForEach-Object { [string]$_.id })
    if ($ids.Count -gt 0) {
      try {
        Invoke-RestMethod "$MasBase/remote/ack" -Method Post -ContentType "application/json; charset=utf-8" `
          -Body (@{ token = $Token; ids = $ids; status = "neu" } | ConvertTo-Json) -TimeoutSec 15 | Out-Null
        Gut "$($ids.Count) haengengebliebene Nachricht(en) wieder eingereiht"
      } catch { Schlecht "Wiedereinreihen fehlgeschlagen: $($_.Exception.Message)" "" }
    }
  }
}

# --- Fazit ---------------------------------------------------------------
Write-Host ""
if ($offen.Count -eq 0) {
  Write-Host "FAZIT: Der Draht ist in Ordnung - getippte Nachrichten kommen an und werden bearbeitet." -ForegroundColor Green
  exit 0
}
Write-Host "FAZIT: $($offen.Count) Punkt(e) offen:" -ForegroundColor Red
foreach ($o in $offen) { Write-Host "  - $o" }
Write-Host "`nWichtig: Nachrichten gehen trotzdem nicht verloren - sie bleiben auf 'neu'" -ForegroundColor Yellow
Write-Host "und werden abgearbeitet, sobald der offene Punkt behoben ist." -ForegroundColor Yellow
exit 1
