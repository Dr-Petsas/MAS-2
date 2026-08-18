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
  # Chef spricht mit Opus (Wunsch 29.07.2026). Der Urlaubs-Waechter (watchdog.ps1)
  # prueft das Modell und startet neu, falls abweichend.
  # 03.08.2026 (Dr. Petsas): VORUEBERGEHEND Opus 5 zum Durchtesten. Morgen zurueck
  # auf "claude-opus-4-8-thinking-high" (auch $ExpectedModel in watchdog.ps1).
  [string]$Model = "claude-opus-5-thinking-high",
  # DREIERTEAM (Chef 18.08.2026): "wenn ich auf der Fernsteuerung antworte, soll
  # das Dreierteam weiterarbeiten - Grok, Opus und Fable wie bisher." Vorher lief
  # jede Handy-Nachricht durch GENAU EINEN Opus-Lauf; Grok und Fable kamen nur in
  # den Sitzungen am Rechner dazu. Jetzt fuehrt Opus auch am Draht das Team:
  # er arbeitet, Grok liest gegen, Fable macht den Feinschliff.
  [string]$GrokModel = "cursor-grok-4.6-high-fast",
  [string]$FableModel = "claude-fable-5-thinking-max",
  # Harte Obergrenze pro Agent-Lauf. Bricht ein Lauf hier ab, wird die Nachricht
  # NICHT als Waise verloren, sondern als "neu" zurueckgereiht (siehe Schleife).
  [int]$AgentTimeoutMin = 25,
  # Kollegen-Laeufe sind Gegenlesen, nicht Bauen - kuerzere Leine, damit der
  # Draht nach der Antwort von Opus nicht noch eine halbe Stunde blockiert ist.
  [int]$MateTimeoutMin = 12,
  # Wie alt darf eine haengengebliebene ("verwaiste") Nachricht hoechstens sein,
  # um beim Start noch einmal ausgefuehrt zu werden? Aeltere werden nur
  # abgeschlossen - siehe Requeue-Orphans (Vorfall 03.08.2026: MAS-Stopp).
  [int]$OrphanMaxAgeMin = 30
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
# Anmelde-Sperre: liegt diese Datei vor, fehlt dem kopflosen Agenten der
# Zugangsschluessel. Der Selbsttest (tools\fernsteuerung_pruefen.ps1) liest sie.
$AuthFile = Join-Path $RunDir "agent_auth_block.txt"
$AuthHintMin = 30                        # so selten wird der Hinweis wiederholt
$AuthRuheMin = 5                         # so lange gar nichts annehmen (kein Flackern)
# Team-Schalter: Liegt diese Datei vor, antwortet Opus allein ("nur opus" im
# Chat). Default ist also TEAM AN - ohne Datei arbeitet das Dreierteam.
$TeamFile = Join-Path $RunDir "remote_chat_team_aus.txt"
# Wer heisst wie und mit welchem Modell laeuft er? Eine Stelle, damit ein
# Modellwechsel nicht an drei Orten nachgezogen werden muss.
$Team = [ordered]@{
  grok  = @{ name = "Grok";  rolle = "Pruefer";     modell = $GrokModel;  verb = "prueft" }
  fable = @{ name = "Fable"; rolle = "Feinschliff"; modell = $FableModel; verb = "schleift" }
}
$OpusModel = $Model                      # Wunschmodell (aktuell Opus 5)
# Sprechender Name fuers Handy: der Chef soll lesen, WELCHES Opus gerade laeuft.
# Vorher stand in allen Hinweistexten fest "Opus 4.8" - nach dem Umschalten auf
# Opus 5 war das schlicht falsch und stiftete Verwirrung (03.08.2026).
$OpusName = if ($OpusModel -match "opus-?5") { "Opus 5" } elseif ($OpusModel -match "opus-?4[-.]?8") { "Opus 4.8" } else { $OpusModel }
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
# Wer schlaegt gerade den Puls? Seit dem Dreierteam (18.08.2026) soll im Board
# stehen, WER arbeitet - "Grok prueft seit 09:12" sagt mehr als "Arbeite seit".
$script:PulseWho = "Opus arbeitet"
function Post-Pulse() {
  if (-not $script:PulseText) { return }
  $now = Get-Date
  $secs = [int](($now - $script:PulseStart).TotalSeconds)
  $t = [string]$script:PulseText
  $short = if ($t.Length -gt 160) { $t.Substring(0, 160) + "..." } else { $t }
  $body = ("{0} seit {1} (laeuft {2}s, Puls {3})`nAuftrag: {4}" -f `
    $script:PulseWho, $script:PulseStart.ToString("HH:mm"), $secs, $now.ToString("HH:mm:ss"), $short)
  try { Api-Post "/remote/board" @{ text = $body } | Out-Null } catch {}
}

# Fehlertext deutet auf erschoepftes Guthaben / Kontingent / Zahlung hin?
function Test-BillingError([string]$t) {
  if (-not $t) { return $false }
  return ($t -match "(?i)(insufficient|not enough|no .{0,12}credit|out of .{0,12}credit|credits?\b|quota|usage limit|spend limit|payment required|payment method|402|upgrade your plan|billing|balance|guthaben|kontingent|zahlungs|limit reached|exceeded your|hard limit)")
}
# Nutzer will zurueck auf das Wunsch-Opus (siehe $OpusName)?
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
  if (Test-AuthError $t) { return $false }
  return ($t -match "(?i)(unavailable|overloaded|temporar|try again|rate.?limit|too many requests|timeout|timed out|econnreset|econnrefused|socket hang|network error|network\b|502|503|504|bad gateway|gateway timeout|internal (server )?error|service (error|unavailable)|no response|connection (reset|closed|refused)|keine ausgabe vom agenten)")
}

# FEHLENDE ANMELDUNG (Vorfall 16.-17.08.2026, "Fernsteuerung ist platt")
# ---------------------------------------------------------------------
# Der Chef tippte "Moin"/"Halo" und bekam dreimal
# "(keine Ausgabe vom Agenten) Error: Authentication required ...". Ursache: Der
# cursor-agent ist INTERAKTIV angemeldet ("cursor-agent status" -> Login
# successful), der KOPFLOSE Lauf (-p) verlangt aber einen API-Schluessel. Ohne
# den startet gar kein Agent - egal welches Modell.
#
# Vorher lief dieser Fehler in die Transienten-Schleife: dreimal warten, dann
# Ersatzmodell, dann den Rohtext als "Antwort" ans Handy und die Nachricht auf
# "fertig". Also 40 s Warten, eine englische Fehlermeldung UND die Nachricht war
# verloren. Jetzt: sofort erkennen, Nachricht LIEGEN LASSEN (bleibt "neu", wird
# nach dem Einsetzen des Schluessels von selbst bearbeitet) und hoechstens
# einmal je $AuthHintMin Minuten einen deutschen Klartext-Hinweis schicken.
function Test-AuthError([string]$t) {
  if (-not $t) { return $false }
  return ($t -match "(?i)(authentication required|agent login|CURSOR_API_KEY|not (logged|signed) in|unauthorized|401)")
}

# --- DREIERTEAM (Chef 18.08.2026) -----------------------------------------
# Der Chef will am Handy dasselbe Team wie am Rechner: Opus fuehrt, Grok liest
# gegen, Fable macht den Feinschliff. Drei kleine, testbare Bausteine:
#   Test-TeamCmd     - schaltet der Chef das Team per Chat ein oder aus?
#   Parse-TeamOrders - welche Kollegen will Opus dazuholen? (Steuerzeilen)
#   Parse-Verdict    - welches Urteil faellt ein Kollege?
# Alle drei arbeiten nur auf Text, damit sie ohne Modell pruefbar sind
# (tools\test_remote_chat_guards.ps1).

# "nur opus" / "team aus" -> allein; "team an" / "zu dritt" -> Team. Sonst "".
#
# STRENG, und zwar aus Erfahrung (18.08.2026, erster Selbsttest): Die erste
# Fassung pruefte nur auf Schluesselwoerter irgendwo im Text. Prompt verschluckte
# sie einen langen Arbeitsauftrag, in dem das Wort "Dreierteam" bloss VORKAM -
# der Waechter antwortete "Team ist zurueck" und die Aufgabe war weg. Ein
# Steuerbefehl ist deshalb nur, was auch wirklich wie einer aussieht:
#   - kurz (bis 40 Zeichen) - ein Arbeitsauftrag ist immer laenger,
#   - keine Frage (Fragezeichen -> der Chef will eine Antwort, keinen Schalter),
#   - und die Wendung steht am ANFANG (nicht irgendwo mitten im Text).
# Wichtig: "opus wieder an" (Guthaben-Befehl) darf hier NICHT anschlagen.
function Test-TeamCmd([string]$t) {
  $s = ([string]$t).Trim()
  if (-not $s) { return "" }
  if ($s.Length -gt 40) { return "" }
  if ($s.Contains("?")) { return "" }
  if ($s -match "(?i)^(bitte\s+)?(nur|allein|solo)\s+opus\b" -or
      $s -match "(?i)^team\s+(aus|weg|pausiert|ruht|stopp)\b" -or
      $s -match "(?i)\bohne\s+(das\s+)?team\b" -or
      $s -match "(?i)\bohne\s+grok\s+und\s+fable\b") { return "aus" }
  if ($s -match "(?i)^team\s+(an|wieder an|zurueck|zur(\u00fc|ue)ck|ein)\b" -or
      $s -match "(?i)^(dreierteam|alle\s+drei)\b" -or
      $s -match "(?i)\bzu\s+dritt\b" -or
      $s -match "(?i)^mit\s+grok\s+und\s+fable\b") { return "an" }
  return ""
}

# Opus haengt an seine Antwort Steuerzeilen "[TEAM] grok: <Auftrag>". Sie sind
# NICHT fuer den Chef - sie werden herausgeschnitten und steuern den naechsten
# Lauf. Rueckgabe: gereinigter Text + Liste der Auftraege (je Kollege einmal).
function Parse-TeamOrders([string]$antwort) {
  $rest = @()
  $orders = @()
  $gesehen = @{}
  foreach ($zeile in (([string]$antwort) -split "`r?`n")) {
    $m = [regex]::Match($zeile, '^\s*\[TEAM\]\s*(grok|fable)\s*[:\-\u2013]\s*(.+?)\s*$', 'IgnoreCase')
    if ($m.Success) {
      $wer = $m.Groups[1].Value.ToLower()
      if (-not $gesehen.ContainsKey($wer)) {
        $gesehen[$wer] = $true
        $orders += @{ who = $wer; task = $m.Groups[2].Value.Trim() }
      }
      continue
    }
    # Auch unbrauchbare TEAM-Zeilen ("[TEAM] niemand") wandern in den Papierkorb,
    # damit der Chef nie Maschinen-Zeilen liest.
    if ($zeile -match '^\s*\[TEAM\]') { continue }
    $rest += $zeile
  }
  return @{ text = (($rest -join "`n").Trim()); orders = $orders }
}

# Letzte Zeile eines Kollegen: "[URTEIL] gruen|gelb|rot". gruen = alles gut,
# gelb/rot = Opus muss noch einmal ran.
function Parse-Verdict([string]$antwort) {
  $rest = @()
  $urteil = ""
  foreach ($zeile in (([string]$antwort) -split "`r?`n")) {
    $m = [regex]::Match($zeile, '^\s*\[URTEIL\]\s*(gruen|gr(\u00fc|ue)n|green|gelb|rot)\s*$', 'IgnoreCase')
    if ($m.Success) {
      $w = $m.Groups[1].Value.ToLower()
      $urteil = if ($w -match "^(gruen|gr(\u00fc|ue)n|green)$") { "gruen" } else { $w }
      continue
    }
    $rest += $zeile
  }
  return @{ text = (($rest -join "`n").Trim()); urteil = $urteil }
}

# Token aus backend\.env lesen.
$envPath = "F:\MAS-2\backend\.env"
$Token = ""
if (Test-Path $envPath) {
  $line = Get-Content $envPath | Where-Object { $_ -match "^REMOTE_CHAT_TOKEN=" } | Select-Object -First 1
  if ($line) { $Token = ($line -split "=", 2)[1].Trim() }
}
if (-not $Token) { Write-Host "ABBRUCH: REMOTE_CHAT_TOKEN fehlt in $envPath"; exit 1 }

# Zugangsschluessel fuer den kopflosen Agenten (siehe Test-AuthError). Reihenfolge:
# schon gesetzte Umgebung > backend\.env. So genuegt EIN Eintrag in der .env
# (CURSOR_API_KEY=... oder CURSOR_AGENT_API_KEY=...) und der Draht laeuft wieder -
# ohne Codeaenderung, ohne Neustart-Ritual.
if (-not $env:CURSOR_API_KEY) {
  foreach ($schluesselName in @("CURSOR_API_KEY", "CURSOR_AGENT_API_KEY")) {
    $zeile = Get-Content $envPath | Where-Object { $_ -match "^$schluesselName=" } | Select-Object -First 1
    if ($zeile) {
      $wert = ($zeile -split "=", 2)[1].Trim().Trim('"')
      if ($wert) { $env:CURSOR_API_KEY = $wert; break }
    }
  }
}
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

# Eine Nachricht in den Handy-Chat, mit Absender (opus/grok/fable/team). Nur
# diese vier laesst das Backend durch; alles andere erscheint namenlos.
#
# ZWEI WEGE, absichtlich: Das Feld "speaker" ist der saubere Weg, greift aber
# erst nach einem MAS-Neustart. Der Chef haengt am Draht und MAS ist seine
# einzige Leitung - ein Neustart nur fuer eine Anzeige ist das Risiko nicht wert
# (18.08.2026). Deshalb steht der Absender ZUSAETZLICH als erste Zeile im Text:
# die Handy-Seiten sind statisch (kein Neustart) und machen daraus das farbige
# Namensschild. Sieht eine alte, zwischengespeicherte Seite die Zeile doch,
# liest der Chef schlicht "[Grok]" - haesslich, aber verstaendlich.
# Zusammengeklebte Saetze trennen (18.08.2026, erster Team-Lauf am Handy):
# Manche Modelle melden sich WAEHREND der Arbeit ("Ich lese jetzt ...") und die
# Cursor-Ausgabe reiht diese Zwischenmeldungen ohne Leerzeichen an die
# Schlussfassung - am Handy stand dann "...Absenderliste kennt.Ich bin Grok".
# Nur dort wird getrennt, wo ein Satzende DIREKT an einem grossgeschriebenen
# Wort klebt UND davor mindestens zwei Kleinbuchstaben stehen (oder eine
# schliessende Klammer). Damit bleiben Abkuerzungen unberuehrt: bei "z.B.Das"
# steht vor jedem Punkt nur ein einzelner Buchstabe.
function Glaetten([string]$text) {
  $t = [string]$text
  if (-not $t) { return "" }
  return [regex]::Replace($t, "(?<=(?:[a-z\u00e4\u00f6\u00fc\u00df]{2}|\))[.!?:])(?=[A-Z\u00c4\u00d6\u00dc])", "`n`n")
}

function Say([string]$wer, [string]$text) {
  $schild = switch ($wer) { "opus" { "[Opus]" } "grok" { "[Grok]" } "fable" { "[Fable]" } "team" { "[Team]" } default { "" } }
  $sauber = Glaetten $text
  $rumpf = if ($schild) { $schild + "`n" + [string]$sauber } else { [string]$sauber }
  try { Api-Post "/remote/message" @{ role = "agent"; text = $rumpf; speaker = $wer } | Out-Null }
  catch { Log "FEHLER beim Zurueckschreiben: $($_.Exception.Message)" }
}

# Jeder Kopf hat seinen EIGENEN Gespraechsfaden. Opus behaelt die alte Datei
# (sein Faden laeuft seit Juli durch); Grok und Fable bekommen eigene. Sonst
# wuerde ein Kollegen-Lauf mitten in Opus' Faden landen und dessen Verlauf mit
# fremdem Modell fortsetzen.
function Session-Datei([string]$wer) {
  if (-not $wer -or $wer -eq "opus") { return $SessionFile }
  return (Join-Path $RunDir ("remote_chat_session_{0}.txt" -f $wer))
}
function Get-Session([string]$wer = "opus") {
  $f = Session-Datei $wer
  if (Test-Path $f) { return (Get-Content $f -Raw).Trim() }
  return ""
}
function Set-Session([string]$id, [string]$wer = "opus") {
  if ($id) { Set-Content -Path (Session-Datei $wer) -Value $id -Encoding ASCII -NoNewline }
}

function Build-Prompt([string]$userText, [bool]$teamAn = $true) {
  # Der Team-Teil steht NUR im Prompt, wenn das Team an ist. Sonst wuerde Opus
  # Kollegen anfordern, die niemand ruft - und der Chef bekaeme Steuerzeilen
  # ohne Wirkung.
  $teamTeil = ""
  if ($teamAn) {
    $teamTeil = @"

DEIN TEAM (du fuehrst es):
- GROK, Modell $GrokModel - der Pruefer. Zweites Augenpaar: findet Fehler, Luecken, Regelverstoesse, prueft selbst nach.
- FABLE, Modell $FableModel - der Feinschliff. Sprache, Texte, Oberflaeche, Laientauglichkeit.

Du hast zwei Wege, sie einzubeziehen:
1. WAEHREND deines Laufs: Starte Unteragenten mit genau diesen Modellen und gib ihnen Teilaufgaben (Recherche, Parallelarbeit, Gegenlesen). Nutze das bei allem, was Umfang hat.
2. NACH deiner Antwort: Haenge fuer jeden Kollegen, der noch daraufschauen soll, GENAU EINE Zeile ganz am Ende an - Format exakt so:
[TEAM] grok: <konkreter Auftrag in einem Satz>
[TEAM] fable: <konkreter Auftrag in einem Satz>
Diese Zeilen liest Dr. Petsas NICHT, sie werden herausgeschnitten und steuern den naechsten Lauf. Der Kollege sieht deine Antwort und seinen Auftrag, arbeitet im selben Arbeitsverzeichnis und schreibt Dr. Petsas selbst eine kurze Nachricht. Meldet ein Kollege einen Mangel, bekommst du danach noch einen Zug, um nachzulegen.

Wann wen:
- Du hast Code geaendert, gebaut oder etwas repariert: IMMER "[TEAM] grok" (nachpruefen, ob es wirklich laeuft und den Regeln entspricht).
- Es geht um Texte oder Oberflaechen, die Praxen oder Patienten lesen: "[TEAM] fable".
- Reine Auskunft, kurze Frage, Smalltalk ("wie steht's?"): KEINE Team-Zeile. Das Team wird nicht geweckt, wenn es nichts zu pruefen gibt.
"@
  }
  return @"
[SYSTEM] Du bist OPUS, der leitende Coding-Agent fuer Dr. Petsas' System (Pickadoc-Frontend F:\pickadoc-live-base, Backend F:\MAS-2, Sprach-Stack F:\Clara-Voice, Doku F:\Lena-Voice). Dr. Petsas schreibt dir gerade VOM HANDY. Er sieht nur kurze Chat-Antworten, keinen Code.
$teamTeil
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

# Prompt fuer einen Kollegen (Grok oder Fable). Er sieht den Wunsch des Chefs,
# was Opus geantwortet hat und seinen eigenen Auftrag - und schreibt dem Chef
# selbst. Das Urteil in der letzten Zeile entscheidet, ob Opus nachlegen muss.
function Build-MatePrompt([string]$wer, [string]$auftrag, [string]$chefText, [string]$leadText) {
  $k = $Team[$wer]
  $eigenart = if ($wer -eq "grok") {
    @"
Du bist der PRUEFER. Dein Wert liegt darin, NICHT zu glauben, was Opus schreibt:
- Sieh selbst nach (Dateien lesen, Tests/Checks laufen lassen, Log pruefen).
- Kleine, eindeutig richtige Fehler behebst du selbst und sagst, was du geaendert hast.
- Grosse oder riskante Aenderungen fuehrst du NICHT eigenmaechtig aus - benenne sie klar.
"@
  } else {
    @"
Du bist der FEINSCHLIFF. Du achtest darauf, was ein Mensch am Ende liest und bedient:
- Deutsche Texte in Oberflaechen, SMS, Mails: verstaendlich, richtig, ohne Fachjargon.
- Kleine Text- und Darstellungsfehler behebst du selbst und sagst, was du geaendert hast.
- Am Bauwerk selbst (Logik, Datenwege) aenderst du nichts eigenmaechtig - benenne es.
"@
  }
  return @"
[SYSTEM] Du bist $($k.name), $($k.rolle) im Dreierteam von Dr. Petsas (Pickadoc-Frontend F:\pickadoc-live-base, Backend F:\MAS-2, Sprach-Stack F:\Clara-Voice, Doku F:\Lena-Voice). Opus fuehrt und hat gerade gearbeitet. Dr. Petsas liest mit - AM HANDY, ohne Code.

$eigenart
Verbindliche Regeln: die AGENTS.md jedes betroffenen Repos gelten auch fuer dich (Release-Gate vor Neustart/Commit, deutsche Commit-Messages, nichts Ungetestetes an den Live-Worker, Clara nimmt keinen Schaden). Erfinde nichts; was du nicht geprueft hast, sagst du nicht.

[WAS DR. PETSAS WOLLTE]
$chefText

[WAS OPUS GEANTWORTET HAT]
$leadText

[DEIN AUFTRAG VON OPUS]
$auftrag

Melde dich NICHT zwischendurch ("Ich lese jetzt ...") - der Chef bekommt nur EINEN Text von dir, und zwar am Ende. Arbeite still, schreib dann die Antwort.

Antworte AUSSCHLIESSLICH auf Deutsch, 2 bis 4 Saetze, ohne Code-Bloecke und ohne Tool-Namen. Sag als Erstes, was du wirklich geprueft hast. Danach als LETZTE Zeile genau eine dieser drei:
[URTEIL] gruen
[URTEIL] gelb
[URTEIL] rot
gruen = geprueft, in Ordnung. gelb = kleinere Sachen, von mir behoben oder benannt. rot = so nicht in Ordnung, Opus muss nachlegen.
"@
}

# Abschluss-Zug fuer Opus, wenn ein Kollege gelb oder rot gemeldet hat. Der Chef
# soll am Ende EINE verbindliche Aussage haben, nicht drei Meinungen.
function Build-ClosePrompt([string]$chefText, [string]$berichte) {
  return @"
[SYSTEM] Du bist wieder OPUS und fuehrst das Team. Deine Kollegen haben gegengelesen und einen Mangel gemeldet. Dr. Petsas wartet am Handy auf EINE klare Aussage.

[WAS DR. PETSAS WOLLTE]
$chefText

[WAS DIE KOLLEGEN MELDEN]
$berichte

Jetzt: Pruefe, was zu Recht bemaengelt wurde, und behebe es vollstaendig (aendern, testen, committen - AGENTS.md gilt). Was du fuer unbegruendet haeltst, sagst du mit Begruendung. Was riskant waere (Deploy, Datenloeschung, Live-Worker ohne gruenes Gate), machst du NICHT, sondern schlaegst es vor.

Antworte AUSSCHLIESSLICH auf Deutsch, 2 bis 5 Saetze, ohne Code-Bloecke und ohne Tool-Namen: was jetzt gilt und was noch offen ist. KEINE Team-Zeilen mehr.
"@
}

function Run-Agent([string]$prompt, [string]$sessionId, [string]$modelOverride = "__ACTIVE__", [int]$timeoutMin = 0) {
  if ($timeoutMin -le 0) { $timeoutMin = $AgentTimeoutMin }
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
    $deadline = (Get-Date).AddMinutes($timeoutMin)
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
          text = ("Diese Aufgabe hat laenger als $timeoutMin Minuten gebraucht und wurde abgebrochen, damit der Draht frei bleibt. Bitte in kleineren Schritten anfragen oder erneut senden - ich nehme sie dann neu auf.") }
      }
    }
    Beat
    # UTF-8 lesen: der cursor-agent schreibt UTF-8; ohne -Encoding liest
    # Windows-PowerShell 5.1 die Datei als ANSI und macht aus Umlauten
    # Zeichensalat ("Fuer" -> "FÃ¼r") auf dem Handy des Chefs (30.07.2026).
    $raw = (Get-Content $outFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
    $err = (Get-Content $errFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
    Remove-Item $inFile, $outFile, $errFile -ErrorAction SilentlyContinue
    # FEHLALARM-SCHUTZ (Dr. Petsas 03.08.2026): Der Konto-Test darf NUR den
    # Fehlerkanal pruefen - NIEMALS die normale Antwort des Agenten. Vorher lief
    # der Test ueber stdout, also ueber den Antworttext selbst: Sobald in einer
    # Antwort ueber ein leeres Konto geschrieben wurde, hielt der Waechter das fuer
    # eine echte Fehlermeldung, sperrte Opus und fiel aufs Ersatzmodell zurueck
    # (Vorfall 22:38/22:41 Uhr, hat die frisch gestellte Opus-5-Leitung gekippt).
    # Eine echte Dienst-Meldung steht auf stderr oder in einer Fehler-Antwort
    # (is_error) - beides wird weiterhin geprueft (siehe unten).
    $billing = Test-BillingError $err
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
    # ALTLAST-SCHUTZ (Dr. Petsas 03.08.2026): Nur FRISCHE Waisen neu einreihen.
    # Ein alter, laengst erledigter Befehl darf nicht Stunden spaeter erneut
    # ausgefuehrt werden - heute Abend wurde so "Beende den MAS-Server" aus einem
    # abgebrochenen Lauf wiedervorgelegt und hat den MAS-Server (den Chat-Draht
    # des Chefs) tatsaechlich gestoppt. Aeltere Waisen werden nur abgeschlossen.
    $now = [double](([DateTimeOffset](Get-Date)).ToUnixTimeMilliseconds())
    $fresh = @($orphans | Where-Object { ($now - [double]($_.createdAt)) -le ($OrphanMaxAgeMin * 60000) })
    $stale = @($orphans | Where-Object { ($now - [double]($_.createdAt)) -gt ($OrphanMaxAgeMin * 60000) })
    if ($fresh.Count -gt 0) {
      $ids = @($fresh | ForEach-Object { [string]$_.id })
      Api-Post "/remote/ack" @{ ids = $ids; status = "neu" } | Out-Null
      Log ("Verwaiste Nachrichten wieder eingereiht (in_arbeit -> neu): " + ($ids -join ", "))
    }
    if ($stale.Count -gt 0) {
      $sids = @($stale | ForEach-Object { [string]$_.id })
      Api-Post "/remote/ack" @{ ids = $sids; status = "fertig" } | Out-Null
      Log ("Alte Waisen (aelter als ${OrphanMaxAgeMin} min) NICHT erneut ausgefuehrt, nur abgeschlossen: " + ($sids -join ", "))
    }
  } catch { Log "Waisen-Pruefung fehlgeschlagen: $($_.Exception.Message)" }
}

