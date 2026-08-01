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
  [string]$Model = "claude-opus-4-8-thinking-high",
  # Harte Obergrenze pro Agent-Lauf. Bricht ein Lauf hier ab, wird die Nachricht
  # NICHT als Waise verloren, sondern als "neu" zurueckgereiht (siehe Schleife).
  [int]$AgentTimeoutMin = 25
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
# Opus-Guthaben-Sperre: liegt diese Datei vor, ist Opus mangels Guthaben aus und
# der Draht laeuft auf dem Ersatzmodell. Der Urlaubs-Waechter liest sie ebenfalls.
$BillingFile = Join-Path $RunDir "opus_billing_block.txt"
$OpusModel = $Model                      # Wunschmodell (Opus 4.8)
$FallbackModel = "auto"                   # Ersatz: Konto-Standard, haelt den Draht offen
$script:ActiveModel = $OpusModel
if (Test-Path $BillingFile) { $script:ActiveModel = $FallbackModel }
if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Path $RunDir -Force | Out-Null }

function Beat() { try { Set-Content -Path $HeartbeatFile -Value ((Get-Date).ToString("o")) -Encoding ASCII -NoNewline } catch {} }

# Live-Puls fuers Handy (30.07.2026): Waehrend eines - evtl. minutenlangen -
# Agent-Laufs aktualisiert der Waechter das Board alle ~15 s mit einer laufenden
# Uhr. So bewegt sich board.updatedAt weiter und die Handy-Seite kann "arbeitet
# noch (Puls vor X s)" von "haengt/abgestuerzt" (kein Puls) unterscheiden. Der
# Chef sah bei langen Laeufen sonst nur Stille und wusste nicht, ob ich lebe.
$script:PulseText = ""
$script:PulseStart = Get-Date
function Post-Pulse() {
  if (-not $script:PulseText) { return }
  $now = Get-Date
  $secs = [int](($now - $script:PulseStart).TotalSeconds)
  $t = [string]$script:PulseText
  $short = if ($t.Length -gt 160) { $t.Substring(0, 160) + "..." } else { $t }
  $body = ("Arbeite seit {0} (laeuft {1}s, Puls {2}) an:`n{3}" -f `
    $script:PulseStart.ToString("HH:mm"), $secs, $now.ToString("HH:mm:ss"), $short)
  try { Api-Post "/remote/board" @{ text = $body } | Out-Null } catch {}
}

# Fehlertext deutet auf erschoepftes Guthaben / Kontingent / Zahlung hin?
function Test-BillingError([string]$t) {
  if (-not $t) { return $false }
  return ($t -match "(?i)(insufficient|not enough|no .{0,12}credit|out of .{0,12}credit|credits?\b|quota|usage limit|spend limit|payment required|payment method|402|upgrade your plan|billing|balance|guthaben|kontingent|zahlungs|limit reached|exceeded your|hard limit)")
}
# Nutzer will nach dem Aufladen zurueck auf Opus 4.8?
function Test-OpusRestoreCmd([string]$t) {
  if (-not $t) { return $false }
  return (($t -match "(?i)opus") -and ($t -match "(?i)(wieder|zur(ü|ue)ck|aktivier|umstell|einstell|\ban\b|4\.?8|aufgeladen|aufgeld|geladen)"))
}
# VORUEBERGEHENDER (transienter) Ausfall des Cursor-/Modell-Dienstes? Solche
# Fehler ("[unavailable]", overloaded, Netz/Timeout, 5xx, "keine Ausgabe vom
# Agenten") sind KEIN inhaltliches Ergebnis - der Chef darf sie nicht als
# "Antwort" sehen. Sie werden kurz erneut versucht (siehe Schleife unten).
# Guthaben-Fehler sind hier bewusst NICHT enthalten (die haben ihren eigenen Weg).
function Test-TransientError([string]$t) {
  if (-not $t) { return $false }
  return ($t -match "(?i)(unavailable|overloaded|temporar|try again|rate.?limit|too many requests|timeout|timed out|econnreset|econnrefused|socket hang|network error|network\b|502|503|504|bad gateway|gateway timeout|internal (server )?error|service (error|unavailable)|no response|connection (reset|closed|refused)|keine ausgabe vom agenten)")
}

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

function Run-Agent([string]$prompt, [string]$sessionId, [string]$modelOverride = "__ACTIVE__") {
  $mdl = if ($modelOverride -eq "__ACTIVE__") { $script:ActiveModel } else { $modelOverride }
  $outFile = Join-Path $RunDir ("agent-out-{0}.json" -f ([guid]::NewGuid().ToString("N").Substring(0,8)))
  $errFile = "$outFile.err"
  $inFile  = "$outFile.in"
  $agentArgs = @("-p", "--output-format", "json", "--force", "--trust", "--workspace", $Workspace)
  if ($mdl -and $mdl -ne "auto") { $agentArgs += @("--model", $mdl) }
  if ($sessionId) { $agentArgs += @("--resume", $sessionId) }
  try {
    # Prompt als UTF-8-Datei OHNE BOM (Umlaute kommen sauber an) und ueber stdin
    # rein (kein Windows-Quoting-Problem). Der Agent laeuft als UEBERWACHTER
    # Prozess: waehrend des - evtl. minutenlangen - Laufs schlaegt der Heartbeat
    # WEITER, damit der Urlaubs-Waechter den beschaeftigten Draht nicht faelschlich
    # als "haengt" killt (Vorfall 30.07.2026). Stdout/Stderr in Dateien, damit
    # grosse Antworten sicher ankommen UND Fehlertexte (Guthaben) sichtbar sind.
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($inFile, $prompt, $enc)
    $p = Start-Process -FilePath $CursorAgent -ArgumentList $agentArgs `
      -RedirectStandardInput $inFile -RedirectStandardOutput $outFile -RedirectStandardError $errFile `
      -NoNewWindow -PassThru
    $deadline = (Get-Date).AddMinutes($AgentTimeoutMin)
    $nextPulse = (Get-Date).AddSeconds(15)
    while (-not $p.HasExited) {
      Beat
      Start-Sleep -Seconds 4
      if ((Get-Date) -gt $nextPulse) { Post-Pulse; $nextPulse = (Get-Date).AddSeconds(15) }
      if ((Get-Date) -gt $deadline) {
        # Ganzen Prozessbaum killen (cmd -> node), sonst laeuft der Agent verwaist weiter.
        try { Start-Process taskkill -ArgumentList "/PID",$p.Id,"/T","/F" -NoNewWindow -Wait -ErrorAction SilentlyContinue } catch {}
        Start-Sleep -Seconds 1
        Remove-Item $inFile, $outFile, $errFile -ErrorAction SilentlyContinue
        return @{ ok = $false; timeout = $true; session = $sessionId; billing = $false;
          text = ("Diese Aufgabe hat laenger als $AgentTimeoutMin Minuten gebraucht und wurde abgebrochen, damit der Draht frei bleibt. Bitte in kleineren Schritten anfragen oder erneut senden - ich nehme sie dann neu auf.") }
      }
    }
    Beat
    # UTF-8 lesen: der cursor-agent schreibt UTF-8; ohne -Encoding liest
    # Windows-PowerShell 5.1 die Datei als ANSI und macht aus Umlauten
    # Zeichensalat ("Fuer" -> "FÃ¼r") auf dem Handy des Chefs (30.07.2026).
    $raw = (Get-Content $outFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
    $err = (Get-Content $errFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
    Remove-Item $inFile, $outFile, $errFile -ErrorAction SilentlyContinue
    $combined = "$raw`n$err"
    $billing = Test-BillingError $combined
    if (-not $raw) { return @{ ok = $false; text = ("(keine Ausgabe vom Agenten) " + $err); session = $sessionId; billing = $billing } }
    # letzte nicht-leere Zeile ist das JSON-Ergebnis
    $jsonLine = ($raw -split "`n" | Where-Object { $_.Trim() -like "{*}" } | Select-Object -Last 1)
    if (-not $jsonLine) { return @{ ok = $false; text = ("Unerwartete Agent-Ausgabe: " + $raw.Substring(0, [Math]::Min(400, $raw.Length))); session = $sessionId; billing = $billing } }
    $obj = $jsonLine | ConvertFrom-Json
    $text = if ($obj.result) { [string]$obj.result } else { "(leere Antwort)" }
    $sid = if ($obj.session_id) { [string]$obj.session_id } else { $sessionId }
    $isErr = ($obj.is_error -eq $true)
    if ($isErr -and -not $billing) { $billing = Test-BillingError $text }
    return @{ ok = (-not $isErr); text = $text; session = $sid; billing = $billing }
  } catch {
    Remove-Item $inFile, $outFile, $errFile -ErrorAction SilentlyContinue
    $emsg = $_.Exception.Message
    return @{ ok = $false; text = ("Agent-Fehler: " + $emsg); session = $sessionId; billing = (Test-BillingError $emsg) }
  }
}

