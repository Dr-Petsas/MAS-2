# Stack-Health-Watchdog: MAS-2 + Clara-Worker + Lena-STT
# Prueft Health, startet ausgefallene Teile neu (inkl. Zombie-Cleanup).
# Exit 0 = alles gruen, Exit 1 = mind. eine Komponente rot (auch nach Restart).
#
#   powershell -File F:\MAS-2\scripts\stack_health_watchdog.ps1
#   powershell -File F:\MAS-2\scripts\stack_health_watchdog.ps1 -NoRestart

param([switch]$NoRestart)

$ErrorActionPreference = 'Continue'
$LogDir = 'F:\MAS-2\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir 'stack_watchdog.log'
$Stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'

function WLog([string]$Msg, [string]$Level = 'INFO') {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Test-PortListening([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-HttpJson([string]$Url, [int]$TimeoutSec = 6) {
    try {
        return Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec
    } catch {
        return $null
    }
}

function Stop-ProcsMatching([string]$NameFilter, [scriptblock]$CmdMatch) {
    Get-CimInstance Win32_Process -Filter "Name='$NameFilter'" -ErrorAction SilentlyContinue |
        Where-Object { & $CmdMatch $_ } |
        ForEach-Object {
            WLog "stop PID $($_.ProcessId): $($_.Name)" 'WARN'
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

# ---------------------------------------------------------------------------
WLog "=== Watchdog tick ($Stamp) NoRestart=$NoRestart ==="

$result = [ordered]@{
    mas     = 'unknown'
    clara   = 'unknown'
    lena    = 'unknown'
    ollama  = 'unknown'
    livekit = 'unknown'
    actions = @()
}

# --- Ollama / LiveKit (Hilfsdienste, best-effort) ---
$result.ollama = if (Test-PortListening 11434) { 'ok' } else { 'down' }
$result.livekit = if (Test-PortListening 7880) { 'ok' } else { 'down' }

# --- MAS-2 ---
$mas = Get-HttpJson 'http://127.0.0.1:4000/health'
if ($mas -and $mas.ok) {
    $result.mas = 'ok'
    WLog "MAS-2: ok (Port 4000)"
} else {
    $result.mas = 'down'
    WLog "MAS-2: DOWN" 'ERROR'
    if (-not $NoRestart) {
        Stop-ProcsMatching 'node.exe' { $_.CommandLine -like '*src/server.js*' }
        Start-Sleep -Seconds 2
        WLog "MAS-2: starte Backend..."
        Start-Process -FilePath 'node' -ArgumentList 'src/server.js' `
            -WorkingDirectory 'F:\MAS-2\backend' -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $LogDir "backend_wd_$Stamp.log") `
            -RedirectStandardError  (Join-Path $LogDir "backend_wd_$Stamp.err.log")
        $result.actions += 'restart-mas'
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Seconds 2
            $mas = Get-HttpJson 'http://127.0.0.1:4000/health'
            if ($mas -and $mas.ok) { break }
        }
        if ($mas -and $mas.ok) {
            $result.mas = 'recovered'
            WLog "MAS-2: recovered"
        } else {
            WLog "MAS-2: Restart fehlgeschlagen" 'ERROR'
        }
    }
}

# Named-Tunnel fuer mas.pickadoc-tunnel.com (best-effort)
$namedCf = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*tunnel run*' -or $_.CommandLine -like '*config.yml*' }
if (-not $namedCf) {
    WLog "Named-Tunnel cloudflared: fehlt" 'WARN'
    if (-not $NoRestart -and (Test-Path 'F:\MAS-2\start-cloudflare-tunnel.ps1')) {
        try {
            & powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\MAS-2\start-cloudflare-tunnel.ps1'
            $result.actions += 'restart-mas-tunnel'
        } catch {
            WLog "Named-Tunnel Start: $($_.Exception.Message)" 'ERROR'
        }
    }
}

# --- LiveKit SFU ---
if ($result.livekit -eq 'down' -and -not $NoRestart) {
    WLog "LiveKit SFU: starte..."
    Start-Process -FilePath 'F:\Clara-Voice\deploy\livekit\livekit-server.exe' `
        -ArgumentList '--config', 'F:\Clara-Voice\deploy\livekit\livekit.yaml' `
        -WorkingDirectory 'F:\Clara-Voice\deploy\livekit' -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "livekit_wd_$Stamp.log") `
        -RedirectStandardError  (Join-Path $LogDir "livekit_wd_$Stamp.err.log")
    $result.actions += 'restart-livekit'
    Start-Sleep -Seconds 3
    $result.livekit = if (Test-PortListening 7880) { 'recovered' } else { 'down' }
}

# --- Lena-STT ---
$lena = Get-HttpJson 'http://127.0.0.1:8140/health' 8
$lenaOk = $false
if ($lena -and $lena.ok) {
    $silero = $lena.sileroVad -and $lena.sileroVad.loaded
    $enhance = $lena.enhance -and $lena.enhance.enabled
    if ($silero) {
        $lenaOk = $true
        $result.lena = 'ok'
        WLog "Lena-STT: ok primary=$($lena.primary) device=$($lena.device) silero=$silero enhance=$enhance"
    } else {
        WLog "Lena-STT: Health ok aber Silero nicht geladen - gilt als ungesund" 'WARN'
        $result.lena = 'degraded'
    }
} else {
    $result.lena = 'down'
    WLog "Lena-STT: DOWN" 'ERROR'
}

$lenaTunnel = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*127.0.0.1:8140*' -or $_.CommandLine -like '*localhost:8140*' }
if (-not $lenaTunnel) {
    WLog "Lena Quick-Tunnel: fehlt" 'WARN'
    if ($result.lena -eq 'ok') { $result.lena = 'degraded' }
}

if (($result.lena -ne 'ok') -and -not $NoRestart) {
    WLog "Lena-STT: Cleanup + Neustart (inkl. Tunnel)..."
    Stop-ProcsMatching 'python.exe' { $_.CommandLine -like '*lena_stt.server*' }
    Stop-ProcsMatching 'cloudflared.exe' {
        $_.CommandLine -like '*127.0.0.1:8140*' -or $_.CommandLine -like '*localhost:8140*'
    }
    Start-Sleep -Seconds 2
    # HF-Cache auf lokales Laufwerk zwingen (I:\ war Permission-denied)
    $env:HF_HOME = 'F:\Clara-Voice\.cache\huggingface'
    $env:HF_HUB_CACHE = 'F:\Clara-Voice\.cache\huggingface\hub'
    $env:HF_HUB_DISABLE_XET = '1'
    New-Item -ItemType Directory -Force -Path $env:HF_HOME, $env:HF_HUB_CACHE | Out-Null
    & powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\Clara-Voice\lena_stt\start-lena-stt.ps1' -Tunnel
    if ($LASTEXITCODE -ne 0) {
        WLog "Lena Start: exit=$LASTEXITCODE" 'ERROR'
    }
    $result.actions += 'restart-lena'
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        $lena = Get-HttpJson 'http://127.0.0.1:8140/health' 8
        if ($lena -and $lena.ok -and $lena.sileroVad -and $lena.sileroVad.loaded) { break }
    }
    if ($lena -and $lena.ok) {
        $result.lena = 'recovered'
        WLog "Lena-STT: recovered primary=$($lena.primary)"
    } else {
        $result.lena = 'down'
        WLog "Lena-STT: Restart fehlgeschlagen" 'ERROR'
    }
}

# --- Clara Worker ---
$claraPort = Test-PortListening 8091
$claraLock = Test-PortListening 8099
$claraProc = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*pickadoc_session_worker*' }
$claraCount = @($claraProc).Count

if ($claraPort -and $claraLock -and $claraCount -eq 1) {
    $result.clara = 'ok'
    WLog "Clara: ok (PID $($claraProc.ProcessId), Ports 8091/8099)"
} elseif ($claraCount -gt 1) {
    $result.clara = 'zombie'
    WLog "Clara: $($claraCount) Worker - Zombies" 'ERROR'
} else {
    $result.clara = 'down'
    WLog "Clara: DOWN (port8091=$claraPort lock=$claraLock procs=$claraCount)" 'ERROR'
}

if (($result.clara -ne 'ok') -and -not $NoRestart) {
    WLog "Clara: Cleanup + Neustart..."
    Stop-ProcsMatching 'python.exe' { $_.CommandLine -like '*pickadoc_session_worker*' }
    Start-Sleep -Seconds 2
    # Schnelles Gate (nicht Full) - bei Rot trotzdem starten (Verfuegbarkeit)
    $gateOut = & powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\Clara-Voice\tools\release_gate.ps1' 2>&1
    $gateCode = $LASTEXITCODE
    if ($gateCode -ne 0) {
        WLog "Clara: Release-Gate nicht gruen (exit=$gateCode) - starte trotzdem" 'WARN'
    } else {
        WLog "Clara: Release-Gate gruen"
    }
    Start-Process -FilePath 'powershell' `
        -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'F:\Clara-Voice\start-clara.ps1' `
        -WorkingDirectory 'F:\Clara-Voice' -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "clara_wd_$Stamp.log") `
        -RedirectStandardError  (Join-Path $LogDir "clara_wd_$Stamp.err.log")
    $result.actions += 'restart-clara'
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        if ((Test-PortListening 8091) -and (Test-PortListening 8099)) { break }
    }
    $claraProc2 = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*pickadoc_session_worker*' }
    if ((Test-PortListening 8091) -and @($claraProc2).Count -ge 1) {
        $result.clara = 'recovered'
        WLog "Clara: recovered (PID $($claraProc2.ProcessId))"
    } else {
        $result.clara = 'down'
        WLog "Clara: Restart fehlgeschlagen" 'ERROR'
    }
}

# --- Summary ---
$allOk = ($result.mas -in @('ok', 'recovered')) -and
         ($result.clara -in @('ok', 'recovered')) -and
         ($result.lena -in @('ok', 'recovered'))
$summary = "mas=$($result.mas) clara=$($result.clara) lena=$($result.lena) ollama=$($result.ollama) livekit=$($result.livekit) actions=$($result.actions -join ',')"
if ($allOk) {
    WLog "SUMMARY GRUEN | $summary"
    $code = 0
} else {
    WLog "SUMMARY ROT | $summary" 'ERROR'
    $code = 1
}

# Maschinenlesbare Zeile fuer den Agent-Loop
Write-Host ("WATCHDOG_RESULT " + (@{
    ok      = $allOk
    mas     = $result.mas
    clara   = $result.clara
    lena    = $result.lena
    ollama  = $result.ollama
    livekit = $result.livekit
    actions = $result.actions
    stamp   = $Stamp
} | ConvertTo-Json -Compress))

exit $code
