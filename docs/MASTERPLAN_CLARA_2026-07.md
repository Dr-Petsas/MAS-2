# MASTERPLAN Clara 2026-07 (verbindlich fuer alle Sessions)

Stand: 04.07.2026 - Beschluss: Dieser Plan ist Gesetz. **KEIN Abschweifen.**
Neue Ideen, Wuensche und Zurufe werden NICHT sofort gebaut, sondern kommen auf
die **Warteliste** am Ende dieses Dokuments. Ein Arbeitspaket gilt erst als
fertig, wenn seine Definition of Done erfuellt ist - erst dann beginnt das
naechste. Halbfertiges ist verboten.

Geltungsbereich: F:\MAS-2, F:\Clara-Voice, F:\pickadoc-live-base.
Jedes Repo verweist in seiner AGENTS.md auf diesen Plan.

## Eiserne Arbeitsregeln fuer JEDES Paket

1. Vor Beginn: Branch oder sauberer Stand, Release-Gate gruen.
2. Move-only-Refactorings strikt getrennt von Verhaltensaenderungen committen.
3. Neue Funktionen hinter Entitlement/Feature-Flag - der med-dent-Pilot
   laeuft unveraendert weiter, bis das Neue gruen ist.
4. **Plattform-Regel (unabdingbar):** Nichts wird nur fuer med dent gebaut.
   Jedes Paket muss die Frage bestehen: "Was passiert bei einer Augenarzt-
   oder Hausarzt-Praxis?" Fachwissen gehoert in Kataloge/Daten, nie in Code.
5. Vertragstreue: bestehende Routen/Formate nur erweitern, nie brechen.
6. Fertig = committet (deutsche Message: was + warum) + Gate gruen.

---

## Phase 0 - Sichern (04.07.2026) - ERLEDIGT 04.07.

- [x] Clara-Voice: Schnell-Gate gruen, Commit, Voll-Gate gruen (117/128, Suite-
      Soll erfuellt), Tag `stabil-2026-07-04`
- [x] MAS-2: Plan-Dokument committet, Tag `stabil-2026-07-04`
- [x] pickadoc: Commit demo-aufklaerungen (~213 PDFs, 25 Fachrichtungen) +
      AGENTS.md, Tag `stabil-2026-07-04` (fremde Session-Reste unangetastet)
