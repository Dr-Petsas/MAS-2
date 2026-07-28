# Livetest Lueckenfueller (W-STABIL-9, Beweis b)

**Dauer: ~5 Minuten. Voraussetzung: Clara live (Port 8091), MAS laeuft.**
Stand 28.07.2026: Kette gebaut, Modultest gruen (`scripts/test-gap-fill.mjs`),
Register-Dialoge vk-18 + vk-18b gruen, Lese-Endpunkte live geprueft
(Gap-Briefing, Kandidaten, Status). Es fehlt NUR dieser eine begleitete
Durchlauf mit einem ECHTEN Lisa-Anruf auf eine Testnummer.

## Weg A: Gezieltes Einbestellen auf die eigene Handynummer (empfohlen)

Der sauberste Beweis, weil der Anruf beim Chef selbst ankommt.

**Vorab-Check (verifiziert 28.07.2026):** Der Testpatient existiert —
**Michael Petsassss** (id `demo_petsassss`), Mobil **+491776004600**
(= Chef-Handy), eindeutiger Suchtreffer. Gegenprobe jederzeit:
`node scripts/check-testpatient.mjs` (nur lesend).

1. Clara anrufen und sagen:
   **"Such bitte den Patienten Michael Petsassss heraus."**
   -> Clara nennt den Patienten (Werkzeug `search_patient`).
2. **"Bestell ihn fuer morgen um zehn Uhr zur Kontrolle ein. Sag ihm, bei uns
   ist kurzfristig ein Termin frei geworden."**
   -> Clara liest die Anweisung fuer Lisa WOERTLICH vor und fragt:
   "Soll Lisa jetzt so anrufen?" (noch KEIN Anruf).
3. **"Ja, bitte genau so anrufen."**
   -> Lisa ruft die Handynummer an. Abnehmen, kurz antworten
   (z. B. "Ja, der Termin passt.").
4. Danach Clara fragen: **"Was hat der Anruf von Lisa ergeben?"**
   -> Werkzeug `lisa_call_result`: Zusammenfassung des Gespraechs + Karte
   (`karteLisaErgebnis`) am Handy. Das ist der Beweis "Bericht kommt zurueck".
5. Wenn im Gespraech ein Termin zugesagt wurde: im Pickadoc-Kalender
   nachsehen, ob die Buchung steht (Cloud Function `masBookAppointment`).

## Weg B: Recall-Liste (nur wenn Weg A gruen ist)

1. **"Wo habe ich morgen Luecken im Kalender?"** -> `gap_briefing`.
2. **"Wer sind die Kandidaten?"** -> `list_recall_candidates` (echte
   Recall-Patienten, seit N Tagen faellig).
3. **NUR freigeben, wenn echte Anrufe gewollt sind:** "Recall freigeben."
   -> `approve_recall`; Lisa arbeitet die Liste ab, Ergebnis-Sweep laeuft
   alle 60 s (`sweepRecallOutcomes`).
4. Stoppen/verschieben: **"Recall pausieren."** (`recall-snooze`).

## Was bei Rot zu tun ist

- Kein Anruf nach Schritt 3 (Weg A): MAS-Log nach `gapfill` durchsuchen
  (`logs/`), Lisa-Status: `POST /tools/recall-status`.
- Kein Bericht in Schritt 4: 2 Minuten warten (Finalize-Sweep laeuft alle
  15 s, Transkript braucht ElevenLabs einen Moment), dann erneut fragen.
- Abbruch jederzeit: einfach nicht freigeben — ohne "Ja" passiert nichts.

Ergebnis bitte im VERKAUFSKERN (Punkt 16/17/18) eintragen: Datum + "Livetest
bestanden" oder Befund.
