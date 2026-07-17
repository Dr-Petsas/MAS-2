# ============================================================================
# TUNNEL- UND MAIL-WAECHTER (alle 6 Stunden via Aufgabenplanung "MAS2TunnelWache")
#
# 1) Prueft, ob der Cloudflare-Tunnel zum MAS-2-Backend noch erreichbar ist.
#    Wenn nicht: neuen Quick-Tunnel oeffnen (start-cloudflare-tunnel.ps1 macht
#    .env-Update + Backend-Neustart + masRuntime-Publish nach Firestore) und den
#    neuen Link per E-Mail an dr.petsas@pickadoc.de schicken (SMS als Fallback).
# 2) Prueft, ob das Strato-Mailkonto (dr.petsas@med-dent.clinic) verbunden ist
#    (IMAP-Sync). Wenn nicht: bekannte Passwort-Varianten testen, Konto
#    reparieren (PATCH imap+smtp) bzw. neu anlegen und Sync neu anstossen.
#
# Solange alles steht, passiert NICHTS (keine Mail, kein Neustart) -
# nur OK-Zeilen in logs\tunnel-watch.log.
#
# Manuell:  powershell -ExecutionPolicy Bypass -File F:\MAS-2\tools\tunnel_watch.ps1
# ============================================================================
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LogDir   = 'F:\MAS-2\logs'
$UrlFile  = Join-Path $LogDir 'tunnel-url.txt'
$WatchLog = Join-Path $LogDir 'tunnel-watch.log'
$MasLocal = 'http://127.0.0.1:4000'
$ClientId = 'MEe4ZQHEzOPzLcexyhdT'
$MailTo   = 'dr.petsas@pickadoc.de'
$SmsTo    = '01776004600'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$Msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Msg"
    Write-Host $line
    Add-Content -Path $WatchLog -Value $line
}

