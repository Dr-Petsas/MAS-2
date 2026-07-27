# VERKAUFSKERN Clara (festgelegt vom Chef, 27.07.2026 abends)

Dieses Dokument ist der MASSSTAB fuer ein verkaufbares Produkt. Es listet die
Faehigkeiten, die Clara koennen MUSS, damit sie einer Praxis verkauft werden
kann. Alles, was hier nicht steht, ist Warteliste (Masterplan) — nicht
unwichtig, aber nicht Verkaufskern.

Jeder Punkt ist (oder wird) ein dauerhafter Testfall im Regressions-Register
(`F:\Clara-Voice\testsuite\register.json`, IDs `vk-*` und `reg-*`). Regeln:

1. **Ein gesicherter Punkt darf nie wieder unbemerkt kaputtgehen.** Kippt ein
   Register-Fall, ist der Lauf ROT — egal wie gut die Gesamtquote ist.
   (Blockierend im Gate ab dem ersten komplett gruenen Register-Lauf;
   bis dahin: messen und berichten.)
2. **Jede neue Beschwerde des Chefs wird ein Register-Fall** (`reg-*`) —
   mit dem Wortlaut des Chefs, BEVOR der Fix gebaut wird (erst rot, dann gruen).
3. **Eine Verhaltensaenderung pro Neustart. Kein Neustart, waehrend der Chef
   telefoniert.**

Status-Legende:
- `OK` — bestand vor dem 27.07., sollte gruen sein
- `REP-2707` — am 27.07. repariert, Beweis durch Register-Lauf faellig
- `UNBEWIESEN` — Werkzeug existiert, Ende-zu-Ende nie nachgewiesen
- `NEUBAU` — fehlt, wird gebaut
- `INTEGRATION` — nur im Lauf gegen echte Dienste messbar (nicht im SAFE-Modus)

## A. Termine

| Nr | Faehigkeit (Beispielsatz) | Werkzeuge | Status | Register |
|----|---------------------------|-----------|--------|----------|
| 1 | "Wie viele Termine habe ich noch?" — zaehlt ab jetzt, nur heute | `list_day_appointments` (remaining) | REP-2707 | vk-01 |
| 2 | "Wie sieht mein Tag heute aus?" — Tagesbriefing, auch automatisch morgens | `day_briefing` | OK | vk-02 |
| 3 | "Wer kommt als naechstes?" — Patienten-Briefing mit Hinweisen | `next_patients_briefing` | OK | vk-03 |
| 4 | "Welche Termine hatte ich am 20.7.?" — echte Vergangenheit | `list_day_appointments`/`day_briefing` (date) | REP-2707 | vk-04 |
| 5 | "Wann ist der naechste freie Termin?" | `next_free_slot` | OK | vk-05 |
| 6 | "Buch Frau X fuer Dienstag zehn Uhr" — erst Patient eindeutig, dann buchen | `search_patient` -> `book_for_patient` | OK | vk-06 |
| 7 | "Sag den Termin von Herrn Y ab" — NUR nach Rueckbestaetigung | `patient_next_appointment` -> `cancelAppointment` | UNBEWIESEN | vk-07 |
| 8 | "Verschieb ihn auf Donnerstag vierzehn Uhr" | `getFreeTimeSlotsForPostponeAppointment` -> `postponeAppointment` | UNBEWIESEN | vk-08 |

## B. Kommunikation

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 9 | "Schick Frau X eine SMS, dass ..." | `send_sms` (`find_contact` ohne Nummer) | OK | vk-09 |
| 10 | "Schreib eine Mail an ..." — Entwurf, Freigabe, Versand | `compose_email` -> `approve_and_send` | OK | vk-10 |
| 11 | "Ruf X an und sag ihm ..." — Auftrag wird WIRKLICH ausgeloest | `delegate_call` | REP-2707 | vk-11, reg-05 |
| 12 | Nach jedem Lisa-Anruf ein Gespraechsbericht | `lisa_call_result` (+ Push nach Anrufende) | REP-2707 | vk-12 |
| 13 | "Wie ist die Nummer von Doktor Petsas?" — aus dem festen Praxisverzeichnis | `find_contact`/`contact_card` (+ `mas_config/directory`) | REP-2707 | vk-13 |
| 14 | "Schick mir die Kontaktkarte" — Karte kommt WIRKLICH am Handy an | `contact_card`/`push_contact` | REP-2707 (Ankunft: INTEGRATION) | vk-14, reg-04 |
| 15 | "Hat gestern jemand angerufen?" | `call_log` | OK | vk-15 |

