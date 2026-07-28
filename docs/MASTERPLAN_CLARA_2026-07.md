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

**Nachschliff 05.07. (Befund Chef: Player/QR zu gross, doppelter Header):**

- Doppelter Header weg: Seiten-Banner in `lenaWorkspace.tsx` geloescht, die
  MAS-Kopfzeile (claraPage) reicht.
- Player + QR raus aus der Doku-Spalte: `RecordingControls` hat jetzt einen
  `slim`-Modus — EINE Zeile oben rechts im Patienten-Kopf (Mini-Transport
  Zurueck/Stop/REC/Vor + Timer) plus "iPad koppeln"-Knopf mit LED
  (gruen pulsierend = gekoppeltes Geraet sendet Heartbeat, rot = keins).
  QR nur noch als Popover hinter dem Knopf. Diktatfeld + Analyse bekommen
  den frei gewordenen Platz (Eintragsliste bis 52vh).
- iPad-Seite (`/dictate/...`, dictationPage.tsx) neu als Zimmer-Konsole:
  Playersteuerung (REC/Pause/Stop, Timer, geteilter treatment/recorder-
  Zustand inkl. Fernsteuerung von/zur Praxis) + Diktat als DIALOG —
  Patient LINKS (blau), Doktor RECHTS (magenta), grosser Sprecher-Umschalter;
  Patienten-Passagen werden mit "Patient:"-Praefix gespeichert (Karteikarte
  behaelt die Zuordnung), Segmente aller Geraete laufen live ein.
- MAS-2 additiv: `POST /treatment/heartbeat` (Presence -> treatment/companion
  + Termin-Metadaten + recorder + Segmente zurueck) und `POST
  /treatment/recorder` (Zustand schreiben) — public wie
  submitTreatmentDictation (QR-Link = Ticket), Live-Test gruen
  (Heartbeat/Set/404/Bad-Ids), `npm test`-Failliste identisch zur Basis
  (4 bekannte Altfaelle). Frontend-Build gruen.

### W-LENA Neubau - "Meisterstueck" (beschlossen 11.07.2026, Chef)

**Auftrag (woertlich):** "Das muss ein Meisterstueck werden. Das Wichtigste ist
perfekte Transkription und perfektes Abrechnungsziffern-Matching - daran misst
sich unser Erfolg: Gimmick oder Personalersatz (unser klares Ziel)."

Lena wird zur Ambient-Behandlungsdoku ausgebaut: Arzt-Patient-Gespraech
aufzeichnen + transkribieren, Smalltalk (nur fuer die Anzeige) filtern, in
farbcodierte Abschnitte gliedern, daraus HALLUZINATIONSFREI Abrechnungs-
Absichten fuer Sophie ableiten. Aktivierung per Rechtsklick (Kalender),
Termin-Popup UND - wichtigste Funktion - per Sprachbefehl an Clara. **Clara
selbst (Wake/Sleep, Fakten-Waechter, Briefings) bleibt unangetastet.**

Leitplanken (unverhandelbar):
- **Nie Patient raten:** die Patientenbindung kommt IMMER aus dem echten
  Kalender (offener Termin > genannter Name > aktueller Stuhl-Patient), mit
  Bestaetigung/Readback und Korrekturschleife ("Nein, Herr Meier").
- **Keine Codes aus dem LLM:** das Modell extrahiert nur Konzept+Attribute aus
  dem Transkript; Sophie expandiert deterministisch ueber `billing-catalog/*`
  zu BEMA/BEMA-PLUS/GOZ. BEMA-PLUS = GKV + abdingbare Wahlleistungen (Flag
  "Vereinbarung erforderlich").
- **Keine Freitext-Eingabe:** Korrektur nur per Sprache / Auto-Vorschlag /
  Auswahl aus Hypothesen; jede Aenderung wird markiert (§ 630f BGB).
- **Plattform-Regel:** Fachwissen in Kataloge/Daten, nicht in Code
  (Augenarzt/Hausarzt muss ebenso funktionieren).

Arbeitspakete (jedes FERTIG bevor das naechste beginnt):

- [x] **W-LENA-1 Fundament: Sprachbefehl + Patientenbindung (11.07.).**
      "Clara, starte/beende die Aufnahme" steuert Lena, NICHT Claras Wake/Sleep.
      GEBAUT: (a) Clara-Voice `worker_wake.is_recording_command()` als Vor-Gate
      im `WakeGate` - ein Aufnahme-Kommando (Aufnahme-Substantiv/-Verb + Start/
      Stop) dispatcht IMMER ans LLM und legt Clara NIE schlafen (auch bei
      "beende/stopp die Aufnahme"); blosses "Clara stop" bleibt Sleep. Neue
      Gruppe `recording` im Tool-Subsetting. (b) MAS `clara/treatmentRecording.js`
      (reine `pickCurrentAppointment`-Bindung + Recorder-Schreiben + Live-Follow
      `open_lena_recording`) + Tools `start_treatment_recording`/
      `stop_treatment_recording` in `routes/tools.js`; schwebende Bestaetigung +
      laufende Aufnahme in `voice_state` (`pendingRecording`/`activeRecording`).
      (c) Clara-Profil: zwei Tools (Gruppe recording) + stt_keywords
      (Aufnahme/Lena). (d) Frontend: `open_lena_recording` schickt den Monitor
      via Live-Follow zu Lena. Tests gruen: `test_wake_word.py` (+23 Checks),
      `test_tool_subsetting.py`, `scripts/test-lena-recording.mjs` (pure),
      Clara-Release-Gate voll gruen, `node --check`. OFFEN (bewusst W-LENA-3):
      Bindung an einen bereits im Monitor GEOEFFNETEN Termin per Sprache (der
      Bildschirm-Weg "Aufnahme starten" im Termin-Dialog deckt das schon ab).
- [~] **W-LENA-2 Audio + STT (das erste Erfolgskriterium).** Getrennter,
      medizinisch trainierter STT-Dienst (Parakeet live + med. Post-Korrektur),
      Roh-Audio je Segment. Laeuft SEPARAT vom Clara-Stack. Domaenen-Boosting +
      Post-Korrektur. DoD: messbar hohe Wortgenauigkeit auf Medizin-Vokabular,
      Clara-Gate weiter gruen.
      TEIL 1 (Dienst) FERTIG (11.07.): isolierter `lena_stt/`-Dienst
      (FastAPI/uvicorn, Port 8140, EIGENER Prozess/Modell — kein Import aus dem
      Clara-Stack). Parakeet-ONNX (primeline) auf CPU (device umschaltbar;
      GPU-Upgrade spaeter in EIGENEM venv mit onnxruntime-gpu, nie im
      Clara-Env). Reine Energie-VAD `Segmenter`; medizinische Fach-
      Nachkorrektur (`data/medical_terms_de.txt` = Vokabular als DATEN, nicht
      Code); WS-Protokoll (PCM rein, partial/final raus mit Korrektur-Liste);
      Launcher `start-lena-stt.ps1` (LAN + optional Cloudflare `wss://`);
      Tests `test_lena_stt.py` (16/16) + WS-Smoke + `eval_wer.py` (WER-
      Messharness, ausfuehrbar sobald echtes/TTS-Audio vorliegt). Clara-Gate
      weiter GRUEN.
      TEIL 2 (Frontend-Ingress) LIVE (11.07.): `services/lenaStt.ts` loest die
      wss-Adresse aus `settings/lenaStt` auf (wie masRuntime), oeffnet das
      Mikro, rechnet auf 16k-Mono-PCM (AudioWorklet) und streamt an den Dienst
      (partial/final). ZWEI KANAELE = ZWEI SPRECHER: PC-Raummikro schreibt
      Kanal `raum` (Patient, links), Handy-Headset Kanal `arzt` (Arzt, rechts);
      der manuelle Umschalter auf `/dictate` entfaellt. Beide Oberflaechen
      (recordingControls + dictationPage) nutzen die STT bevorzugt und fallen
      bei Nichterreichbarkeit sauber auf Web-Speech zurueck (kein Regressions-
      risiko). Segmente werden pro Sprechpause sofort als Dialog geschrieben.
      MAS-Route `POST /treatment/lena-stt-url` (Launcher meldet die Tunnel-URL)
      veroeffentlicht `settings/lenaStt`.       OFFEN: reale WER-Messung mit echtem
      Praxis-Audio, GPU-Umzug 5090, ggf. Named Tunnel statt Quick-Tunnel.
      TEIL 5 (Voice-Enhance vor STT, 16.07.): `lena_stt/enhance.py` —
      DeepFilterNet3 (CPU/ONNX via `deepfilter-stream`) + Noise-Gate + leichte
      Kompression/Limiter, eingehaengt in `server.py` **vor** Segmenter.
      Flag `LENA_STT_ENHANCE` (Launcher default an, Notaus=0). Zweck: Bohrer/
      Absauger/Stille-Halluzinationen drosseln — ASR-Qualitaet, kein Podcast-
      Studio. DSP-Fallback ohne DFN. DoD offen: Praxis-Clips WER + „sprach auf
      Stille?“ messbar besser.
      TEIL 4 (Arzt-Quelle umschaltbar, beschlossen 11.07. abends) LIVE (21.07.):
      Einsteller "Arzt-Mikro: Ansteckmikrofon (Funkempfaenger) / Headset
      (ueber Clara)" pro Standort. Motiv: Traegt der Chef das Shokz-Headset,
      haengt es per Bluetooth am HANDY/iPad (fuer Clara) — ein zweiter Capture
      auf demselben Geraet waere fragil. Loesung: EIN Mikro, EIN Capture,
      Verteilung am Server. Drei Teile: (1) Einsteller + Persistenz in Firestore
      (`clients/{c}/locations/{l}/settings/lenaRecorder.arztSource`), von drei
      Parteien lesbar (Frontend-Recorder, MAS, Clara-Worker). (2) Headset-Modus:
      der PC/iPad nimmt NUR den Patienten-Kanal auf (Mono `LenaSttCapture`,
      channel=raum) — der Stereo-Split entfaellt. (3) Der Clara-Worker tee't
      waehrend einer AKTIVEN Aufnahme die Arzt-Aeusserungen aus der LiveKit-
      Session an `lena_stt` (channel=arzt) und schreibt sie als Segmente
      (source=arzt) — derselbe Baustein, den Phase 4 (Ambient) ohnehin braucht.
      Tee-Start: Sprachbefehl (Tool-Result `lenaTee`) ODER UI-Aufnahme am iPad
      via LiveKit-Cmd `lena_tee` (`pickadoc.cmd`). `CLARA_LENA_TEE=1` dauerhaft
      in `start-clara.ps1`. Ansteckmikro bleibt der Default und die bessere
      Doku-Quelle; Headset-Modus = "Clara + Doku, nur ein Geraet am Koerper".
      TEIL 3 (Zwei-Lavalier-Setup am PC) LIVE (11.07.): Chef nutzt zwei
      Ansteckmikros an EINEM Funk-Empfaenger (USB, links/rechts) statt
      Raummikro+Handy. `LenaStereoSplitCapture` splittet die Kanaele
      (ChannelSplitter -> zwei WS-Verbindungen raum/arzt). WICHTIG: Pegelmeter
      und Aufnahme teilen sich EINEN getUserMedia-Stream (vorher zwei Streams
      -> je nach Treiber Mono fuer die Aufnahme: "Meter trennt, Dialog
      nicht"). Geraetewahl automatisch: virtuelle Geraete (Voice-Changer,
      VB-Audio ...) ausgeschlossen, DJI/"Mic Mini" bevorzugt, Wahl in
      localStorage gemerkt. UI entruempelt (Chef 11.07.): kein Stereo-
      Umschalter, kein Geraete-Dropdown, `micSelect.tsx` geloescht; geblieben
      sind L/R-Pegelmeter, "Links = Patient/Arzt"-Tausch und ein Knopf zu den
      Windows-Sound-Einstellungen.
      NACHTRAG iPad (20.07./21.07.): Triple-Toggle **iPad / USB / Bluetooth**.
      **iPad + Bluetooth + USB = Parakeet** über Clara (Weiterleitung in die
      Doku; LiveKit-Mic wird auf gewähltes Gerät gelegt). Canary/Whisper-Doku
      entfernt 21.07. Soft-Switch ohne Hangup/Reconnect; Doku-Welt
      `set_app_mode:doku` = kein Clara-LLM, Parakeet AN. Aufnahme + Nachdiktat
      = `lena_tee` source arzt|nachdiktat. Zurueck: Soft-Return-Begruessung.
      Aufnahme-Kopf als Box-Karten statt Zeilenleiste.
      NACHTRAG Mic-Leiste 3 Modi (25.07.2026): fixe Kopf-Mic-Leiste mit genau
      DREI Modi als EIN Umschalter — `headset` (BT, Arzt-Spur), `headset_room`
      (BT + PC-USB-Raummikro, 2 Spuren) `ipad_room` (iPad-Mikro, 1 gemischter
      Stream); Single-Source `captureMode` in localStorage; alte
      `#micToggle`/`.roommic-bar` ausgeblendet; durchgaengige Zurueck/Weiter-
      Navigation im schlanken Header (auch im Schema-Schritt). AP2: robuster
      BT-Rueck-Wechsel (BT<->iPad) — `pickAudioInput(mode,{waitMs})` pollt nach
      iOS-Routenwechsel bis zu 3 s auf das wiederkehrende BT-Mikro (kein
      getUserMedia), `switchMic` mit 1 Retry; iPad-Zurueck-Geste bleibt via
      History (`pushState` je Modus/Schritt, `popstate`->`showStep`) IN der App.
      AP3: `room_capture.py` zuverlaessig (Auto-Geraetewahl gehaertet, Mapper/
      Stereomix ausgeschlossen; Single-Instance-Start); Modus-2-Kette
      verdrahtet+verifiziert (WS /stt auf 8140 = Conformer, Finals). AP4:
      Modus-3-Heuristik in `ingestLenaDokuSegment` — Ein-Stream-"arzt"-Segmente
      werden bei klarer Laien-/Fragesprache (ohne klinische Marker) als
      Patientenanliegen (`raum`) umgelabelt, nur bei `ipad_room`, nie im
      Schema-Diktat, im Zweifel Arzt; in der UI korrigierbar. Clara-isoliert
      (nur Doku-Capture/UI); Clara-Release-Gate gruen, `node --check`/`vm`
      Inline-Syntax gruen. Fix nebenbei: Live-Clara-Worker lief mit veralteter
      `engine=whisper` -> Tee lieferte nichts; Worker neu gestartet auf
      `CLARA_LENA_TEE_ENGINE=conformer`.
- [x] **W-LENA-3 Live-UI (Layout erhalten).** LIVE (11.07.2026). Datepicker/
      Arztfilter/Patientenliste bleiben. Rechts jetzt Umschalter Dialog<->Struktur:
      Dialog = chronologischer Verlauf (Patient links / Arzt rechts, Kanal=Sprecher
      ueber `source` raum/arzt) mit ausblendbarem Smalltalk (nur Anzeige, Rohtext
      bleibt in `dictations`). Struktur = 9 feste farbcodierte Abschnitte
      (Endo-Feilenfolge weiss-gelb-orange-rot-violett-blau-tuerkis-gruen-schwarz):
      anamnese/befund/diagnose/aufklaerung/vorbereitung/behandlung/nebenleistung/
      nachsorge/procedere. WICHTIG (Anti-Halluzination): Das LLM in
      `structureTreatmentNote` KLASSIFIZIERT nur jedes Segment (per Nummer) in
      Abschnitt + Smalltalk-Flag und schreibt diese Metadaten (`section`,
      `smalltalk`) an die Segment-Dokumente - es schreibt den Text NICHT um. Die
      Struktur-Ansicht gruppiert die ECHTEN Segmenttexte; unklassifizierte landen
      sichtbar in einem eigenen Eimer (nichts geht verloren). Deploy:
      `functions:structureTreatmentNote` + Hosting. OFFEN (bewusst W-LENA-4):
      manuelles Verschieben/Markieren von Segmenten; raeumliche Gruppierung
      benachbarter Abschnitte.
      NACHTRAG (11.07., LIVE): Strukturieren laeuft NICHT mehr ueber die
      OpenAI-Cloud-Function (Quota tot, DSGVO), sondern ueber die neue
      MAS-Route `POST /treatment/structure` (`backend/src/lena/lenaDoc.js`):
      lokales Qwen klassifiziert die Segmente (nur Nummern->Abschnitt+
      Smalltalk-Flag), die Karteikarte wird deterministisch aus den ECHTEN
      Segmenttexten gebaut und nach `treatment/main` geschrieben. Dazu
      Vorgriff auf W-LENA-5: `POST /treatment/billing` schlaegt BEMA/BEMA+/
      GOZ vor (lokales LLM mit Katalog-Grounding aus `backend/src/data/
      billing-catalog/*`, `validateCatalogCodes` gegen Katalog, determinis-
      tischer `expandBillingFromText`-Fallback ohne LLM). Frontend: neues
      `AbrechnungPanel` auf der Lena-Seite (Vorschlaege + Vollstaendigkeits-
      fragen + Entfernen-Knopf, Disclaimer "unverbindlich"). E2E getestet
      am 11.07. (structure: 12/12 Segmente klassifiziert; billing: GOZ 9010
      je Implantat + BEMA 41a aus echtem Diktat, quelle=llm).
- [ ] **W-LENA-4 Korrektur-Modell (markiert, kein Freitext).** Sprachkorrektur,
      Auto-Vorschlag+Bestaetigen, Auswahl aus STT-Hypothesen; Segmente
      verschieben; jede Aenderung mit Wer/Wann/Wie markiert, Original bleibt
      (§ 630f).
