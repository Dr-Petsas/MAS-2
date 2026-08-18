<#
  Spiegel PC-Chat <-> Fernsteuerung (Chef 18.08.2026)
  ---------------------------------------------------
  Liest den Cursor-Verlauf (JSONL) und schreibt neue Zeilen auf den Draht,
  damit das Handy dasselbe sieht wie dieser Rechner.

  Nutzer-Zeilen bekommen das Kuerzel [PC], damit der Waechter sie NICHT
  noch einmal als Auftrag startet (sonst zwei Groks am selben Satz).
  Agent-Zeilen gehen als Grok raus.

  Umgekehrt kann dieses Skript keine Blasen in Cursor erzeugen — das geht
  die IDE nicht. Dafuer gilt: GET /remote/state am Anfang jedes Turns,
  und auf dem PC die Seite /m/fernsteuerung.html offen lassen.

  Start:  powershell -ExecutionPolicy Bypass -File F:\MAS-2\tools\remote_chat_spiegel.ps1
#>
param(
  [string]$MasBase = "http://127.0.0.1:4000",
  [string]$Transcript = "",
  [int]$IntervalSeconds = 4
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RunDir = "F:\MAS-2\.run"
$PinFile = Join-Path $RunDir "spiegel-chat.txt"
$OffsetFile = Join-Path $RunDir "spiegel-offset.txt"
$LogFile = Join-Path $RunDir "spiegel.log"
$HbFile = Join-Path $RunDir "spiegel.hb"
if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Path $RunDir -Force | Out-Null }

function Log([string]$m) {
  $line = ((Get-Date).ToString("yyyy-MM-dd HH:mm:ss") + "  " + $m)
  try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
  Write-Host $line
}

function Beat() { try { Set-Content -Path $HbFile -Value ((Get-Date).ToString("o")) -Encoding ASCII -NoNewline } catch {} }

function Post-Msg([string]$role, [string]$text, [string]$speaker = "") {
  $t = ([string]$text).Trim()
  if (-not $t) { return }
  if ($t.Length -gt 8000) { $t = $t.Substring(0, 8000) }
  $body = @{ role = $role; text = $t }
  if ($speaker) { $body.speaker = $speaker }
  try {
    Invoke-RestMethod -Uri ($MasBase + "/remote/message") -Method Post `
      -ContentType "application/json; charset=utf-8" `
      -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 15 | Out-Null
    return $true
  } catch {
    Log ("Senden fehlgeschlagen: " + $_.Exception.Message)
    return $false
  }
}

function Find-Transcript() {
  if ($Transcript -and (Test-Path $Transcript)) { return $Transcript }
  if (Test-Path $PinFile) {
    $p = (Get-Content $PinFile -Raw -Encoding UTF8).Trim()
    if ($p -and (Test-Path $p)) { return $p }
  }
  $root = "C:\Users\Anmeldung2\.cursor\projects\f-pickadoc-live-base\agent-transcripts"
  $neu = Get-ChildItem $root -Recurse -Filter "*.jsonl" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($neu) { return $neu.FullName }
  return ""
}

function Text-AusZeile([string]$raw) {
  if (-not $raw) { return $null }
  try { $obj = $raw | ConvertFrom-Json } catch { return $null }
  $rolle = [string]$obj.role
  if ($rolle -ne "user" -and $rolle -ne "assistant") { return $null }
  $teile = @($obj.message.content)
  $txt = ""
  foreach ($c in $teile) {
    if ($c.type -eq "text" -and $c.text) { $txt += [string]$c.text + "`n" }
  }
  $txt = $txt.Trim()
  if (-not $txt) { return $null }
  if ($rolle -eq "user") {
    if ($txt -match "(?s)<user_query>\s*(.*?)\s*</user_query>") { $txt = $Matches[1].Trim() }
    else { return $null }
    if ($txt -match "(?s)<timestamp>") { return $null }
    if ($txt.Length -lt 2) { return $null }
    return @{ role = "user"; text = ("[PC]`n" + $txt) }
  }
  # Nur die gesprochene Antwort, keine Tool-Listen.
  if ($txt.Length -lt 8) { return $null }
  return @{ role = "agent"; text = ("[grok]`n" + $txt); speaker = "grok" }
}

$datei = Find-Transcript
if (-not $datei) { Log "ABBRUCH: kein Verlauf gefunden"; exit 1 }
Set-Content -Path $PinFile -Value $datei -Encoding UTF8
# Ab JETZT spiegeln, nicht die ganze alte Sitzung noch einmal auskippen.
$start = 0
try { $start = @(Get-Content $datei -Encoding UTF8).Count } catch {}
Set-Content -Path $OffsetFile -Value ([string]$start) -Encoding ASCII -NoNewline
Log ("Spiegel an. Datei=$datei  ab Zeile $start  MAS=$MasBase")

while ($true) {
  Beat
  try {
    $datei = Find-Transcript
    if (-not $datei) { Start-Sleep -Seconds $IntervalSeconds; continue }
    $zeilen = @(Get-Content $datei -Encoding UTF8)
    $off = 0
    if (Test-Path $OffsetFile) { try { $off = [int](Get-Content $OffsetFile -Raw) } catch { $off = 0 } }
    if ($off -gt $zeilen.Count) { $off = $zeilen.Count }
    for ($i = $off; $i -lt $zeilen.Count; $i++) {
      $ein = Text-AusZeile $zeilen[$i]
      if (-not $ein) { continue }
      $ok = Post-Msg $ein.role $ein.text $ein.speaker
      if ($ok) { Log ("gespiegelt $($ein.role) $($ein.text.Length) Zeichen") }
    }
    Set-Content -Path $OffsetFile -Value ([string]$zeilen.Count) -Encoding ASCII -NoNewline
  } catch { Log ("Schleife: " + $_.Exception.Message) }
  Start-Sleep -Seconds $IntervalSeconds
}