## C. Terminluecken und Recall

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 16 | "Wo habe ich morgen Luecken?" | `gap_briefing` | OK | vk-16 |
| 17 | "Wen koennen wir dafuer anrufen?" — Kandidaten aus den Recall-Toepfen (CampaignR) | `list_recall_candidates` | OK | vk-17 |
| 18 | Recall-Anruf NUR nach Freigabe — und dann passiert er wirklich | `approve_recall` / `gapfill_call_patient` | OK | vk-18 (Dialog), vk-18b (Einbestellen) |
| 19 | An Abwesenheitstagen KEINE Lueckenfueller-Vorschlaege | Abwesenheits-Filter in `gapFill` (praxisweite + Teil-Abwesenheit) | OK (27.07.) | MAS: `scripts/test-gap-fill.mjs` (Abwesenheits-Block) |

## D. Abwesenheiten

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 20 | "Wann bin ich wieder in der Praxis?" — Spanne + Rueckkehrtag, gesiezt | `getDoctorVacation` (eigener Kalender) | REP-2707 | vk-20 |
| 21 | "Hat Frau Mueller naechste Woche frei?" — auch Mitarbeiter | `getDoctorVacation`/`getDoctorAvailability` | REP-2707 | vk-21 |
| 22 | "Trag mir Urlaub von ... bis ... ein" — eintragen und genehmigen | `plan_absence` -> `approve_absence` | OK | vk-22 |

## E. Ueberwachen, Fristen, Zahlungen

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 23 | "Was ist heute reingekommen?" — Mails + Anrufe + Empfang | `comms_digest` | OK | vk-23 |
| 24 | Fristen-Waechter: Fristen aus E-Mails, gescannter Post (Mail-Anlage -> `mail/ocr.js`) UND Telefonaten; Wiedervorlage bis "erledigt" | NEUBAU (Basis: Eskalationsliste, OCR-Strecke, Anruf-Transkripte) | NEUBAU | folgt |
| 25 | Rechnungs-/Zahlungs-Waechter aus denselben drei Quellen; Betrag NUR auf der Karte, gesprochen wird die Frist (Regel: keine Euro-Betraege in gesprochenen Briefings) | NEUBAU | NEUBAU | folgt |
| 26 | Kritisches sofort melden, ohne Fehlalarm durch Werbe-Fusszeilen | `brain/critical.js` (`ohneFusszeile`) | REP-2707 | MAS: `scripts/test-critical-fusszeile.mjs` |

## F. Anzeige

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 27 | Jede angekuendigte Karte erscheint WIRKLICH am Handy und ist vertiefbar (W-FLIP-TIEFE) | Karten-Push + `call.html`/`clara-chat.js` | INTEGRATION | folgt |

## G. Bianca (Patiententelefon) — Platzhalter, bewusst leer

Bianca gehoert zum Verkaufskern, wird aber KOMPLETT NEU und eigenstaendig
entwickelt (Chef 27.07.). Die Zusammenfuehrung mit Clara ("Hochzeit") kommt
erst, wenn Clara steht. Bis dahin: keine Bianca-Faelle im Register, keine
Bianca-Arbeit in Clara-Sessions.

## Messstand