- [ ] **W-LENA-5 Abrechnungs-Bruecke (das zweite Erfolgskriterium).** Nur
      gruene/gelbe Abschnitte speisen Sophie. LLM -> Leistungsabsichten
      (Konzept+Attribute), Sophie expandiert deterministisch ueber
      `billing-catalog/*` zu BEMA-BEMA PLUS-GOZ; Ausschoepfungs-Slider aus der
      Sandbox in den echten Fluss. Manuelle +/- markiert.
      NACHTRAG (12.07.2026, Chef - Richtungsentscheid): Lena BESTIMMT KEINE
      Ziffern mehr. Der "Vorgriff auf W-LENA-5" aus W-LENA-3 (das `AbrechnungPanel`
      mit automatischer BEMA/GOZ-Bestimmung via `POST /treatment/billing`) ist
      aus der       Lena-Seite ENTFERNT. Grund: Lena soll nur die BEHANDLUNG definieren
      ("Implantatinsertion an 36 mit Augmentation"), die Ziffern leitet
      AUSSCHLIESSLICH Sophie deterministisch ab - genau der schon vorhandene Pfad
      `sophieIntakeService.erkennePerLLM` -> MAS `/clara/billing-intake` (LLM ->
      Konzept+Attribute, NIE Ziffern) -> geteilte Sophie-Engine (GOZ 2,3/3,5 +
      BEMA/BEMA+, Schieberegler). Lenas rechte Spalte ist jetzt die
      Sophie-Uebergabe: der bereinigte Behandlungstext wird (debounced, 1,5 s)
      durch `erkennePerLLM` zu KOMPAKTEN Behandlungszeilen erkannt und ins Feld
      geschrieben (Formatter `absichtZuZeile` mappt Konzept-Label + Zahn +
      Augmentation/Sinuslift/Flaechen/Kanaele). Der Arzt kann NACH der Behandlung
      nachdiktieren/editieren ("touched" stoppt das Auto-Ueberschreiben; Button
      "Neu erkennen" erzwingt Re-Erkennung).
      UEBERGABE (12.07., Chef-Pointer "quasi dieser Schritt"): "An Sophie
      uebergeben" (NUR Klick/Kommando) speichert die erkannten Absichten als
      `sophiePlan` am Termin (`AppointmentsService.saveSophiePlan`) - inkl.
      `terminGrund` = kompakter Behandlungstext (Zeilen zu einer Zeile, " · "),
      der in Sophie oben als "Termin: …"-Label erscheint - und navigiert
      zu `/clara?ki=sophie&appointmentId=..&modus=planen`. Sophies Sandbox
      (`billingTestPage.tsx`) restauriert den Plan als "Geplante Behandlungen"
      (Schritt "Leistungen planen") - der Arzt optimiert dort mit dem
      Schieberegler und rechnet ab.       Sind Edits im Feld (touched), holt der Send
      frische Absichten per `erkennePerLLM(text)`, sonst die gecachten.
      Unter dem Behandlungsfeld ein zweites, benanntes Feld "Nachträge /
      Ergänzungen" (tippen ODER diktieren, eigene STT-Instanz): was der Arzt NACH
      der Behandlung ergänzt, wird beim Übergeben mit der Behandlung zusammen
      erkannt und ins Label aufgenommen. Weiterleitung weiterhin NUR per Klick.
      `billTreatment`/`/treatment/billing` bleiben im Backend erhalten (dormant,
      kein Rueckbau), werden von Lena nicht mehr aufgerufen. Frontend live-faehig,
      `lenaWorkspace.tsx` tsc-sauber.
- [~] **W-LENA-6 Zusammenfassung + Uebergabe.** Nach dem Gespraech kompakte
      Abrechnungs-Zusammenfassung; Sophie/Clara nehmen Ergaenzungen auf.
      TEILWEISE (17.07.): iPad-Zusammenfassung + PDF-Druck + Struktur-
      Uebergabe im Wizard (wiz5/wiz6) stehen; PMS-Anbindung und Nadine-Mail
      noch offen. Zusammenfassung behaelt das Arzt-Patient-GESPRAECHSSCHEMA
      und wird vom starken 5090-Modell (`strongLlm()`, qwen3.6) bereinigt
      (`buildDialogueDraft`/`polishDialogueSummary` in `lena/lenaDoc.js`):
      Smalltalk/Junk raus, STT-Hoerfehler geglaettet, KEINE erfundenen
      Befunde/Ziffern (Zahlen-Waechter `inventsNumbers` + Schema-Wache),
      Nachdiktat wortwoertlich. LLM aus -> deterministischer Dialog-Fallback.
      Abschnitts-HTML (`structuredHtml`) bleibt die interne Karteikarte.