Beat
# Aktives Modell hinterlegen, damit der Urlaubs-Waechter es gegenpruefen kann.
try { Set-Content -Path $ModelFile -Value $script:ActiveModel -Encoding ASCII -NoNewline } catch {}
$TeamAn = -not (Test-Path $TeamFile)
Log "Fernsteuerungs-Waechter gestartet. MAS=$MasBase Workspace=$Workspace Modell=$script:ActiveModel (Wunsch=$OpusModel) Intervall=${IntervalSeconds}s Timeout=${AgentTimeoutMin}min Team=$(if ($TeamAn) { "an (Opus fuehrt, $GrokModel prueft, $FableModel schleift)" } else { "aus (nur Opus)" })"
Requeue-Orphans
# Beim Start ehrlich melden, WAS der Fall ist: "bereit fuer Korrekturen" ist eine
# Luege, solange dem kopflosen Agenten der Zugangsschluessel fehlt (17.08.2026).
if (Test-Path $AuthFile) {
  try { Api-Post "/remote/board" @{ text = ("Waechter online seit " + (Get-Date).ToString("HH:mm") + ", ABER: dem Agenten fehlt CURSOR_API_KEY in backend\.env. Nachrichten bleiben liegen und werden nach dem Eintragen automatisch bearbeitet.") } | Out-Null } catch {}
} else {
  $besatzung = if ($TeamAn) { "Team an Bord: Opus fuehrt, Grok prueft, Fable schleift." } else { "Nur Opus (Team ruht - 'team an' holt es zurueck)." }
  try { Api-Post "/remote/board" @{ text = ("Waechter online seit " + (Get-Date).ToString("HH:mm") + " - bereit fuer Korrekturen.`n" + $besatzung) } | Out-Null } catch {}
}