- **27.07.2026 22:03 (SAFE = Routing-Beweis, noch kein Daten-Beweis):
  22/27 gruen.** Rot, als naechstes zu fixen (je EIN Fix, EIN Neustart,
  Register davor/danach):
  1. `vk-07` — "Sag den Termin von Herrn Melzer morgen ab" fuehrt DIREKT
     `cancelAppointment` aus, ohne vorher nachzuschauen und rueckzufragen
     (Live-Risiko: Absage ohne Bestaetigung).
  2. `vk-12` — "Was hat der Anruf von Lisa ergeben?" wird vom
     Anrufliste-Waechter gekapert (`call_log` statt `lisa_call_result`);
     der Gespraechsbericht ist so per Sprache nicht erreichbar.
  3. `vk-21` — "Hat Frau Mueller naechste Woche frei?" laeuft auf
     `next_free_slot` (freie Termine!) statt auf die Abwesenheits-Auskunft.
  4. `vk-18` Zug 2 — "Wer sind die Kandidaten?" bleibt ohne Tool; der
     Fakten-Backstop verwirft die erfundene Antwort zwar, synthetisiert
     aber kein `list_recall_candidates`.
  5. `reg-04` Zug 2 — "Schick sie mir aufs Handy" (Name fiel im Satz
     davor) bleibt ohne Tool — exakt die Karten-Beschwerde vom 27.07.
- **27.07.2026 23:00: alle 5 roten Faelle gefixt und einzeln gruen
  nachgewiesen** (deterministische Umleitungen/Synthesen im Provider,
  je Fix ein Commit in Clara-Voice). Voll-Gate (Katalog + Register +
  Flip-Sperre) laeuft. Neu dazu: `vk-18b` (gezieltes Einbestellen ueber
  `search_patient` -> `gapfill_call_patient`, Beweis faellig) und der
  Abwesenheits-Block im Gap-Fill-Modultest (Punkt 19 gruen).
- **27.07.2026 23:45: Register auf 28 Faelle erweitert und KOMPLETT gruen;
  zwei Voll-Gates gruen (23:00 Uhr 27/27, 23:38 Uhr 28/28; Quote 91,2 %,
  Flip-Sperre 0 gekippt).** `vk-18b` deckte beim ersten Messlauf einen
  ECHTEN Live-Fehler auf: "Bestell sie fuer morgen um zehn ein. Sag ihr
  ..." buchte STILL einen Termin (`book_for_patient`) und behauptete, die
  Patientin sei informiert. Jetzt deterministisch: Einbestell-Intent ->
  `gapfill_call_patient` (Umleitung falscher Tools, Synthese bei Text,
  confirm-Stufe nach dem Ja; Subsetting-Fenster "bestell..ein" 30->80
  Zeichen). Dazu `vk-05`-Backstop: naechster-freier-Termin-Frage ohne
  Tool synthetisiert `next_free_slot` (kippte im Messlauf durch
  Modell-Roulette). Worker um 23:39 neu gestartet — der Stand ist LIVE
  (Tag `stabil-2026-07-27-nacht`). Offen fuer den Chef: begleiteter
  Ende-zu-Ende-Livetest (Lisa ruft Testnummer an, Bericht kommt zurueck).
- **28.07.2026 00:50: W-STABIL-5 (Protokolle) gebaut, getestet, LIVE.**
  Jeder Gespraechszug hinterlaesst ab jetzt EINE Protokollzeile
  (`Clara-Voice\.run\protokoll\turns-JJJJMMTT.jsonl`): was Clara gehoert
  hat, welches Tool mit welchen Argumenten lief (und ob es technisch
  scheiterte), welche Waechter eingriffen, was wirklich gesprochen wurde.
  "Um 14:12 hat sie Unsinn geredet" ist damit in einer Zeile aufklaerbar —
  ohne Log-Raten. Zusaetzlich ueberschreibt der Clara-Umschalter die
  Start-Logs nicht mehr (pro Start eine Zeitstempel-Datei, 30 Starts
  Rueckschau). Gate + Register 28/28 gruen, Worker 00:44 neu gestartet.
  Notaus: CLARA_TURN_PROTOKOLL=0.
- **28.07.2026 00:40: W-STABIL-4 (Fehler-als-Zustand) gebaut, getestet,
  LIVE.** Faellt ein Werkzeug technisch aus, sagt Clara ab jetzt ehrlich
  "Das kann ich gerade nicht nachsehen — der Zugriff darauf ist technisch
  gestoert" statt zu raten oder leer zu klingen; jeder Ausfall wird als
  roter Eintrag gespeichert und steht 60 Minuten auf der Status-Seite
  (Check "Tool-Stoerungen"). Gate -Register gruen (28/28), Worker
  22:32 UTC neu gestartet. Notaus: CLARA_FEHLER_EHRLICH=0.
