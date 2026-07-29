<#
  Urlaubs-Waechter (29.07.2026 - Dr. Petsas 3 Wochen AFK)
  =======================================================
  Prueft die vier Saeulen und repariert sie selbsttaetig:
    1. Ollama (11434)         - Claras LLM
    2. MAS-Backend (4000)     - Chat-Draht + Produkt
    3. Cloudflare-Tunnel      - macht Chat + MAS von aussen erreichbar
    4. Clara-Worker (8091)    - Telefon-Clara (Zombie-sicher via clara-switch)
    5. Lena-STT (8140)        - Behandlungs-Doku
    6. Fernsteuerungs-Waechter (remote_chat_watch.ps1) - beantwortet den Chat
    7. Chat-Seite /m/fernsteuerung.html (lokal + extern erreichbar)

  Betrieb:
    -Report   : voller Morgenbericht in den Chat (taeglich 08:00).
    (ohne)    : stiller Waechter (alle 15 min) - meldet nur, wenn er REPARIERT hat.

  Der einzige Lebensdraht des Chefs ist der Chat. Faellt MAS, Tunnel oder der
  Fernsteuerungs-Waechter aus, kann er nichts mehr schicken - darum werden diese
  drei am haertesten bewacht.

  Kill-Switch fuer alles: die geplanten Aufgaben "MAS-Urlaubswaechter*" in der
  Aufgabenplanung deaktivieren.
#>

param(
  [switch]$Report,
  [string]$MasBase = "http://127.0.0.1:4000",
  [string]$PublicBase = "https://mas.pickadoc-tunnel.com"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# --- Pfade / Konstanten ----------------------------------------------------
$RunDir       = "F:\MAS-2\.run"
$LogFile      = Join-Path $RunDir "watchdog.log"
$EnvPath      = "F:\MAS-2\backend\.env"
$CursorAgent  = "C:\Users\Anmeldung2\AppData\Local\cursor-agent\cursor-agent.cmd"
$WatchScript  = "F:\MAS-2\tools\remote_chat_watch.ps1"
$MasStart     = "F:\MAS-2\start-mas-stack.ps1"
$ClaraSwitch  = "F:\Clara-Voice\tools\clara-switch.ps1"
$LenaPy       = "F:\Lena-Voice\.venv-lena-gpu\Scripts\python.exe"
$LenaRoot     = "F:\Lena-Voice"
$CfConfig     = "C:\Users\Anmeldung2\.cloudflared\config.yml"
$ChatPage     = "F:\MAS-2\backend\public\m\fernsteuerung.html"
# Chef spricht IMMER mit Opus 4.8 (Wunsch 29.07.2026) - AUSSER das Guthaben ist
# erschoepft (dann Ersatzmodell, bis der Chef nach dem Aufladen zurueckschaltet).
$ExpectedModel = "claude-opus-4-8-thinking-high"
$BillingFile  = Join-Path $RunDir "opus_billing_block.txt"
if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Path $RunDir -Force | Out-Null }

$script:Repairs = @()   # Liste der durchgefuehrten Reparaturen
$script:Status  = [ordered]@{}

# Token fuer Chat-Rueckmeldung.
$Token = ""
if (Test-Path $EnvPath) {
  $l = Get-Content $EnvPath | Where-Object { $_ -match "^REMOTE_CHAT_TOKEN=" } | Select-Object -First 1
  if ($l) { $Token = ($l -split "=", 2)[1].Trim() }
}

function Log([string]$m) {
  $line = ((Get-Date).ToString("yyyy-MM-dd HH:mm:ss") + "  " + $m)
  Write-Host $line
  try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
}

function Find-Cloudflared() {
  $c = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $g = Get-ChildItem "C:\Users\Anmeldung2\AppData\Local\Microsoft\WinGet\Packages" -Recurse -Filter "cloudflared.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($g) { return $g.FullName }
  return $null
}

function Test-Port([int]$Port) {
  $client = New-Object Net.Sockets.TcpClient
  try {
    $a = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $a.AsyncWaitHandle.WaitOne(500)) { return $false }
    $client.EndConnect($a); return $true
  } catch { return $false } finally { $client.Close() }
}

function Test-Http([string]$url, [int]$timeout = 8) {
  try {
    $r = Invoke-WebRequest -Uri $url -TimeoutSec $timeout -UseBasicParsing
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400)
  } catch { return $false }
}

function Proc-With([string]$name, [string]$needle) {
  return @(Get-CimInstance Win32_Process -Filter ("Name='{0}'" -f $name) -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like ("*" + $needle + "*") })
}

