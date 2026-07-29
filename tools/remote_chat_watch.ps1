<#
  Fernsteuerungs-Waechter (Urlaub 29.07.2026)
  --------------------------------------------
  Holt neue Handy-Nachrichten aus /remote/pending (Firestore mas_remote_chat),
  startet pro Nachricht eine cursor-agent-Session (Prompt via stdin, damit
  mehrzeilige Korrekturtexte kein Quoting-Problem sind), setzt das Gespraech
  ueber die gespeicherte session_id fort (ein durchgehender Faden) und schreibt
  die Antwort per /remote/message (role=agent) zurueck. Ein Kurz-Board haelt den
  letzten Stand fest.

  Der Agent laeuft im Force-Modus (schreiben + Shell) im Workspace F:\, damit er
  echte Korrekturen an MAS/Clara/Frontend/Lena durchfuehren kann. Er ist an die
  AGENTS.md-Regeln jedes Repos gebunden (Release-Gate vor Neustart, deutsche
  Commits, nichts Ungetestetes an den Live-Worker) - das steht im Prompt und in
  den Repo-Regeln, die cursor-agent automatisch laedt.

  Kill-Switch: dieses Fenster schliessen / Strg+C. Dann nimmt niemand mehr
  Nachrichten an (die Handy-Seite zeigt sie weiter als "neu").

  Start:  powershell -ExecutionPolicy Bypass -File F:\MAS-2\tools\remote_chat_watch.ps1
#>

param(
  [string]$MasBase = "http://127.0.0.1:4000",
  [string]$Workspace = "F:\",
  [int]$IntervalSeconds = 6,
  # Chef spricht IMMER mit Opus 4.8 (Wunsch 29.07.2026). Fest verdrahtet; der
  # Urlaubs-Waechter (watchdog.ps1) prueft das und startet neu, falls abweichend.
  [string]$Model = "claude-opus-4-8-thinking-high"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$CursorAgent = "C:\Users\Anmeldung2\AppData\Local\cursor-agent\cursor-agent.cmd"
$RunDir = "F:\MAS-2\.run"
$SessionFile = Join-Path $RunDir "remote_chat_session.txt"
$LogFile = Join-Path $RunDir "remote_chat_watch.log"
$HeartbeatFile = Join-Path $RunDir "remote_chat_watch.hb"
$ModelFile = Join-Path $RunDir "remote_chat_watch.model"
if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Path $RunDir -Force | Out-Null }

function Beat() { try { Set-Content -Path $HeartbeatFile -Value ((Get-Date).ToString("o")) -Encoding ASCII -NoNewline } catch {} }

# Token aus backend\.env lesen.
$envPath = "F:\MAS-2\backend\.env"
$Token = ""
if (Test-Path $envPath) {
  $line = Get-Content $envPath | Where-Object { $_ -match "^REMOTE_CHAT_TOKEN=" } | Select-Object -First 1
  if ($line) { $Token = ($line -split "=", 2)[1].Trim() }
}
if (-not $Token) { Write-Host "ABBRUCH: REMOTE_CHAT_TOKEN fehlt in $envPath"; exit 1 }
if (-not (Test-Path $CursorAgent)) { Write-Host "ABBRUCH: cursor-agent nicht gefunden ($CursorAgent)"; exit 1 }