- **28.07.2026 00:20: W-STABIL-3 (Faehigkeits-Ping) und W-STABIL-6
  (Morgenlauf) gebaut, getestet, LIVE.** `/clara/health` prueft jetzt 10
  Punkte, darunter neu: alle 65 Profil-Tools gegen die wirklich gemounteten
  MAS-Routen (haette die tote Abwesenheits-Route am ersten Tag gefunden),
  die 9 Plattform-Cloud-Functions, ElevenLabs (Lisa-Agent-Endpunkt — der
  Key ist ConvAI-beschraenkt, /v1/user war Fehlalarm) und Lena-STT. Ab
  morgen frueh 06:30 laeuft automatisch Ping + Register (SAFE) und EIN
  Push meldet rot/gruen aufs Handy. Live-Beweis 00:14 Uhr ueber
  POST /clara/morgenlauf/run: Ping gruen (10 Checks), Register 28/28,
  ~2,5 min. MAS neu gestartet, Clara-Gate danach gruen.

## Befund Lueckenfueller-Kette (Audit 27.07.2026 abends)

Sorge des Chefs: "Luecken fuellen hat garantiert noch keinen guten Workflow,
geschweige denn die richtigen Cloud Functions oder Tools." Befund: **die Kette
existiert vollstaendig und der Maschinenraum ist gruen** — was fehlt, ist der
Ende-zu-Ende-Beweis am Telefon, nicht der Bau:

1. Lücken erkennen: `gapFill.runGapFill` rechnet echte Luecken aus
   Oeffnungszeiten minus Belegung minus Abwesenheiten (Modultest gruen,
   inkl. Idempotenz, Drossel, Einwilligung, Ranking).
2. Kandidaten: CampaignR-Buckets + faellige virtuelle Recalls, gedrosselt
   und dedupliziert (`list_recall_candidates` fuer die Stimme).
3. Freigabe: `approve_recall` -> `recallCoach.approveAndExecute` ->
   Lisa ruft an (ElevenLabs outbound), AB-Skript ohne Medizin-Details.
4. Live-Buchung im Lisa-Gespraech: `offer_slots`/`book_slot` (Webhooks) ->
   Cloud Functions `masSearchPatients` + `masBookAppointment` — BEIDE
   deployt (v2, europe-west3, geprueft 27.07.). ENV fuer Lisa vollstaendig.
5. Rueckmeldung: `sweepRecallOutcomes` laeuft jede Minute im Scheduler,
   `recall_status`/`lisa_call_result` liefern den Bericht; taeglicher
   Initiative-Scan 7:30/18:00 ist im Server verdrahtet.
6. Gezieltes Einbestellen: `gapfill_call_patient` mit Kalender-Vorpruefung
   (keine erfundenen Zeiten), Zwei-Schritt-Bestaetigung, Auto-Botschaft
   aus dem Outreach-Katalog, Override nur auf ausdrueckliche Ansage.

Offen (der eigentliche Rest): (a) `vk-18b` im Register gruen kriegen,
(b) EIN Ende-zu-Ende-Livetest mit dem Chef (Testliste freigeben, Lisa ruft
eine Testnummer an, Bericht kommt zurueck) — erst danach gilt C komplett
als verkaufsfertig.

## Offene Punkte zum Neubau (24/25)

- Eingangsweg Post: Hauspost kommt GESCANNT ALS E-MAIL-ANLAGE an; die lokale
  Texterkennung existiert (`backend/src/mail/ocr.js`, Vision + Tesseract,
  DSGVO-lokal). Neu sind: (a) Fristen-/Betrags-Extraktion auf dem Text,
  (b) Wiedervorlage-Mechanik mit Sprach-Quittung "erledigt",
  (c) dieselbe Extraktion ueber Telefon-Transkripte (eingehend UND Lisa).
- Anrufer wie Anwaelte/Behoerden/Rechnungssteller am Telefon muessen in
  denselben Waechter laufen wie eine Mail (EIN Waechter, EINE Liste,
  drei Quellen).