- [~] **W-LENA-7 Clara als Sprach-Doku-Assistent (beschlossen 12.07., Chef).**
      Clara nimmt per Sprache patienten-/termingebundene Doku/Nachtraege auf,
      quittiert, liest vor, ergaenzt/loescht/findet. GESTAFFELT (jedes Teil FERTIG
      vor dem naechsten), DSGVO-lokal ueber MAS (KEINE Cloud Function). Speicherpfad
      immer die vorhandene Doppel-Spur: `…/appointments/{id}/dictations/{seg}`
      (primaer) + `clients/…/mas_events` (Shared Memory, Kanal `lena_doc`, 45 Tage)
      via `saveTreatmentDictation()`. Vorbild-Muster: `treatmentRecording.js`
      (`_recPropose`/`pickCurrentAppointment`/`startRecordingSession`) und der
      Lena-Tee (`worker_lena_tee.py`).
      **Isolation (Chef 22.07.2026, FERTIG):** Clara/Lena Soft-Trennung im
      Tool-Subsetting — Lena-Bridge-Tools (`lena_bridge`) nur bei Aufnahme/
      Befund/Diktat-Intent; Unklar-Fallback ohne Bridge. Soft-Switch bleibt
      („Befund fuer Meier“ → Lena-STT, iPad zurück → Clara). Regeln in
      `Clara-Voice/AGENTS.md` + `tool_subsetting.py`. Lena-Weiterentwicklung
      (iPad/Schema/STT) darf Claras Sprechpfad nicht mehr mitziehen.
      Vorstufe LIVE (12.07.): Browser-Erkenner `nachtragIntent.ts` (10 Sprach-
      varianten „Nachtrag/Dokumentation Frau X …") schneidet Kommando+Name vom
      Nachtrag-Diktat im Lena-Feld ab — das ist NUR der Browser, nicht Clara.
      - [x] **7a Diktat-Modus + Quittung (FUNDAMENT, FERTIG 12.07.).** Sprachbefehl
        „Clara, nimm fuer Herrn XY Doku auf" -> Patient/Termin aufloesen
        (`resolveSpokenPatientForRead`+`resolveAppointmentInfo`), Bestaetigungs-
        Flow, gesprochene Quittung „Ich nehme jetzt Ihr Diktat fuer … auf, ich
        starte die Aufnahme" (`message`/`speak_result:"verbatim"`). Umsetzung
        NUTZT den bewaehrten Aufnahme-+Tee-Pfad wieder (kein Wake-Gate-Umbau):
        `startRecordingSession({mode:"dictation", forceTee:true})` setzt Recorder
        auf `mode:dictation` und erzwingt den Arzt-Tee (Diktat kommt IMMER ueber
        die LiveKit-Session). Die im Standby verworfenen Arzt-Aeusserungen tee't
        `worker_lena_tee` unveraendert nach `dictations` (source=arzt) — NEU auch
        ins Shared Memory (`/treatment/lena-segment` schreibt jetzt `lena_doc`,
        45 Tage). `activeRecording.mode` unterscheidet Stop-Quittung. Neue MAS-
        Endpoints `/tools/start-patient-dictation` + `/tools/stop-patient-dictation`,
        Tools im Profil (Gruppe `doku`+`recording`, verbatim), Routing in
        `tool_subsetting.py`, Tests im Release-Gate. Voraussetzung wie W-LENA-2:
        `CLARA_LENA_TEE=1` + Wake-Wort aktiv. **SCHARF geschaltet 12.07. (Chef):**
        `CLARA_LENA_TEE=1` ist jetzt DAUERHAFT gesetzt — in `start-clara.ps1`
        (Process-Env, Notaus via `.env`/Umgebung=0) und als User-Env (`setx`).
        `lena_stt` (Port 8140) startet ab sofort MIT dem Stack (`start-mas-stack.ps1`,
        Schritt 4, `-Tunnel`, idempotent+non-fatal), damit der Tee beim „alles
        starten" nie ins Leere laeuft.
      - [x] **7b Vorlesen (Read-back), FERTIG 12.07.** `read_treatment_dictation`
        (`mode` = `full` | `last` | `summary`) liest die Doku eines Termins
        verbatim vor (ueber `combineActiveSegments()`), Modul `lenaDictation.js`.
      - [x] **7c Nachtrag-CRUD per Sprache, FERTIG 12.07.** Aufnehmen/Ergaenzen =
        `save_treatment_dictation`, Loeschen/Streichen = `strike_treatment_dictation`
        (bestehend), Finden = `find_in_treatment` (neu, deterministische
        Satz-Suche). In dieser Architektur beschreibt Lena, Sophie leitet Ziffern
        ab — „Label ergaenzen/loeschen" laeuft daher als Diktat-Ergaenzung/
        -Streichung (fliesst in Sophies Erkennung).
      - [x] **7d Labels per Sprache (Lesen) FERTIG 12.07.** `read_treatment_labels`
        liest den `sophiePlan.terminGrund` vor. Ergaenzen/Loeschen bewusst ueber
        Diktat (7c), NICHT durch serverseitiges Verbiegen von `sophiePlan`
        (Konzept-Katalog liegt im Frontend; Sophie erkennt neu).
      - [x] **7e Nachdiktat + Speichern → Shared Memory (17.07./21.07.).**
        iPad-Button „Speichern“ (ex Sophie-Abrechnung) ruft `/treatment/finalize`:
        Karteikarte + `lena_doc`-Events erst beim Abschluss (nicht live pro
        Segment). Clara kann danach vorlesen. Sophie-Abrechnung folgt spaeter.
        Clara-Diktat (Text `saveTreatmentDictation` UND getee'tes Live-Diktat bei
        `recorder.mode=dictation`) wird als `source=nachdiktat` abgelegt -> eigener,
        ungefilterter Abschnitt (wie iPad-Nachdiktat), erscheint LIVE in der
        Web-Lena (Firestore-Listener). Die Zusammenfassung geht nun ebenfalls ins
        geteilte Gedaechtnis (`writeTreatmentSummaryEvent` -> `lena-summary:{apptId}`,
        Kanal `lena_doc`, upsert/45 Tage) und ist damit in MAS-Suche + Dossier
        fuer alle Agenten sichtbar. iPad aktualisiert Segmente + Summary per
        Heartbeat-Poll (kein Reload).
      - [x] **7d+ Label-ERSTELLUNG per Sprache — FERTIG 12.07.** Ein gesprochenes
        „Fuellung an 35" wird jetzt SERVERSEITIG in ein strukturiertes Sophie-Label
        (`Leistungsabsicht`: Konzept + Attribute, KEINE Ziffer) umgewandelt und
        additiv in `sophiePlan.absichten` geschrieben (`terminGrund` neu gebaut).
        Loesung fuer „Katalog nur im Frontend": Der Server SPIEGELT den bei jedem
        `/clara/billing-intake` mitgeschickten Konzept-Katalog nach
        `settings/sophieKatalog` (`clara/sophieKatalog.js`, In-Memory-Cache +
        Schreib-Guard) — Frontend bleibt Quelle der Wahrheit, kein Doppelpflege;
        die Kopie frischt sich bei jeder Sophie-Nutzung selbst auf. Neu:
        `lenaDictation.addTreatmentLabel()` (Intake via `intakeToAbsichten` +
        gespiegelter Katalog), Endpoint `/tools/add-treatment-label`, Clara-Tool
        `add_treatment_label` (Gruppe doku, verbatim), Routing + Test. Ziffern
        bestimmt weiterhin ausschliesslich Sophies deterministische Engine.
        Ist der Katalog nach einem Kaltstart noch nie gespiegelt, weist Clara
        freundlich darauf hin, einmal Sophie im Browser zu oeffnen.
      - [x] **7e Suche + Push (Sprache) FERTIG 12.07.** `find_in_treatment` findet
        die Passage, spricht sie (Patient/Datum/Passage) UND pusht `lena_find_result`
        per `emitCommand` an den Monitor. Sprach-Ausgabe funktioniert. VERWORFEN
        12.07. (Chef: „machen wir nicht"): die visuelle Fundstellen-Markierung im
        Frontend-Follow-Consumer — der `lena_find_result`-Push bleibt bestehen,
        wird aber bewusst NICHT im Bildschirm ausgewertet.
      - [x] **7f Historische Abfrage + Backdated-Nachtrag FERTIG 12.07.** Read-
        back/Suche/Historie akzeptieren `date` (JJJJ-MM-TT); „was habe ich bei
        Frau Meier am 3.4. nachgetragen" laeuft ueber `read_treatment_dictation`/
        `patient_treatments`. NEU: `start_backdated_dictation` — Nachtrag zu
        einem ZURUECKLIEGENDEN Termin: `resolveRelativeDate()` deutet „vor drei
        Wochen"/„letzten Monat"/„gestern", `findBackdatedAppointment()` waehlt
        den echten Kalendertermin, der dem Ziel am naechsten liegt, und schlaegt
        ihn MIT Datum+Wochentag+Behandlung zur BESTAETIGUNG vor; erst nach „Ja"
        laeuft das Diktat, an genau diesen alten Termin gebunden (Tee schreibt
        dorthin). „Nein, vom 3. April" = Korrektur. So landet ein Nachtrag nie
        auf dem falschen Termin.

- [~] **W-LENA-8 Vorlagen-First Doku-Template Zahnmedizin (beschlossen 18.07., Chef).**
      Richtungswechsel: Lena zeigt kein Dialog-/Bubble-Hero mehr. Ein
      **interaktives Doku-Template Zahnmedizin** ist die Arbeitsflaeche;
      Rohdialog nur Accordion (§ 630f-Archiv). Scope bewusst NUR Zahnmedizin
      (andere Faecher spaeter, wenn Erfahrung da). Ein Mikrofon reicht
      (Diarisierung tritt zurueck; Zustimmung/Planwechsel aus Kontext).
      Clara-Briefing liest spaeter dieselben Felder — bewusst NACH Zahn-Rundung.
      - [x] **8a iPad UI Template-Hero (18.07.).** `ipad-app.html` wiz3:
        `#dokuTpl` + Rohdialog `<details>`; Katalog
        `/m/lena-doku-template-zahn.js` (Basis-Felder + adaptive Bloecke
        inkl. Planänderung geplant/gemacht/Zustimmung). Mic-Default „1 Mic“;
        Stereo optional. Preview: `/m/lena-doku-preview.html`.
      - [ ] **8b Live-Feld-Extraktion robust (LLM).** Heuristik in 8a ist Start;
        periodisch/final qwen Feld-Fill + Persistenz `templateFields` an
        `treatment/main`. Planwechsel nur bei Entscheidungssprache; additiv
        (geplant bleibt). Kein Mid-Chair-Tap.
      - [ ] **8c structuredText aus bestaetigtem Template** (wiz5 Bridge;
        Abrechnungshinweise GOZ/BEMA aus Feldern — Sophie bleibt Ziffern-Instanz).
      - [x] **8d Clara Briefing (gewichtet, kurz) — FERTIG 19.07.** Heads-up
        (`nextPatientsBriefing`) und Tages-Prep (`day-appointments`) lesen
        `treatment/main.templateFields` des letzten Termins. Modul
        `lena/lenaBriefing.js` (23.07. aus clara/ nach lena/ verschoben, Clara
        bezieht es entkoppelt ueber `shared/lenaBridge.js`): Feld-Gewichte (Komplikation/Planwechsel/
        Therapie/Diagnose/offen > Befund/Anlass), max. 2 Fakten, ≤140 Zeichen,
        „keine Komplikationen“ und Befund-Romane werden verworfen. Fallback
        Kalender-visitMotive. SignR-Anamnese unveraendert separat. Absicherung:
        `node scripts/test-lena-briefing.mjs`. Kein structuredText-Dump.
      - [~] **8e 01-Modus Neupatient (Visual, 18.07.).** Einstieg iPad
        (`/m/lena-01/`): schichtbasiertes SVG-Odontogramm (Base Zahn+Wurzeln,
        Overlays Karies/Fuellung/Krone/WF/Belag/Implantat, Arch-Gingiva +
        Brueckenband). Orientiert an `F:\struktur01` Lena01/OdontogramSvg,
        aber modular statt Monolith. OFFEN: Editor-Interaktion, Persistenz,
        Bedarf→Termine/Docs (spaeter, bewusst nach Visual-Freigabe).

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

### W-SUCHE-2 - Feinschliff nach Chef-Feedback (05.07., FERTIG)

Chef-Feedback zur ersten Fassung: chronologisch statt Ranking, Name/Titel
schlecht, Werbung sickert ein ("Sky Deal" als Rechnung/Kosten-Vorgang),
Praxis-Branding fehlt, Karteikarte soll wie eine echte Karteikarte aussehen,
Browser-Vor/Zurueck ueber alles, 3 Skins, "Rote Liste" ist ein Medikamenten-
verzeichnis (Wording raus), KI-Modus wie bei Google.

- **Name:** Cockpit -> **MAS** (Korrektur Chef 05.07.: MAS, nicht MSS),
  Schlagzeile "Weiss alles. Findet alles. Vergisst nichts." MAS erster
  Eintrag in der MAS-KI-Leiste; Praxisname + Logo oben rechts
  (Location-Logo, sonst Monogramm).
- **Chronologie:** `searchBrain` sortiert neueste zuerst (Score nur noch
  Tiebreaker, Patienten-Karteikarten bleiben oben); Datum vorn in jeder
  Trefferzeile.
- **Werbefilter:** Massen-Newsletter mit Abmelde-Struktur (Werbe-Betreff +
  1 Marker oder >=3 Marker) schlagen jetzt auch "ernste" Kategorien in
  `mail/classify.js`; echte Rechnung/Anwaltspost bleibt relevant (getestet).
  Sky-Vorgang case_d348... geschlossen.
- **KI-Modus:** `GET /brain/answer` — Stichwort-Extraktion aus natuerlicher
  Frage (Stoppwoerter raus, UND-Suche, Fallback einzeln), Antwort NUR aus
  Suchtreffern ueber lokales LLM (qwen3 via Ollama, DSGVO on-prem), mit
  nummerierten Quellen. Frontend: Sparkle-Knopf in der Suchleiste, Antwort-
  Panel mit klickbaren Quellen-Chips.
- **Browser-Navigation:** URL fuehrend; Ansichtswechsel = pushState,
  Tippen = replace; Zurueck/Vor traegt durch Suche/Vorgang/Karteikarte/
  Ereignis (Mirror-Effekt mit Erst-Lauf-Sperre gegen Deep-Link-Verlust).
- **Skins:** 3 Stile (Hell/Papier/Nacht) als CSS-Variablen auf
  `.mss-outer[data-skin]`, Umschalter oben rechts, localStorage.
- **Karteikarte:** Reiter-Lasche, rote Randlinie, liniertes Kopffeld,
  Kennzahlen — echte Karteikarten-Optik.
- **Cache:** `/brain/search|answer|karteikarte` senden `Cache-Control:
  no-store`, Frontend `cache:"no-store"` (Browser-304 => leere Listen).
- Commits: MAS-2 e21b06a, Frontend adf96a6b. Live getestet: Flyeralarm-
  Frage beantwortet mit Quelle [1] in ~8 s; Sky nur noch als geschlossen.

### W-SUCHE-3 - Entity Profile (Patient/Kontakt, FERTIG 05.07.)

Google-Business-artige Vollprofile in der MAS-Suche:

- **Backend:** `src/brain/entityProfile.js` — `buildEntityProfile`,
  `buildProfilePreview`, `searchContacts`. Routen: `GET /brain/profile`
  (?patientId= / ?name= / ?contactId=). Suchtreffer: Patient mit
  `profilePreview` (Termine, Anamnese-Flags, Rating, Recall, Komm-Zaehler),
  neue Trefferart **contact** (Adressbuch ohne PHI).
- **Patienten-Profil:** Stammdaten, letzter/nächster Termin, Anamnese-
  Auffälligkeiten (`getPatientAnamnese`), Behandlungsdoku, alle SignR-
  Dokumente, Abrechnung (sophieAbrechnung/sophiePlan + offene Billing-
  Vorgänge), Kommunikation gruppiert (Anrufe/Mails/Briefe ↓↑), Recall-
  Buckets, Sterne-Rating, Vorgänge.
- **Kontakt-Profil:** Kommunikation + nicht-medizinische Vorgänge — keine
  Termine/Anamnese/Doku/Abrechnung.
- **Frontend:** `masCockpit.tsx` — Profil-Vorschau in SERP, Profilseite mit
  Reitern (Übersicht/Termine/Anamnese/Kommunikation/Dokumente/Abrechnung/
  Vorgänge). `brainService.getEntityProfile` + Typen `EntityProfile`,
  `ProfilePreview`.

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
- [x] **Chat-Spur** fuer erkennbar persoenliche Saetze ("Was haeltst du
      von...", "Mir ist langweilig"): Mini-LLM-Call mit eigenem kleinen
      Persona-Prompt (warm, Augenzwinkern, Selbstironie), OHNE Tools und
      OHNE Praxisdaten im Kontext (kann nichts Echtes verraten). Nach-Guard
      verwirft Ziffern + Erledigt-/Gebucht-Behauptungen -> ehrliche
      Ausweich-Zeile. Qwen-3.6-Umschaltung ERLEDIGT (verifiziert
      28.07.2026): `.env` traegt CLARA_CHAT_LLM_BASE_URL/-MODEL fest auf
      qwen3.6:35b-a3b (pickadoc1/vLLM); Server-Live-Probe gruen. Das
      hoelzerne 4b ist nur noch Rueckfall, wenn die Env-Schluessel fehlen
      (Startabbruch-Wache W-STABIL-7 prueft die Schluessel-Liste mit).
- [x] Voll-Suite + Release-Gate gruen, Worker-Neustart, Tag — laufend
      erfuellt; zuletzt Voll-Gate + Register strict 28.07.2026 mit Tag
      (siehe W-STABIL-1/W-UMBAU-Beweise).
- [x] **Bewertung Intent-Schicht (Auftrag Chef):** Zwei-Stufen-Architektur
      "flexibel verstehen, strikt handeln" ist RICHTIG, aber das
      Verstehens-Problem ist ein EIGENES Paket (Eingabe-Robustheit), nicht
      der Hebel fuer "steif": W1.1-Subsetting ist bereits die halbe
      Intent-Schicht (deterministisches Keyword-Routing). Der volle
      Resolver (R0 Regex -> R1 Keywords -> R2 Mini-LLM-JSON + Fast-Path +
      Clarify statt Leer-Turn) steht als Folgepaket W-INTENT auf der
      Warteliste — erst W-HUMAN abschliessen und messen. (Bewertung
      abgeschlossen; seit W-UMBAU-1 ist die deterministische Schicht
      zusaetzlich in `services/intent_router.py` konsolidiert.)

## Phase W-HUMAN Stufe 2 - Lockerheit 1-4 (Auftrag Chef 09.07., praezisiert 10.07.)

**Auftrag:** "Setz bitte 1-4 um, aber keinen zweiten LLM-Gang wie in 5
beschrieben. Insbesondere Starts und Begruessungen sollten interessant sein,
z.B. die Uhrzeit miteinbeziehen oder das letzte auffaellige Ereignis, wenn es
unmittelbar mit der Kontaktaufnahme zeitlich passt." Voraussetzung (erfuellt
10.07.): Speicherpunkt Clara v6.0 mit vollstaendigem Rollback-Anker.

Leitprinzip unveraendert: **Fakten-Kern (Zahlen/Namen/Zeiten) bleibt woertlich
aus dem Tool; Variation entsteht NUR im Code (Pools), nie im LLM.**

- [x] **(1) Rotierende warme Rahmen-Pools** um die verbatim-Briefings
      (daySchedule buildSpokenDayBriefing/-List, rangeOverview) - vary()-Muster,
      dazu maybe() (Wahrscheinlichkeits-Zeile, oft leer) in speech.js.
- [x] **(2) Zahl-getriebene Reaktion** ("Ein voller Tag." bei >= 20,
      "Ueberschaubar." bei <= 3) - dayLoadReaction()/rangeLoadReaction(),
      deterministisch aus der echten Zahl, mittlere Tage bleiben unkommentiert.
- [x] **(3) Kollegialer Vor-/Nachsatz** um den unantastbaren Fakten-Kern
      (maybe()-Einleitung, warmClose()-Abschluss ~ jedes 3. Mal, vary-Gedaechtnis
      verhindert direkte Wiederholung).
- [x] **(4) Sprechbarkeit in sanitize_reply** (Clara-Voice): Stunden-Bereiche
      "9-12 Uhr" -> "neun bis zwoelf Uhr", Anzahlen bis 999 als Zahlwort
      ("128 Anrufe" -> "hundertachtundzwanzig Anrufe"), Telefonnummern durch
      Nachbarschafts-Pruefung weiter geschuetzt.
- [x] **Starts/Begruessungen:** tageszeitbewusste greeting_pools im Profil
      (morning/midday/afternoon/evening/night, {{current_hm}} als gesprochene
      Uhrzeit; services/greeting_pools.py, Anti-Wiederholung, pro Session
      memoiert fuer TTS-Cache) + frisches auffaelliges Ereignis (<= 45 min,
      nur echte Kommunikations-Kanaele, keine Kalender-Automatik) via
      GET /clara/greeting-context direkt nach dem Hallo - profil-gated
      (nur assistant_mode=internal), Bianca/Lisa byte-identisch.
- [x] KEIN zweiter LLM-Gang (Punkt 5 bewusst gestrichen, Chef 09.07.).
- [x] DoD erfuellt 10.07.: node-Tests (day-schedule, greeting-context) gruen,
      Release-Gate voll gruen, Backend + Worker neu gestartet, committet.

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

## Phase W-FLIP-TIEFE - Angezeigte Inhalte vertiefbar machen (Chef 24.07.2026)

**Auftrag (sinngemaess):** Clara flippt bereits das Handy-Display, um Themen
zu zeigen ("was kannst du alles"). Das soll ueberall genutzt werden - UND Clara
soll auf ALLES, was sie textlich/als Karte zeigt, bei einer Nachfrage fundiert
und eloquent in die Tiefe gehen koennen (schriftliche Information neben dem
Gesprochenen). Oberste Regel bleibt: harte Fakten, nichts halluziniert.

**Architektur (systematisches Rueckgrat, danach jede Domaene "Karte + Detail"):**
Jede Uebersichts-Karte fuehrt zusaetzlich zum (fuer die Anzeige gekappten)
`items`-Chip einen reichen, deterministischen `detail`-Text mit. Der Worker
haelt die zuletzt gezeigten Karten turn-uebergreifend in `displayed_context`
(Session-Feld, Ringpuffer, gekappt) und speist sie als vertrauenswuerdigen
"das steht gerade auf dem Display"-Block ins LLM (Vorbild `topic_context`). Der
Fakten-Waechter behandelt durch `displayed_context` GEDECKTE Vertiefung als
erlaubt (nur bei explizitem Vertief-Intent + vorhandenem Anzeige-Kontext);
Halluzination OHNE Anzeige-Kontext bleibt strikt blockiert (Regression
07.07.2026). Hybrid: reicht die angezeigte Tiefe nicht, ruft der elaborate-Pfad
ein bestehendes Detail-Tool (volle Terminliste/Patientenhistorie).

- [x] WP2 Anzeige-Kontextspeicher `push_displayed_context` in
      `appointment_tools._stash_cards` (turn-uebergreifend, Ringpuffer, gekappt).
- [x] WP3 Injektion als begrenzter Grounding-Block in `openai_compat_llm`
      (`_format_displayed_context_block`, im Per-Turn-Kontext, ~3500 Zeichen).
- [x] WP6 Pilot: Capabilities-Karte (`worker_human`) traegt `detail` + wird
      gestasht -> "erklaer mir den Tagesueberblick genauer" wird tief
      beantwortbar (End-to-End-Nachweis, self-contained).
- [x] WP4 Fakten-Waechter: covered-by-display-Ausnahme, FLAG-gated
      (`CLARA_DISPLAY_ELABORATE=0` = Notaus), separat getestet.
- [x] WP1 MAS `karten.js`: Schema additiv um `detail`; alle 5 Builder
      (`kartePatient`/`karteTag`/`karteDoku`/`karteLuecken`/`karteSophie`) +
      `nextPatientsBriefing` reichen volle Quelldaten.
- [x] WP5 Routing: kanonischer Vertief-Intent `is_elaboration_intent`
      (`tool_subsetting`); Worker routet Vertiefung-auf-Angezeigtes auf den
      regulaeren LLM-Turn statt in die Chat-Spur.
- [x] WP7 Hybrid-Rest: Grounding-Block weist auf Detail-Tool-Aufruf hin, wenn
      das Angezeigte nicht reicht (bestehende Fakten-Kern-Tools).
- [x] WP8 Neue Flip-Domaene als Muster: `karteEingaenge` (Post/Anrufe/
      Bewertungen) + `detail`, additiv am comms-digest. Weitere Domaenen
      (Zeitraum, QM, Recall, Team, freie Slots) folgen demselben Muster.
- [x] WP9 Tests: `test_facts_guard` (Vertiefung erlaubt / ohne Kontext
      blockiert / Notaus / frische Tagesfrage geschuetzt + Grounding-Block),
      `test_human_layer` (Capabilities-Detail + displayed_context-Ringpuffer);
      Clara-Schnell-Gate gruen.

**Definition of Done:** Rueckgrat (WP2/3) + Pilot (WP6) beweisen die Tiefe
end-to-end; Fakten-Waechter bleibt gruen (WP4 flag-gated + getestet); MAS
`detail` strikt additiv/vertragstreu; neue Flip-Domaene als Muster (WP8);
Schnell-Gate gruen; kein Rueckbau der Sprech-/Isolation-/Verbatim-Garantien.
Weitere Domaenen (WP8-Liste) sind "nach Bedarf" und folgen dem Muster.

## Phase W-LABOR - Clara-Testlabor pro Mandant (Chef 27.07.2026)

**Auftrag (sinngemaess):** Eine Seite, auf der JEDE Frage, die Clara koennen
muss, nach Funktionen kategorisiert steht. Fragen einzeln ODER gruppenweise
ausloesbar (kein Zwang zum 250er-Komplettlauf), Claras Antwort erscheint LIVE
schriftlich unter der Frage. Pro Frage: Problem markieren + Kommentar
schreiben, Befunde als Datei runterladen, damit Clara sofort verbessert werden
kann. Verbesserung soll direkt von der Seite aus anstossbar sein (Prompt +
Tool-Beschreibungen editierbar). Mandantenfaehig: im Superuser-Konto unter
JEDEM Kunden, getestet wird gegen die Daten/Kalender des gewaehlten Kunden,
Aenderungen werden PRO MANDANT gespeichert. Pro Frage ein eingefrorener
Ist-Zustand von heute zum Zuruecksetzen eigener Aenderungen.

**Befund der Bestandsaufnahme (27.07.):**
- Die Testsuite (`run_tests.py`, 127 Faelle + 13 Dialoge) faehrt schon die
  echte Produktions-Pipeline, schreibt ihr JSONL aber ERST AM ENDE (Z. 852) —
  darum gibt es heute keine Live-Antworten. stdout traegt nur `tool=` + ms.
- Es gibt KEINEN Endpunkt "Frage rein, Antwort raus". `--ids` kostet je Lauf
  10-20 s Ollama-Warmup -> fuer Einzelfragen unbrauchbar.
- Abdeckung: 64 Tools in 13 Gruppen stehen 25 Test-Kategorien gegenueber;
  `doku` (17 Tools), `komm` (8), `memo` (7) sind praktisch unabgedeckt.
- Claras System-Prompt kommt im Compact-Modus zu ~100 % aus `profile.json`
  -> `system_prompt` (~22.700 Zeichen), ist also vollstaendig web-editierbar.
  Die 64 Tool-Beschreibungen sind ~78 % des LLM-Kontexts und die Hauptursache
  falscher Tool-Wahl — ebenfalls aus `profile.json`, ebenfalls editierbar.
- Mandantenfaehigkeit-Blocker: `profiles/clara_meddent/profile.json` traegt die
  Kunden-ID **64x fest in den Tool-URLs**, dazu Standort + 3 Kalender. Andere
  Kunden haben heute KEIN Clara-Profil -> Profil-Generator noetig.
- Der Platz im Superuser existiert bereits: Kunden-Workspace mit Tab
  `testtrain` (`superuserDashboard.tsx`, `TestTrainView mode="client"`).

**Architektur (Chef-Entscheidungen 27.07.):**
1. **Labor-Dienst** (Clara-Voice, `testsuite/lab_server.py`): haelt Modell,
   Profil und Tools dauerhaft im RAM; Einzelfrage in 1-3 s statt 20 s Warmup;
   Gruppen-/Vollauf als NDJSON-Strom; `reload` liest das Profil frisch von der
   Platte, damit "Prompt aendern -> sofort nochmal fragen" ohne Neustart geht.
   Nutzt `process_turn()`/`evaluate()` aus `run_tests.py` — dieselbe Pipeline
   wie das Gate, kein zweiter Wahrheitsstand.
2. **MAS-Bruecke** `/testlab/*`: reicht den Dienst durch, speichert PRO
   MANDANT in Firestore (`clients/{clientId}/mas_clara_lab_*`): Basislinien,
   Befunde/Kommentare, Prompt- und Tool-Fassungen.
3. **Seite** `backend/public/clara-testlabor.html`: Vollbild-Layout (100dvh,
   eigene Scrollbereiche), responsiv bis Handy; im Superuser unter jedem Kunden
   als eingebetteter Tab (`?client=<id>&t=<token>`; `?t=` akzeptiert auth.js
   bereits). Frontend wird EINMAL deployt, danach laufen Aenderungen an der
   Seite ohne Firebase-Deploy.
4. **Profil-Generator**: erzeugt pro Mandant ein Clara-Profil aus der Vorlage
   (Kunden-ID, Standort, Kalender aus Firestore eingesetzt).
5. **Echte Daten, umgeleitete Ausgaenge** (Chef: "komplett auf echten Daten"):
   Lese-Tools echt wie bisher; Schreib-Tools echt, aber alle Ausgaenge auf den
   Demo-Patienten "Michael Petsassss" / `+491776004600` umgeleitet. Die
   Umleitung haengt PRO REQUEST am Aufruf (AsyncLocalStorage-Hook in
   `lisa/outbound.js`), NIE als globale Env — sonst leitet der Praxisbetrieb
   bei Vergessen echte Patienten-SMS um (stiller Ausfall).
6. **Basislinie pro Frage**: friert Antwort, Tool, Argumente und die Fassung
   von Prompt/Tool-Beschreibungen ein; "heute" und "jetzt" nebeneinander.
   Konflikt beachtet: der System-Prompt ist EINER fuer alle Fragen —
   Zuruecksetzen wirkt punktgenau auf die Tool-Beschreibung bzw. auf die
   geaenderte Prompt-Stelle, mit Versionshistorie (nichts geht verloren).

- [x] WP1 Labor-Dienst `lab_server.py` (Einzelfrage, Strom, reload, Abbruch).
- [x] WP2 MAS-Bruecke `/testlab/*` + Firestore-Speicher pro Mandant.
- [x] WP3 Seite: Vollbild/responsiv, Live-Antworten, Kommentar, Export.
- [x] WP4 Profil-Generator pro Mandant: `POST /testlab/create-profile` holt
      Kunde/Standort/Kalender/Besuchsgruende aus der Plattform-Datenbank, der
      Labor-Dienst schreibt das Profil aus der Vorlage und schreibt die
      Kunden-Nummer in JEDE Werkzeug-Adresse um (sonst testet der neue Mandant
      unbemerkt gegen fremde Daten). `mas_config/booking` wird mitgesetzt.
- [x] WP5 Basislinie einfrieren + Zuruecksetzen.
- [x] WP6 Testpatient-Umleitung per Request — **als Positivliste**, nicht als
      Sperrliste (`src/clara/testRedirect.js`). Anlass: der erste Entwurf
      vertraute darauf, dass MAS ein mitgeschicktes `testRedirect` auswertet;
      MAS kannte das Feld nicht und der erste Probelauf trug eine ECHTE
      Abwesenheit fuer 07.08.2026 in den Kalender Dr. Petsas ein. Jetzt gilt:
      lesende Werkzeuge laufen, `send_sms`/`delegate_call` werden auf den
      Testpatienten umgebogen (Haken in `lisaSendSms`/`lisaStartCall`, damit
      auch die indirekten Wege ueber recallCoach/absencePlanner erfasst sind),
      **alles Uebrige wird verweigert** — auch jedes kuenftig ergaenzte
      Werkzeug, bis es jemand bewusst einordnet. Testpatient pro Mandant:
      `mas_config/test_redirect`. Absicherung: `scripts/test-test-redirect.mjs`.
      Offen: Buchen/Stornieren/Abwesenheit brauchen einen Testkalender.
- [x] WP7 Prompt- + Tool-Editor mit Versionierung.
- [x] WP8 Katalog auf volle Funktionsabdeckung: 165 Einzelfragen + 21 Dialoge,
      alle 64 Werkzeuge haben mindestens eine Frage (vorher 39 ohne).
- [x] WP9 Superuser-Tab pro Kunde (Deploy 27.07.2026, `claraTestLabView.tsx`).

**Was der erste Volldurchlauf gefunden hat (27.07.2026, 159/165):** vier echte
Maengel, die ohne den Katalog niemand gesehen haette — (1) "Ich habe das Diktat
beendet" ohne Stopp-Werkzeug, die Aufnahme lief weiter; (2) "Ruhe-Modus ist
aktiv" ohne Umschalten; (3) ein frei erfundenes Tagesbriefing, weil "Gib mir das
Tagesbriefing" kein Tages-Muster traf; (4) die Selbstanrede "Clara, ich habe …".
Alle vier behoben und per Test festgenagelt. Zusaetzlich zwei Maengel am
Werkzeug selbst: die Suite liess die Sprech-Schicht aus (zeigte Rohtext statt
gesprochenem Text) und `run_tests.py` endete IMMER mit Code 0 — die
Funktions-Testsuite konnte das Release-Gate gar nicht rot faerben
(`--min-pass`, Schwelle 85 %).

**Definition of Done:** Jede Frage ist einzeln, gruppenweise und komplett
ausloesbar; Antworten erscheinen live unter der Frage; Befunde sind pro Frage
kommentierbar und als JSON+Markdown exportierbar (mit Repro-Kommando); Prompt
und Tool-Beschreibungen sind pro Mandant editierbar und versioniert; jede Frage
hat eine einfrierbare Basislinie mit Zuruecksetzen; Ausgaenge gehen im Testlauf
NIE an echte Patienten; `run_tests.py`-Verhalten fuer das Release-Gate bleibt
byte-identisch (Labor ist additiv); Clara-Gate gruen.

## Phase W-DIALOG - Clara fuehrt Gespraeche statt Ansagen (Chef 27.07.2026)

**Auftrag (sinngemaess):** "Auf jede Frage kommt eine Antwort - aber kein Mensch
redet so. Es muessen Rueckfragen kommen." Beispiel Chef: "Loesch den Termin
morgen von Herrn Meier" soll fuehren zu "Moment, ich schau nach ... ich habe
einen um 14 Uhr, meinen Sie den?" - und weiter: "Er kommt mit seiner Frau, soll
ich die auch absagen?", "Er hat heute frueh eine Mail geschickt, dass er absagen
will." Ebenso beim Briefing: NICHT 20 Sekunden Ansage, sondern rauszoomen
("Beginn 8 Uhr Herr Meier, Schluss 17 Uhr, Luecke um 12 - was brauchen Sie?")
und dann Schritt fuer Schritt vertiefen. Ebenso bei Fehlschlaegen: "Moment,
finde ich nicht ... wann war der denn da?" - "kein Patient, der hat eine Mail
geschrieben" - "ah, gefunden". Kurz: **turnuebergreifendes Verstaendnis.**

**Befund der Bestandsaufnahme (27.07.):** Das Einstufige ist KEIN Modell-Defizit
und keine Prompt-Frage. Der Prompt verlangt Rueckfragen bei Mehrdeutigkeit
bereits, und der Katalog prueft sie (`response_question`). Drei Stellen
verhindern sie deterministisch:
- **Intent-Router** (`openai_compat_llm.py` ~2217): das Modell ruft
  `search_patient` (nachschauen), der Router schreibt es bei Storno-Intent in
  `cancelAppointment` um. Der Schritt "erst schauen" wird aktiv gestrichen.
- **Fakten-Fast-Route**: ueberspringt bei Kalenderfragen den Pass-1-Lauf und
  setzt den Tool-Call selbst - es gibt keinen Moment fuer eine Rueckfrage.
- **`speak_result: verbatim`** (37 von 64 Werkzeugen): MAS baut den fertigen
  Sprechtext, Clara liest ihn wortwoertlich, der Zug endet OHNE weiteren
  LLM-Pass. Deshalb ist das Briefing zwingend ein Monolog.
Dazu fehlt der Kern: **Clara hat keinen Zustand, der einen Zug ueberlebt.**
Bianca hat ihn (`booking_state`/`manage_state`, `awaiting_cancel_confirm`),
Clara laeuft mit `assistant_mode: internal` daran vorbei. Symptome, die der
Chef live hatte: vergessene Angaben im Verlauf (= Zustand fehlt) und wechselnde
Antworten auf dieselbe Frage (= Werkzeug fehlt, z. B. "wann habe ich frei":
`plan_absence`/`approve_absence`/`absence_status` gibt es, ein LESE-Werkzeug
fuer eigene Abwesenheiten nicht). Messbarer Beleg fuer den Architekturfehler:
10 von 21 Dialogen fallen durch, fast immer im ZWEITEN Zug - das ist keine
Testschuld, das ist die Architektur.

**Architektur-Entscheidungen (27.07.):**
1. **EIN Arbeitszustand** pro Sitzung mit drei Inhalten, statt drei Loesungen:
   geladener Kontext (Tag/Suche, mit Verfallsdatum), zuletzt genannte
   adressierbare Liste (echte IDs), offene Handlung. Absage-Bestaetigung,
   Briefing-Nachfassen und Such-Verengung sind derselbe Zustand.
2. **Rueckbezuege deterministisch**: "den", "die Zweite", "der um 14 Uhr" werden
   gegen die zuletzt genannte Liste aufgeloest, nicht vom Modell geraten -
   Ergebnis ist eine echte Termin-ID statt eines Nachnamens (sicherer als heute).
3. **Zustand lebt in der Sitzung, NICHT im Prompt.** Pro Zug geht nur ein
   knapper, zur Frage passender Auszug mit harter Obergrenze hinein. Grund:
   Vorfall 16.06. (Prompt > Kontextfenster -> Ollama schnitt den System-Prompt
   ab -> Leer-Turns "das habe ich nicht verstanden").
4. **Zusammenfassen passiert in MAS, nie im Modell.** Die Kurzform des Briefings
   (Beginn/Ende/Luecke/Anzahl) rechnet MAS und bleibt `verbatim` - damit bleibt
   die Zusage "jede gesprochene Zahl kommt aus dem Kalender" erhalten
   (Vorfall 07.07.: erfundene Termine/Patienten).
5. **Ersatz fuer die Verbatim-Garantie, wo frei formuliert wird:
   Deckungspruefung.** Liegt ein geladener Kontext vor, darf keine Zahl, kein
   Name und keine Uhrzeit gesprochen werden, die nicht darin steht. Erst durch
   den gehaltenen Kontext gibt es ueberhaupt etwas, wogegen man pruefen kann -
   damit ist freies Formulieren sicherer als das heutige Durchreichen.
6. **Rueckfragen entstehen aus Befunden, nicht aus Hoeflichkeit.** Nicht das
   Modell entscheidet, ob es etwas zu fragen gibt, sondern eine Regel ueber dem
   geholten Umfeld. Kein Befund -> handeln wie heute (Latenz!). Sonst erfindet
   das Modell Relevanz, so wie es fruher Termine erfunden hat.
7. **Umfeld-Scan haengt am GEGENSTAND, nicht am Werkzeug.** 64 Werkzeuge, aber
   nur Patient/Termin/Vorgang/Nachricht/Zeitfenster. Zuordnung deklarativ im
   Profil wie die `group`-Felder des Tool-Subsettings.
8. **Vorschlag vs. Ausfuehrung:** Das Blockieren ist Code (Schreib-Werkzeuge
   verweigern ohne bestaetigten Vorschlag), die Formulierung darf das Modell
   machen. Unbekanntes Werkzeug -> lieber einmal zu viel fragen (Lehre
   W-LABOR WP6). Nur-Prompt-Loesungen sind hier verboten: sie wirken sporadisch,
   und sporadisch falsch ist im Praxisbetrieb das schlechteste Verhalten.
9. **Rueckfrage darf raten, Handlung nicht.** Die Ehefrau-Erkennung ist eine
   Heuristik (gleiche Startzeit + gleicher Nachname; ein Familien-/Haushalts-
   Feld gibt es im Datenmodell NICHT). Als Frage zulaessig, als automatische
   Doppelabsage niemals.

- [x] WP1 Arbeitszustand pro Sitzung + Rueckbezuege deterministisch aufloesen
      (`services/dialog_state.py`, Einhaengung Worker + Suite + LLM-Provider).
      Notaus `CLARA_DIALOG_STATE=0` => byte-identisches Altverhalten.
      Absicherung: `testsuite/test_dialog_state.py` im Release-Gate.
- [x] WP1b Labor-Mehrzug: `/ask` akzeptiert `sessionId` + haelt history/
      session_state; Testlabor-UI mit Chatblasen + Weiterfragen
      (`clara-testlabor.html` + `sessionId`/`reset` durchgereicht).
- [x] WP2 Abwesenheits-LESE-Werkzeug: `getDoctorVacation` (Builtin) aktiviert +
      Katalog `abs-06` + Routing "wann habe ich Urlaub/frei".
- [x] WP3 Deckungspruefung in `response_guard.sanitize_reply` (Sicherung VOR
      der Lockerung). Kein Kontext -> keine Pruefung, im Zweifel behalten.
      Notaus `CLARA_FACT_COVERAGE=0`. Absicherung in `test_speakability.py`.
- [x] WP4 Briefing rauszoomen: `day_briefing` liefert bereits Lagebild
      (`overview: true` + Nachfrage); `list_day_appointments` und
      `patient_next_appointment` liefern jetzt strukturierte Termine fuer den
      Merkzettel (Nachfassen ohne zweiten Backend-Weg).
- [x] WP5 Vorschlag/Bestaetigung statt blinder Absage: Storno/Verschieben geht
      erst ueber `patient_next_appointment`, setzt offene Handlung, "ja"/"den"
      loest aus. Intent-Router schreibt nicht mehr search→cancel um.
      Umfeld-Scan am Gegenstand: gleicher Startzeit + gleicher Nachname
      (Rueckfrage, nie Auto-Doppelabsage) + offene Vorgaenge/Mail am Patienten.
- [x] WP6 Suche mit Herkunft ("gesucht in Patienten; Adressbuch: …") bei
      leerer Patientensuche — Adressbuch im selben Lauf, kein Neustart.

**Definition of Done:** Die 10 heute durchfallenden Dialoge laufen gruen, OHNE
dass eine Erwartung aufgeweicht wird; die Einzelfragen-Quote bleibt >= 89 %;
jedes Paket hat Notaus + Test im Release-Gate; Sprech-Schicht, Fakten-Waechter,
Erledigt-Waechter, Begruessungs-Pools, Tool-Subsetting-Kern, Lena/iPad und
Biancas Pfad bleiben unberuehrt (Bianca wird ohnehin neu gebaut).

**Nicht Teil dieses Pakets (Warteliste):** Rueckgaengig-Werkzeug, proaktives
Warteliste-Angebot beim freigewordenen Slot, echtes Familien-/Haushalts-Feld in
der Plattform, Laborauftrags-Status (Daten existieren nicht), Anrufernummer ->
Patient bei Bianca.

## Phase W-STABIL - Verkaufskern & Regressions-Register (Chef 27.07.2026 abends)

Ausloeser: Wochenlange Korrektur-Schleifen ("verschlimmbessern") ohne Ende;
Befund vom 27.07.: (a) Fehler werden in hoefliche Saetze verwandelt statt
sichtbar zu werden (Abwesenheits-Auskunft lief WOCHEN gegen eine fehlende
MAS-Proxy-Route, Gate blieb gruen), (b) die grosse Testsuite prueft NUR
Tool-Wahl + Argumente, nie den gesprochenen Inhalt, (c) Voll-Gate simuliert
alle Tools (SAFE) und kann tote Endpunkte nicht sehen, (d) --min-pass 85
erlaubt ~28 rote Faelle, (e) wirksamer Zustand (ElevenLabs-Prompt, Firestore,
Env) liegt ausserhalb von Git.

Der MASSSTAB ist `docs/VERKAUFSKERN_CLARA.md` (27 Punkte, vom Chef
festgelegt). Arbeitspakete in dieser Reihenfolge, jedes einzeln FERTIG:

- **W-STABIL-1 Register (27.07. begonnen):** `testsuite/register.json` in
  Clara-Voice — Verkaufskern- (`vk-*`) und Regressions-Faelle (`reg-*`) mit
  Erwartung an Tool, Argumente UND gesprochenen Inhalt (`say_contains`/
  `say_not_contains`, Datums-Platzhalter `{{today}}` usw.). Register-Faelle
  sind KRITISCH: ein roter Fall macht den Lauf rot (blockierend ab erstem
  gruenen Lauf, Schalter `--register-strict`). Jede neue Chef-Beschwerde wird
  ERST Register-Fall (rot), DANN Fix (gruen).
  **SCHARF seit 28.07.2026, 02:06:** Register erstmals komplett gruen
  (31/31) -> `--register-strict` blockiert jetzt auch das VOLL-Gate.
  Voll-Gate gruen (Quote 91,3 %, Flip-Sperre 0 Rueckschritte), beide Repos
  getaggt: `stabil-2026-07-28-0206` (MAS + Clara-Voice).
- **W-STABIL-2 Flip-Sperre:** `compare_runs.py` als Pflichtschritt im Gate —
  jeder frueher gruene Fall, der kippt, wird namentlich gemeldet und macht
  das Gate rot (unabhaengig von der Quote).
- **W-STABIL-3 Faehigkeits-Ping: FERTIG (28.07.2026).** `/clara/health`
  (und damit die Handy-Statusseite `/clara/<clientId>/status`) prueft jetzt
  zusaetzlich: (1) ALLE 65 Profil-Tools gegen die wirklich gemounteten
  MAS-Routen — genau der Abwesenheits-Vorfall; (2) die 9 Plattform-Cloud-
  Functions per OPTIONS (ohne Ausfuehrung); (3) ElevenLabs ueber den
  Lisa-Agent-Endpunkt (der Key ist ConvAI-beschraenkt, /v1/user waere
  Fehlalarm); (4) Lena-STT (8140); dazu Kontextfenster-Wache >= 32768.
  Test: `node scripts/test-capability-ping.mjs` (inkl. Negativprobe:
  erfundenes Tool auf toter Route wird gemeldet).
- **W-STABIL-4 Fehler-als-Zustand: FERTIG (28.07.2026).** Fallen in einem
  Durchgang ALLE HTTP-Tools TECHNISCH aus (Route tot, 500, Netzwerk),
  spricht der Worker selbst den ehrlichen Satz ("Das kann ich gerade nicht
  nachsehen — der Zugriff darauf ist technisch gestoert. Ich habe die
  Stoerung vermerkt.") und beendet den Turn — kein zweiter LLM-Durchgang,
  nie wieder "sanft leeres Ergebnis". Anruf-Auftraege behalten ihren
  praeziseren Satz. Jeder Ausfall geht als roter Eintrag an MAS
  (POST /clara/tool-error -> mas_tool_errors) und steht auf der Status-
  Seite ("Tool-Stoerungen (60 min)", heilt sich nach 1 h selbst).
  Geschaefts-Antworten ("Termin bereits vergeben") sind KEIN Ausfall.
  Test: testsuite/test_error_state.py (im Gate). Notaus: CLARA_FEHLER_EHRLICH=0.
- **W-STABIL-5 Protokolle: FERTIG (28.07.2026).** (1) Entscheidungsprotokoll:
  der Worker schreibt pro Gespraechszug EINE JSONL-Zeile nach
  `Clara-Voice/.run/protokoll/turns-JJJJMMTT.jsonl` — gehoerter Satz, jedes
  Tool mit Argumenten und Status (ok/fehler/system), eingegriffene Waechter
  (action-claim/appt-claim/call-outcome/call-promise/loop/fehler-als-zustand),
  gesprochene Antwort, abgebrochen ja/nein, Dauer. 14 Tage Aufbewahrung,
  Notaus CLARA_TURN_PROTOKOLL=0, darf nie werfen (services/turn_protocol.py,
  Test testsuite/test_turn_protokoll.py im Gate). "Um 14:12 hat Clara Unsinn
  geredet" ist damit in einer Zeile aufklaerbar. (2) Neustart-feste Logs:
  clara-switch.ps1 schrieb Start-Process-Redirects immer in DIESELBEN Dateien
  (ueberschreiben) — jetzt pro Start `<ziel>-JJJJMMTT-HHMMSS.log/.err.log`,
  die letzten 30 Starts bleiben liegen; die Absturz-Ursache von gestern
  ueberlebt den Neustart von heute. Gate + Register 28/28 gruen, Worker
  28.07. 00:44 neu gestartet.
- **W-STABIL-6 Morgenlauf: FERTIG (28.07.2026).** Scheduler im MAS: taeglich
  ab 06:30 (CLARA_MORGENLAUF_ZEIT, Not-Aus CLARA_MORGENLAUF=0) laufen
  Faehigkeits-Ping + Verkaufskern-Register (SAFE-Modus, 28 Faelle, keine
  echten Pushes/SMS aus den Tests) — das Ergebnis kommt als EIN Push aufs
  Handy ("Morgenlauf: GRUEN — Ping gruen (10 Checks) | Register 28/28",
  Link auf die Statusseite). Handausloesung: POST /clara/morgenlauf/run
  (?push=0 fuer stumm). Live bewiesen 28.07. 00:14 Uhr: Ping gruen,
  Register 28/28, Laufzeit ~2,5 min.
- **W-STABIL-7 Konfig ins Tag: FERTIG (28.07.2026).** (1) Export:
  `scripts/konfig-export.mjs` schreibt den wirksamen Zustand ausserhalb von
  Git als committete Snapshots nach `backend/config-snapshots/` — ElevenLabs-
  Agenten Lisa+Bianca (Prompt/erste Ansage/Stimme/Tools; Secrets rekursiv
  entfernt), Firestore `settings/lenaStt`+`sophieKatalog` (Inhalt+Hash),
  Env-Schluessel-NAMEN beider Repos (nie Werte). `--check` vergleicht nur.
  (2) Drift-Wache: Health-Check "Konfig-Drift" laesst den Exporter im
  Vergleichsmodus laufen — aendert jemand z. B. den Lisa-Prompt in der
  ElevenLabs-Konsole, wird die Status-Seite rot und der Morgenlauf meldet es
  aufs Handy. (3) Versionspaar: Health-Check "Versionsstand" zeigt
  `git describe` von MAS UND Clara (inkl. -dirty) + Konfig-Snapshot-Datum.
  (4) Harter Startabbruch: start-clara.ps1 bricht ohne .env bzw. ohne die
  7 Pflichtschluessel mit roter Liste ab (vorher: stiller Fallback auf
  lokale SFU-Dev-Creds = Telefon tot ohne Fehlerbild); Abgleich gegen die
  exportierte Schluessel-Liste; Notaus CLARA_START_TROTZDEM=1. Abbruch- und
  Normalpfad beide bewiesen. (5) Rollback WIRKLICH geuebt: checkout
  `stabil-2026-07-27-nacht` -> Kernmodule kompilieren + Sprech-Schicht gruen
  auf dem alten Stand -> zurueck auf `v5.4-speed`, HEAD byte-identisch.
- **W-STABIL-8 Neubau aus dem Verkaufskern: FERTIG (28.07.2026).**
  Fristen-/Rechnungs-Waechter (Punkte 24/25) — EIN Waechter, EINE
  Wiedervorlage-Liste, drei Quellen. (1) `brain/critical.js` erweitert:
  Rechnungs-/Zahlungssignal (`invoiceOrPayment`), Betrags-Extraktion in Cent
  (`extractAmountCents`, NIE gesprochen — nur Karte), mehr Frist-Muster
  ("Widerspruch bis", "Zahlungsfrist", "zu zahlen bis") und die
  Stark/Schwach-Unterscheidung `deadlineStrong` (Werbe-"bis zum" wie
  FLYERALARM kommt NICHT auf die Wiedervorlage — Live-Befund im ersten
  Lauf). (2) Drei Quellen tragen die Felder: Mail-Sync
  (`mailbox.recordInboundMail`), gescannte Post (`documents.saveDocument`
  bewertet jetzt — vorher OHNE Frist-Feld) und Telefon-Transkripte
  (`brain/extractor.js` + Ingest-Route). NEU: Mail-ANLAGEN werden beim Sync
  automatisch gelesen (PDF-Textlayer/Vision-OCR, max. 3 Anlagen je Mail,
  Signatur-Logos ausgenommen, asynchron, Notaus `MAS_MAIL_ANHANG_OCR=0`) und
  als bewertete Unterlage in `mas_documents` + Gehirn uebernommen — Hauspost
  kommt gescannt als E-Mail-Anlage (O-Ton Chef). (3) Lese-Modell
  `brain/wiedervorlage.js` (offene starke Fristen + Kritisches + Rechnungen,
  nach Faelligkeit; Verstrichenes faellt nach 14 Tagen raus), Tools
  `POST /tools/wiedervorlage` (+ Karte `karteWiedervorlage` mit Betraegen)
  und `POST /tools/wiedervorlage-erledigt` (Sprach-Quittung; mehrdeutig =>
  Rueckfrage, nie raten). Clara-Profil: 2 neue Tools (Gruppe `post`),
  Subsetting-Keywords frist/wiedervorlage/rechnung/mahnung/widerspruch
  (bewusst OHNE breite Woerter wie "faellig" — kaperte die QM-Frage;
  das Abhaken zusaetzlich in Gruppe `memo`, weil "Die Sache mit X ist
  erledigt" wie ein Aufgaben-Satz routet), Register vk-24/vk-25/vk-25b.
  Mahn-KASKADEN desselben Absenders werden gebuendelt (neuestes Schreiben
  zaehlt, "N Schreiben" wird mitgesprochen; Abhaken erledigt ALLE Schreiben
  des Vorgangs — Live-Befund: FLYERALARM stand dreifach drauf). Beweis:
  `scripts/test-wiedervorlage.mjs` (40 Pruefungen, inkl. Firestore-Kette
  mit Aufraeumen), bestehende Tests critical/extractor/karten gruen,
  Clara-Register 31/31, Route live gegen echte Praxisdaten geprueft
  (Netdental, FLYERALARM-Kaskade 4 Schreiben, Unterlagen-Anforderung).
- **W-STABIL-9 Lueckenfueller Ende-zu-Ende (Audit 27.07., Befund im
  Verkaufskern-Dokument):** Die Kette ist GEBAUT und der Maschinenraum
  gruen (Modultest `test-gap-fill.mjs` inkl. Abwesenheits-Block; Cloud
  Functions `masSearchPatients`/`masBookAppointment` deployt; Scheduler
  fuer Ergebnis-Sweep und Initiative-Scan laufen). Kein Neubau noetig —
  fehlend sind NUR die Beweise: (a) Register-Dialog `vk-18b` (gezieltes
  Einbestellen) gruen, (b) EIN begleiteter Livetest mit dem Chef:
  Testliste freigeben -> Lisa ruft eine Testnummer an -> Buchung/Bericht
  kommen nachweisbar zurueck. Erst dann gilt Block C als verkaufsfertig.
  **Stand 28.07.2026 nachts: (a) ERLEDIGT** — Register komplett gruen
  (31/31, inkl. vk-18 UND vk-18b als Mehrzug-Dialoge), Lese-Endpunkte
  live geprueft (Gap-Briefing "keine nennenswerten Luecken", Kandidaten
  mit echten Faelligkeiten, Status). **(b) VORBEREITET:** Schritt-fuer-
  Schritt-Anleitung fuer den 5-Minuten-Livetest liegt in
  `docs/LIVETEST_LUECKENFUELLER.md` (Weg A: Einbestellen auf die eigene
  Handynummer; Weg B: Recall-Liste). Nachts bewusst NICHT ausgefuehrt —
  echte Anrufe nur begleitet.
- **W-STABIL-9c SMS-Zusage + Kontakt-Zaehler (Chef 28.07.2026 frueh) —
  FERTIG gebaut, wartet auf den begleiteten Livetest.** Chef-Vorgaben
  woertlich: "fuer die sms braeuchten wir eine html seite wo die zusagen
  koennen, und dann muss bei der ersten zusage die luecke geschlossen
  werden" + "angerufene oder angesimste patienten muessen einen laufenden
  zaehler bekommen (sichtbar als hochgestellte zahl) ... eine
  gesamtkontaktzahl und eine gruene zahl wo das funktioniert hat. dadurch
  ranken wir unsere patienten und achten auf spam. ausserdem muss nach
  termin ueber dieses verfahren der patient aus dem recallbucket
  gestrichen und neu sortiert werden." Umsetzung:
  * **Online-Zusage:** Jede Recall-SMS traegt einen Link auf
    `/z/<clientId>/<token>` (oeffentlich, Token = 96-Bit-Ticket pro
    Kandidat/Slot, Ablauf mit Slot-Beginn; `clara/slotClaim.js` +
    `routes/zusage.js`, Auth-Freigabe wie QR-Landing). ERSTE Zusage
    reserviert per Firestore-Transaktion am Fall (`callList.slotClaim`)
    und bucht fest ueber `commitBooking` (derselbe Weg wie Lisas
    Telefon-Zusagen); alle spaeteren Klicker sehen "schon vergeben",
    nach Slot-Beginn "abgelaufen". Absage ueber die Seite wird als
    outcome=declined am Kandidaten protokolliert. Buchungsfehler:
    ehrliche Seite ("wir melden uns") + ACHTUNG-Notiz am Fall,
    Reservierung wird freigegeben.
  * **Kontakt-Zaehler** (`clara/outreachStats.js`,
    `mas_patient_outreach/{patientId}`): jeder Anruf/jede SMS aus
    Recall-Listen, Sweep-Fallback und gezieltem Einbestellen zaehlt
    (recordContact); jede Buchung ueber die Strecke (Online-Zusage,
    Sweep-Zusage, Live-Buchung im Gespraech) erhoeht die Erfolgszahl.
    Anzeige als hochgestellte Zahlen am Namen: **"Maria Ackermann ⁵ ✓²"**
    — ✓-Zahl = "gruene" Erfolgszahl; die neue Kandidaten-Karte
    (`karteRecallKandidaten`, eine je Anrufliste, an
    `/tools/recall-candidates`) faerbt per Level (ok=hat gebucht,
    warn=mehrfach kontaktiert ohne Termin) und traegt die Rohwerte
    strukturiert (echtes Gruen kann die Handy-App spaeter rendern —
    Warteliste). Gesprochen nur wenn auffaellig ("schon dreimal
    kontaktiert, bisher ohne Termin").
  * **Ranking + Spam-Wache** (`gapFill.rankCandidatesForGap`): bei
    gleicher Faelligkeit zuerst, wer WENIG juengste Kontakte hat; wer
    im 90-Tage-Fenster >= 3-mal kontaktiert wurde und NIE gebucht hat,
    fliegt raus (Notaus/Feintuning: MAS_OUTREACH_SPAM_MAX,
    _SPAM_WINDOW_DAYS, _BOOKED_SUPPRESS_DAYS).
  * **Bucket-Streichung nach Buchung** (`markConverted`): Kampagnen-
    Patient bekommt appointmentMade=true (das Konversions-Flag, das
    gapFill schon immer als "raus aus dem Bucket" liest — die Plattform
    sortiert anhand des NEUEN Termins neu ein); zusaetzlich 60-Tage-
    Sperre im Zaehler-Ledger, die auch virtuelle Recalls unterdrueckt
    (deren Plattform-Platzhalter fassen wir nicht an).
  * **Kandidaten-Ansage nach Thema** (`buildSpokenGapCandidates`): je
    Bucket/Kampagne mit Zweck ("aus der Kampagne PZR — professionelle
    Zahnreinigung: ..."), Faelligkeit ab 2 Monaten in Monaten gesprochen.
  * **Livetest-Fenster** (`testRedirect.activeTenantRedirect` +
    `scripts/set-live-test-redirect.mjs <minuten|off>`, Maximum 240):
    befristet gehen ALLE Lisa-Anrufe/SMS des Mandanten an den
    Testpatienten (Chef-Handy) und ALLE Buchungswege buchen den
    TESTPATIENTEN (demo_petsassss) statt des echten Patienten —
    Zaehler/Bucket-Streichung bleiben im Testlauf bewusst unangetastet.
    Test-SMS-Clip 600 statt 480, damit der [TESTLAUF]-Vorspann nie den
    Zusage-Link kappt.
  * **Zwischenstand** zaehlt Online-Zusagen mit ("N Termine fest gebucht,
    davon X ueber den SMS-Link"); SMS-Kandidaten mit Web-Antwort zaehlen
    nicht mehr als "nur SMS verschickt".
  * **Beweise:** `scripts/test-slot-claim.mjs` (12 Firestore-Pins:
    erste gewinnt, vergeben ueber Telefon-Weg, abgelaufen, Absage-
    Fortschreibung, Doppelklick-Idempotenz; raeumt auf),
    `scripts/test-outreach-stats.mjs` (21 Pins: Anzeige, Fenster, Tore,
    Ranking, SMS-Link ueberlebt jede Kuerzung),
    `scripts/test-live-redirect-window.mjs` (8 Pins, stellt Original-
    Konfig wieder her); Regression gruen: test-gap-fill (63),
    test-outreach (44), test-test-redirect (8), test-karten;
    Live-Probe: /z-Seite lokal (offen -> Absage -> persistiert,
    outcome=declined am Fall) UND ueber den oeffentlichen Tunnel
    (404-Seite "Link ungueltig" fuer fremde Tokens). Livetest-Anleitung
    komplett neu: `docs/LIVETEST_LUECKENFUELLER.md`.

Feste Regeln ab sofort: eine Verhaltensaenderung pro Neustart; kein Neustart
waehrend der Chef telefoniert; kein "fertig" ohne Register-Zahlen.

Danach (nicht davor): **W-UMBAU** — Aufraeumen OHNE Verhaltensbruch.

**CHEF-LEITPLANKE (28.07.2026, O-Ton): "Mir gefiel der deterministische
Kern eingebettet in ein LLM-Konstrukt, damit sich das lebendiger anhoert
— das LLM ist total wichtig in der Konstruktion des Satzes. Bitte macht
das nicht so steif!"** Daraus verbindlich fuer JEDE Umbau-Session:

- Der Router entscheidet nur, WELCHES Werkzeug laeuft und WELCHE Fakten
  gelten — deterministisch, nachvollziehbar, an EINER Stelle.
- Den gesprochenen SATZ baut weiterhin das LLM. Umformulieren ist erlaubt
  und ERWUENSCHT (lebendig, variantenreich, Kontextbezug) — Clara soll
  sich NICHT wie ein Automat anhoeren.
- Dazwischen steht die Fakten-Treue-Wache: Zahlen, Daten, Uhrzeiten und
  Namen aus dem Tool-Ergebnis duerfen beim Formulieren nicht veraendert
  oder erfunden werden (inventsNumbers-Muster aus `clara/summarize.js`;
  `response_guard` bleibt die letzte Instanz vor dem Mund).
- **Relative Zeitangaben sind menschlicher (Chef 28.07.2026):** gesprochen
  wird "morgen", "am kommenden Dienstag", "in zwei Wochen" — das nackte
  Datum NUR bei Nachfrage oder wenn es sonst unklar waere. (Genau so
  arbeitet `response_guard.sanitize_reply` seit 12.06. — beim Umbau
  NICHT rueckbauen, sondern als Sprachregel uebernehmen.)
- Die alte Formulierung "Faktenantworten ohne LLM-Umformulierung" ist
  damit GESTRICHEN. `speak_result: verbatim` bleibt nur, wo Woertlichkeit
  gewollt ist (Lisa-Anweisungen woertlich vorlesen, Telefonnummern,
  Rueckfrage-Saetze mit Ja/Nein-Anker) — nicht als Standard.
- **Abschweifungen sind ERWUENSCHT (Chef 28.07.2026):** Der Router faengt
  nur KLARE Absichten ab (Kalenderfakten, Auftraege, Freigaben). Alles
  andere — Smalltalk, Abschweifungen, Meinungs- und Themenwechsel-Saetze
  — geht OHNE Umleitung ans LLM und wird VOM LLM beantwortet. Kein
  Router-Treffer heisst: LLM antwortet frei (dasselbe Prinzip wie beim
  Tool-Subsetting: kein Treffer -> volle Liste). Eine Clara, die jede
  Abschweifung abwuergt, ist unverkaeuflich.
- **Mehrzug-Gespraeche: Thema erschliessen statt Torschuss aus dem
  Sechzehner (Chef 28.07.2026, O-Ton):** "Beim Fussball, wenn der Ball
  beim eigenen Torwart ist, erwartet keiner, dass dieser aus seinem
  Sechzehn-Meter-Raum ein Tor erzielt. Der Ball laeuft ueber
  Pass-Stafetten ueber das ganze Feld, bis er im gegnerischen Tor
  landet. Das gilt auch fuer uns und die Themenbewaeltigung: nicht
  sofort aufs Tor schiessen, sondern das Thema erschliessen." Konkret:
  Rueckfragen und Zwischenschritte sind GUT; ein Thema darf sich ueber
  mehrere Zuege entwickeln (Merkzettel/dialog_state nutzen); weder
  Router noch Prompt duerfen erzwingen, dass in Zug eins alles
  verstanden UND beantwortet wird.
- **Kleines Gespraechs-Gedaechtnis fuer relative Bezuege (Chef
  28.07.2026, O-Ton):** "Wenn man ueber Patient A spricht, muss man auch
  nach drei Saetzen noch etwas erzielen koennen. Beispiel: '... ok, dann
  buch ihm einen Termin.' Nicht nach jedem Zug bei null landen."
  Konkret: Pronomen und Rueckbezuege ("ihm", "sie", "den um vierzehn
  Uhr") loesen sich gegen den Gespraechs-Merkzettel auf (dialog_state +
  Namens-Carryover); der Gegenstand bleibt ueber Zuege erhalten, bis ein
  neues Thema ihn abloest. Jeder Router-Baustein liest deshalb den
  Verlauf mit (letzte ~3 Nutzer-Zuege), nie nur den Einzelsatz.

Arbeitspakete (je eines FERTIG vor dem naechsten, je ein Gate + Neustart):

- **W-UMBAU-1 Router-Inventur + Konsolidierung: FERTIG (28.07.2026).**
  86 Namen (alle Absichts-Muster + Datums-/Personen-/Auftrags-Extraktion,
  1.149 Zeilen) byte-identisch aus dem Provider nach
  `services/intent_router.py` gezogen; Provider re-exportiert (Altimporte
  und Tests tragen weiter), `_sanitize_tool_calls` + Stream-Ablauf blieben
  im Provider. Chef-Leitplanke steht im Modulkopf. Neue Pin-Testdatei
  `testsuite/test_intent_router.py` (39 Pins fuer bisher ungetestete
  Erkenner, als Gate-Schritt eingehaengt); Statik-Beweis per AST (keine
  fehlenden Namen). Beifang des Register-Nachtlaufs (reg-05 rot, als
  eigener Commit gefixt): (1) Perfekt-Behauptung "Ich habe Lisa
  ANGEWIESEN ... anzurufen" schluepfte am Sprech-Waechter vorbei
  (kannte nur Praesens/Futur; Verneinung zaehlt jetzt nur im Umfeld der
  Zusage, nicht in der Nachricht); (2) Imperativ-Auftrag "sag ihm, er
  muss ..." war fuer den Auftragstext-Extraktor unsichtbar (kannte nur
  Infinitive); (3) NEU Freigabe-ERDUNG: approve_absence/approve_recall
  ohne ihr Thema im Gespraech (Claras letzte Antwort oder aktueller
  Satz) wird verworfen — das Modell hatte auf "Ja, bitte genau so."
  eine nie besprochene Urlaubs-Freigabe gerufen. Beweis: Register 31/31
  strict, reg-05 zusaetzlich 2x solo gruen, Voll-Gate.
- **W-UMBAU-2 Lebendig sprechen statt Monolog: FERTIG (28.07.2026).**
  Alle Kandidaten entschieden — 5 Werkzeuge erzaehlen jetzt frei
  (FreiSprech: LLM formuliert, Fakten-Guard prueft, deterministischer
  Rueckfall), 2 bleiben BEGRUENDET woertlich:
  * **lisa_call_result** (Register vk-12) + **comms_digest** (vk-23):
    Bericht ueber delegierte Anrufe / Eingaenge. Beifang: NEUE Guard-
    Stufe **Handelnden-Wache** — die Umformulierung machte aus "Lisa hat
    Dr. Petsas erreicht" ein "ICH habe gerade Dr. Petsas erreicht"
    (Zahlen/Namen stimmten, der Guard war blind); Ich-Taten nur, wenn
    die Quelle sie selbst sagt; "Dr." sprengte das Suchfenster
    (Abkuerzungspunkte gefaltet); Prompt-Regel 10.
  * **wiedervorlage** (vk-24/25): Bericht frei, die ABHAK-ANLEITUNG
    ('Zum Abhaken: "Die Sache mit ... ist erledigt."') bleibt als
    exportierte Konstante WOERTLICH — sie ist ein Sprachbefehl. Beifang:
    Prompt-Regel 11 (keine dazuerfundenen Aufforderungen — "Bitte passt
    das an" aus der Live-Probe).
  * **absence_status** (NEU Register vk-22b) + **recall_status** (NEU
    vk-18c): Zwischenstaende frei. Beifang mit Grundsatz-Wert: NEUE
    zentrale **Pflichtwort-Wache** `pflichtOk` in freiFormulieren — der
    generische namenOk sieht nur Namen MIT Anrede; Absender ("Finanzamt
    Bochum"), Kalendernamen, Zeitfenster ("vormittags"), Tages-Kern
    ("morgen") und Handlungsanker ("Beschwerde", "Monitor") gehen als
    Pflichtwoerter mit; fehlt eines, bleibt der deterministische Satz.
    Der LEERE Recall-Fall bleibt woertlich ("Sage: Recall starten" =
    Sprachbefehl).
  * **read_ratings**: bleibt verbatim — Patienten-Zitate + autorisierte
    Pointen aus humor.js sind gewollter Wortlaut. **qm_calendar**:
    bleibt verbatim — Compliance-Antworten (Prueffristen), viele
    ungeschuetzte Eigennamen. Die 7 Briefings liefen schon vorher ueber
    FreiSprech.
  Beweis: `scripts/test-freisprech.mjs` (Guard-Units + 5 LLM-Laeufe mit
  Pflichtwort-Invarianten), `scripts/test-wiedervorlage.mjs`
  (Konstanten-Kopplung), Live-Proben je Route, Register-Stichproben +
  voller Register-Lauf strict.
  **Beifang vk-18b (Register-Nachtlauf):** (1) Der Fall lief auf eine
  ECHTE Mehrdeutigkeit (zwei Ackermanns im Bestand, Clara fragt korrekt
  zurueck; das Drehbuch kann nicht antworten) -> Fall nutzt jetzt den
  vollen Namen "Marina Ackermann". Mehrdeutigkeits-DIALOG als eigener
  Register-Fall: Warteliste. (2) SUITE-PARITAETS-LOCH geschlossen:
  run_tests.py wandte die Anruf-Waechter (call_outcome_claim /
  call_promise_claim, Live-Worker Z. 835-860) NICHT an — der Report
  zeigte ein leeres Versprechen ("Ich rufe Marina Ackermann an ...",
  tool=none, Guard-Zaehler 0), das Clara live nie gesagt haette. Jetzt
  Paritaet + call_claim_blocked im Halluzinations-Zaehler.
  **Beifang vk-17 (zweiter Nachtlauf, Flake):** Die Kandidaten-Synthese
  verlangte Recall-Kontext in der VORHERIGEN Antwort — die
  selbsttragende Erstfrage ("Welche RECALL-Patienten schlaegst du fuer
  die LUECKEN vor?") hatte keinen Verlauf, das Modell stellte statt
  Tool-Call eine Tages-Rueckfrage (mit leerer "Ich schaue nach"-Floskel).
  Jetzt zaehlen starke Themen-Woerter (recall/anruflist/lueck) auch im
  Satz selbst; "Kandidat" allein bleibt kontextgebunden. Pins in
  test_intent_router; vk-17/vk-18/vk-18b 3/3 gruen, Schnell-Gate gruen,
  Worker neu gestartet (registered 05:48).
  Warteliste (Befund Live-Probe comms_digest): die EINZELZEILEN des
  Eingaenge-Berichts bleiben schematisch, weil die QUELLE
  Extractor-Artefakte enthaelt ("(buchen/verschieben/absagen)",
  Zitat-Klammern aus der Evidenz) — das ist ein Quellseiten-Aufraeumen
  in buildSpokenComms/Extractor-Summary, eigener Posten, NICHT per
  Umformulierung loesbar.
- **W-UMBAU-3 Werkzeug-Konsolidierung: FERTIG (28.07.2026).** Befund per
  Inventur (`testsuite/tool_inventur.py`, neu): 67 Werkzeuge, ALLE mit
  group-Feld, KEINE zwei Tools auf derselben Route, keine deaktivierten
  Leichen; Faehigkeits-Ping meldet 67/67 Routen im MAS vorhanden, 9/9
  Cloud Functions erreichbar. Doppel-Tools zusammenlegen und Gruppen
  saeubern war also durch fruehere Pakete bereits erledigt. Beschreibungen
  (~11.400 Tokens gesamt, pro Zug durch Tool-Subsetting auf 15-30 Tools
  begrenzt): Sichtpruefung der laengsten (save_treatment_dictation,
  gapfill_call_patient, termin_abrechnen, alle Briefings) ergab — das
  sind VERHALTENSREGELN aus echten Vorfaellen (Hint-Protokoll, confirm-
  Ablauf, needsMotive/needsOverride, Morgen-Auftakt-Abgrenzung), KEIN
  Geruempel; grosses Kuerzen waere Rueckbau von Fixes. Einzige echte
  woertliche Doppelung: search_patient trug das Hint-Protokoll ZWEIMAL —
  jetzt EIN Satz mit der Vereinigungsmenge der Ausloeser. Beweis:
  Subsetting-Test, vk-18b + reg-04 gruen, Schnell-Gate gruen, Worker mit
  gestagtem Profil neu registriert (06:00).
- **W-UMBAU-4 Pfad-Trennung: FERTIG (28.07.2026).** Befund: Die Trennung
  hing an EINER Weiche (`_patient_gates_enabled` in worker_llm_turn —
  Clara faehrt assistant_mode=internal, damit sind alle 11 Bianca-Gates
  an den Aufrufstellen abgeschaltet); die Bianca-Strecke selbst vertraute
  blind darauf. Jetzt DOPPELSCHLOSS: jeder Gate-Einstieg des
  BiancaFlowMixin (intent_router, doctor_presence, fast_side, manage_flow,
  smalltalk, ask_doctor_first, slot_search, reprompt_pick, booking_flow,
  finalize, ask_confirmation) sichert sich SELBST ab und kehrt fuer
  interne Profile sofort um — haelt auch, wenn eine kuenftige
  Aufrufstelle die Weiche vergisst. Patienten-Strecke byte-gleich
  (Gegenprobe im Test). Die Booking-Restberuehrungen im Session-Kern
  (`_has_active_booking` an Begruessung/Reconnect) sind ohne aktive
  Buchung No-ops und bleiben. PHYSISCH bleibt das Bianca-Erbe (ruhend)
  im Worker, bis die neue eigenstaendige Bianca steht — Hochzeit spaeter,
  ein Herausreissen jetzt waere Rueckbau erreichter Funktionen
  (pickadoc_demo/Patienten-Demo laeuft ueber dieselbe Strecke). Beweis:
  NEU `testsuite/test_pfad_trennung.py` (17 Pins: Weichen-Wahrheitstafel,
  alle 11 Doppelschloesser, Gegenprobe Patientenpfad offen, Live-Profil
  traegt internal) — im Schnell-Gate verankert; Gate gruen, Worker neu
  registriert.

## Reihenfolge

0. **W-STABIL vor allem anderen** - solange W-STABIL-1 bis -7 nicht stehen,
   keine neuen Faehigkeiten (Ausnahme: P0-Fehler mit Register-Fall).
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
  → TEILWEISE ERLEDIGT 16.07.: `/m/ipad.html` + `/m/ipad-app.html` (Clara
  LiveKit voll, Querformat-Split Clara|Lena) + `POST /treatment/current`
  (Raum→Termin, deviceKey-gated). Backend neu gestartet (Route antwortet).
  OFFEN: Hosting-Deploy fuer `?embedded=1` auf dictationPage, Live-Abnahme
  am Stuhl.
- 18.07.2026: Weitere Fachrichtungs-Doku-Templates (Ortho/HNO/Derma/…) —
  erst wenn Zahnmedizin (W-LENA-8) rund ist; Chef: Erfahrung fehlt.
- 21.07.2026: **Clara als Souffleuse am Stuhl** — DONE 21.07.: waehrend
  Aufnahme alle ~45 s ein `coach_speak` „Denk noch an: {Box}.“ zu offenen
  Template-Luecken; Box-Fokus; kein Dialog. Nachdiktat-Feintuning spaeter.
- 21.07.2026: **Anamnese-Box vorausgefüllt** (SignR/Akte: Allergien,
  Medikamente, Risiken) auf der Aufnahme-Seite; Chef ergaenzt nur Abweichungen.
- 21.07.2026: **Nachdiktat als knapper Dialog** (nach der Behandlung) —
  Clara fragt gezielt offene Luecken ab; kein Smalltalk. Getrennt von der
  Souffleuse am Stuhl. **Feintuning Behandlungsschritte: spaeter.**
- 21.07.2026 (Chef, praezisiert): **Nachdiktat als intensives Gespraech —
  Abrechnungs-Vorbereitung.** Alle abrechnungsrelevanten Positionen muessen
  im Nachdiktat erfasst werden. Clara deckt Luecken EXPLIZIT anhand
  Termingrund + diktierten Behandlungen auf (wurde anaesthesiert? Roentgen?
  Kofferdam? etc.). Dafuer **explizite Frage-Skripte je Behandlungsart**
  (Fuellung/Endo/Extraktion/PZR/ZE ...) erstellen — Skripte kommen spaeter,
  Struktur analog `openGapPrompts` in `lena-doku-template-zahn.js`.
- 21.07.2026: **Tages-Schema (nicht 01)** — waehrend Behandlungsaufnahme
  Stimme → FDI-Schema mit Zeilen Befund/Therapie/Paro/Kiefer (OK oben,
  UK unten). 01-Modus bleibt Erstuntersuchung (spaeter). Beispiel:
  „34 Karies distal“ → Befund KaD; „Füllung inzisal distal“ → Therapie FuOD.
- 25.07.2026: **W-DATEN — Clara als Datenassistentin schaerfen (Chef, NICHT
  Zahnmedizin).** Drei aufeinander aufbauende Pakete: (1) **Namen & Kontakte
  verstehen** — STT-Bias zusaetzlich aus Korrespondenz/Kartei (Anrufer/Absender
  aus dem Praxisgedaechtnis), nicht nur Kalenderfenster; beschraenkt (Recency +
  Cap, kein 13k-Dump). (2) **Anrufe wann + Inhalt** — call_log liest Zeitpunkt
  UND Inhalt/Zusammenfassung je Anruf, gedeckt aus dem Ereignis (Fakten-Waechter
  bleibt). (3) **Dringende Rueckruf-Warnung** — verlaesslich in Briefing/Heads-up
  + proaktiv (baut auf asapQueue/interruptPolicy). START mit (1): Fundament, ist
  Voraussetzung fuer (2)+(3). Fuzzy-Anlaut-Schaerfung (T/D/Z, P/B, K/G, F/V/W) in
  Clara-Voice `stt_postcorrect` bereits erledigt (Gate gruen).
- 27.07.2026: **Rueckgaengig-Werkzeug** ("nee, doch nicht") — haeufigster
  menschlicher Gesprächszug, existiert bei Clara gar nicht. Strategisch
  interessant: je verlaesslicher das Rueckgaengig, desto WENIGER
  Bestaetigungsfragen braucht man. Aus W-DIALOG ausgeklammert.
- 27.07.2026: **Freigewordenen Slot proaktiv anbieten** — nach einer Absage
  "der Platz um 14 Uhr ist frei, Frau Yildiz wartet auf so einen - soll ich
  fragen?". Daten liegen vor (Recall-Kandidaten, Luecken-Briefing). Erst nach
  W-DIALOG, sonst zwei Baustellen gleichzeitig.
- 27.07.2026: **Echtes Familien-/Haushalts-Feld in der Plattform** — es gibt
  KEINE Verknuepfung zwischen Patienten (kein household/relative/Begleitperson;
  `familyDoctorName` ist der Hausarzt). W-DIALOG faehrt zunaechst die Heuristik
  (gleiche Startzeit + gleicher Nachname) als FRAGE. Bewaehrt sie sich, ist das
  die Begruendung fuer das richtige Feld (Datenmigration + Oberflaeche).
- 27.07.2026: **Laborauftrags-Status** ("die Prothese ist noch nicht fertig") —
  im System nicht vorhanden, Labor existiert nur als Mail-Kategorie und
  Adressbuch-Kontakt. Braucht eine neue Datenquelle, kein KI-Thema.
- 27.07.2026: **Anrufernummer -> Patient bei Bianca** — die Rufnummer kommt
  nirgends aus der Telefonie in die Sitzung (`callerPhone` ist nur ein
  optionaler Tool-Parameter, den niemand fuellt), deshalb fragt Bianca Name und
  Nummer ab, die die Anlage beim Klingeln mitliefert. Wichtig: Nummer ist ein
  Anhaltspunkt, KEIN Ausweis (am Handy geht auch die Ehefrau ran) — also
  "Spreche ich mit Herrn Meier?" statt Formular. Zurueckgestellt, weil Bianca
  gerade neu gebaut wird (Chef 27.07.).
- 27.07.2026: **Lisa fragt trotz vorhandenem Kontext nach Name/Nummer** — ihre
  Architektur ist richtig (Buchungswerkzeuge nehmen nur `slot_iso`, der Task ist
  die Autoritaet, Name/Nummer gehen als Dynamic Variables). Also entweder nutzt
  der ElevenLabs-Agenten-Prompt die Variablen nicht, oder `bookingContext` war
  leer (Patient nicht per ID aufloesbar -> Rueckfallmodus ohne Werkzeuge). An
  einem konkreten Anruf pruefbar: Task traegt `transcriptText` + `bookingContext`.

## Aenderungslog

- 28.07.2026 (frueh, Nachtschicht): **Masterplan-Schlussstand — alle autonom
  baubaren Pakete FERTIG.** In dieser Nacht abgeschlossen: W-STABIL-5/-6/-7/
  -8/-9a (Protokolle, Morgenlauf, Konfig ins Tag, Fristen-/Rechnungs-
  Waechter + Wiedervorlage, Lueckenfueller-Register), W-UMBAU-1 bis -4
  (Absichts-Router konsolidiert; FreiSprech auf lisa_call_result/
  comms_digest/wiedervorlage/absence_status/recall_status mit Handelnden-
  und Pflichtwort-Wache; Werkzeug-Inventur + search_patient-Dedup;
  Pfad-Trennung Clara/Bianca per Doppelschloss) sowie W-HUMAN-Abschluss
  (Chat-Spur verifiziert auf Qwen 3.6). Register 33/33 strict, Morgenlauf
  06:35 GRUEN (Ping 13 Checks, Push aufs Handy). **Was JETZT noch offen
  ist, braucht den Chef oder externen Takt:**
  * **Livetest Lueckenfueller (W-STABIL-9b):** 5-Minuten-Anleitung liegt in
    `docs/LIVETEST_LUECKENFUELLER.md` — echte Anrufe nur begleitet.
  * **Hardware/vor Ort:** Shokz pairen + Zimmer-Live-Probe (Phase 3),
    echte Zimmer-Aufnahmen, WER-Messung Lena, iPad-Abnahme am Stuhl.
  * **Extern getaktet:** Dens-Office-Kickoff (Phase 2), 5090-Umzug.
  * **Groessere Folgepakete (Reihenfolge = Vorschlag):** W-LENA-4/-5
    (Korrektur-Modell, Abrechnungs-Bruecke), Phase 6 (RBAC,
    Gedaechtnis-Hygiene, Transparenz, Rezeptions-Flows), Phase 7-Rest
    (Profil-Split clara_base+Overlay, Zweit-Mandant systematisch,
    Flotten-Monitoring), Phase 5-Rest (Entity-Linking, ROI-Zaehler),
    Phase 4 (Ambient-Doku), W-INTENT und die Warteliste (u. a.
    Rueckgaengig-Werkzeug, Slot-Nachrueck-Angebot, comms_digest-
    Einzelzeilen-Aufraeumen, Firestore-Datenbackup/gcloud).
- 27.07.2026 (abends): **W-STABIL beschlossen (Chef) — Verkaufskern +
  Regressions-Register statt weiterer Einzel-Fixes.** Der Chef hat den
  Verkaufskern festgelegt (`docs/VERKAUFSKERN_CLARA.md`, 27 Punkte inkl.
  Fristen-/Rechnungs-Waechter aus Mail + gescannter Post + Telefonaten).
  Befunde des Tages dokumentiert (unsichtbare Fehler, Testsuite prueft
  keinen gesprochenen Inhalt, SAFE-Gate sieht keine toten Endpunkte,
  min-pass 85, Konfig ausserhalb Git). Entscheidung: KEIN Rollback auf v6
  (v6 = Stand 10.07. = `stabil-2026-07-10-0035` + Testinstanz-Verkabelung;
  17 Tage aelter, enthaelt den Heads-up-Fehler); v6 bleibt Testinstanz.
  Bianca wird eigenstaendig neu entwickelt, Hochzeit erst wenn Clara steht.
- 25.07.2026: **W-DATEN-1 GEBAUT — Namen & Kontakte im STT-Bias (Chef).**
  `listPatientNamesForStt` (MAS `src/clara/sttPatientNames.js`) haengt jetzt
  additiv Korrespondenz-/Kontaktnamen an die Kalendernamen: (a) juengste
  `mas_events` (letzte 45 Tage, `queryLatest`) — `subject.name` + Nicht-Org-
  `counterparty.name`; (b) geteiltes Adressbuch `mas_contacts` (neue
  `listRecentContactNames`, neueste zuerst). Beschraenkt: 800 Events / 600
  Kontakte gescannt, max. 500 Namen ergaenzt, Anreden/Titel weg, Orgs raus
  (GmbH/Labor/Kasse…), dedupt gegen Kalender. Faellt der Scan aus -> exakt das
  alte Kalender-Verhalten (kein Regress). Route liefert `memoryCount` +
  `source=calendar+memory` (additiv, Vertrag gewahrt). Clara-Voice-Worker
  unveraendert (konsumiert `names`). Zusatz Clara-Voice `stt_postcorrect`:
  Anlaut-Verwechslungen (T/D/Z, P/B, K/G, F/V/W) im Fuzzy-Abgleich. Tests:
  `scripts/test-stt-memory-names.mjs` (pur) + `test_facts_guard.py` (Anlaut) +
  Clara-Gate gruen; `node --check` sauber. Wirkt nach MAS-Neustart + neuer
  Clara-Session.
- 24.07.2026: **Clara-Beschimpfungs-Konter (W-HUMAN-Zusatz, Chef)** — Clara
  kontert direkte Beleidigungen/Anmachen mit derb-humorvollen Spruechen
  (`services/worker_human.py`: `_ROAST_INSULT_RE`/`_ROAST_COMEON_RE` +
  Pools `roast_insult`/`roast_comeon`). Sicherheitsrahmen: laeuft NUR in der
  menschlichen Schicht (Clara intern, nie Bianca/Patient), erst NACH Ja/Nein-,
  Vent-, Ops-Gruppen- und Personen-Check (Arbeit gewinnt immer), nur bei
  klarer 2.-Person-Beleidigung ueber enges festes Lexikon. Plattformweit AUS,
  aktiv nur per Profil-Flag `banter.roast` (nur `clara_meddent`); Env-Notaus
  `CLARA_ROAST_LAYER=0`. Optionale Mini-LLM-Roast-Spur (`ROAST_PERSONA_PROMPT`
  + `_roast_lane_reply` + Nach-Guard `roast_reply_ok`) gebaut, aber hinter
  `banter.roast_llm` default AUS (Fallback immer auf Pool). Tests:
  `testsuite/test_human_layer.py` (Roast an/aus, Gegenprobe normale Saetze,
  Katalog auch mit `allow_roast=True` unangetastet) + Schnell-Gate gruen.
  Live-Wirkung nach Worker-Neustart (Chef).
- 22.07.2026: **Clara spricht IMMER relativ** — LLM-Zeitkontext sagte fälschlich
  „nenne Termine als JJJJ-MM-TT“ (gesprochen). Jetzt: Tools = ISO, Mund =
  heute/morgen/nächste Woche/in N Wochen. `response_guard` + MAS
  `relativeDayLabel` erweitern Ferntermine; Profil-Sprechstil-Regel.
- 22.07.2026: **Clara STT: Kalender-Patientennamen live** — kein Modell-
  Retrain. MAS `GET /clara/stt-patient-names` liefert Vor-/Nachnamen aus
  Terminen im Fenster letzte 2 Wochen + diese + naechste Woche (Heute/
  Morgen zuerst, Cache 30 min). Worker mischt bei `set_profile` in
  `stt_keywords`; Parakeet-Postcorrect mit Laengen-/Prefix-Buckets.
- 22.07.2026: **Clara STT: alle Patientennamen live nachziehen** — ersetzt
  durch Kalenderfenster (siehe Eintrag oben); Patientenstamm-Dump war zu
  gross (~13k) und unscharf.
- 21.07.2026: **Souffleuse am Stuhl** — iPad sendet `coach_speak` bei offenen
  Doku-Boxen („Denk noch an: Befund.“), Cooldown 45 s, erst ab 25 s Aufnahme;
  Worker-Pfad unveraendert (`_run_coach_speak`). Nachdiktat-Feintuning spaeter.
- 21.07.2026: **Voice-Zahnstatus MVP (KZBV)** — Katalog
  `lena-zahnstatus-katalog.js` (EBZ: **f=fehlend**), Parser
  `lena-voice-chart.js`, FDI-Schema in Doku-Box, Box-Fokus bei Live-Fill;
  01-Modus `Lena01.selectTooth` + `perio-voice.js` Poll. Füllung klinisch
  als `Fu`+Flächen (kein EBZ-f). 02-Tab-Führung auf Warteliste.
- 18.07.2026: **W-LENA-8e 01-Modus Visual** — `/m/lena-01/` schichtbasiertes
  SVG-Odontogramm (anatomische Silhouetten, Kronen-Kappen, Gingiva, Bruecke);
  Einstieg aus ipad-app. Referenz `F:\struktur01`, absichtlich schlanker.
- 18.07.2026: **W-LENA-8 gestartet (Chef)** — Lena Vorlagen-First Zahnmedizin:
  iPad wiz3 Doku-Template Hero, Rohdialog Accordion, 1-Mic-Default,
  Katalog `lena-doku-template-zahn.js`. Clara-Briefing und LLM-Fill folgen.

- 17.07.2026: **Lena-STT Halluzinations-Abwehr (Chef)** — Testaufnahmen (Overlap,
  Nuschelsaetze) zeigten "Unmengen an Halluzinationen": Canary (DE-Lock, kein
  Sprach-Jump) erfindet bei undeutlicher/ueberlappender Sprache selbstsichere
  DEUTSCHE Fehl-Woerter ("Lepon", "Zoe auf dem Stier"), plus viele Mikro-Segmente
  aus dem reinen Energie-VAD. Drei additive, flag-gated Stufen mit Notaus/Tests
  (Clara-Voice): (1) **Silero neuronales Sprach-Gate** `lena_stt/vad_silero.py`
  vor Canary — verwirft Segmente ohne echte Sprache (Bohrer/Rascheln), die das
  Energie-Gate durchlaesst (konservativ, `LENA_STT_SILERO_MIN_RATIO=0.05`,
  Notaus `LENA_STT_SILERO_GATE=0`; Deps `silero-vad`+`torchaudio` nur im Lena-GPU-
  venv, `--no-deps`). (2) **Halluzinations-Loop-Waechter** `hallucination_guard.py`
  — deutsche Loop-/Spam-Muster raus, kurze echte Antworten bleiben (Test
  `test_hallucination_guard.py` im Release-Gate, Notaus `LENA_STT_HALLU_GUARD=0`).
  (3) **Confidence** pro Segment immer geloggt + im `final`-JSON als `conf`; Gate
  (`LENA_STT_MIN_CONF>0`) erst nach Kalibrieren scharf. Dazu **Debug-Capture**
  `LENA_STT_CAPTURE_DIR` (WAV+JSONL je Segment) fuer echtes A/B-Tuning. `/health`
  zeigt `sileroVad`/`halluGuard`/`logConf`/`capture`.
- 17.07.2026: **Lena-STT: echte Aufnahme ausgewertet + Doppelungs-Filter (Chef)** —
  Capture einer echten Behandlung (89 Segmente) zeigte: Halluzinationen weitgehend
  geloest (Silero+Waechter verwarfen nur 4 Segmente, alle korrekt Nicht-Sprache;
  keine echte Doku verloren). ZWEI echte Restprobleme: (1) **Zwei-Mikro-Doppelung**
  — Ansteck- (`arzt`) und Raummikro (`raum`) hoeren beide den Behandler, jeder Satz
  kam DOPPELT (0,5–2 s versetzt, "…Zahn 37,8."/"…Zahn 378."). Neu: `dedup_guard.py`
  (prozessweiter Kurzzeit-Puffer, Text-Aehnlichkeit + enges Zeitfenster fuer
  divergente Zwillinge) -> 85->71 Segmente; Notaus `LENA_STT_DEDUP=0`, Test im
  Gate. GRENZE: <45%-aehnliche Zwillinge bleiben (Cross-Channel-Merge an der
  Speicherstelle mit source+Zeit = separates Paket). (2) **Confidence bei Canary
  unbrauchbar** (konstant 1.0) -> conf-Gate bleibt AUS. (3) **Fachbegriffe** teils
  falsch ("kariös"->"karriös", "Veneer"->"Venier") -> erledigt (siehe naechster
  Eintrag "Lena-Fachvokabular"). `startMs/endMs=0` + Cross-Channel-Merge -> erledigt
  (siehe Eintrag "Lena Zeitstempel durchgereicht + Cross-Channel-Merge").
- 17.07.2026: **Lena Zeitstempel durchgereicht + Cross-Channel-Merge (Chef)** —
  Ursache `startMs/endMs=0`: Lena SENDET die Zeiten im WS-`final`, aber sie gingen
  an DREI Stellen verloren — die Capture-Klassen (`lena-stt-capture.js`) reichten
  sie nicht durch `onFinal`, `postLenaSegment` sendete sie nicht, und die Route
  `/treatment/lena-segment` speicherte sie nicht. Jetzt end-to-end: Lena ->
  onFinal(…, {startMs,endMs}) -> iPad rechnet ABSOLUT (recStartedAtMs + Offset;
  beide Stereo-Kanaele teilen dieselbe Basis) -> Route speichert `startMs/endMs`
  (nur wenn plausibel >0). Additiv, Alt-Segmente/kein Timing unveraendert. Darauf
  aufbauend `src/lena/crossChannel.js`: an der SPEICHERSTELLE (Quelle+echte Zeit)
  werden Zwei-Mikro-Zwillinge zusammengefasst, die der STT-Server-Dedup nicht
  schafft — der divergente Live-Fall ("Den Zahn zwischen Raum…"/"Im
  Zahnzwischenraum, Approximalraum…") ist per Bigramm-Aehnlichkeit 0.74 (>=0.5) +
  Zeitfenster 2,5 s klar erkannt; echtes Gegen-Sprechen (Arzt/Patient, sim 0.32)
  bleibt. Eingehaengt in `structureTreatment` (Gespraech, nie Nachdiktat). Test:
  `node backend/scripts/test-lena-merge.mjs` (ohne Firebase/LLM). Der offene
  naechste Qualitaetshebel (Kontext-Korrektur der Fachbegriff-Garbles per qwen3.6)
  ist erledigt -> siehe Eintrag "Lena: Canary->qwen3.6-Fachbegriff-Korrektor".
- 17.07.2026: **Lena-Fachvokabular + umgangssprachliche Deutung (Chef)** — Drei
  Teile: (1) `lena_stt/data/medical_terms_de.txt` von ~150 auf 281 Begriffe
  erweitert (Adjektiv-/Befundformen kariös/insuffizient/gelockert/klopfempfindlich …,
  Plurale/Fehlformen Veneers, Schlifffacette, KFO-Begriffe); Fuzzy faengt jetzt
  "karriöse"->"kariöse", "Veniers"->"Veneers". (2) **ASCII-Umlaut-Bug behoben:**
  die alte Liste (ae/oe/ue) zog Canarys korrektes "Füllung"->"Fuellung",
  "Anästhesie"->"Anaesthesie" — jetzt echte Umlaute (nicht zurueckbauen). Gegenprobe:
  "seriöse" wird NICHT zu "kariöse". (3) **Umgangssprache->Fachsprache in der
  ANZEIGE-Zusammenfassung** (`lena/lenaDoc.js`, qwen3.6-Politik): 'Loch'->'kariöse
  Stelle', 'kaputt/abgebrochen'->'defekt/frakturiert', 'wackelt'->'gelockert',
  'Nerv'->'Pulpa' — nur bei eindeutigem Sinn, keine neue Diagnose/Gewissheit; die
  WOERTLICHE Akte (§ 630f Original-Segmente) bleibt unangetastet. Zusaetzlich in der
  Klassifikation abgesichert: umgangssprachliche Befunde ('Loch','kaputt','tut weh' …)
  gelten als klinisch und werden NIE als Smalltalk verworfen.
- 18.07.2026: **Lena Overnight-Optimierung (Whisper Primary)** — 33 DE-Zahnmedizin-
  YouTube-Quellen / 148 Min Clips; 17 Config-Sweeps. Winner: sanfte RMS-Norm
  (`TARGET_RMS=0.05`, `MAX_GAIN=3`, `BEAM=5`, Hotwords im Code default AUS).
  Aggressive Norm/Hotwords ohne VAD erzeugten Loops. Praxis-Startscript:
  `PRIMARY=whisper`, Hotwords AN (VAD filtert Stille). Bericht:
  `F:\Clara-Voice\logs\REPORT_lena_overnight.md`. Korpus unter
  `lena_stt/_overnight_corpus/`. Kein Canary-Finetune (braucht Labels).
- 17.07.2026: **Lena: Canary->qwen3.6-Fachbegriff-Korrektor (W-LENA-7, Chef)** —
  Chef-Entscheidung: **parakeet_de_med bleibt AUS der Live-Pipeline** (kein
  zweites STT-Modell; es kann Canarys Text ohnehin nicht "korrigieren" — es raet
  nur dasselbe Audio neu und brachte den 13.07.-Sprachsprung). Statt des zu
  schwachen Fuzzy-Postkorrektors bei groben Garbles ("Barottis"->"Parotis",
  "in Blattat"->"Implantat") geht Canarys Ausgabe jetzt DIREKT an qwen3.6 (starkes
  5090-Modell). Neue, eng gezuegelte Stufe in `structureTreatment` (MAS,
  `src/lena/lenaDoc.js` `correctGarbles()`, direkt nach Cross-Channel-Merge, vor
  Klassifikation): qwen glaettet je Segment NUR echte Spracherkennungs-Verhoerer
  (Fachbegriffe), mit Nachbarzeilen als Kontext. § 630f: der Canary-Rohtext
  bleibt IMMER als `text`, die Korrektur nur als `textCorrected` daneben; ab da
  laeuft alles ueber `segText()` (Klassifikation, Dialog, Karteikarte, Abrechnung).
  Guard `src/lena/garbleCorrect.js` `acceptCorrection()` (firebase-frei, getestet
  via `node backend/scripts/test-lena-correct.mjs`) verwirft Erfindungen,
  Zahlen-/Zahnnummer-Aenderungen, Aufblaehung und Verstuemmelung -> im Zweifel
  bleibt der Rohtext. Notaus `LENA_LLM_CORRECT=0`. BACKLOG (in Ruhe): Canary
  selbst auf das Fachvokabular fein-tunen, dann traegt der Korrektor weniger.
- 17.07.2026: **Lueckenerkennung + Recall-Freigabe korrigiert (Chef)** — Zwei
  Vorfaelle: (1) Clara meldete ZU VIELE freie Luecken, weil `runGapFill()`
  ueber ALLE Behandler-Kalender scannte (leerer Kollegen-Kalender =
  ganzer Tag frei) und mehrtaegige Abwesenheiten durch den `isMultiDay`-Filter
  fielen. Fix (MAS-2): `runGapFill(..., {calendarId})` scopt auf EINEN Kalender;
  die Aufrufer `gap-briefing` (`resolveDayCalendarScope`), `morningBriefing`
  (Operator-Behandler) und `recallCoach.dailyInitiativeScan` (identifizierter
  Operator) uebergeben den Kalender des angemeldeten Behandlers — ohne Operator
  bleibt es praxisweit (kein Regress). `getDayAppointments` behaelt jetzt
  mehrtaegige ABWESENHEITEN (blockieren Luecken), und `runGapFill` wertet
  praxisweite (kalenderlose) Absenzen fuer jeden Kalender als belegt.
  (2) Die Freigabe-Frage lautet nicht mehr "Soll ich die Anruflisten
  freigeben?", sondern "Soll ich versuchen, die Luecken zu schliessen und
  Recall-Patienten anrufen zu lassen?" (recallCoach.js: spoken/instruction/
  Push-reason/initiativeSuffix). Damit "Nein"/"Ja" weiter greifen: Clara-Voice
  `openai_compat_llm._freigabe_offer_pending` erkennt zusaetzlich den Luecken-
  Wortlaut; `tool_subsetting` erzwingt die recall-Gruppe (approve_recall/
  recall_snooze), solange Claras letzte Antwort eine Freigabe anbietet — sonst
  fiel `recall_snooze` aus dem Subset und ein schlichtes "Nein" lief ins Leere.
  Abgesichert per `testsuite/test_recall_yes_no_guard.py` (jetzt im Release-Gate).
- 17.07.2026: **Clara-Nachdiktat + Doku im Shared Memory (Chef)** — Claras
  Sprach-Diktat ist jetzt ein WORTWOERTLICHER Nachtrag: Text-Diktat
  (`saveTreatmentDictation`) schreibt `source=nachdiktat` statt `clara`; das
  getee'te Live-Diktat (`start_patient_dictation`, `recorder.mode=dictation`)
  wird in `/treatment/lena-segment` von `arzt` auf `nachdiktat` umgesetzt
  (normale Aufnahme bleibt `arzt`). Damit landet Clara-Diktat im eigenen,
  ungefilterten Nachdiktat-Abschnitt. NEU: die fertige ZUSAMMENFASSUNG geht ins
  geteilte Praxisgedaechtnis — `writeTreatmentSummaryEvent()` (treatmentDoc.js)
  schreibt/aktualisiert `lena-summary:{apptId}` (Kanal `lena_doc`, 45 Tage,
  `upsertEvent` in eventStore.js) aus `structureTreatment` (Button/iPad) UND
  `strukturiereKarteikarte` (Clara-Auto). Damit sind Zusammenfassung + Nachdiktate
  in der MAS-Suche (`/brain/search`) und im Patienten-Dossier auffindbar; alle
  Agenten (Nadine/Lisa/Bianca) lesen aus demselben Speicher. LIVE ohne Reload:
  Web-Lena via Firestore-Listener (unveraendert); iPad zieht Segmente +
  Zusammenfassung per Heartbeat-Poll nach (`/treatment/heartbeat` liefert
  jetzt `structuredText`/`structuredHtml`).
- 17.07.2026: **Dialog-Zusammenfassung via qwen3.6 (Chef)** — `/treatment/structure`
  baut aus den gefilterten Segmenten einen Arzt-Patient-Dialog
  (`buildDialogueDraft`) und laesst ihn vom starken 5090-Modell bereinigen
  (`polishDialogueSummary` -> `strongLlm()`): Gespraechsschema bleibt,
  STT-Fehler geglaettet, nichts erfunden (Zahlen-Waechter + Schema-Wache),
  Nachdiktat wortwoertlich angehaengt. 5090 aus -> deterministischer Fallback.
  `structuredText` = Dialog (iPad/Desktop-Anzeige + PDF), `structuredHtml` =
  interne Abschnitts-Karteikarte unveraendert.
- 17.07.2026: **Lena UX-Korrekturen (Chef)** — Zusammenfassung filtert
  Non-Klinik aus dem Arzt-Patient-Gespraech; Nachdiktat wortwoertlich.
  iPad-Aufnahme = Kanal `raum` (Patient), Arzt vom Headset. Segment
  Edit/Delete (`/treatment/lena-segment-update|delete` + Desktop).
  STT-Phrase: Tennisbaer→Teddybaer; keine Tech-Meta in Summary-UI.
- 17.07.2026: **Overnight-Paket Lena/iPad** — MAS: `POST /treatment/current`
  liefert `patientHints` (Termin + Patientenakte + Anamnese-Befunde);
  iPad `ipad-app.html` nutzt Server-Hints fuer Besonderheiten. MAS: Lena-STT-Proxy
  (`GET /treatment/lena-stt-url` via Named-Tunnel `/lena-stt`). iPad-Struktur/
  Billing + deviceKey-Auth (falsche deviceKey -> 403, kein Dev-Bypass).
  Desktop-Lena: Summary/Strukturieren/PDF. Clara-Voice:
  `lena_stt/eval_enhance.py` (18 Stress-WAVs, Gate->Stille 5/18; UTF-8-safe).
  Browser-Speech-Greeting auf iPad entfernt (Clara LiveKit uebernimmt).
  Bewusst OFFEN (Warteliste): PMS/Nadine-Export, Stereo/Headset-Tee parallel,
  W-LENA-4 Korrekturmodell, W-LENA-5 volle Sophie-Bruecke.
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
- 11.07.2026: **W-LENA Neubau begonnen (Meisterstueck)** — WP1-6 im Plan
  verankert. **W-LENA-1 FERTIG:** Sprachbefehl "Clara, starte/beende die
  Aufnahme" mit halluzinationsfreier Patientenbindung. Clara-Voice
  worker_wake-Vor-Gate (Aufnahme-Kommando dispatcht, legt Clara nie schlafen;
  blosses "Clara stop" bleibt Sleep) + Tool-Subsetting-Gruppe `recording`;
  MAS `clara/treatmentRecording.js` + Tools start/stop_treatment_recording +
  voice_state pending/activeRecording; Profil zwei Tools + stt_keywords;
  Frontend Live-Follow `open_lena_recording` (Monitor -> Lena). Tests gruen
  (test_wake_word +23, test_tool_subsetting, scripts/test-lena-recording.mjs),
  Clara-Release-Gate voll gruen, node --check. Live-Worker-Neustart steht
  noch aus (Produktion) — auf Freigabe wartend.
- 11.07.2026: **W-LENA-1 LIVE** — MAS-Backend + Clara-Worker neu gestartet
  (Smoke GRUEN, Tool-Calling ok, Worker registriert), neue Route
  `/tools/stop-treatment-recording` antwortet.
- 11.07.2026: **W-LENA-2 Teil 1 (STT-Dienst) FERTIG** — isolierter
  `lena_stt/`-Dienst (Parakeet-ONNX CPU, medizinische Nachkorrektur,
  Energie-VAD-Segmenter, WS-Protokoll, Launcher mit optionalem Cloudflare-
  Tunnel, Unit-Tests 16/16, WS-Smoke, WER-Harness). KEIN Import aus dem
  Clara-Stack -> Clara bleibt unantastbar; Clara-Gate weiter GRUEN. Offen:
  Frontend-Ingress (Browser-Mikro -> wss) + reale WER-Messung + 2-Kanal.
- 11.07.2026: **W-LENA-2 Teil 2 (Frontend-Ingress) LIVE** — `lenaStt.ts`
  (wss-Discovery aus `settings/lenaStt`, Mikro -> 16k-PCM via AudioWorklet ->
  WS, 3,5-s-Timeout + Retry mit frischer URL); recordingControls (Kanal
  `raum`) und dictationPage (Kanal `arzt`, Umschalter entfernt) nutzen die
  medizinische STT bevorzugt, Web-Speech-Fallback (kein Regressionsrisiko);
  Segmente pro Sprechpause sofort als Dialog. MAS-Route
  `POST /treatment/lena-stt-url` (Launcher meldet Tunnel-URL). Deploy-Kette:
  3 Repos committet, MAS-Backend neu (neue Route antwortet 400 statt 404),
  Lena-STT-Tunnel scharf (`settings/lenaStt` veroeffentlicht, /health ueber
  Tunnel ok), Hosting-Build gruen + deployed (docgenda.web.app), Clara-Smoke
  GRUEN. OFFEN: reale WER-Messung, 5090-Umzug, ggf. Named Tunnel.
- 11.07.2026: **Lena Stereo-Split am PC LIVE** — Praxis hat statt Raummikro
   zwei Ansteckmikros (DJI Mic Mini), die per Funk in EINEN Empfaenger am
  Line-In gehen. Im DJI-Stereo-Modus liegt TX1 links, TX2 rechts. Neu:
  `LenaStereoSplitCapture` (services/lenaStt.ts) oeffnet EINEN Stereo-Eingang
  mit abgeschaltetem Browser-DSP (sonst Mono-Downmix) und streamt linken +
  rechten Kanal getrennt an ZWEI WebSockets des lena_stt-Dienstes (Kanal =
  Sprecher) — der Dienst behandelt jede Verbindung unabhaengig, keine
  Server-Aenderung. recordingControls: Umschalter "2 Mikros am PC (Stereo)",
  Empfaenger-Wahl + Zuordnung "Links = Patient/Arzt". Zusaetzlich ein
  Mikrofon-Auswaehler (micSelect.tsx) fuer Arzt-/Patienten-/Empfaenger-Geraet
  (Auswahl pro Kanal in localStorage). Hosting deployed, Typecheck sauber.
- 11.07.2026 (abends): **Lena Kanaltrennung repariert + Struktur/Abrechnung
  auf MAS LIVE** — Befund Chef: "Meter trennt, Dialog nicht" + Strukturieren
  tot + Pseudo-Einstellungen nerven. Ursachen und Fixes:
  (1) Meter und Aufnahme oeffneten ZWEI getUserMedia-Streams — je nach
  Treiber lieferte der zweite nur Mono. Jetzt EIN geteilter Stereo-Stream
  fuer beide; Geraetewahl automatisch (virtuelle Geraete wie "Voice Changer"
  ausgeschlossen — genau der hatte die Trennung gefressen; DJI/USB bevorzugt,
  Wahl gemerkt). (2) UI entruempelt: Stereo-Umschalter, Dropdown und
  micSelect.tsx raus; L/R-Pegel, "Links = Patient/Arzt" und Sound-
  Einstellungen-Knopf bleiben. (3) Strukturieren + Abrechnungsvorschlaege
  rufen die neuen MAS-Routen `/treatment/structure` + `/treatment/billing`
  (lokales Qwen; OpenAI-Function hatte tote Quota — Cloud-Weg fuer
  Patiententexte damit ganz zu). Neues AbrechnungPanel auf der Lena-Seite.
  E2E: structure 12/12 Segmente, billing GOZ 9010 + BEMA 41a aus echtem
  Diktat. Deploy: MAS committet + neu gestartet (Gate GRUEN), Hosting-Build
  gruen + deployed. Fremde QM/Julia-WIP-Dateien waehrend des Builds gestasht
  (Regel 1) und danach zurueckgeholt; deren Compile-Blocker (kaputte
  Anfuehrungszeichen juliaWorkspace Z. 1097, customButtons-Union
  calendarCtrl) im Arbeitsstand mitrepariert, gehoeren aber der QM-Session.
- 11.07.2026 (spaeter Abend): **Lena Dominanz-Gate gegen Uebersprechen LIVE**
  — Befund Chef: Transkription trennt trotz Kanal-Split weiter nicht. ECHTE
  Ursache: zwei Ansteckmikros im selben Raum hoeren BEIDE Sprecher; die STT
  normalisiert das leise Uebersprechen (~-10 bis -15 dB) und transkribiert es
  mit — Kanal-Splitten allein KANN das nicht loesen (der Pegelmeter zeigt
  relative Lautstaerke, die STT nicht). Fix in `LenaStereoSplitCapture`
  (services/lenaStt.ts): EIN Stereo-Worklet liefert L/R als Paar; ein
  Dominanz-Gate vergleicht pro ~21-ms-Block die geglaetteten Huellkurven
  (Attack sofort, Release ~200 ms) und reicht nur den deutlich lauteren
  Kanal (Faktor 2 = ~+6 dB) an die Erkennung durch, der leisere bekommt
  Stille (seine Segmentierung schliesst sauber). Beide aehnlich laut
  (Doppel-Sprechen) => beide offen, nichts geht verloren; Stille => kein
  Eingriff. Dazu Identik-Detektor: liefert der Empfaenger links=rechts
  (Mono-Modus am Geraet), kommt eine klare Fehlermeldung statt stiller
  Doppel-Transkription. Gate-Logik simuliert (Arzt spricht: Patientenkanal
  100/100 Bloecke stumm; Doppel-Sprechen: 50/50 offen; Stille: 50/50 offen).
  Typecheck sauber, Hosting deployed (fremde QM-WIP wieder per Stash
  umgangen).
- 16.07.2026: **W-LENA-2 TEIL 5 Voice-Enhance LIVE** — `lena_stt/enhance.py`:
  DeepFilterNet3 (CPU/ONNX, `deepfilter-stream`) + Noise-Gate (inkl. HF-
  Bohrer-Erkennung) + leichte Kompression/Limiter, vor Segmenter in
  `server.py`. Flag `LENA_STT_ENHANCE` (Launcher default an). Health zeigt
  `enhance.backend=dfn3`. Tests `test_enhance.py` 10/10. DoD Praxis-WER offen.
- 11.07.2026: **W-LENA-3 (Live-UI + 9 Abschnitte + Smalltalk-Filter) LIVE** —
  lenaWorkspace hat rechts jetzt den Umschalter Dialog<->Struktur. Dialog =
  chronologischer Verlauf (Patient links / Arzt rechts ueber `source`) mit
  ausblendbarem Smalltalk (nur Anzeige, Rohtext bleibt). Struktur = 9 feste
  farbcodierte Abschnitte (Endo-Folge weiss->schwarz), gruppiert die ECHTEN
  Segmenttexte. `structureTreatmentNote` klassifiziert jedes Segment nur
  (Nummer -> Abschnitt + smalltalk-Flag, KEIN Umschreiben) und schreibt
  `section`/`smalltalk` an die dictations-Docs; unklassifizierte bleiben in
  einem sichtbaren Eimer. Deploy: `functions:structureTreatmentNote` +
  Hosting-Build gruen + deployed. Frontend- + Functions-Typecheck sauber.
- 10.07.2026: **Speicherpunkt Clara v6.0** (Rollback-Anker, Auftrag Chef):
  alle drei Repos committet + annotierter Tag `clara-v6.0`; Clara-Voice
  Voll-Gate GRUEN (133/139, 0 unkontrollierte Halluzinationen, Tag
  `stabil-2026-07-10-0035`); Git-Bundles aller Repos nach
  `C:\repo-backups\2026-07-10-clara-v6.0\` (verify ok). Rollback:
  `git checkout clara-v6.0` je Repo bzw. `git clone <bundle>`.
  Stand enthaelt: Wake/Stopp robust (Verhoerer, Quittungen, Farb-Feedback),
  WP1-3 Fakten-Waechter, Zeitraum-Abfragen, Briefing bereinigt, Mail-Sync
  inkrementell.
- 10.07.2026: **W-HUMAN Stufe 2 (Lockerheit 1-4 + Starts) fertig**: warme
  Rahmen-Pools + Zahl-Reaktion + kollegiale Vor-/Nachsaetze um die verbatim-
  Briefings (speech.js maybe/dayLoadReaction/warmClose, daySchedule,
  rangeOverview); Sprechbarkeit 4 (Stunden-Bereiche als Worte, Zahlwoerter
  bis 999); tageszeitbewusste greeting_pools (Profil + services/
  greeting_pools.py, {{current_hm}}) und frisches auffaelliges Ereignis
  (<= 45 min) via GET /clara/greeting-context direkt nach dem Hallo.
  Fakten-Kern bleibt woertlich, Variation NUR im Code — kein zweiter
  LLM-Gang. Tests: test-day-schedule/test-greeting-context (node),
  test_greeting_pools/test_speakability (python) gruen; Voll-Gate gruen;
  Backend + Worker neu gestartet.
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