# --- 1) Ollama -------------------------------------------------------------
function Check-Ollama() {
  if (Test-Http "http://127.0.0.1:11434/api/tags" 4) { $script:Status["Ollama"] = "ok"; return }
  Log "Ollama down - starte 'ollama serve'"
  try { Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden } catch { Log "Ollama-Start-Fehler: $($_.Exception.Message)" }
  Start-Sleep -Seconds 6
  if (Test-Http "http://127.0.0.1:11434/api/tags" 6) { $script:Status["Ollama"] = "repariert"; $script:Repairs += "Ollama neu gestartet" }
  else { $script:Status["Ollama"] = "DOWN"; $script:Repairs += "Ollama liess sich NICHT starten" }
}

# --- 2) MAS ----------------------------------------------------------------
function Check-Mas() {
  if (Test-Http "$MasBase/health" 5) { $script:Status["MAS"] = "ok"; return }
  Log "MAS down/unerreichbar - Reparatur"
  # Port belegt aber ungesund? -> toten node auf 4000 killen.
  $c = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { try { Stop-Process -Id $c.OwningProcess -Force } catch {}; Start-Sleep -Seconds 2 }
  if (Test-Path $MasStart) {
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",$MasStart -WindowStyle Minimized
  }
  for ($i = 0; $i -lt 20; $i++) { Start-Sleep -Seconds 3; if (Test-Http "$MasBase/health" 4) { break } }
  if (Test-Http "$MasBase/health" 5) { $script:Status["MAS"] = "repariert"; $script:Repairs += "MAS-Backend neu gestartet" }
  else { $script:Status["MAS"] = "DOWN"; $script:Repairs += "MAS liess sich NICHT starten" }
}

# --- 3) Tunnel -------------------------------------------------------------
function Check-Tunnel() {
  # Der WAHRE Test ist die externe Erreichbarkeit - daran haengt der Chat des
  # Chefs. Prozess-Zaehlen ist unzuverlaessig (und wuerde bei Fehlerkennung
  # einen zweiten Tunnel starten). Erreichbar = ok, egal wie viele Prozesse.
  if (Test-Http "$PublicBase/health" 12) { $script:Status["Tunnel"] = "ok"; return }
  Log "Tunnel extern NICHT erreichbar - Reparatur"
  $cf = Find-Cloudflared
  if (-not $cf) { $script:Status["Tunnel"] = "DOWN"; $script:Repairs += "cloudflared.exe nicht gefunden"; return }
  # Nur starten, wenn KEIN benannter Tunnel laeuft (Doppelstart vermeiden).
  $named = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*config.yml*tunnel*run*" })
  if ($named.Count -eq 0 -and (Test-Path $CfConfig)) {
    Start-Process -FilePath $cf -ArgumentList "--config",$CfConfig,"tunnel","run" -WindowStyle Hidden
    Start-Sleep -Seconds 8
  }
  if (Test-Http "$PublicBase/health" 12) { $script:Status["Tunnel"] = "repariert"; $script:Repairs += "Cloudflare-Tunnel neu gestartet" }
  else { $script:Status["Tunnel"] = "extern NICHT erreichbar"; $script:Repairs += "Tunnel extern weiterhin down" }
}

# --- 4) Clara --------------------------------------------------------------
function Check-Clara() {
  if (Test-Port 8091) { $script:Status["Clara"] = "ok"; return }
  Log "Clara-Worker (8091) tot - clara-switch live (killt Zombies)"
  if (Test-Path $ClaraSwitch) {
    try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ClaraSwitch -Mode live 2>&1 | Out-Null } catch { Log "clara-switch-Fehler: $($_.Exception.Message)" }
  }
  if (Test-Port 8091) { $script:Status["Clara"] = "repariert"; $script:Repairs += "Clara-Worker neu gestartet" }
  else { $script:Status["Clara"] = "DOWN"; $script:Repairs += "Clara kam NICHT hoch (Log clara-switch pruefen)" }
}

# --- 5) Lena ---------------------------------------------------------------
function Check-Lena() {
  if (Test-Http "http://127.0.0.1:8140/health" 5) { $script:Status["Lena"] = "ok"; return }
  Log "Lena-STT (8140) down - Reparatur"
  # tote lena_stt.server einsammeln, dann sauber im GPU-venv starten
  foreach ($p in (Proc-With "python.exe" "lena_stt.server")) { try { Stop-Process -Id $p.ProcessId -Force } catch {} }
  Start-Sleep -Seconds 2
  if (Test-Path $LenaPy) {
    Start-Process -FilePath $LenaPy -ArgumentList "-m","lena_stt.server" -WorkingDirectory $LenaRoot -WindowStyle Hidden
  }
  for ($i = 0; $i -lt 15; $i++) { Start-Sleep -Seconds 4; if (Test-Http "http://127.0.0.1:8140/health" 4) { break } }
  if (Test-Http "http://127.0.0.1:8140/health" 5) { $script:Status["Lena"] = "repariert"; $script:Repairs += "Lena-STT neu gestartet" }
  else { $script:Status["Lena"] = "DOWN"; $script:Repairs += "Lena kam NICHT hoch" }
}