function Log([string]$msg) {
  $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $line = "$stamp  $msg"
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Api-Get([string]$path) {
  return Invoke-RestMethod -Uri ("{0}{1}{2}token={3}" -f $MasBase, $path, ($(if ($path.Contains("?")) { "&" } else { "?" })), [uri]::EscapeDataString($Token)) -TimeoutSec 20
}
function Api-Post([string]$path, [hashtable]$body) {
  $body["token"] = $Token
  return Invoke-RestMethod -Uri ($MasBase + $path) -Method Post -ContentType "application/json; charset=utf-8" -Body ($body | ConvertTo-Json -Depth 6) -TimeoutSec 20
}

function Get-Session() {
  if (Test-Path $SessionFile) { return (Get-Content $SessionFile -Raw).Trim() }
  return ""
}
function Set-Session([string]$id) {
  if ($id) { Set-Content -Path $SessionFile -Value $id -Encoding ASCII -NoNewline }
}

function Build-Prompt([string]$userText) {
  return @"
[SYSTEM] Du bist der Cursor-Coding-Agent fuer Dr. Petsas' System (Pickadoc-Frontend F:\pickadoc-live-base, Backend F:\MAS-2, Sprach-Stack F:\Clara-Voice, Doku F:\Lena-Voice). Dr. Petsas schreibt dir gerade VOM HANDY AUS DEM URLAUB. Er sieht nur kurze Chat-Antworten, keinen Code.

Verbindliche Regeln:
- Halte dich strikt an die AGENTS.md jedes betroffenen Repos: Release-Gate vor jedem Neustart/Commit, deutsche Commit-Messages (was + warum), NICHTS Ungetestetes an den Live-Worker, Clara darf keinen Schaden nehmen.
- Ist die Korrektur klar und sicher: fuehre sie VOLLSTAENDIG aus (Code aendern, testen, committen). Nenne in der Antwort, was du getan, getestet und committet hast.
- Ist die Anweisung unklar, ODER waere sie riskant (Deploy nach Firebase, Loeschen/Migrieren von Daten, Neustart des Live-Workers ohne gruenes Gate): fuehre sie NICHT blind aus - frage in einem Satz zurueck bzw. beschreibe, was du vorschlaegst, und warte auf sein OK.
- Erfinde nichts. Wenn du etwas nicht sicher weisst, sag das.

Antworte AUSSCHLIESSLICH auf Deutsch, kurz und laientauglich (2 bis 6 Saetze), ohne Code-Bloecke und ohne Tool-Namen.

[NACHRICHT VON DR. PETSAS]
$userText
"@
}

function Run-Agent([string]$prompt, [string]$sessionId) {
  $outFile = Join-Path $RunDir ("agent-out-{0}.json" -f ([guid]::NewGuid().ToString("N").Substring(0,8)))
  $agentArgs = @("-p", "--output-format", "json", "--force", "--trust", "--workspace", $Workspace)
  if ($Model) { $agentArgs += @("--model", $Model) }
  if ($sessionId) { $agentArgs += @("--resume", $sessionId) }
  try {
    # Prompt ueber stdin (kein Windows-Quoting-Problem). Stdout -> Datei, damit
    # grosse/mehrzeilige Antworten sicher als eine JSON-Zeile ankommen.
    $prompt | & $CursorAgent @agentArgs 1> $outFile 2>$null
    $raw = (Get-Content $outFile -Raw -ErrorAction SilentlyContinue)
    Remove-Item $outFile -ErrorAction SilentlyContinue
    if (-not $raw) { return @{ ok = $false; text = "(keine Ausgabe vom Agenten)"; session = $sessionId } }
    # letzte nicht-leere Zeile ist das JSON-Ergebnis
    $jsonLine = ($raw -split "`n" | Where-Object { $_.Trim() -like "{*}" } | Select-Object -Last 1)
    if (-not $jsonLine) { return @{ ok = $false; text = ("Unerwartete Agent-Ausgabe: " + $raw.Substring(0, [Math]::Min(400, $raw.Length))); session = $sessionId } }
    $obj = $jsonLine | ConvertFrom-Json
    $text = if ($obj.result) { [string]$obj.result } else { "(leere Antwort)" }
    $sid = if ($obj.session_id) { [string]$obj.session_id } else { $sessionId }
    $isErr = ($obj.is_error -eq $true)
    return @{ ok = (-not $isErr); text = $text; session = $sid }
  } catch {
    Remove-Item $outFile -ErrorAction SilentlyContinue
    return @{ ok = $false; text = ("Agent-Fehler: " + $_.Exception.Message); session = $sessionId }
  }
}

Beat
# Aktives Modell hinterlegen, damit der Urlaubs-Waechter es gegenpruefen kann.
try { Set-Content -Path $ModelFile -Value $Model -Encoding ASCII -NoNewline } catch {}
Log "Fernsteuerungs-Waechter gestartet. MAS=$MasBase Workspace=$Workspace Modell=$Model Intervall=${IntervalSeconds}s"
try { Api-Post "/remote/board" @{ text = ("Waechter online seit " + (Get-Date).ToString("HH:mm") + " - bereit fuer Korrekturen.") } | Out-Null } catch {}

while ($true) {
  Beat
  try {
    $pending = Api-Get "/remote/pending"
    $msgs = @($pending.messages)
    if ($msgs.Count -gt 0) {
      foreach ($m in $msgs) {
        $id = [string]$m.id
        $text = [string]$m.text
        if (-not $id -or -not $text) { continue }
        Log "Neue Nachricht $id : $($text.Substring(0, [Math]::Min(80, $text.Length)))"
        try { Api-Post "/remote/ack" @{ ids = @($id); status = "in_arbeit" } | Out-Null } catch {}
        try { Api-Post "/remote/board" @{ text = ("In Arbeit seit " + (Get-Date).ToString("HH:mm") + ":`n" + $text.Substring(0, [Math]::Min(200, $text.Length))) } | Out-Null } catch {}

        $sid = Get-Session
        $prompt = Build-Prompt $text
        $res = Run-Agent $prompt $sid
        if ($res.session) { Set-Session $res.session }

        $reply = [string]$res.text
        if (-not $reply.Trim()) { $reply = "(Der Agent hat keine Textantwort geliefert.)" }
        try { Api-Post "/remote/message" @{ role = "agent"; text = $reply } | Out-Null } catch { Log "FEHLER beim Zurueckschreiben: $($_.Exception.Message)" }
        try { Api-Post "/remote/ack" @{ ids = @($id); status = "fertig" } | Out-Null } catch {}
        try { Api-Post "/remote/board" @{ text = ("Zuletzt beantwortet " + (Get-Date).ToString("HH:mm") + ".`n" + $reply.Substring(0, [Math]::Min(300, $reply.Length))) } | Out-Null } catch {}
        Log "Beantwortet $id (ok=$($res.ok), session=$($res.session))"
      }
    }
  } catch {
    Log "Schleifen-Fehler: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $IntervalSeconds
}
