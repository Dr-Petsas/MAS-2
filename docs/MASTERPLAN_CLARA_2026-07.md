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

## Phase 0 - Sichern (04.07.2026)

- [ ] Clara-Voice: Schnell-Gate, Commit der offenen Aenderungen, Voll-Gate, Tag `stabil-2026-07-04`
- [ ] MAS-2: Plan-Dokument committen, Tag `stabil-2026-07-04`
- [ ] pickadoc: Sicherungs-Commit der offenen Session-Reste (getrennt), Commit demo-aufklaerungen, Tag `stabil-2026-07-04`
- [ ] Git-Bundles aller drei Repos nach `C:\repo-backups\2026-07-04\` (zweites Laufwerk)
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

## Phase 1 - Vermessen & Entschlacken (Woche 1-3)

Messwerte 04.07.: `pickadoc_session_worker.py` ~10.300 Zeilen,
`server.js` ~7.100, `openai_compat_llm.py` ~2.700, `profile.json` ~1.500.

- [ ] **W1.1 Tool-Subsetting aktivieren** nach `docs/clara_tool_groups.md`
      (Core + Gruppe = 10-15 Tools pro Turn statt 57). Stabile Gruppen-Sets
      (Prefix-Cache!), 20-Tool-Cap in `_sanitize_custom_tools()` fixen.
- [ ] **W1.2 server.js in Express-Router splitten** (tools/brain/clara/qm/
      testtrain/devices) - rein mechanisch, Routen identisch.
- [ ] **W1.3 Worker zerlegen:** Session-Kern (<2.000 Zeilen) + Persona-Module;
      Booking-State-Machine ins Bianca-Modul, nicht in Claras Pfad.
- [ ] **W1.4 Kompensationen loeschen:** Intent-Umleitungen in
      `_sanitize_tool_calls()` nach aktivem Subsetting (Doc-Hinweis 5).
- [ ] **W1.5 Modell-Evaluation** erst NACH Subsetting (Prompt ~16,7k -> ~8k),
      Entscheidung anhand 118-Faelle-Suite, nicht nach Gefuehl.
- NICHT anfassen: `response_guard.py`, `daySchedule`-Filter, `holidays.js`.

## Phase 2 - Dens-Office-Anbindung (paralleler Track, extern getaktet)

- [ ] Neutrale Adapter-Schnittstelle `pvs/adapter.js` (getPatient,
      getAppointments, getChartEntries, writeDocument, writeChartEntry,
      writeBillingPositions). Dens = erster Adapter, nie die Schnittstelle.
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
- (frei)

## Aenderungslog

- 04.07.2026: Plan erstellt (Phasen 0-7 + W-LENA), beschlossen mit Chef.
