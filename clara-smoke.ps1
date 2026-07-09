# ============================================================================
# CLARA-SMOKE - Schneller Selbsttest des gesamten Clara-Stacks (~5-10 s).
#
# Zweck (15.06.2026): Nach JEDEM Neustart sofort GRUEN/ROT pro Komponente
# sehen, statt von Hand zu suchen, was kaputt ist. Prueft genau die Schichten,
# die heute Probleme gemacht haben - inklusive der Tool-Calling-Faehigkeit
# (der Bug aus Commit 1011c18, der den Voll-Gate von 95% auf 6% gedrueckt hat).
#
# WICHTIG: Der Tool-Calling-Check laeuft REIN auf LLM-Ebene (Ollama) und fuehrt
# KEINE echten Tools aus -> KEINE Pushes/SMS an die Praxis. Sicher gegen Live.
#
# Aufruf:   powershell -File F:\MAS-2\clara-smoke.ps1
# Exitcode: 0 = alles gruen, 1 = mindestens ein Check rot.
# ============================================================================
$ErrorActionPreference = 'Continue'

$results = @()
function Add-Check([string]$Name, [bool]$Ok, [string]$Detail, [string]$FixHint = "") {
    $script:results += [pscustomobject]@{ Name = $Name; Ok = $Ok; Detail = $Detail; Fix = $FixHint }
}

# --- .env lesen (Modell + LLM-URL) -----------------------------------------
$envPath = 'F:\Clara-Voice\.env'
$llmModel = 'qwen3:4b-instruct'
$llmBase  = 'http://127.0.0.1:11434/v1'
if (Test-Path $envPath) {
    foreach ($line in Get-Content $envPath) {
        if ($line -match '^\s*LIVEAVATAR_LLM_MODEL\s*=\s*(.+?)\s*$')    { $llmModel = $Matches[1].Trim() }
        if ($line -match '^\s*LIVEAVATAR_LLM_BASE_URL\s*=\s*(.+?)\s*$') { $llmBase  = $Matches[1].Trim() }
    }
}

# --- 1) MAS-2 Backend (Port 4000) ------------------------------------------
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4000/health' -TimeoutSec 6 -UseBasicParsing -ErrorAction Stop
    Add-Check 'MAS-2 Backend (4000)' ($r.StatusCode -eq 200) ("HTTP " + $r.StatusCode)
} catch {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4000/' -TimeoutSec 6 -UseBasicParsing -ErrorAction Stop
        Add-Check 'MAS-2 Backend (4000)' $true ("HTTP " + $r.StatusCode + " (/, kein /health)")
    } catch {
        Add-Check 'MAS-2 Backend (4000)' $false 'nicht erreichbar' 'start-mas-stack.ps1 erneut laufen lassen; backend_*.err.log pruefen'
    }
}

# --- 2) Cloudflare-Tunnel ---------------------------------------------------
$cf = @(Get-Process cloudflared -ErrorAction SilentlyContinue)
$tunnelUrl = ''
foreach ($p in @('F:\MAS-2\logs\tunnel-url.txt','F:\MAS-2\logs\tunnel_url.txt')) {
    if (Test-Path $p) { $tunnelUrl = (Get-Content $p -Raw -ErrorAction SilentlyContinue).Trim() }
}
$tunnelDetail = "" + $cf.Count + " Prozess(e)"
if ($tunnelUrl) { $tunnelDetail = $tunnelDetail + " | " + $tunnelUrl }
Add-Check 'Cloudflare-Tunnel' ($cf.Count -ge 1) $tunnelDetail 'start-cloudflare-tunnel.ps1 starten'

# --- 3) LiveKit SFU (Port 7880) --------------------------------------------
$sfu = [bool](Get-NetTCPConnection -LocalPort 7880 -State Listen -ErrorAction SilentlyContinue)
$sfuDetail = 'kein Listener'
if ($sfu) { $sfuDetail = 'lauscht' }
Add-Check 'LiveKit SFU (7880)' $sfu $sfuDetail 'livekit-server.exe via start-mas-stack.ps1 starten'

# --- 4) LLM: Modell erreichbar (lokal Ollama ODER remote vLLM) -------------
$llmLocal = ($llmBase -match '127\.0\.0\.1:11434|localhost:11434')
$modelLoaded = $false
try {
    if ($llmLocal) {
        $ps = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/ps' -TimeoutSec 6 -ErrorAction Stop
        $modelLoaded = [bool]($ps.models | Where-Object { $_.name -eq $llmModel })
        $names = ($ps.models | ForEach-Object { $_.name }) -join ', '
        if (-not $names) { $names = '(keins)' }
        Add-Check 'LLM Modell (lokal)' $modelLoaded ("erwartet '" + $llmModel + "'; geladen: " + $names) ('ollama run ' + $llmModel + '  (laedt + haelt warm); .env LIVEAVATAR_LLM_MODEL pruefen')
    } else {
        $models = Invoke-RestMethod -Uri ($llmBase.TrimEnd('/') + '/models') -TimeoutSec 8 -ErrorAction Stop
        $ids = @($models.data | ForEach-Object { $_.id })
        $modelLoaded = $ids -contains $llmModel
        $names = ($ids -join ', ')
        if (-not $names) { $names = '(keins)' }
        Add-Check 'LLM Modell (remote)' $modelLoaded ("erwartet '" + $llmModel + "' via " + $llmBase + "; verfuegbar: " + $names) ('vLLM auf ' + $llmBase + ' pruefen; Tailscale/VPN aktiv?')
    }
} catch {
    if ($llmLocal) {
        Add-Check 'LLM Modell (lokal)' $false 'Ollama nicht erreichbar (11434)' 'Ollama-App starten'
    } else {
        Add-Check 'LLM Modell (remote)' $false ('LLM nicht erreichbar: ' + $llmBase) ('vLLM-Server pruefen; Tailscale/VPN aktiv?')
    }
}