function Test-Health([string]$Base, [int]$TimeoutSec = 20) {
    if (-not $Base) { return $false }
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "$Base/health" -TimeoutSec $TimeoutSec
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

# --- 1) Lokales Backend sicherstellen (ohne Backend nuetzt kein Tunnel) ---
if (-not (Test-Health $MasLocal 10)) {
    Log "backend: lokal nicht erreichbar - starte neu"
    $Stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    Start-Process -FilePath 'node' -ArgumentList 'src/server.js' `
        -WorkingDirectory 'F:\MAS-2\backend' -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDir "backend_$Stamp.log") `
        -RedirectStandardError  (Join-Path $LogDir "backend_$Stamp.err.log")
    for ($i = 0; $i -lt 25 -and -not (Test-Health $MasLocal 5); $i++) { Start-Sleep -Seconds 2 }
    if (-not (Test-Health $MasLocal 10)) {
        Log "backend: Neustart FEHLGESCHLAGEN - Abbruch (Tunnel ohne Backend sinnlos)"
        exit 1
    }
    Log "backend: wieder oben"
}

# --- 2) Tunnel pruefen ---
$tunnelOk = $false
$oldUrl = (Get-Content $UrlFile -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($oldUrl) { $oldUrl = $oldUrl.Trim() }
if ($oldUrl -and (Test-Health $oldUrl 25)) {
    Log "tunnel: OK ($oldUrl)"
    $tunnelOk = $true
}
if (-not $tunnelOk) {
Log "tunnel: GEFALLEN ($oldUrl) - oeffne neuen Tunnel"

# --- 3) Neuen Tunnel oeffnen ---
# Alten cloudflared hart beenden: sonst wuerde start-cloudflare-tunnel.ps1 den
# (zombie-)Prozess als "laeuft bereits" werten und die tote URL behalten.
Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
# WICHTIG: Weder Pipeline (& ... | ForEach) noch Start-Process -Wait benutzen!
# Beides wartet auf die vom Start-Skript gestarteten DAEMONS (cloudflared,
# node) mit - die Pipeline ueber geerbte stdout-Handles, -Wait ueber den
# ganzen Prozessbaum. Beobachtet 12.06.: Waechter hing dadurch >9 min.
# WaitForExit() wartet nur auf die eine powershell.exe des Start-Skripts.
$tsOut = Join-Path $LogDir 'tunnel-start-last.log'
$tsProc = Start-Process -FilePath 'powershell' -WindowStyle Hidden -PassThru `
    -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','F:\MAS-2\start-cloudflare-tunnel.ps1' `
    -RedirectStandardOutput $tsOut -RedirectStandardError "$tsOut.err"
if (-not $tsProc.WaitForExit(300000)) {
    Log "tunnel-start: Timeout nach 5 min - breche Start-Skript ab und mache weiter"
    Stop-Process -Id $tsProc.Id -Force -ErrorAction SilentlyContinue
}
Get-Content $tsOut -ErrorAction SilentlyContinue |
    ForEach-Object { Add-Content -Path $WatchLog -Value "  [tunnel-start] $_" }

# Der benannte Tunnel hat eine FESTE Adresse - die URL aendert sich NICHT.
# Nach dem Neustart nur pruefen, ob die feste URL wieder erreichbar ist.
$newUrl = (Get-Content $UrlFile -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($newUrl) { $newUrl = $newUrl.Trim() }
# Backend wird vom Start-Skript neu gestartet - warten bis es lokal antwortet.
for ($i = 0; $i -lt 25 -and -not (Test-Health $MasLocal 5); $i++) { Start-Sleep -Seconds 2 }
# Benannten Tunnel bis zu 3 min auf Erreichbarkeit prüfen.
$newOk = $false
if ($newUrl) {
    for ($i = 0; $i -lt 18; $i++) {
        if (Test-Health $newUrl 15) { $newOk = $true; break }
        Start-Sleep -Seconds 10
    }
}
if ($newOk) {
    Log "tunnel: wiederhergestellt und erreichbar ($newUrl) - feste Adresse, kein Neu-Koppeln noetig"
} else {
    # --- 4) NUR wenn die feste Adresse NICHT wiederhergestellt werden konnte:
    #        echtes Problem -> per E-Mail (Fallback SMS) alarmieren. ---
    Log "tunnel: feste Adresse NICHT erreichbar ($newUrl) - alarmiere"
    $body = @"
ACHTUNG: Der MAS-Tunnel ($newUrl) ist gefallen und konnte NICHT automatisch
wiederhergestellt werden. Der Link selbst bleibt gleich (fester Named-Tunnel) -
bitte pruefen, ob cloudflared/das Backend auf dem Praxis-PC laufen.

-- Tunnel-Waechter, automatischer Lauf
"@
    $mailOk = $false
    try {
        $acc = (Invoke-RestMethod -Uri "$MasLocal/mail/accounts?clientId=$ClientId" -TimeoutSec 30).accounts | Select-Object -First 1
        if ($acc) {
            $payload = @{ accountId = $acc.id; to = @($MailTo); logToBrain = $false
                          subject = "MAS-Tunnel gefallen (feste Adresse nicht erreichbar)"; text = $body } | ConvertTo-Json
            $res = Invoke-RestMethod -Uri "$MasLocal/mail/send?clientId=$ClientId" -Method Post `
                -ContentType 'application/json; charset=utf-8' -Body $payload -TimeoutSec 120
            $mailOk = [bool]$res.ok
        } else { Log "mail: kein Konto konfiguriert" }
    } catch { Log "mail: FEHLER $($_.Exception.Message)" }
    Log "mail: $(if ($mailOk) { 'verschickt an ' + $MailTo } else { 'NICHT verschickt' })"

    if (-not $mailOk) {
        try {
            $payload = @{ phone = $SmsTo; recipientName = 'Dr. Petsas'
                          message = "MAS-Tunnel gefallen und nicht automatisch wiederhergestellt - bitte Praxis-PC pruefen." } | ConvertTo-Json
            $res = Invoke-RestMethod -Uri "$MasLocal/tools/send-sms?clientId=$ClientId" -Method Post `
                -ContentType 'application/json; charset=utf-8' -Body $payload -TimeoutSec 120
            Log "sms-fallback: $(if ($res.ok) { 'verschickt' } else { 'FEHLER' })"
        } catch { Log "sms-fallback: FEHLER $($_.Exception.Message)" }
    }
}
} # Ende Tunnel-Reparatur

# --- 5) Mailkonto pruefen und bei Bedarf reparieren -------------------------
# Das Backend synct alle 2 Minuten von selbst; hier geht es um den Fall, dass
# das Konto kaputt ist (Passwort geaendert, Konto geloescht). Dann: bekannte
# Passwort-Varianten durchprobieren, Konto patchen/neu anlegen, Sync anstossen.
$MailEmail  = 'dr.petsas@med-dent.clinic'
$MailOwner  = '7OPCoghiRzwzVtXE8eOJ'
# Passwort-Varianten kommen aus backend\.env (MAIL_WATCH_PASSWORDS, mit ';'
# getrennt) - Klartext-Secrets gehoeren nicht ins Git-versionierte Skript.
$PwVariants = @()
$envFile = 'F:\MAS-2\backend\.env'
if (Test-Path $envFile) {
    $line = (Get-Content $envFile | Where-Object { $_ -match '^\s*MAIL_WATCH_PASSWORDS\s*=' } | Select-Object -First 1)
    if ($line) {
        $PwVariants = ($line -split '=', 2)[1].Trim() -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    }
}
if (-not $PwVariants) { Log "mailkonto: MAIL_WATCH_PASSWORDS fehlt in backend\.env - Auto-Reparatur ohne Passwoerter" }
$ImapCfg    = @{ host = 'imap.strato.de'; port = 993; secure = $true;  user = $MailEmail }
$SmtpCfg    = @{ host = 'smtp.strato.de'; port = 587; secure = $false; user = $MailEmail }

function Find-MailAccount {
    try {
        $accs = (Invoke-RestMethod -Uri "$MasLocal/mail/accounts?clientId=$ClientId" -TimeoutSec 30).accounts
        return ($accs | Where-Object { $_.email -eq $MailEmail } | Select-Object -First 1)
    } catch { return $null }
}

function Test-MailSync([string]$AccountId) {
    try {
        $body = @{ accountId = $AccountId } | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$MasLocal/mail/sync?clientId=$ClientId" -Method Post `
            -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 120
        # Mit accountId antwortet das Backend flach ({ok,fetched,...}),
        # ohne accountId mit {ok,results:[...]}.
        if ($r.results) {
            $res = $r.results | Select-Object -First 1
            return [bool]($res -and $res.ok)
        }
        return [bool]$r.ok
    } catch { return $false }
}

function Get-WorkingPassword {
    foreach ($pw in $PwVariants) {
        try {
            $b = ($ImapCfg + @{ password = $pw }) | ConvertTo-Json
            $r = Invoke-RestMethod -Uri "$MasLocal/mail/accounts/test?clientId=$ClientId" -Method Post `
                -ContentType 'application/json; charset=utf-8' -Body $b -TimeoutSec 60
            if ($r.ok) { return $pw }
        } catch { }
    }
    return $null
}

$mailRepaired = $false
$acc = Find-MailAccount
if ($acc -and (Test-MailSync $acc.id)) {
    Log "mailkonto: OK ($MailEmail, Sync laeuft)"
} else {
    Log "mailkonto: NICHT verbunden ($MailEmail) - starte Reparatur"
    $pw = Get-WorkingPassword
    if (-not $pw) {
        Log "mailkonto: KEINE Passwort-Variante funktioniert - manueller Eingriff noetig (Strato-Login pruefen)"
    } else {
        try {
            if ($acc) {
                $patch = @{ active = $true
                            imap = ($ImapCfg + @{ password = $pw })
                            smtp = ($SmtpCfg + @{ password = $pw }) } | ConvertTo-Json -Depth 4
                $r = Invoke-RestMethod -Uri "$MasLocal/mail/accounts/$($acc.id)?clientId=$ClientId" -Method Patch `
                    -ContentType 'application/json; charset=utf-8' -Body $patch -TimeoutSec 60
            } else {
                $create = @{ label = 'Dr. Petsas'; email = $MailEmail; active = $true
                             visibility = 'private'; ownerUserId = $MailOwner
                             imap = ($ImapCfg + @{ password = $pw })
                             smtp = ($SmtpCfg + @{ password = $pw }) } | ConvertTo-Json -Depth 4
                $r = Invoke-RestMethod -Uri "$MasLocal/mail/accounts?clientId=$ClientId" -Method Post `
                    -ContentType 'application/json; charset=utf-8' -Body $create -TimeoutSec 60
                $acc = $r.account
            }
            # Neuladen/Refresh: Sync sofort anstossen, damit der Posteingang frisch ist.
            if ($acc -and (Test-MailSync $acc.id)) {
                $mailRepaired = $true
                Log "mailkonto: REPARIERT und neu synchronisiert ($MailEmail)"
            } else {
                Log "mailkonto: Reparatur unsicher - Sync schlaegt weiter fehl"
            }
        } catch { Log "mailkonto: Reparatur-FEHLER $($_.Exception.Message)" }
    }
    # Info aufs Handy, wenn repariert wurde (per SMS, falls Mail gerade erst wieder kam).
    if ($mailRepaired) {
        try {
            $payload = @{ phone = $SmsTo; recipientName = 'Dr. Petsas'
                          message = "MAS: Dein Mailkonto $MailEmail war getrennt und ist jetzt automatisch repariert + neu geladen." } | ConvertTo-Json
            Invoke-RestMethod -Uri "$MasLocal/tools/send-sms?clientId=$ClientId" -Method Post `
                -ContentType 'application/json; charset=utf-8' -Body $payload -TimeoutSec 120 | Out-Null
        } catch { }
    }
}
exit 0