while ($true) {
  Beat
  try {
    # Anmelde-Sperre: solange sie frisch ist, gar nicht erst Nachrichten annehmen.
    # Sonst wuerde der Draht im 25-Sekunden-Takt gegen dieselbe Wand laufen, das
    # Board zwischen "In Arbeit" und "Anmeldung fehlt" flackern und das Log
    # zulaufen. Die Nachrichten bleiben auf "neu" liegen und werden nach dem
    # Einsetzen des Schluessels von selbst der Reihe nach bearbeitet.
    if (Test-Path $AuthFile) {
      $sperrAlterMin = 999
      try { $sperrAlterMin = (New-TimeSpan -Start ([datetime]::Parse(((Get-Content $AuthFile -Raw) -split "  ")[0].Trim())) -End (Get-Date)).TotalMinutes } catch {}
      if ($sperrAlterMin -lt $AuthRuheMin) {
        Start-Sleep -Seconds 30
        continue
      }
      Log ("Anmelde-Sperre ist " + [int]$sperrAlterMin + " min alt - ich probiere es erneut")
      Remove-Item $AuthFile -ErrorAction SilentlyContinue
    }
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

        # --- Steuerbefehl: Team an oder aus --------------------------------
        # Der Chef soll das Team ohne Codeaenderung bremsen koennen ("nur opus")
        # und genauso zurueckholen ("team an"). Steht VOR dem Opus-Befehl, weil
        # "nur opus" sonst wie eine Modell-Wiederherstellung aussehen koennte.
        $teamCmd = Test-TeamCmd $text
        if ($teamCmd -eq "aus") {
          try { Set-Content -Path $TeamFile -Value ((Get-Date).ToString("o")) -Encoding ASCII -NoNewline } catch {}
          $TeamAn = $false
          Say "team" "Verstanden - ab jetzt antworte ich allein (Opus). Grok und Fable bleiben draussen, bis du 'team an' schreibst."
          try { Api-Post "/remote/ack" @{ ids = @($id); status = "fertig" } | Out-Null } catch {}
          Log "Team AUS (Wunsch des Chefs)"
          continue
        }
        if ($teamCmd -eq "an") {
          Remove-Item $TeamFile -ErrorAction SilentlyContinue
          $TeamAn = $true
          Say "team" "Das Team ist zurueck: Ich (Opus) fuehre, Grok liest gegen, Fable macht den Feinschliff. Du siehst an jeder Nachricht, wer schreibt."
          try { Api-Post "/remote/ack" @{ ids = @($id); status = "fertig" } | Out-Null } catch {}
          Log "Team AN (Wunsch des Chefs)"
          continue
        }

        # --- Steuerbefehl: zurueck auf das Wunsch-Opus ----------------------
        if ((Test-Path $BillingFile) -and (Test-OpusRestoreCmd $text)) {
          Log "Opus-Wiederherstellung angefragt - teste $OpusName ($OpusModel)"
          $test = Run-Agent "Antworte mit genau dem Wort: OPUSBEREIT" "" $OpusModel
          if ($test.ok -and -not $test.billing) {
            $script:ActiveModel = $OpusModel
            try { Set-Content -Path $ModelFile -Value $OpusModel -Encoding ASCII -NoNewline } catch {}
            Remove-Item $BillingFile -ErrorAction SilentlyContinue
            $rep = "Erledigt - ich spreche wieder mit Claude $OpusName."
          } elseif ($test.billing) {
            $rep = "Ich kann $OpusName noch nicht aktivieren - der Dienst meldet weiterhin ein Konto-Problem. Bitte pruefen und danach erneut 'opus wieder an' schreiben. Ich bleibe solange als Ersatzmodell erreichbar."
          } else {
            $rep = "Der Opus-Test meldete: " + [string]$test.text + " - ich bleibe vorerst auf dem Ersatzmodell."
          }
          Say "team" $rep
          try { Api-Post "/remote/ack" @{ ids = @($id); status = "fertig" } | Out-Null } catch {}
          Log "Opus-Restore: $rep"
          continue
        }

        # Live-Puls fuers Handy aktivieren (laeuft in Run-Agents Warteschleife).
        $script:PulseStart = Get-Date
        $script:PulseText = $text
        $script:PulseWho = "Opus arbeitet"
        $sid = Get-Session
        $prompt = Build-Prompt $text $TeamAn
        $res = Run-Agent $prompt $sid
        if ($res.session) { Set-Session $res.session }

        # --- Voruebergehender Dienst-Ausfall? -> nachfassen statt Fehler zeigen -
        # Der Cursor-/Modell-Dienst meldete nachts zeitweise "[unavailable]" o.ae.
        # Bisher ging dieser Rohfehler direkt ans Handy -> der Chef bekam "keine
        # Antwort". Jetzt: bis zu 2x mit kurzem Abstand erneut versuchen; haelt der
        # Ausfall an UND laeuft der Draht noch auf Opus, EINMAL aufs Ersatzmodell
        # ausweichen, damit ueberhaupt eine echte Antwort ankommt.
        # --- Anmeldung fehlt? -> Nachricht LIEGEN LASSEN, Klartext schicken ---
        # Nichts darf verloren gehen: die Nachricht geht zurueck auf "neu" und
        # wird automatisch bearbeitet, sobald der Schluessel da ist.
        if ((-not $res.ok) -and (Test-AuthError $res.text)) {
          $script:PulseText = ""
          try { Set-Content -Path $AuthFile -Value ((Get-Date).ToString("o") + "  " + [string]$res.text) -Encoding UTF8 } catch {}
          try { Api-Post "/remote/ack" @{ ids = @($id); status = "neu" } | Out-Null } catch {}
          $letzterHinweis = [datetime]::MinValue
          $hinweisMarke = Join-Path $RunDir "agent_auth_hint.txt"
          if (Test-Path $hinweisMarke) {
            try { $letzterHinweis = [datetime]::Parse((Get-Content $hinweisMarke -Raw).Trim()) } catch {}
          }
          if ((New-TimeSpan -Start $letzterHinweis -End (Get-Date)).TotalMinutes -ge $AuthHintMin) {
            $hinweis = @"
Ich habe deine Nachricht, kann sie aber gerade nicht bearbeiten: dem Coding-Agenten fehlt sein Zugangsschluessel. Angemeldet ist er (interaktiv), fuer den Hintergrund-Betrieb braucht er zusaetzlich einen API-Key.

So ist es in zwei Minuten behoben: auf cursor.com anmelden, unter Dashboard > Integrations > API Keys einen Key erzeugen und ihn in F:\MAS-2\backend\.env als CURSOR_API_KEY=... eintragen. Danach den Waechter neu starten (oder mir hier einfach nochmal schreiben).

Deine Nachricht bleibt liegen und wird automatisch bearbeitet, sobald der Schluessel da ist - es geht nichts verloren.
"@
            Say "team" $hinweis
            try { Set-Content -Path $hinweisMarke -Value ((Get-Date).ToString("o")) -Encoding ASCII -NoNewline } catch {}
          }
          try { Api-Post "/remote/board" @{ text = ("ANMELDUNG FEHLT (seit " + (Get-Date).ToString("HH:mm") + "): Der Agent braucht CURSOR_API_KEY in backend\.env. Nachrichten bleiben liegen und werden danach automatisch bearbeitet.") } | Out-Null } catch {}
          Log "ANMELDUNG FEHLT - Nachricht $id bleibt liegen (naechster Versuch in $AuthRuheMin min)"
          break   # restliche Nachrichten dieser Runde nicht anfassen
        }
        if (Test-Path $AuthFile) { Remove-Item $AuthFile -ErrorAction SilentlyContinue }

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
          $hinweis = "WICHTIG: Der Dienst meldet gerade ein Konto-Problem fuer $OpusName. Damit du mich weiter erreichst, antworte ich vorlaeufig mit einem Ersatzmodell (Konto-Standard). Sobald das geklaert ist, schreib einfach 'opus wieder an' - dann stelle ich sofort auf $OpusName zurueck."
          Say "team" $hinweis
          $res = Run-Agent $prompt $res.session $FallbackModel
          if ($res.session) { Set-Session $res.session }
        }

        # --- Antwort von Opus: Steuerzeilen raus, dann ans Handy -------------
        # Die "[TEAM] ..."-Zeilen sind Regie-Anweisungen an die Kollegen und
        # duerfen NIE im Chat landen (der Chef liest sonst Maschinentext).
        $reply = [string]$res.text
        if (-not $reply.Trim()) { $reply = "(Der Agent hat keine Textantwort geliefert.)" }
        if ($res.billing -and $script:ActiveModel -eq $FallbackModel) {
          $reply = "Auch das Ersatzmodell ist gerade nicht verfuegbar - das Konto scheint komplett ohne Guthaben zu sein. Bitte lade auf; danach 'opus wieder an' schreiben. (Urspruengliche Meldung: " + $reply + ")"
        }
        $zerlegt = Parse-TeamOrders $reply
        $reply = if ($zerlegt.text) { $zerlegt.text } else { $reply }
        Say "opus" $reply
        Log "Beantwortet $id (ok=$($res.ok), billing=$($res.billing), modell=$script:ActiveModel, session=$($res.session))"

        # --- Kollegen dazu: Grok liest gegen, Fable schleift ----------------
        # Nacheinander, nie gleichzeitig: die Kollegen arbeiten im SELBEN
        # Arbeitsverzeichnis - zwei Agenten parallel wuerden sich in denselben
        # Dateien begegnen. Der Chef sieht jede Meldung einzeln mit Absender.
        # Gespart wird an drei Stellen: Team aus, Opus hat gar keinen Kollegen
        # angefordert, oder der Lauf ist gescheitert (dann gibt es nichts zu
        # pruefen). Bei einem Konto-Problem bleibt das Team ebenfalls draussen -
        # weitere Laeufe wuerden nur dieselbe Wand treffen.
        $auftraege = @($zerlegt.orders)
        $teamLaeuft = $TeamAn -and ($auftraege.Count -gt 0) -and $res.ok -and (-not $res.billing) `
          -and (-not $res.timeout) -and ($script:ActiveModel -eq $OpusModel)
        $berichte = @()
        $nachbessern = $false
        if ($teamLaeuft) {
          foreach ($auftrag in $auftraege) {
            $wer = [string]$auftrag.who
            $k = $Team[$wer]
            if (-not $k) { continue }
            $script:PulseStart = Get-Date
            $script:PulseText = [string]$auftrag.task
            $script:PulseWho = ("{0} {1}" -f $k.name, $k.verb)
            try { Api-Post "/remote/board" @{ text = ("{0} {1} seit {2}`nAuftrag: {3}" -f $k.name, $k.verb, (Get-Date).ToString("HH:mm"), $script:PulseText) } | Out-Null } catch {}
            Log ("Kollege {0} ({1}) uebernimmt: {2}" -f $k.name, $k.modell, $script:PulseText)
            $mp = Build-MatePrompt $wer ([string]$auftrag.task) $text $reply
            $mres = Run-Agent $mp (Get-Session $wer) $k.modell $MateTimeoutMin
            if ($mres.session) { Set-Session $mres.session $wer }
            if (-not $mres.ok) {
              # Ehrlich bleiben: der Chef muss wissen, dass das Sicherheitsnetz
              # diesmal NICHT gespannt war. Opus' Antwort steht ja schon.
              Log ("Kollege {0} scheiterte: {1}" -f $k.name, [string]$mres.text)
              Say "team" ("{0} konnte diesmal nicht gegenlesen (der Dienst meldete ein Problem). Die Antwort von Opus oben bleibt unveraendert stehen - schreib 'nochmal pruefen', wenn du das Gegenlesen nachholen willst." -f $k.name)
              continue
            }
            $u = Parse-Verdict ([string]$mres.text)
            $mtext = if ($u.text) { $u.text } else { [string]$mres.text }
            Say $wer $mtext
            $urteil = if ($u.urteil) { $u.urteil } else { "gruen" }
            $berichte += ("{0} ({1}): {2}" -f $k.name, $urteil, $mtext)
            if ($urteil -ne "gruen") { $nachbessern = $true }
            Log ("Kollege {0} fertig, Urteil={1}" -f $k.name, $urteil)
          }
        }

        # --- Abschluss: EINE verbindliche Aussage --------------------------
        # Nur wenn wirklich ein Mangel gemeldet wurde. Sonst waere das ein
        # vierter Lauf, der nichts hinzufuegt.
        if ($nachbessern) {
          $script:PulseStart = Get-Date
          $script:PulseText = "Nachbesserung nach dem Gegenlesen"
          $script:PulseWho = "Opus legt nach"
          Log "Kollegen melden Mangel - Opus legt nach"
          $cres = Run-Agent (Build-ClosePrompt $text ($berichte -join "`n")) (Get-Session) $script:ActiveModel
          if ($cres.session) { Set-Session $cres.session }
          $ctext = (Parse-TeamOrders ([string]$cres.text)).text
          if ($cres.ok -and $ctext) { Say "opus" $ctext }
          else { Log ("Nachbesserung ohne brauchbare Antwort: " + [string]$cres.text) }
        }

        $script:PulseText = ""   # Puls aus - alle fertig
        $script:PulseWho = "Opus arbeitet"
        try { Api-Post "/remote/ack" @{ ids = @($id); status = "fertig" } | Out-Null } catch {}
        $mitgelesen = if ($berichte.Count -gt 0) { " Gegengelesen: " + (($berichte | ForEach-Object { ($_ -split ":")[0] }) -join ", ") + "." } else { "" }
        try { Api-Post "/remote/board" @{ text = ("Zuletzt beantwortet " + (Get-Date).ToString("HH:mm") + " (Modell: $script:ActiveModel)." + $mitgelesen + "`n" + $reply.Substring(0, [Math]::Min(280, $reply.Length))) } | Out-Null } catch {}
      }
    }
  } catch {
    Log "Schleifen-Fehler: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $IntervalSeconds
}
