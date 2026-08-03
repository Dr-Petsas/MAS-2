# Test fuer die Schutzmechanismen des Fernsteuerungs-Waechters (03.08.2026).
#
# Hintergrund: Am Abend des 03.08.2026 hat sich der Chat-Draht selbst lahmgelegt.
# Der Konto-Test lief ueber die GESAMTE Agenten-Ausgabe - also auch ueber den
# Antworttext. Sobald in einer Antwort ueber ein leeres Konto geschrieben wurde,
# hielt der Waechter das fuer eine echte Dienst-Meldung, sperrte Opus und fiel
# aufs Ersatzmodell zurueck. Zusaetzlich wurde beim Neustart eine Stunden alte
# "verwaiste" Nachricht ("Beende den MAS-Server") erneut ausgefuehrt und hat den
# MAS-Server gestoppt. Dieser Test haelt beide Korrekturen fest.
#
# Aufruf:  powershell -NoProfile -ExecutionPolicy Bypass -File F:\MAS-2\tools\test_remote_chat_guards.ps1

$ErrorActionPreference = "Stop"
$src = "F:\MAS-2\tools\remote_chat_watch.ps1"
$fails = 0
$oks = 0
function Check([string]$name, [bool]$cond) {
  if ($cond) { $script:oks++; Write-Host "  ok   $name" }
  else { $script:fails++; Write-Host "  FEHL $name" -ForegroundColor Red }
}

# Die zu pruefenden Funktionen direkt aus dem Original laden (kein Nachbau),
# damit der Test nicht gruen bleibt, wenn jemand das Original aendert.
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($src, [ref]$tokens, [ref]$errors)
if ($errors -and $errors.Count) { Write-Host "ABBRUCH: Syntaxfehler in $src"; exit 1 }
foreach ($fn in @("Test-BillingError", "Test-TransientError", "Test-OpusRestoreCmd")) {
  $def = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $fn }, $true) | Select-Object -First 1
  if (-not $def) { Write-Host "ABBRUCH: Funktion $fn nicht gefunden"; exit 1 }
  . ([scriptblock]::Create($def.Extent.Text))
}

Write-Host "1) Konto-Erkennung: echte Dienst-Meldungen"
Check "englische Meldung erkannt" (Test-BillingError "Error: insufficient credits for this model")
Check "deutsche Meldung erkannt"  (Test-BillingError "Fehler: Guthaben aufgebraucht")
Check "Kontingent erkannt"        (Test-BillingError "monthly quota exceeded")

Write-Host "2) Konto-Erkennung wird NICHT mehr auf den Antworttext angewendet"
$line = Select-String -Path $src -Pattern '^\s*\$billing\s*=\s*Test-BillingError\s+\$err\s*$' -ErrorAction SilentlyContinue
Check "Pruefung laeuft nur ueber den Fehlerkanal (stderr)" ($null -ne $line)
$bad = Select-String -Path $src -Pattern 'Test-BillingError\s+\$combined' -ErrorAction SilentlyContinue
Check "keine Pruefung mehr ueber die gesamte Ausgabe" ($null -eq $bad)
$onErr = Select-String -Path $src -Pattern 'if \(\$isErr -and -not \$billing\) \{ \$billing = Test-BillingError \$text \}' -ErrorAction SilentlyContinue
Check "Fehler-Antworten werden weiterhin geprueft" ($null -ne $onErr)

Write-Host "3) Wiederherstellungs-Befehl"
Check "'opus wieder an' erkannt"        (Test-OpusRestoreCmd "opus wieder an")
Check "'Opus 5 aktivieren' erkannt"     (Test-OpusRestoreCmd "bitte Opus 5 aktivieren")
Check "normale Nachricht nicht erkannt" (-not (Test-OpusRestoreCmd "Bitte pruefe die Termine von morgen"))

Write-Host "4) Verwaiste Nachrichten: nur frische duerfen erneut laufen"
$OrphanMaxAgeMin = 30
$now = [double](([DateTimeOffset](Get-Date)).ToUnixTimeMilliseconds())
$orphans = @(
  [pscustomobject]@{ id = "frisch"; createdAt = ($now - 60000) },        # 1 Minute alt
  [pscustomobject]@{ id = "grenzwertig"; createdAt = ($now - 1500000) }, # 25 Minuten alt
  [pscustomobject]@{ id = "uralt"; createdAt = ($now - 7200000) }        # 2 Stunden alt
)
$fresh = @($orphans | Where-Object { ($now - [double]($_.createdAt)) -le ($OrphanMaxAgeMin * 60000) })
$stale = @($orphans | Where-Object { ($now - [double]($_.createdAt)) -gt ($OrphanMaxAgeMin * 60000) })
Check "frische Nachrichten kommen zurueck in die Warteschlange" ($fresh.Count -eq 2)
Check "alter Befehl wird NICHT erneut ausgefuehrt" ($stale.Count -eq 1 -and $stale[0].id -eq "uralt")
$guard = Select-String -Path $src -Pattern 'OrphanMaxAgeMin \* 60000' -ErrorAction SilentlyContinue
Check "Altersgrenze ist im Waechter verbaut" ($null -ne $guard -and $guard.Count -ge 2)

Write-Host "5) Sprechender Modellname in den Hinweistexten"
foreach ($case in @(@{ m = "claude-opus-5-thinking-high"; n = "Opus 5" }, @{ m = "claude-opus-4-8-thinking-high"; n = "Opus 4.8" })) {
  $OpusModel = $case.m
  $OpusName = if ($OpusModel -match "opus-?5") { "Opus 5" } elseif ($OpusModel -match "opus-?4[-.]?8") { "Opus 4.8" } else { $OpusModel }
  Check ("$($case.m) -> $($case.n)") ($OpusName -eq $case.n)
}
$hard = Select-String -Path $src -Pattern '(rep|hinweis) = "[^"]*Opus 4\.8' -ErrorAction SilentlyContinue
Check "keine fest verdrahteten Modellnamen mehr in den Chat-Texten" ($null -eq $hard)

Write-Host ""
if ($fails -gt 0) { Write-Host "ERGEBNIS: $oks ok, $fails FEHLGESCHLAGEN" -ForegroundColor Red; exit 1 }
Write-Host "ERGEBNIS: alle $oks Pruefungen gruen" -ForegroundColor Green
exit 0