# --- 5) TOOL-CALLING (der entscheidende Check, OHNE Nebenwirkungen) ---------
# Reiner LLM-Aufruf mit einem Test-Tool. Erwartet: Modell liefert tool_calls.
# Genau das war nach 1011c18 kaputt (Modell antwortete nur Text -> "nicht
# verstanden"). KEINE echte Tool-Ausfuehrung, kein MAS, kein Push.
$toolOk = $false
$toolDetail = ''
try {
    # WICHTIG (09.07.2026): Wie der echte Worker-Pfad anfragen. qwen3.6 ist ein
    # Reasoning-Modell; ohne '/no_think' und mit knappem Budget verbraucht es die
    # Tokens im Denk-Block und liefert den tool_call nicht -> falsch-ROT. Der
    # Worker haengt '/no_think' an und gibt genug Budget. Hier identisch.
    $payload = @{
        model       = $llmModel
        stream      = $false
        max_tokens  = 256
        temperature = 0.0
        messages    = @(
            @{ role = 'system'; content = 'Du bist ein Praxis-Assistent. Nutze fuer Kalenderfragen das passende Tool. /no_think' },
            @{ role = 'user';   content = 'Was habe ich morgen fuer Termine?' }
        )
        tools = @(@{
            'type' = 'function'
            'function' = @{
                'name' = 'get_day_appointments'
                'description' = 'Liefert die Termine eines Tages.'
                'parameters' = @{ 'type' = 'object'; 'properties' = @{ 'date' = @{ 'type' = 'string' } }; 'required' = @('date') }
            }
        })
    }
    $jsonPath = Join-Path $env:TEMP 'clara_smoke_tool.json'
    [System.IO.File]::WriteAllText($jsonPath, ($payload | ConvertTo-Json -Depth 8))
    $resp = & curl.exe -s -X POST ($llmBase + '/chat/completions') -H 'Content-Type: application/json' -H 'Authorization: Bearer ollama' --data ('@' + $jsonPath) --max-time 30
    $obj = $resp | ConvertFrom-Json
    $tc = $obj.choices[0].message.tool_calls
    if ($tc -and $tc.Count -ge 1) {
        $toolOk = $true
        $toolDetail = "Modell waehlte Tool '" + $tc[0].function.name + "'"
    } else {
        $toolDetail = 'Modell lieferte KEINEN tool_call (nur Text) -> exakt der 1011c18-Fehler'
    }
} catch {
    $toolDetail = 'LLM-Aufruf fehlgeschlagen: ' + $_.Exception.Message
}
Add-Check 'Tool-Calling (LLM)' $toolOk $toolDetail 'Voll-Gate laufen lassen: tools\release_gate.ps1 -Full; letzten Tool-Commit per git revert pruefen'

# --- 6) Clara Worker: Prozess + Registrierung ------------------------------
$wproc = @(Get-CimInstance Win32_Process -Filter "name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'pickadoc_session_worker' })
$workerRunning = $wproc.Count -ge 1
$logCandidates = @()
$logCandidates += Get-ChildItem 'F:\MAS-2\logs\clara_*.err.log' -ErrorAction SilentlyContinue
$logCandidates += Get-ChildItem 'F:\Clara-Voice\_worker*.err.log' -ErrorAction SilentlyContinue
$newest = $logCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$registered = $false
$workerDetail = "" + $wproc.Count + " Prozess(e)"
if ($newest) {
    $hit = Select-String -Path $newest.FullName -Pattern 'registered worker' -ErrorAction SilentlyContinue | Select-Object -First 1
    $registered = [bool]$hit
    $regTxt = 'NICHT registriert'
    if ($registered) { $regTxt = 'registered worker OK' }
    $workerDetail = $workerDetail + " | Log: " + $newest.Name + " | " + $regTxt
}
Add-Check 'Clara Worker' ($workerRunning -and $registered) $workerDetail 'start-clara.ps1 neu starten; Worker-Log auf Traceback pruefen'

# ============================================================================
# Ausgabe
# ============================================================================
Write-Host ""
Write-Host "================ CLARA SMOKE-TEST ================" -ForegroundColor Cyan
foreach ($c in $results) {
    $mark = '[ ROT ]'
    $col  = 'Red'
    if ($c.Ok) { $mark = '[GRUEN]'; $col = 'Green' }
    Write-Host ("{0,-7} {1,-24} {2}" -f $mark, $c.Name, $c.Detail) -ForegroundColor $col
    if ((-not $c.Ok) -and $c.Fix) { Write-Host ("        -> Fix: " + $c.Fix) -ForegroundColor Yellow }
}
Write-Host "==================================================" -ForegroundColor Cyan
$red = @($results | Where-Object { -not $_.Ok })
if ($red.Count -gt 0) {
    $names = ($red | ForEach-Object { $_.Name }) -join ', '
    Write-Host ("ERGEBNIS: ROT - " + $red.Count + " Check(s) fehlgeschlagen: " + $names) -ForegroundColor Red
    exit 1
}
Write-Host "ERGEBNIS: GRUEN - Clara ist startklar." -ForegroundColor Green
exit 0