# --- 6) Fernsteuerungs-Waechter -------------------------------------------
function ChatWatcher-Alive() {
  # Zuverlaessiges Signal: der Waechter schreibt jede Runde einen Heartbeat.
  # Frisch (< 90 s) = lebt und arbeitet (faengt auch einen HAENGENDEN Waechter).
  $hb = Join-Path $RunDir "remote_chat_watch.hb"
  if (-not (Test-Path $hb)) { return $false }
  try {
    $ts = [datetime]::Parse((Get-Content $hb -Raw).Trim())
    return (((Get-Date) - $ts).TotalSeconds -lt 90)
  } catch { return $false }
}
function ChatWatcher-Model() {
  $mf = Join-Path $RunDir "remote_chat_watch.model"
  if (-not (Test-Path $mf)) { return "" }
  try { return (Get-Content $mf -Raw).Trim() } catch { return "" }
}
function Check-ChatWatcher() {
  # Bei erschoepftem Opus-Guthaben ist das Ersatzmodell ausdruecklich ERLAUBT -
  # dann NICHT auf Opus zurueckzwingen (das wuerde nur erneut scheitern).
  $billingBlock = Test-Path $BillingFile
  $model = ChatWatcher-Model
  $modelOk = $billingBlock -or ($model -eq $ExpectedModel)
  if ((ChatWatcher-Alive) -and $modelOk) {
    $script:Status["Chat-Waechter"] = if ($billingBlock) { "ok (Ersatz - Opus-Guthaben aus)" } else { "ok (Opus 4.8)" }
    return
  }
  if ((ChatWatcher-Alive) -and -not $modelOk) {
    Log ("Chat-Waechter laeuft, aber falsches Modell ('" + $model + "' statt $ExpectedModel, keine Guthaben-Sperre) - Neustart erzwingen")
    $script:Repairs += "Chat-Modell auf Opus 4.8 zurueckgestellt"
  }
  Log "Fernsteuerungs-Waechter tot/haengt/falsches Modell - alte beenden, genau einen starten"
  # Alle bestehenden beenden (auch Zombies), damit NIE zwei Agenten parallel
  # dieselbe Nachricht bearbeiten.
  foreach ($p in (Proc-With "powershell.exe" "remote_chat_watch.ps1")) { try { Stop-Process -Id $p.ProcessId -Force } catch {} }
  Start-Sleep -Seconds 2
  if (Test-Path $WatchScript) {
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",$WatchScript -WindowStyle Minimized
  }
  for ($i = 0; $i -lt 8; $i++) { Start-Sleep -Seconds 2; if (ChatWatcher-Alive) { break } }
  if (ChatWatcher-Alive) { $script:Status["Chat-Waechter"] = "repariert"; $script:Repairs += "Chat-Waechter neu gestartet" }
  else { $script:Status["Chat-Waechter"] = "DOWN"; $script:Repairs += "Chat-Waechter startete NICHT" }
}

# --- 7) Chat-Seite ---------------------------------------------------------
function Check-ChatPage() {
  $localOk = Test-Http "$MasBase/m/fernsteuerung.html" 6
  $stateOk = $false
  if ($Token) { $stateOk = Test-Http ("$MasBase/remote/state?limit=1&token=" + [uri]::EscapeDataString($Token)) 6 }
  $extOk = Test-Http "$PublicBase/m/fernsteuerung.html" 12
  if ($localOk -and $extOk -and ($stateOk -or -not $Token)) { $script:Status["Chat-Seite"] = "ok"; return }
  Log "Chat-Seite Problem (lokal=$localOk extern=$extOk state=$stateOk)"
  # Datei ganz weg/leer? -> das ist ein echtes Code-Problem: Agent reparieren lassen.
  $fileBad = (-not (Test-Path $ChatPage)) -or ((Get-Item $ChatPage -ErrorAction SilentlyContinue).Length -lt 500)
  if ($fileBad -and (Test-Path $CursorAgent) -and (Test-Http "$MasBase/health" 5)) {
    Log "Chat-Seite defekt/fehlt - starte Agent-Selbstheilung"
    $prompt = "Die Datei F:\MAS-2\backend\public\m\fernsteuerung.html (Handy-Chatseite fuer den Fernsteuerungs-Chat) fehlt oder ist beschaedigt. Stelle eine funktionierende Version wieder her: sie liest den Token aus dem URL-Parameter ?token= (Fallback localStorage), pollt GET /remote/state?token=... alle 4s, zeigt Nachrichten (user rechts, agent links) und das Board, und sendet per POST /remote/message {token, role:'user', text}. Mobil, dunkel, selbsttragend. Danach kurz auf Deutsch bestaetigen, was du getan hast."
    try { $prompt | & $CursorAgent -p --output-format json --force --trust --workspace "F:\MAS-2" 1> (Join-Path $RunDir "chatrepair.json") 2>$null } catch {}
    $script:Repairs += "Chat-Seite: Agent-Selbstheilung angestossen"
  }
  $script:Status["Chat-Seite"] = if (Test-Http "$MasBase/m/fernsteuerung.html" 6) { "repariert/ok" } else { "PRUEFEN" }
}