- [x] Git-Bundles aller drei Repos nach `C:\repo-backups\2026-07-04\`
      (Clara-Voice 7,9 MB, MAS-2 1,4 MB, pickadoc 918 MB)
- [ ] Firestore-Export: gcloud fehlt auf der Maschine -> Warteliste

Rollback-Anker ab heute: `git checkout stabil-2026-07-04`.

## Phase W-LENA - Lena-Arbeitsplatz neu (Tier 1, beschlossen 04.07.)

Die bisherige Lena-Seite ist unbrauchbar (Befund Chef 04.07.). Neubau:

- **Links:** Kalenderpicker + Tagesliste der Termine (Patienten anwaehlbar)
- **Rechts:** Behandlungs-Doku des gewaehlten Termins/Patienten
  (Diktate chronologisch, Streichungen sichtbar nach Par. 630f, offene
  Doku-Fragen, Nachtragen)
- **Darunter: Zuleitung an Sophie** (Praezisierung Chef 04.07.): Abrechnung
  selbst macht Sophie auf ihrer Seite. Unter der Doku gibt es ein Feld, um
  abrechnungsrelevante Infos einzutippen/zu diktieren - die landen in Sophies
  Arbeitsstand, als waeren sie auf der Sophie-Seite erfasst, IMMER mit Bezug
  auf Patient, Datum und Termin.
- Datenquellen: bestehende MAS-Endpoints (Tagesplan, Doku, offene Fragen,
  Sophie-Intake) - nur lesen/erweitern, nichts umbenennen.
- DoD: Chef kann einen Tag waehlen, jeden Patienten anklicken, Doku sehen
  und Abrechnungs-Hinweise an Sophie schicken (mit Patient/Datum/Termin);
  Ampel fuer fehlende Doku; keine toten Platzhalter mehr.

**Status 04.07.: GEBAUT.** `lenaWorkspace.tsx` neu (Monats-Kalenderpicker +
Tagesliste mit Doku-Ampel links, Doku rechts, "An Sophie" darunter mit Tipp-
UND Diktat-Eingabe). MAS-2: `GET/POST /clara/sophie-hinweis` schreibt in den
bestehenden Sophie-Arbeitsstand (`mas_abrechnung_memo`, gleiche Stelle wie
Claras Diktat-Trennung) und laesst die stille Sophie-Sonde antworten
(Gegenfrage/komplett). E2E-Test `scripts/test-sophie-hinweis.mjs` gruen,
Frontend-Build gruen. Deep-Link `?ki=lena&appointmentId=` bleibt gueltig.
Offen: Abnahme durch Chef im Alltag.

## Phase W-SUCHE - MAS-Cockpit als Gedaechtnis-Suchmaschine (beschlossen 05.07.)

Das bisherige Cockpit (Rote Liste + Fristen + Freigaben + Dubletten als lange
Listenwand) ist zu kompliziert (Befund Chef 05.07.). Neubau als **Google-artige
UNIVERSAL-Suche ueber das Praxisgedaechtnis** mit DREI Trefferarten (Erweiterung
05.07. nach Befund "Sablon/flyeralarm = 0 Treffer" - Case-only reichte nicht):

- **patient** -> Karteikarte: ALLES zu einer Person (Termine/Behandlungen aus
  der Plattform-DB, Telefonate, E-Mails, Briefe, Doku, Vorgaenge)
- **case** -> Vorgang (Thread pro Person+Thema) mit Detailseite + Aktionen
- **event** -> Einzel-Ereignis, auch OHNE Vorgang (oeffnet seinen Vorgang,
  sonst eigene Detailseite)

Startseite (ohne Suchbegriff): Suchleiste + die letzten 5 Vorgaenge.

- **Backend (rein additiv):** Modul `src/brain/search.js` mit `searchBrain`
  (Cases via `listCases` + NEUESTE Ereignisse via neuem `eventStore.queryLatest`
  (ts desc; asc haette bei vollem Fenster genau die neuesten verworfen) +
  Patienten via `searchPatient`-CF) und `buildKarteikarte` (Ereignisse per
  patientId UND Namens-Tokens - findet auch unmatched Eintraege; alle
  Namens-Tokens muessen vorkommen, nie Teiltreffer fremder Patienten).
  Routen: `GET /brain/search?q&kind&status&topic&channel&assignee&limit`,
  `GET /brain/karteikarte?patientId&name`, `GET /brain/events/:id`.
  Ranking nach Feldgewicht (Name/Titel > Verlauf), Boosts offen/Frist/
  Aktualitaet; Patienten immer oben. Facetten inkl. `kind`.
  Bestehende `/brain/*`-Vertraege unveraendert.
- **Frontend:** `masCockpit.tsx` = Suchmaschine (SERP mit gemischten Treffern,
  Snippet-Highlight, Filter-Chips; Vorgangs-Detail mit Verlauf + Erledigt/
  Zuweisen; Karteikarten-Seite mit Vorgaengen, Terminen aus der Plattform-DB
  (Kalender-Paritaet: needsConfirmation/declined ausgeblendet, Lena-Doku-Link
  pro Termin) + Gedaechtnis-Verlauf; Ereignis-Detail mit Erledigt-Aktion).
  Deep-Links: `?ki=cockpit&q=&case=&patient=&pname=&event=`.
  `ClaraBrain` (`?ki=clara`) bleibt unangetastet.
- **Plattform-Regel:** fachunabhaengig - reine Gedaechtnis-Suche, kein
  med-dent-Spezialwissen im Code.
- DoD: Name/Firma/Thema eingeben -> gerankte gemischte Trefferliste mit
  Snippet; Patiententreffer oeffnet Karteikarte mit allem; Startseite zeigt
  Suchfeld + letzte 5 Cases; alte Cockpit-Funktionen (Erledigen/Freigeben)
  bleiben erreichbar; Frontend-Build + `node --check` gruen.

**Status 05.07.: FERTIG.** Live verifiziert: "flyeralarm" -> Vorgang
(Anwaltsschreiben) + Clara-Proaktiv-Ereignis; "sablon" -> 2 Patienten-
Karteikarten + 3 Vorgaenge + Ereignisse. Backend-Suite: 42/46 gruen, die
4 roten (day-schedule, doku-lernloop, mail-briefing, memo-trennung) waren
schon VOR W-SUCHE rot (identisch in mas2_test_lisa_popup/overwatch-Laeufen,
andere Baustellen).

## Phase 1 - Vermessen & Entschlacken (Woche 1-3)

Messwerte 04.07.: `pickadoc_session_worker.py` ~10.300 Zeilen,
`server.js` ~7.100, `openai_compat_llm.py` ~2.700, `profile.json` ~1.500.

- [x] **W1.1 Tool-Subsetting aktivieren** nach `docs/clara_tool_groups.md`
      (Core + Gruppe = 10-15 Tools pro Turn statt 57). Stabile Gruppen-Sets
      (Prefix-Cache!), 20-Tool-Cap in `_sanitize_custom_tools()` fixen.
      **ERLEDIGT 04.07.:** `services/tool_subsetting.py` (deterministisches
      Keyword-Routing, Satz + letzte 3 Nutzer-Zuege sticky, kein Treffer =>
      volle Liste), EINE Einhaenge-Stelle in `generate_stream()` (gilt fuer
      Worker, Spekulativ-Lauf UND Testsuite), `group`-Felder an allen 51
      custom_tools, Cap 20->200 + group/speak_result erhalten. Offline-
      Routing-Test `test_tool_subsetting.py` im Release-Gate. Messung:
      Tagesfrage ~26k -> ~9k Prompt-Tokens (9/60 Tools, Schnitt 16.7).
      Voll-Gate: 118/128 (Baseline davor: 117/128). Notaus:
      `CLARA_TOOL_SUBSETTING=0`.
- [x] **W1.2 server.js in Express-Router splitten** (tools/brain/clara/qm/
      testtrain/devices) - rein mechanisch, Routen identisch.
      **ERLEDIGT 04.07.:** server.js 7.223 -> 346 Zeilen (Middleware, Mounts,
      Scheduler). 8 Router unter `src/routes/` (misc/tools/qm/brain/mail/
      testtrain/devices/clara) + `_shared.js` (Tenant-/Mail-Scope-Helfer).
      Jede Route behaelt ihren vollen Original-Pfad, gemountet ohne Prefix
      => Matching identisch; clara zuletzt (Catch-all /clara/:clientId).
      Beweise: Routen-Inventar 236/236 identisch (`scripts/route-inventory.mjs`),
      alle Routen-Bloecke byte-identisch (nur app.->router.), Schatten-Vergleich
      alt/neu ueber 37 read-only Endpunkte gruen, npm test unveraendert
      (37/41 vorher = 37/41 nachher; die 4 roten sind LLM-Formulierungs-
      Flakes, vor dem Split genauso rot). Nach Live-Tausch: Health ready,
      Sophie-E2E gruen, Clara-Voll-Suite 119/128 (= beste Baseline).
      Tag: stabil-2026-07-04-w12.
- [x] **W1.3 Worker zerlegen:** Session-Kern (<2.000 Zeilen) + Persona-Module;
      Booking-State-Machine ins Bianca-Modul, nicht in Claras Pfad.
      **ERLEDIGT 04.07.:** `pickadoc_session_worker.py` 10.295 -> ~2.150 Zeilen
      (Session-Kern: Felder, Kommando-Dispatch, Greeting, Watchdogs,
      Transcript-Recorder, Entrypoint). 10 neue Module unter `services/`:
      Leafs `worker_config` (Env/Audio/VAD-Konstanten), `worker_speech`
      (Datum/Zahlen gesprochen), `worker_profiles` (Profil+Provider-Builder),
      `bianca_booking` (Booking-State-Helfer, 47 Funktionen), `worker_mic_utils`
      (Echo/Halluzination) + Mixins `bianca_flow` (BiancaFlowMixin, 40
      Dialog-Methoden), `worker_llm_turn` (LLM-Turn/Tool-Schleife),
      `worker_speech_out` (TTS/PCM/Barge-in/Lipsync), `worker_mic`
      (consume_mic/Spekulativ), `worker_coach`. V3Session erbt von den
      5 Mixins; alle 123 Methoden + 63 Felder unveraendert. Beweise:
      alle 327 def-/Konstanten-Bloecke byte-identisch zu HEAD (AST-Check),
      py_compile + pyflakes sauber, Voll-Suite 119/128 mit EXAKT denselben
      9 Fail-IDs wie vor dem Split. `_normalize_profile` bleibt per
      Re-Export Testsuite-Vertrag. Tag: stabil-2026-07-04-w13.
- [x] **W1.4 Kompensationen loeschen:** Intent-Umleitungen in
      `_sanitize_tool_calls()` nach aktivem Subsetting (Doc-Hinweis 5).
      **ERLEDIGT 04.07. (Ergebnis: BEHALTEN, kein Code geloescht).**
      Messung ueber drei gruene 128er-Laeufe: Guards feuern weiterhin
      (Route-Guards je ~1x/Lauf, Argument-Wachen 5-8x/Lauf). Grund: die
      Verwechslungen passieren INNERHALB einer Subsetting-Gruppe
      (read/day_briefing beide "tag", compose/approve beide "komm",
      plan/approve_absence beide "abwesenheit", search_patient=Core),
      und Freigabe-Zuege ("Ja, mach das so") matchen keine Gruppe =>
      volle Liste. Loeschen wuerde gruene Faelle rot machen und den
      Notaus (CLARA_TOOL_SUBSETTING=0) entwaffnen. Befund dokumentiert
      in docs/clara_tool_groups.md Hinweis 5. Die Schicht ist ab jetzt
      die bewusste zweite Verteidigungslinie nach dem Subsetting.
- [x] **W1.5 Modell-Evaluation** erst NACH Subsetting (Prompt ~16,7k -> ~8k),
      Entscheidung anhand 118-Faelle-Suite, nicht nach Gefuehl.
      **ERLEDIGT 04.07. (Entscheid: qwen3:4b-instruct BLEIBT).**
      128er-Suite, beide Modelle nach Subsetting bei 32k Kontext auf der
      RTX 3060 (12 GB): 4b-instruct 119/128, TTFT p50 2,25 s / Dialog-Zug-2
      0,83 s, 7,5 GB VRAM, 1 Halluzinations-Wache. qwen3:8b 111/128,
      TTFT p50 3,11 s / Zug-2 4,12 s (!), 9,8 GB VRAM, 4 Halluzinations-
      Wachen; verwechselt systematisch delegate_call/find_contact, faellt
      bei Griechisch- und Storno-Rueckfrage-Faellen ab. Groesser ist auf
      dieser Karte in ALLEN Dimensionen schlechter. Neu bewerten erst bei
      Hardware-Wechsel (mehr VRAM) oder RunPod-Pfad. Log: .run/w15_qwen8b.log.
- [~] **W1.5-NACHTRAG (04.07. abends, CHEF-ENTSCHEID): Qwen 3.6 MoE ist
      DAS Zielmodell.** O-Ton: "Vergiss das 4b oder 8b — wir haben extra
      dafuer den Server aufgestellt." pickadoc1 (RTX 5090) serviert
      `qwen3.6:35b-a3b` per vLLM ueber Tailscale (100.77.30.98:8000);
      MAS-2-FreiSprech laeuft schon darauf, Tool-Calling per Probe
      verifiziert. Der 4b/8b-Vergleich von heute Vormittag war die
      3060-Zwischenloesung und ist damit Geschichte.
      DURCHGEFUEHRT (04.07. abends):
      1. Erstlauf 131er-Suite gegen 3.6: nur 114/131 — Ursache waren ZWEI
         Alt-Bugs, keine Modellschwaeche: (a) vLLM lehnt System-Nachrichten
         nach Position 0 mit HTTP 400 ab (Ollama tolerierte das) — alle
         spaeten Nudges (Sprachspiegel, Auswahl, Leer-Retry) wurden zu
         30-ms-Leerantworten; Fix: spaete Steuer-Nachrichten reisen auf
         Nicht-Ollama-Backends als gerahmte User-Nachricht
         (`_late_system_as_user`, Override LIVEAVATAR_LLM_LATE_SYSTEM_AS_USER).
         (b) Das spanische Stopword "es" kippte deutsche Saetze ("Gab es
         etwas von ...?") in den Spanisch-Spiegel; aus dem es-Hint-Set
         entfernt.
      2. Danach 120/131 (Vollprompt) bzw. 122/131 (Compact) — 4b-Referenz
         am selben Tag: 119/128. Fehlbild des grossen Modells ist ANDERS:
         es "denkt mit" und laesst Tools weg (Sonntag-Logik verweigerte
         day_briefing/approve_recall, Rueckfragen statt compose_email).
      3. Gegenmittel: Kanon-Beispiele + Wochenend-Klarstellung im
         Clara-System-Prompt (tools/apply_profile_w15_qwen36.py) und zwei
         deterministische Kein-Tool-Waechter im Provider (day-overview-guard
         synthetisiert day_briefing bei klarer Tagesfrage, approve-guard
         synthetisiert approve_recall/approve_absence nach Vorschau +
         ausdruecklicher Freigabe). Alle vormals roten Faelle einzeln gruen;
         dlg-namensvetter-Kanon um die legitime getFreeTimeSlots-Route
         erweitert (3.6 prueft erst Verfuegbarkeit, bucht dann korrekt).
      4. Worker-.env auf 3.6 umgestellt (COMPACT=1, Rollback-Zeilen als
         Kommentar direkt darunter); Chat-Spur (W-HUMAN) laeuft ebenfalls
         auf dem 3.6. Finaler Bestaetigungslauf laeuft
         (.run/w15_qwen36_final.log) -> bei Gruen: Gate, Worker-Neustart,
         Tag. Latenz 3.6 remote: TTFT p50 1.9 s / p90 2.6 s (4b lokal auf
         der belasteten 3060: 2.25 s / 4.2 s — der Umstieg ist auch
         schneller).
- NICHT anfassen: `response_guard.py`, `daySchedule`-Filter, `holidays.js`.

## Phase 2 - Dens-Office-Anbindung (paralleler Track, extern getaktet)

**ZURUECKGESTELLT (Entscheid Chef, 04.07.2026):** Der PVS-Adapter wird
GROESSER geschnitten als nur Voice/Clara - er muss das KOMPLETTE System
bedienen (Plattform-Kalender, Lena-Doku, Sophie-Abrechnung, Briefings,
nicht nur Claras Sprach-Tools). Phase 2 wird neu geplant, wenn der
System-Schnitt steht; bis dahin laufen die anderen Phasen weiter.

- [ ] Neutrale Adapter-Schnittstelle `pvs/adapter.js` (getPatient,
      getAppointments, getChartEntries, writeDocument, writeChartEntry,
      writeBillingPositions). Dens = erster Adapter, nie die Schnittstelle.
      Schnittstelle wird SYSTEM-weit konsumiert (MAS-2-Kern), nicht aus
      dem Voice-Stack heraus.
- [ ] Kickoff-Fragen an DENS: lesbare/schreibbare Objekte? Events/Webhooks?
      Auth? Sandbox-Mandant? (Oeffentlich belegt: VDDS-MMI + DENSimport-PDF.)
- [ ] Meilensteine: M0 Sandbox + ID-Mapping (`mas_pvs_map`) -> M1 Patienten/
      Termine lesen -> M2 Stuhl-Briefing aus Dens-Daten -> M3 Doku-PDF in die
      Akte (DENSimport) -> M4 native Karteieintraege/Abrechnung falls API.
- [ ] Source-of-Truth pro Datentyp festlegen BEVOR Sync-Code entsteht.
- Alles hinter Entitlement `pvs_dens`.

## Phase 3 - Wake-Word & Audio-Hardware (Woche 2-5)

Befund Shokz OpenRun Mini: Mikros isolieren die Traeger-Stimme und
unterdruecken den Raum (by design) -> **perfekt fuer Arzt-Kanal, ungeeignet
fuer Raumaufnahme**. Bluetooth-HFP ~16 kHz mono reicht fuer STT des Traegers.
Vorteil: Clara antwortet privat ins Ohr, Haende bleiben steril.

- [~] **Stufe A (nur Shokz, keine Raummikros):** Wake-Word ("Clara") +
      Kommandos + Diktat + Briefings ueber Headset.
      SOFTWARE ERLEDIGT 04.07. - STT-BASIERT statt eigener Engine:
      Die bestehende VAD/Whisper-Pipeline laeuft weiter, aber im Standby
      dispatcht NUR, was mit dem Wake-Wort beginnt (erste 3 Tokens;
      "Klara"-STT-Variante inklusive, "Lara/Karla" bewusst NICHT).
      `services/worker_wake.py` (pure Zustandsmaschine standby/active,
      38 Unit-Checks in `testsuite/test_wake_word.py`, im Schnell-Gate),
      Gate im Mic-Dispatch VOR Transkript-Speicherung (Hygiene: verworfene
      Umgebungssaetze werden nie gespeichert/geloggt), Spekulativ-LLM +
      Partial-Barge-in im Standby nur mit Wake-Praefix, Quittungen
      ("Ja, bitte?"/"Okay."), `wake_state`-Event + Anzeige im Telefon-
      Frontend. Aktivierung PRO PROFIL: `"wake_word": {"enabled": true}`
      (default AUS - Bianca/Bestand byte-identisch; Voll-Gate SAFE 120/128).
      openWakeWord/Porcupine bleiben Option fuer Always-on-Hardware spaeter.
      OFFEN (braucht Chef vor Ort): Shokz pairen, Live-Probe im Zimmer,
      Push-to-talk-Fallback in der Pairing-App, Akku-Messung HFP.
- [~] Bohrer-/Absauggeraeusch-Samples in die Testsuite (STT-Robustheit).
      MESSRAHMEN ERLEDIGT 04.07.: `testsuite/noise_robustness.py` mischt
      Laerm in die Test-Audio-Bibliothek (SNR-Stufen 15/5/0 dB) und misst
      WER-Degradation + Hotword-Verlust. Erster Befund (synthetischer
      Turbinen-/Sauger-Laerm, 16 Clips): Parakeet bleibt p50-stabil bis
      0 dB; griechische Namen kippen unter Bohrerlaerm zuerst (8/8 ->
      5/8 Hotword-Treffer bei 0 dB). OFFEN: ECHTE Zimmer-Aufnahmen
      (Handy reicht) nach testsuite/noise/ legen - Harness nimmt sie
      dann automatisch statt der Synthese.
- [ ] Latenz-Budget messen: Wake->Zuhoeren <0,5 s, Antwortbeginn <2 s.
      (Braucht Chef vor Ort: Headset/Mikro am Zimmer-PC, echter Sprechweg.)
- [ ] **Stufe B (nur fuer Ambient, Phase 4):** EIN Zimmer bekommt ein
      Far-Field-Array (Konferenz-Klasse, USB) mit sichtbarer Aktiv-LED.
      Kein Dauerbetrieb, Aktivierung nur pro Behandlung.
- Hardware bestellen: Shokz + 1 Mikrofon-Array (Vorlaufzeit).

## Phase 4 - Ambient-Doku (Pilot ab Woche 6, nach Stufe A)

- [ ] Einwilligung ueber SignR-Formular (Katalog-Vorlage, fachneutral).
- [ ] Start/Stopp-Marken: "Clara, Behandlung dokumentieren" / "Clara, fertig".
- [ ] Audio -> STT -> strukturierter Entwurf entlang dokuPflicht-Archetypen
      -> Freigabe ueber save_treatment_dictation-Pfad + Lena-Review.
      **Roh-Audio wird NIE gespeichert.**
- [ ] Pilot: 1 Zimmer, 1 Behandler, 2 Wochen. Metrik: Nachedit-Quote.
- [ ] DSGVO-Paket: DSFA, VVT-Eintrag, Retention ueber brain/retention.

## Phase 5 - Proaktiv ohne zu nerven (Woche 3-6, baut auf Phase 1)

- [x] **ASAP-Queue serverseitig:** EINE Dringlichkeits-Schicht aus Post,
      Anrufen, Vorgaengen, Doku-Waechter, Recall. ERLEDIGT 04.07.:
      `src/clara/asapQueue.js` (buildAsapQueue + spokenAsapQueue) aggregiert
      rote Liste/Fristen (P0), Beschwerden + Ungeloestes inkl. needsIdentity
      mit dringlichem Signal (P1), Rueckrufe/Kollegen + wartende Freigaben
      (Mail-Entwuerfe, Recall-Listen) + Doku-Luecken (P2), Restzaehler (P3).
      Jede Quelle best-effort, Dedupe ueber eventId, keine Euro-Zahlen.
      Endpoint POST `/tools/asap-queue`; Clara-Tool `asap_briefing`
      (Gruppe "tag", Keywords brennt/dringend/eilt/liegen bleiben).
      Test: `scripts/test-asap-queue.mjs` (isolierter Mandant, 13 Checks).
- [x] **Unterbrechungs-Politik** (Konfig pro Mandant + Rolle):
      P0 sofort (Risiko/Notfall), P1 naechste Kalender-Luecke (der Kalender
      ist der Taktgeber!), P2 naechstes Briefing, P3 nur UI.
      Tagesbudget fuer Spontan-Ansagen (Start: max. 3), Stumm waehrend
      laufender Behandlung ausser zum aktuellen Patienten, Snooze lernt
      (recall_snooze-Muster verallgemeinern).
      ERLEDIGT 04.07.: `src/clara/interruptPolicy.js` (decideDelivery pur +
      runProaktivSweep), Scheduler in server.js (alle 5 Min, Not-Aus
      MAS_PROAKTIV=0 bzw. mas_config/proaktiv.enabled=false).
      Schutzregeln: BASELINE beim ersten Lauf (Altbestand wird markiert,
      NICHT gemeldet), max. 1 P0-Anruf/Tag (weitere P0 als Push), max.
      1 P1-Push pro Sweep, Tagesbudget 3, Ruhezeiten 20-7 (P0 ausgenommen),
      announced-Dedupe (nie doppelt), stumm bei laufender Behandlung ausser
      zum Patienten im Stuhl. Snooze: `/tools/proaktiv-snooze` + Clara-Tool
      `proaktiv_snooze` (2x am Tag = Rest des Tages nur P0).
      Tests: `scripts/test-interrupt-policy.mjs` (20 Checks, gruen);
      Katalogfall snooze-01 gruen gegen echtes LLM.
- [x] **Clara Overwatch — Besuchsgrund-Waechter (Auftrag Chef 05.07.):**
      Passt die DOKUMENTIERTE/ABGERECHNETE Behandlung nicht zum gebuchten
      Besuchsgrund (Kons-Besprechung gebucht, Implantat gesetzt), korrigiert
      Clara den Besuchsgrund des Termins — auch rueckwirkend ("behandelt") —
      damit der Patient im RICHTIGEN Recall-Bucket landet (Plattform rechnet
      Buckets ueber visitMotive.id, Nachtlauf 03:00 zieht die Korrektur nach).
      ERLEDIGT 05.07.: `src/clara/motiveOverwatch.js`.
      Entscheide: EIN Termin, EIN dominanter Besuchsgrund (kein Splitting,
      keine Doppel-Buckets); Dominanz ueber klinische PRIORITAETSLEITER
      (Implantation/OP 4 > Extraktion/Endo/PAR/Krone 3 > Fuellung/PZR 2 >
      Kontrolle 1 > Besprechung 0), NIE ueber Umsatz. Auto-Korrektur nur
      nach oben (>= Stufe 3, oder Stufe 2 wenn Besprechung gebucht);
      Kontrolle+kleine Behandlung -> nur Hinweis (Kontroll-Recall bleibt);
      Downgrades nie. Erkennung deterministisch satzweise mit Zukunfts-/
      Besprechungs-Wachen ("geplant"/"besprochen" zaehlt nicht als Tat);
      zweite Quelle: Sophie-Strecken-Label bei status complete.
      Eingehaengt: save-treatment-dictation (nach Doku-Check/Sonde) +
      bill-treatment (nach complete); Sweep-Endpoint POST
      `/tools/motive-overwatch` (days, dryRun). Sekundaerbehandlungen als
      Metadaten am Termin (motiveOverwatch.detected), Audit als Brain-Event
      (motive-overwatch:<apptId>:<motiveId>, idempotent) + gesprochene
      Bestaetigung. Ziel-Motiv: voller visitMotives-Katalog des Standorts
      (132 Motive beim Demo-Client; booking.visitMotives ist nur die
      buchbare Teilmenge OHNE OP-Motive) + Namens-Klassifikation
      (Beratungs-Motive nie OP-Ziel), bei mehreren Kandidaten Dauer-Naehe
      ("klein"/"gross"), Override mas_config/motive_overwatch.mapping.
      Notaus: MAS_MOTIVE_OVERWATCH=0 bzw. mas_config enabled=false; Modus
      "vorschlag" schreibt nur Metadaten.
      Tests: `scripts/test-motive-overwatch.mjs` (38 Checks, gruen, Teil
      von npm test) + `scripts/e2e-motive-overwatch.mjs` (manuell, echter
      Termin mit Rollback — 05.07. gruen: KFO-Kontrolle + Implantat-Diktat
      -> "IMP Implantation OP klein", Audit + Brain-Event, zweites Diktat
      ohne erneute Ansage).
      OFFEN (Warteliste): Tagesend-Liste der "hinweisen"-Faelle ans
      Chef-Handy (heute: gesprochener Hinweis direkt beim Diktat).
- [ ] **Entity-Linking:** Anruf -> Patient -> Vorgang (Abnahmefall:
      Kollegenanruf "Dr. Koenig wegen Patient Mayer"). Rolling Summary pro
      Vorgang ueber Bianca -> Case -> Lisa.
- [ ] **ROI-Zaehler direkt einbauen:** gefuellte Luecken, geschlossene Doku,
      gesparte Minuten - pro Mandant, Anzeige im Cockpit (NIE gesprochen,
      Euro-Regel bleibt).

## Phase 6 - Team & Rollen, Gedaechtnis-Hygiene (Woche 4-8)

- [ ] **Harte RBAC:** Rollen-Matrix (Admin / Behandler / Praxismanagement /
      Rezeption) x Tool-Whitelist. Rolle waehlt Tool-Gruppen aus W1.1
      (Rezeption = kleines Set = schneller Prompt). Kritische Aktionen
      (set_doku_rule, approve_absence, team_betriebsferien, approve_and_send)
      nur fuer definierte Rollen, alles auditiert. An PIN-Identify andocken.
- [ ] **Gedaechtnis-Hygiene (harte Regel):** Ins Praxisgedaechtnis gelangen
      NUR (a) tool-bestaetigte Ereignisse und (b) explizite Kommandos
      ("Team-Memo: ..."). Kein freies Transkript wird zu Gedaechtnis.
      Clara hoert nur nach Wake-Word/Push-to-talk, mit sichtbarer Anzeige.
      Keine Mikros ausserhalb der Behandlungszimmer.
- [ ] **Gegen Ueberwachungsgefuehl (Produktgarantien):** keine Auswertungen
      pro Mitarbeiterin (bewusst nicht gebaut), Transparenz-Seite in
      MAS-Settings ("Was Clara speichert - und was nicht"), schriftliche
      Team-Info (Par. 26 BDSG / Art. 13 DSGVO), Roh-Audio-Verzicht.
- [ ] Rezeptions-Flows: die 10 haeufigsten Front-Desk-Aufgaben per Sprache.

## Phase 7 - Plattform-Haertung "jede Praxis" (laeuft quer, ab Woche 1)

- [x] `specialtyKeyForClient()` an echte Client-Daten koppeln statt Hardcode
      "zahnmedizin". ERLEDIGT 04.07.: async + 10-Min-Cache; Aufloesung
      1. `mas_config/doku.specialtyKey` (expliziter Override pro Mandant),
      2. `clients/{id}/locations/{loc}/specialities` (Onboarding-Daten,
      kleinste cardinality = Haupt-Fachrichtung, erster Key mit Katalog),
      3. Zahn-Namens-Heuristik fuer Altbestand, 4. Fallback zahnmedizin.
      Nie werfend. Alle 4 Aufrufer in routes/tools.js auf await umgestellt.
      MedDent verifiziert (15 Specialities ohne specialtyKey -> Heuristik
      greift -> zahnmedizin). MAS-Suite: gleiche 3 Vorbestands-Fails wie
      Baseline (day-schedule, mail-briefing, memo-trennung LLM-flaky),
      nichts Neues rot. Clara-Schnell-Gate gruen, Backend neu gestartet.
- [ ] Profil-Split: `clara_base` + Mandanten-Overlay (Muster:
      campaign_overlay.py). Prompt-Beispiele aus visit_motives generieren.
- [~] **Zweiter synthetischer Test-Mandant** (Hausarzt oder Augenarzt) in der
      Testsuite. Jedes Feature muss auf BEIDEN Mandanten gruen sein,
      sonst kein Merge. Das ist der Durchsetzungs-Mechanismus.
      TEIL 1 ERLEDIGT 04.07.: `scripts/test-specialty-resolver.mjs` laeuft
      in der npm-Suite gegen synthetischen Hausarzt-Mandanten
      (zzz-mas2-specialty): Override/Provisionierung/cardinality/Cache/
      Heuristik + getrennte Fachkataloge (Check-up trifft nur im
      Hausarzt-Katalog). OFFEN: weitere Features (Doku-Check, Briefings)
      systematisch auf dem Zweit-Mandanten fahren.
- [ ] Flotten-Monitoring: Health-Telemetrie + Alarm pro Mandant
      (Lehre aus dem 16.06.-Vorfall).

## Phase W-HUMAN - Lebendige Gespraeche (beschlossen 04.07. nachmittags, Chef)

**Auftrag:** "Jedes Gespraech ist extrem steif — ich will lebendige
Gespraeche. Oberste Prioritaet bleibt: harte Fakten, nichts halluziniert.
Nur Ausdrucksweise und abschweifende Smalltalk-Themen freier. Empathie,
Sarkasmus, Ironie — in Massen." Leitprinzip wie FreiSprech:
**Persoenlichkeit aus sicheren Schichten, Fakten nur aus Tools.**

Bestandsaufnahme (was es schon gab): Humorschicht Abwesenheiten
(`absencePlanner` ABSENCE_QUIPS), `humor.js` (rote Ampel, Bewertungen,
Anrufliste), FreiSprech (Briefings, Fakten-Guard), Bianca-Smalltalk —
aber Clara (assistant_mode: internal) hatte NICHTS davon: jeder Satz ging
mit Tool-Pflicht ans LLM, daher das steife "nicht verstanden".

- [x] **Interne Smalltalk-Schicht** `services/worker_human.py` (HumanMixin,
      vor dem LLM-Turn, nur interner Modus): Dank, Befinden, Identitaet,
      Uhrzeit/Datum (echte Uhr), Wetter, Witz, Kompliment, Saison-Gruss,
      Frust->Empathie (+Hilfsangebot), Faehigkeiten, Wiederholen (letzte
      Antwort). Deterministische Pools, nie zweimal dieselbe Zeile
      (Muster absencePlanner). Not-Aus: CLARA_HUMAN_LAYER=0.
- [x] **Sicherheits-Reihenfolge:** Ops gewinnt IMMER — matcht der Satz eine
      Tool-Gruppe (W1.1-Muster) oder eine Personen-Anrede (Herr/Frau/Dr. X),
      laeuft er unveraendert ans LLM+Tools. Ja/Nein/Okay wird NIE geschluckt
      (gehoert laufenden Rueckfragen). Unit-Test erzwingt: KEIN Fall des
      131er-Katalogs landet in der Schicht (`testsuite/test_human_layer.py`).
- [~] **Chat-Spur** fuer erkennbar persoenliche Saetze ("Was haeltst du
      von...", "Mir ist langweilig"): Mini-LLM-Call mit eigenem kleinen
      Persona-Prompt (warm, Augenzwinkern, Selbstironie), OHNE Tools und
      OHNE Praxisdaten im Kontext (kann nichts Echtes verraten). Nach-Guard
      verwirft Ziffern + Erledigt-/Gebucht-Behauptungen -> ehrliche
      Ausweich-Zeile. OFFEN: auf Qwen 3.6 (pickadoc1) schalten — das 4b
      plaudert hoelzern (Test 16:41: bot ungefragt "Beratungstermin" an).
- [ ] Voll-Suite + Release-Gate gruen, Worker-Neustart, Tag.
- [ ] **Bewertung Intent-Schicht (Auftrag Chef):** Zwei-Stufen-Architektur
      "flexibel verstehen, strikt handeln" ist RICHTIG, aber das
      Verstehens-Problem ist ein EIGENES Paket (Eingabe-Robustheit), nicht
      der Hebel fuer "steif": W1.1-Subsetting ist bereits die halbe
      Intent-Schicht (deterministisches Keyword-Routing). Der volle
      Resolver (R0 Regex -> R1 Keywords -> R2 Mini-LLM-JSON + Fast-Path +
      Clarify statt Leer-Turn) steht als Folgepaket W-INTENT auf der
      Warteliste — erst W-HUMAN abschliessen und messen.

## Phase W-OUTREACH - Recall mit Substanz (beschlossen 05.07. frueh, Chef)

**Auftrag:** "Man kann nicht ohne Grund anrufen und sagen der Doktor hat Luft.
Lisa muss erkennen: Bucket PZR -> die waren lange nicht bei der Reinigung, also
biete ich Kontroll- und Reinigungstermine an. Fuer JEDEN Besuchsgrund, JEDE
Fachrichtung (Zahnarzt, Orthopaede, Gynaekologe). KEIN Arzt will sich mit den
Inhalten auseinandersetzen - es muss von alleine perfekt funktionieren. Es geht
um GELD und REPUTATION."

**Architektur-Entscheid:** Inhalte werden EINMAL zentral produziert (Ableitung
aus den 26 gepruefteten Onboarding-Fachkatalogen `landingpages-catalog/`),
NIE pro Praxis, KEINE Laufzeit-LLM-Kreativitaet Richtung Patient. Aufloesung
pro Anruf/SMS: Kampagnen-Override (`cfg.phoneKi.prompt`) > Katalog-Eintrag
(exakt/fuzzy per Motivname) > kanonische Klasse (Vorsorge/Reinigung/Nachsorge/
Kontrolle/Beratung/Behandlung) > generischer sicherer Fallback. Jede Stufe
sicher, hoehere Stufen nur spezifischer. Sicherheitsregeln (keine Diagnosen,
keine Preise, kein Druck, ein Angebot + eine Alternative, Nein akzeptieren,
Rueckruf statt Medizinauskunft) stehen IM Rahmen, nie in der Vorlage.

- [x] **Outreach-Katalog-Build:** `scripts/build-outreach-catalog.mjs` liest
      die 26 Fachkataloge, extrahiert pro Besuchsgrund purpose/purposeShort/
      consequence aus den redaktionell gepruefeten Landingpage-Texten
      (Du->Sie-Normalisierung, HTML-Strip, Laengen-Caps, Qualitaets-Guards),
      schreibt `backend/src/clara/outreach-catalog.json` (MAS, in Git) und
      `docgendaweb/public/outreach-catalog.de.json` (CampaignR, lazy fetch).
- [x] **Aufloesungs-Modul** `src/clara/outreachTemplates.js`: Kaskade s. o.,
      matchLevel exact/fuzzy/class/generic wird auditiert; Komposition
      Anruf-Instruktion (<=1550, Sicherheitsregeln fix) + Recall-SMS (<=440).
- [x] **Verdrahtung MAS-Pfad:** `recallCoach.executeCallList` (Anruf + SMS)
      und SMS-Fallback im Sweep nutzen die Vorlagen; Kampagnen-`phonePrompt`
      (bisher toter Draht) hat Vorrang. `gapfill_call_patient` fuellt die
      Chef-Botschaft aus der Vorlage vor, wenn keine diktiert wurde
      (Bestaetigungs-Readback bleibt Pflicht). Lisa-Clip 800 -> 1600.
- [x] **Beschwerde-Waechter im Sweep:** "nicht mehr anrufen"/Beschwerde im
      Transkript -> outcome complaint, KEIN SMS-Fallback, ALERT-Note am
      Vorgang + Brain-Event (complaintStated/needsHuman -> ASAP P1).
- [x] **CampaignR-Vorbelegung:** Kampagnen-Seite laedt den Katalog (public
      Asset), belegt E-Mail/SMS/Telefon-Prompt beim ersten Laden und ueber
      "Texte vorschlagen" motivspezifisch vor (Herkunftshinweis am Feld);
      Cloud Function `buildCampaignTaskPrompt` nutzt cfg.phoneKi.prompt
      bereits -> Pfad 1 automatisch versorgt, KEIN Functions-Deploy noetig.
- [x] Tests: `scripts/test-outreach.mjs` (pur, ohne Firestore) in der
      npm-Suite; node --check; Clara-Schnell-Gate.
- Warteliste (bewusst NICHT jetzt): E-Mail-Kanal im Lueckenfueller (via
  Nadine) + Vorlaufzeit-Kaskade; persistente Opt-out-Sperrliste; blueprintId
  am Plattform-VisitMotive; Erst-N-Transkript-Review-UI im Monitor.

**FERTIG 05.07.2026:** Alle Punkte gebaut, 44 Outreach-Checks + Demo-Playbook
(dryRun) gruen, Clara-Schnell-Gate gruen. Commits: MAS-2 `aa9c216`,
pickadoc-live-base `97e0d4f6`. Nebenfund behoben: `backend/src/data/qm/*.json`
(QM-Katalog) war durch `data/`-Ignore NIE in Git — wiederhergestellt und
`.gitignore`-Ausnahme fuer `backend/src/data/` gesetzt.

## Phase W-OUTREACH-2 - Lisa bucht LIVE im Gespraech (Auftrag Chef 05.07.)

**Auftrag (woertlich):** "Der Patient muss einen Alternativtermin angeboten
bekommen — jeder, der auf den freien Spot angerufen wird, darf einen
Alternativtermin buchen. ES WERDEN KEINE TERMINWUENSCHE VERNEINT. Kein
Rueckruf, keine Mehrarbeit: der Patient muss sofort buchbare Alternativen
bekommen. Lisa braucht Zugriff auf den Terminkalender."

**Architektur:** Lisa (ElevenLabs-Agent) bekommt zwei Webhook-Tools, die auf
MAS-2 zeigen (`/lisa/tools/offer-slots`, `/lisa/tools/book-slot`; eigener
Secret-Header, timing-safe). `task_id`/`client_id` kommen als Dynamic
Variables aus `lisaStartCall` — nie vom LLM. Autoritaet ist der Lisa-Task
(`bookingContext`: Patient, Besuchsgrund, Kalender, Slot); OHNE Kontext
buchen die Tools nichts. Slots kommen aus `getFreeTimeSlots` (dieselbe CF wie
das Buchungs-Widget), Buchung ueber `masBookAppointment` (prueft Verfuegbarkeit
serverseitig -> Doppelbuchung unmoeglich). Ist der Slot im Wettlauf gerade
vergeben, liefert book_slot IM SELBEN ZUG neue Alternativen — Lisa bietet sie
sofort an. Tunnel-URL wechselt: Boot-Sync (`syncLisaAgentTools`) haelt die
Tool-URLs am Agenten aktuell.

- [x] `src/lisa/callBooking.js`: Wunsch-Parser ("Donnerstag nachmittags",
      "naechste Woche vormittags", "um 15 Uhr", "14.07."), Slot-Auswahl
      (nie leere Haende: passt nichts zum Wunsch -> naechste freie Termine,
      ehrlich markiert), Sprech-Formate, Live-Buchung mit Halluzinations-
      Wache (erfundene Zeiten werden gegen den echten Kalender geprueft).
- [x] `src/routes/lisaTools.js` + auth.js public + server.js-Mount (vor
      clara-Catch-all) + Boot-Sync; `scripts/setup-lisa-agent-tools.mjs`
      legt die Tools idempotent an (LISA_TOOL_SECRET in .env erzeugt,
      Tools bei ElevenLabs angelegt + am Agenten verdrahtet).
- [x] Instruktionen: `composeRecallCallInstruction`/`composeInviteInstruction`
      mit liveBooking-Variante ("buche SOFORT mit book_slot", "kein
      Terminwunsch wird abgelehnt", erst nach Werkzeug-Bestaetigung fest
      zusagen); Fallback ohne Werkzeuge verspricht nichts Festes mehr
      ("Praxis ruft mit Vorschlaegen zurueck" statt Reservierungs-Zusage).
      Limits: CALL_INSTRUCTION_LIMIT 1550->2100, Lisa-Clip 1600->2200.
- [x] Sweep-Nachlauf (Luecke im alten Ablauf): Ergebnisse werden auch NACH
      resolved weiter ausgewertet (vorher verpuffte eine Zusage, wenn ein
      frueherer Anruf schon gebucht hatte). Tool-Buchungen (bookedSlotIso am
      Task) schlagen die Transkript-Deutung. NEU outcome wants_other_time
      (Terminwunsch != Absage) mit dringlicher Note + needsHuman-Event.
      SMS-Fallback nur noch, solange der Slot nicht vergeben ist.
- [x] Tests: `scripts/test-lisa-live-booking.mjs` (38 pure Checks) +
      `scripts/smoke-lisa-tools.mjs` (Endpunkte live: Secret-Gate,
      No-Context-Gate, echte Slots, Halluzinations-Wache) + test-outreach
      angepasst; node --check alle Dateien.

**Bewusst so gelassen:** SMS-Pfad unveraendert (Patient ruft Praxis an);
Kandidaten-Limit 8 parallel bleibt — durch Live-Buchung ist der Wettlauf
jetzt fair (wer zuerst zusagt, bucht; alle anderen bekommen sofort
Alternativen). Kein Terminwunsch wird verneint.

## Reihenfolge

1. Phase 0 (sofort) -> parallel Dens-Kickoff-Fragen raus + Hardware bestellen
2. W-LENA (Tier 1, direkt nach Phase 0)
3. Phase 1 (Woche 1-3) - Schluessel fuer Latenz, Rollen, Plattform
4. Phase 3 Stufe A ab Woche 2, Phase 5 ab Woche 3, Phase 6 ab Woche 4
5. Phase 4 ab Woche 6 (nach Stufe A), Phase 2 nach externem Takt
6. Phase 7 als Gate quer durch alles

---

## WARTELISTE (hier landet ALLES Neue - nichts davon wird sofort gebaut)

Regel: Neue Idee/Wunsch -> Eintrag mit Datum + 1 Satz. Bewertung erst, wenn
das laufende Arbeitspaket fertig ist. Kein Eintrag = wird nicht gebaut.

- 04.07.2026: Firestore-Export als Datensicherung einrichten (gcloud fehlt
  auf der Maschine; Code-Sicherung besteht, Daten-Backup noch offen).
- 05.07.2026: W-OUTREACH-Folgen: E-Mail-Kanal im Lueckenfueller (Nadine) mit
  Vorlaufzeit-Kaskade (>=5 Tage: E-Mail zuerst, dann SMS, dann Anruf).
- 05.07.2026: Persistente Opt-out-Sperrliste (mas_config/outreach_optout),
  gespeist aus Beschwerde-Waechter; Plattform-Feld smsAllowed nachziehen.
- 05.07.2026: blueprintId am Plattform-VisitMotive mitschreiben (Onboarding +
  Motiv-Anlage), damit Outreach-Matching ohne Namens-Fuzzy auskommt.
- 05.07.2026: Erst-Anruf-Kontrolle im Monitor: erste N Transkripte einer
  neuen Kampagne als Review-Karte, Auto-Pause bei Auffaelligkeit.
- 04.07.2026: W-INTENT — volle Zwei-Stufen-Intent-Schicht (Resolver R0-R2,
  Fast-Path, Clarify-Pfad, Transcript-Repair, Guards fragen statt strippen).
  Skizze liegt im Chat vom 04.07.; bauen erst nach W-HUMAN-Abschluss.
- 04.07.2026: Alte Lena-Dashboard-Funktion "Naechste 7 Tage - fehlende
  Pflicht-Dokumente je Termin" beim Neubau bewusst nicht uebernommen (war Teil
  der verworrenen Seite). Wenn gewuenscht: als eigene Karte im neuen Layout
  oder bei Julia/Vorbereitung wieder andocken.
- 05.07.2026: iPad als feste "Zimmer-Konsole" fuer Aufnahmen (einmal per
  MAS-Geraete-Pairing koppeln, dann dauerhaft Raum-Ansicht mit Start/Pause/
  Stopp je laufendem Termin). Grundlage existiert: treatment/recorder-Dokument
  + RecordingControls; fehlt nur eine schlanke iPad-Oberflaeche. QR je Termin
  (Handy-Diktat) bleibt daneben bestehen.
- (frei)

## Aenderungslog

- 04.07.2026: Plan erstellt (Phasen 0-7 + W-LENA), beschlossen mit Chef.
- 04.07.2026: Phase 0 abgeschlossen (Commits, Tags, Voll-Gate, Bundles).
- 04.07.2026: W-LENA gebaut und getestet (siehe Status im Abschnitt W-LENA).
- 04.07.2026: W1.1 Tool-Subsetting aktiv (118/128 im Voll-Gate, vorher 117;
  Prompt bei Tagesfragen ~26k -> ~9k Tokens). Notaus CLARA_TOOL_SUBSETTING=0.
- 04.07.2026: Phase 5 ASAP-Queue serverseitig fertig (asapQueue.js,
  /tools/asap-queue, Clara-Tool asap_briefing). Suite jetzt 130 Faelle:
  120/130, beide asap-Faelle gruen, Fail-Familie identisch zur 128er-Basis
  (abs-03, memo-04, balla, storno, 4 Dialoge). Worker neu gestartet.
- 04.07.2026 (abends): Phase 5 Unterbrechungs-Politik fertig
  (interruptPolicy.js, Scheduler, /tools/proaktiv-snooze, Tool
  proaktiv_snooze, Baseline-Schutz, 20 Checks gruen). Suite 131 Faelle.
- 04.07.2026 (abends): W-HUMAN begonnen (worker_human.py: Smalltalk-Pools +
  Chat-Spur; Unit-Tests gruen, Katalog-Sicherheitscheck bestanden).
  Klarstellung Modelle: Worker-Routing lokal qwen3:4b-instruct; Qwen 3.6
  MoE (pickadoc1, vLLM) bisher NUR FreiSprech — W1.5-Nachtrag: 128er-Suite
  laeuft als Messung gegen das 3.6, Chat-Spur wird darauf umgestellt.
- 05.07.2026: W-LENA Aufnahme-Steuerung fertig: zentrales
  treatment/recorder-Dokument (Status/Kommando/Heartbeat), gemeinsame
  RecordingControls (Start/Pause/Beenden, Timer, Fernsteuerung, QR) auf
  Lena-Seite + Behandlungstab; "Aufnahme starten"-Button auf der
  Popup-Hauptseite springt in den Behandlungstab und startet sofort.
  TS-Projektpruefung gruen.
- 05.07.2026: Sprech-Variation gegen "Schema F": vary() in speech.js
  (Anti-Wiederholung, 10 dokumentierte Stil-Ansaetze); Anamnese-Ansage,
  Naechste-Patienten-Briefing und daySchedule-Sprechtexte (Historie,
  Patiententermine, freier Slot) auf Varianten-Pools (je ~5-11) umgestellt.
  Clara-Gate gruen.
- 05.07.2026: Sablon-Seed bereinigt: Demo-Anamnese-Antworten aus dem echten
  Bogen entfernt (unseed-Skript), seed-anamnese-sablon.mjs geloescht —
  keine erfundenen Befunde mehr in Patientendaten.
- 05.07.2026: Sophie Implantat-PLANUNG umgebaut (billingTestPage):
  (1) Roentgen-Konflikte (OPG+Zahnfilm) werden ueber die neue rechtfertigende
  Indikation je Aufnahme (Dropdown, roentgenIndikation.ts, vorbelegt) geloest —
  der Konfliktloeser streicht NIE mehr ein Bild (auch nicht sitzungs-
  uebergreifend); (2) Planungs-Screen komplett OHNE Preise, 2 Spalten:
  links Plan (klickbare Leistungen, +-Symbol an jedem Block/Schritt,
  Implantatsystem-/Material-Auswahl ohne Preise, Indikations-Dropdowns),
  rechts ALLE verbindbaren Leistungen zur angeklickten Ziffer (Trivialname +
  Ziffer), IGeL-Ideen, Katalog-Suche; Slider zeigt "naechste Stufe" als Chips;
  (3) Implantat-Strecke erweitert: 9003/9005 (Schablonen + Labor-Auslage),
  9020, 9060, 9130, 9160, 9170, IGeL (praeop. PZR 1040, Lachgas A9030);
  neue amtliche Regeln (9050-9010, 9100-9130, 9110-9120/9130, 9003-9005);
  (4) Abrechnungs-Schritt ohne Schieberegler — Faktor 2,3/3,5/frei bleibt,
  Positionen nachtragen per Suche, entfernen per Haekchen. TS-Check gruen.