# Verwaiste Nachrichten wieder aufnehmen: bricht ein frueherer Lauf mittendrin ab
# (Wächter gekillt/neu gestartet), bleibt die Nachricht auf "in_arbeit" haengen und
# wuerde NIE beantwortet. Beim Start (genau ein Waechter laeuft) sind alle
# "in_arbeit" sicher verwaist -> zurueck auf "neu", damit sie neu bearbeitet werden.
function Requeue-Orphans() {
  try {
    $st = Api-Get "/remote/state?limit=200"
    $orphans = @($st.messages | Where-Object { $_.role -eq "user" -and $_.status -eq "in_arbeit" })
    if ($orphans.Count -gt 0) {
      $ids = @($orphans | ForEach-Object { [string]$_.id })
      Api-Post "/remote/ack" @{ ids = $ids; status = "neu" } | Out-Null
      Log ("Verwaiste Nachrichten wieder eingereiht (in_arbeit -> neu): " + ($ids -join ", "))
    }
  } catch { Log "Waisen-Pruefung fehlgeschlagen: $($_.Exception.Message)" }
}

Beat
# Aktives Modell hinterlegen, damit der Urlaubs-Waechter es gegenpruefen kann.
try { Set-Content -Path $ModelFile -Value $script:ActiveModel -Encoding ASCII -NoNewline } catch {}
Log "Fernsteuerungs-Waechter gestartet. MAS=$MasBase Workspace=$Workspace Modell=$script:ActiveModel (Wunsch=$OpusModel) Intervall=${IntervalSeconds}s Timeout=${AgentTimeoutMin}min"
Requeue-Orphans
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

        # --- Steuerbefehl: nach dem Aufladen zurueck auf Opus 4.8 -----------
        if ((Test-Path $BillingFile) -and (Test-OpusRestoreCmd $text)) {
          Log "Opus-Wiederherstellung angefragt - teste Opus 4.8"
          $test = Run-Agent "Antworte mit genau dem Wort: OPUSBEREIT" "" $OpusModel
          if ($test.ok -and -not $test.billing) {
            $script:ActiveModel = $OpusModel
            try { Set-Content -Path $ModelFile -Value $OpusModel -Encoding ASCII -NoNewline } catch {}
            Remove-Item $BillingFile -ErrorAction SilentlyContinue
            $rep = "Erledigt - ich spreche wieder mit Claude Opus 4.8. Danke fuers Aufladen."
          } elseif ($test.billing) {
            $rep = "Ich kann Opus 4.8 noch nicht aktivieren - das Guthaben reicht offenbar noch nicht. Bitte (weiter) aufladen und danach erneut 'opus wieder an' schreiben. Ich bleibe solange als Ersatzmodell erreichbar."
          } else {
            $rep = "Der Opus-Test meldete: " + [string]$test.text + " - ich bleibe vorerst auf dem Ersatzmodell."
          }
          try { Api-Post "/remote/message" @{ role = "agent"; text = $rep } | Out-Null } catch {}
          try { Api-Post "/remote/ack" @{ ids = @($id); status = "fertig" } | Out-Null } catch {}
          Log "Opus-Restore: $rep"
          continue
        }

        # Live-Puls fuers Handy aktivieren (laeuft in Run-Agents Warteschleife).
        $script:PulseStart = Get-Date
        $script:PulseText = $text
        $sid = Get-Session
        $prompt = Build-Prompt $text
        $res = Run-Agent $prompt $sid
        if ($res.session) { Set-Session $res.session }

        # --- Voruebergehender Dienst-Ausfall? -> nachfassen statt Fehler zeigen -
        # Der Cursor-/Modell-Dienst meldete nachts zeitweise "[unavailable]" o.ae.
        # Bisher ging dieser Rohfehler direkt ans Handy -> der Chef bekam "keine
        # Antwort". Jetzt: bis zu 2x mit kurzem Abstand erneut versuchen; haelt der
        # Ausfall an UND laeuft der Draht noch auf Opus, EINMAL aufs Ersatzmodell
        # ausweichen, damit ueberhaupt eine echte Antwort ankommt.
        $tRetry = 0
        while ((-not $res.ok) -and (-not $res.billing) -and (Test-TransientError $res.text) -and ($tRetry -lt 2)) {
          $tRetry++
          $snip = [string]$res.text; if ($snip.Length -gt 70) { $snip = $snip.Substring(0,70) }
          Log ("Transienter Dienst-Fehler ('" + $snip + "') - Versuch " + ($tRetry + 1) + " nach kurzer Pause")
          Start-Sleep -Seconds (6 * $tRetry)
          Beat
          $res = Run-Agent $prompt (Get-Session)
          if ($res.session) { Set-Session $res.session }
        }
        if ((-not $res.ok) -and (-not $res.billing) -and (Test-TransientError $res.text) -and ($script:ActiveModel -ne $FallbackModel)) {
          Log "Transienter Fehler bleibt - einmaliger Versuch mit Ersatzmodell, um den Draht offen zu halten"
          Beat
          $res = Run-Agent $prompt (Get-Session) $FallbackModel
          if ($res.session) { Set-Session $res.session }
        }

        # --- Opus-Guthaben erschoepft? -> Fallback, Draht offen halten ------
        if ($res.billing -and $script:ActiveModel -eq $OpusModel) {
          Log "Opus-Guthaben erschoepft - schalte auf Ersatzmodell und antworte erneut"
          $script:ActiveModel = $FallbackModel
          try { Set-Content -Path $ModelFile -Value $FallbackModel -Encoding ASCII -NoNewline } catch {}
          try { Set-Content -Path $BillingFile -Value ("Opus-Guthaben erschoepft seit " + (Get-Date).ToString("o")) -Encoding ASCII -NoNewline } catch {}
          $hinweis = "WICHTIG: Dein Guthaben fuer Opus 4.8 ist gerade erschoepft. Damit du mich weiter erreichst, antworte ich vorlaeufig mit einem Ersatzmodell (Konto-Standard). Sobald du aufgeladen hast, schreib einfach 'opus wieder an' - dann stelle ich sofort auf Opus 4.8 zurueck."
          try { Api-Post "/remote/message" @{ role = "agent"; text = $hinweis } | Out-Null } catch {}
          $res = Run-Agent $prompt $res.session $FallbackModel
          if ($res.session) { Set-Session $res.session }
        }

        $script:PulseText = ""   # Puls aus - Lauf fertig
        $reply = [string]$res.text
        if (-not $reply.Trim()) { $reply = "(Der Agent hat keine Textantwort geliefert.)" }
        if ($res.billing -and $script:ActiveModel -eq $FallbackModel) {
          $reply = "Auch das Ersatzmodell ist gerade nicht verfuegbar - das Konto scheint komplett ohne Guthaben zu sein. Bitte lade auf; danach 'opus wieder an' schreiben. (Urspruengliche Meldung: " + $reply + ")"
        }
        try { Api-Post "/remote/message" @{ role = "agent"; text = $reply } | Out-Null } catch { Log "FEHLER beim Zurueckschreiben: $($_.Exception.Message)" }
        try { Api-Post "/remote/ack" @{ ids = @($id); status = "fertig" } | Out-Null } catch {}
        try { Api-Post "/remote/board" @{ text = ("Zuletzt beantwortet " + (Get-Date).ToString("HH:mm") + " (Modell: $script:ActiveModel).`n" + $reply.Substring(0, [Math]::Min(280, $reply.Length))) } | Out-Null } catch {}
        Log "Beantwortet $id (ok=$($res.ok), billing=$($res.billing), modell=$script:ActiveModel, session=$($res.session))"
      }
    }
  } catch {
    Log "Schleifen-Fehler: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $IntervalSeconds
}
