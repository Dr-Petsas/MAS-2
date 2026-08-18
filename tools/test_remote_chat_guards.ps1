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
foreach ($fn in @("Test-BillingError", "Test-TransientError", "Test-OpusRestoreCmd",
                  "Test-TeamCmd", "Parse-TeamOrders", "Parse-Verdict")) {
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

Write-Host "6) Dreierteam (Chef 18.08.2026): Schalter, Regie-Zeilen, Urteile"
Check "'nur opus' schaltet das Team aus"      ((Test-TeamCmd "nur opus bitte") -eq "aus")
Check "'team aus' schaltet das Team aus"      ((Test-TeamCmd "Team aus, mach das allein") -eq "aus")
Check "'ohne das Team' schaltet aus"          ((Test-TeamCmd "mach das ohne das Team") -eq "aus")
Check "'team an' holt das Team zurueck"       ((Test-TeamCmd "team an") -eq "an")
Check "'zu dritt' holt das Team zurueck"      ((Test-TeamCmd "macht das bitte zu dritt") -eq "an")
# Der Guthaben-Befehl darf NICHT als Team-Befehl durchgehen - sonst waere er
# nach dem Umbau nicht mehr erreichbar (er wird zuerst geprueft).
Check "'opus wieder an' bleibt Guthaben-Befehl" ((Test-TeamCmd "opus wieder an") -eq "")
Check "normale Nachricht schaltet nichts"      ((Test-TeamCmd "Bitte pruefe die Termine von morgen") -eq "")
# VORFALL 18.08.2026 (erster Selbsttest): Ein langer Arbeitsauftrag, in dem das
# Wort "Dreierteam" nur VORKAM, wurde als Schalter verstanden - der Waechter
# antwortete "Team ist zurueck" und die Aufgabe war verloren. Ein Steuerbefehl
# ist nur, was kurz ist, keine Frage stellt und am Anfang steht.
$langerAuftrag = @"
SELBSTTEST DES DREIERTEAMS (ausgeloest von Opus am Rechner).
Aendere NICHTS an Clara. Hole danach beide Kollegen dazu.
"@
Check "langer Auftrag mit 'Dreierteam' wird NICHT geschluckt" ((Test-TeamCmd $langerAuftrag) -eq "")
Check "Frage nach dem Team ist kein Schalter"  ((Test-TeamCmd "Wie laeuft das Dreierteam?") -eq "")
Check "'Team' mitten im Satz schaltet nichts"  ((Test-TeamCmd "Sag dem Team an, es soll warten - dann weiter im Kalender") -eq "")

$antwort = @"
Ich habe die Absenderkennung eingebaut und getestet.
Committet in MAS-2.
[TEAM] grok: Pruefe, ob die Handy-Seite ohne Absender-Feld weiterhin sauber anzeigt.
[TEAM] fable: Lies die neuen Chat-Texte auf Verstaendlichkeit.
"@
$z = Parse-TeamOrders $antwort
Check "zwei Auftraege erkannt"                  ($z.orders.Count -eq 2)
Check "erster Auftrag geht an Grok"             ($z.orders[0].who -eq "grok")
Check "zweiter Auftrag geht an Fable"           ($z.orders[1].who -eq "fable")
Check "Auftragstext kommt vollstaendig an"      ($z.orders[0].task -like "Pruefe, ob die Handy-Seite*")
# Das ist der wichtigste Punkt: Maschinen-Zeilen duerfen NIE im Chat des Chefs
# landen - er liest sonst Regie-Anweisungen statt einer Antwort.
Check "Regie-Zeilen sind aus dem Chat-Text raus" ($z.text -notmatch '\[TEAM\]')
Check "eigentliche Antwort bleibt erhalten"      ($z.text -like "Ich habe die Absenderkennung*")
$doppelt = Parse-TeamOrders "Fertig.`n[TEAM] grok: einmal`n[TEAM] grok: nochmal"
Check "derselbe Kollege wird nur einmal geholt"  ($doppelt.orders.Count -eq 1)
$unsinn = Parse-TeamOrders "Fertig.`n[TEAM] niemand"
Check "unbrauchbare Regie-Zeile wird verworfen"  ($unsinn.orders.Count -eq 0 -and $unsinn.text -eq "Fertig.")
$ohne = Parse-TeamOrders "Nur eine Auskunft, kein Team noetig."
Check "Antwort ohne Regie-Zeile bleibt unberuehrt" ($ohne.orders.Count -eq 0 -and $ohne.text -eq "Nur eine Auskunft, kein Team noetig.")

$gruen = Parse-Verdict "Geprueft, laeuft.`n[URTEIL] gruen"
Check "gruenes Urteil erkannt"                  ($gruen.urteil -eq "gruen")
Check "Urteilszeile ist aus dem Chat-Text raus"  ($gruen.text -eq "Geprueft, laeuft.")
Check "rotes Urteil erkannt"                    ((Parse-Verdict "So nicht.`n[URTEIL] rot").urteil -eq "rot")
Check "gelbes Urteil erkannt"                    ((Parse-Verdict "Kleinigkeit behoben.`n[URTEIL] gelb").urteil -eq "gelb")
Check "fehlendes Urteil bleibt leer"             ((Parse-Verdict "Habe geschaut, passt.").urteil -eq "")

Write-Host "7) Dreierteam: Sparregeln und Vertraege im Waechter"
# Kollegen-Modelle duerfen NIE in die Modell-Datei geschrieben werden: der
# Urlaubs-Waechter vergleicht sie mit Opus und wuerde den Draht sonst mitten im
# Gegenlesen abschiessen.
$modellZeilen = @(Select-String -Path $src -Pattern 'Set-Content -Path \$ModelFile' -ErrorAction SilentlyContinue)
Check "Modell-Datei wird ueberhaupt geschrieben" ($modellZeilen.Count -ge 2)
Check "kein Kollegen-Modell in der Modell-Datei" (-not ($modellZeilen | Where-Object { $_.Line -match "Grok|Fable" }))
# Bei Konto-Problem oder gescheitertem Lauf bleibt das Team draussen.
$sparen = Select-String -Path $src -Pattern '\$teamLaeuft = \$TeamAn' -Context 0,1 -ErrorAction SilentlyContinue
$sparText = if ($sparen) { $sparen.Line + " " + ($sparen.Context.PostContext -join " ") } else { "" }
Check "Team ruht bei Konto-Problem"              ($sparText -match '-not \$res\.billing')
Check "Team ruht bei gescheitertem Lauf"         ($sparText -match '\$res\.ok')
Check "Team laeuft nur auf dem Wunsch-Opus"      ($sparText -match '\$script:ActiveModel -eq \$OpusModel')
# Jeder Kopf braucht seinen eigenen Gespraechsfaden.
Check "eigene Sitzungsdatei je Kollege"          ($null -ne (Select-String -Path $src -Pattern 'remote_chat_session_\{0\}' -ErrorAction SilentlyContinue))
# Absender an jeder Agent-Nachricht (sonst sieht der Chef nicht, wer schreibt).
Check "Nachrichten tragen einen Absender"        ($null -ne (Select-String -Path $src -Pattern 'speaker = \$wer' -ErrorAction SilentlyContinue))
$roh = Select-String -Path $src -Pattern 'Api-Post "/remote/message"' -ErrorAction SilentlyContinue
Check "keine Nachricht mehr ohne Absender"       ($roh.Count -eq 1)

Write-Host ""
if ($fails -gt 0) { Write-Host "ERGEBNIS: $oks ok, $fails FEHLGESCHLAGEN" -ForegroundColor Red; exit 1 }
Write-Host "ERGEBNIS: alle $oks Pruefungen gruen" -ForegroundColor Green
exit 0