function Post-Chat([string]$text) {
  if (-not $Token) { return }
  try {
    Invoke-RestMethod -Uri "$MasBase/remote/message" -Method Post -ContentType "application/json; charset=utf-8" `
      -Body (@{ token = $Token; role = "agent"; text = $text } | ConvertTo-Json) -TimeoutSec 15 | Out-Null
  } catch { Log "Chat-Post-Fehler: $($_.Exception.Message)" }
}
function Post-Board([string]$text) {
  if (-not $Token) { return }
  try {
    Invoke-RestMethod -Uri "$MasBase/remote/board" -Method Post -ContentType "application/json; charset=utf-8" `
      -Body (@{ token = $Token; text = $text } | ConvertTo-Json) -TimeoutSec 15 | Out-Null
  } catch {}
}

# --- Ablauf ----------------------------------------------------------------
Log ("Waechter-Lauf startet (" + $(if ($Report) { "MORGENBERICHT" } else { "still" }) + ")")
Check-Ollama
Check-Mas
Check-Tunnel
Check-Clara
Check-Lena
Check-ChatWatcher
Check-ChatPage

$zeile = ($script:Status.GetEnumerator() | ForEach-Object { "$($_.Key): $($_.Value)" }) -join "  |  "
Log ("Ergebnis: " + $zeile)
$boardLine = ((Get-Date).ToString("dd.MM. HH:mm") + " Waechter - " + $zeile)
Post-Board $boardLine

$hatReparatur = $script:Repairs.Count -gt 0
if ($Report) {
  # Chef will, dass ich mich mit meinem Modellnamen melde.
  $model = ChatWatcher-Model; if (-not $model) { $model = $ExpectedModel }
  $billingBlock = Test-Path $BillingFile
  $modelSchoen = if ($billingBlock) { "einem Ersatzmodell (Opus 4.8 pausiert)" } elseif ($model -like "claude-opus-4-8*") { "Claude Opus 4.8" } else { $model }
  $tunnelOk = ($script:Status["Tunnel"] -like "ok*") -or ($script:Status["Tunnel"] -like "repariert*")
  $pageOk   = ($script:Status["Chat-Seite"] -like "*ok*") -or ($script:Status["Chat-Seite"] -like "repariert*")

  $emo = if ($hatReparatur) { "Guten Morgen! Ich habe heute Nacht etwas nachjustiert:" } else { "Guten Morgen! Alle Systeme stehen:" }
  $body = "Hier ist $modelSchoen, dein Korrektur-Agent.`n`n" + $emo + "`n`n" + (($script:Status.GetEnumerator() | ForEach-Object { "- $($_.Key): $($_.Value)" }) -join "`n")
  if ($tunnelOk -and $pageOk) {
    $body += "`n`nTunnel (mas.pickadoc-tunnel.com) und diese Chat-Seite sind von aussen erreichbar und funktionsfaehig."
  } else {
    $body += "`n`nACHTUNG: Tunnel oder Chat-Seite brauchen Aufmerksamkeit (siehe Liste oben)."
  }
  if ($billingBlock) {
    $body += "`n`nWICHTIG: Opus 4.8 ist wegen erschoepftem Guthaben pausiert - ich laufe gerade auf einem Ersatzmodell. Sobald du aufgeladen hast, schreib 'opus wieder an', dann stelle ich auf Opus 4.8 zurueck."
  }
  if ($hatReparatur) { $body += "`n`nReparaturen:`n" + (($script:Repairs | ForEach-Object { "- $_" }) -join "`n") }
  $body += "`n`n(Automatischer 8-Uhr-Bericht. Antworte einfach, wenn du eine Korrektur brauchst.)"
  Post-Chat $body
} elseif ($hatReparatur) {
  Post-Chat ("Achtung - ich musste gerade etwas reparieren:`n" + (($script:Repairs | ForEach-Object { "- $_" }) -join "`n") + "`n`nStand: " + $zeile)
}
Log "Waechter-Lauf fertig."
