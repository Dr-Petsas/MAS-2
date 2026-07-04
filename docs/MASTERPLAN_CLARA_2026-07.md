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
- [ ] **W1.5 Modell-Evaluation** erst NACH Subsetting (Prompt ~16,7k -> ~8k),
      Entscheidung anhand 118-Faelle-Suite, nicht nach Gefuehl.
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

- [ ] **Stufe A (nur Shokz, keine Raummikros):** Wake-Word ("Clara") +
      Kommandos + Diktat + Briefings ueber Headset. Engine lokal:
      openWakeWord ODER Picovoice Porcupine (Custom-Keyword). Parallel
      Push-to-talk in der Pairing-App (HFP-Dauerbetrieb zieht Akku - messen).
- [ ] Bohrer-/Absauggeraeusch-Samples in die Testsuite (STT-Robustheit).
- [ ] Latenz-Budget messen: Wake->Zuhoeren <0,5 s, Antwortbeginn <2 s.
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

- [ ] **ASAP-Queue serverseitig:** EINE Dringlichkeits-Schicht aus Post,
      Anrufen, Vorgaengen, Doku-Waechter, Recall.
- [ ] **Unterbrechungs-Politik** (Konfig pro Mandant + Rolle):
      P0 sofort (Risiko/Notfall), P1 naechste Kalender-Luecke (der Kalender
      ist der Taktgeber!), P2 naechstes Briefing, P3 nur UI.
      Tagesbudget fuer Spontan-Ansagen (Start: max. 3), Stumm waehrend
      laufender Behandlung ausser zum aktuellen Patienten, Snooze lernt
      (recall_snooze-Muster verallgemeinern).
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

- [ ] `specialtyKeyForClient()` (dokuPflicht.js:600) an echte Client-Daten
      koppeln statt Hardcode "zahnmedizin".
- [ ] Profil-Split: `clara_base` + Mandanten-Overlay (Muster:
      campaign_overlay.py). Prompt-Beispiele aus visit_motives generieren.
- [ ] **Zweiter synthetischer Test-Mandant** (Hausarzt oder Augenarzt) in der
      Testsuite. Jedes Feature muss auf BEIDEN Mandanten gruen sein,
      sonst kein Merge. Das ist der Durchsetzungs-Mechanismus.
- [ ] Flotten-Monitoring: Health-Telemetrie + Alarm pro Mandant
      (Lehre aus dem 16.06.-Vorfall).

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
- 04.07.2026: Alte Lena-Dashboard-Funktion "Naechste 7 Tage - fehlende
  Pflicht-Dokumente je Termin" beim Neubau bewusst nicht uebernommen (war Teil
  der verworrenen Seite). Wenn gewuenscht: als eigene Karte im neuen Layout
  oder bei Julia/Vorbereitung wieder andocken.
- (frei)

## Aenderungslog

- 04.07.2026: Plan erstellt (Phasen 0-7 + W-LENA), beschlossen mit Chef.
- 04.07.2026: Phase 0 abgeschlossen (Commits, Tags, Voll-Gate, Bundles).
- 04.07.2026: W-LENA gebaut und getestet (siehe Status im Abschnitt W-LENA).
- 04.07.2026: W1.1 Tool-Subsetting aktiv (118/128 im Voll-Gate, vorher 117;
  Prompt bei Tagesfragen ~26k -> ~9k Tokens). Notaus CLARA_TOOL_SUBSETTING=0.
