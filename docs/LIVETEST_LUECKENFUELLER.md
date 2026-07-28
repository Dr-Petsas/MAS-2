# Livetest Lueckenfueller (W-STABIL-9, Beweis b)

**Dauer: ~10 Minuten. Voraussetzung: Clara live (Port 8091), MAS laeuft.**
Stand 28.07.2026: Kette komplett — Listen-Workflow mit Anruf + SMS,
**Online-Zusage-Seite** (SMS-Link, erste Zusage bucht den Slot), Kontakt-
Zaehler pro Patient, Bucket-Streichung nach Buchung, befristetes
**Livetest-Fenster** (alle Anrufe/SMS aufs Chef-Handy, Buchungen auf den
Testpatienten). Modultests gruen: `test-gap-fill.mjs`, `test-slot-claim.mjs`,
`test-outreach-stats.mjs`, `test-live-redirect-window.mjs`, `test-outreach.mjs`,
`test-test-redirect.mjs`.

## So laeuft der Listen-Workflow (das Zielbild)

1. Clara findet Luecken und baut je Luecke eine **Anrufliste** aus den
   Recall-Buckets (Kampagnen + faellige Recalls), gerankt nach Faelligkeit,
   Kontakt-Zaehler (wenig Kontaktierte zuerst) und Consent.
2. Der Chef fragt **"Wer sind die Kandidaten?"** — Clara nennt sie **nach
   Thema/Bucket mit Zweck** ("aus der Kampagne PZR — professionelle
   Zahnreinigung: Frau X, seit 8 Monaten faellig ..."), am Handy kommt die
   Kandidaten-Karte mit hochgestellten Zaehlern: **Name ⁵ ✓²**
   (5 Kontakte gesamt, 2 fuehrten zum Termin; ✓-Zahl = Erfolgszahl).
3. **"Recall freigeben"** — Lisa ruft an (nur-SMS-Consent bekommt SMS).
   Jede SMS traegt einen **Zusage-Link** (`/z/...`): Der Patient sagt am
   Handy mit einem Tipp zu — die **erste Zusage bucht den Slot fest**
   (masBookAppointment), alle spaeteren sehen "schon vergeben".
4. Nach der Buchung: Patient wird **aus dem Recall-Bucket gestrichen**
   (Kampagne: appointmentMade; zusaetzlich 60-Tage-Sperre im Zaehler-Ledger)
   und vom Plattform-Recaller anhand des NEUEN Termins neu einsortiert.
5. **"Wie laeuft der Recall?"** — Zwischenstand inkl. "davon N ueber den
   SMS-Link"; Beschwerden/Unklares zeigen auf den Monitor.

## Weg A: Begleiteter Komplett-Test im Livetest-Fenster (empfohlen)

Kein echter Patient wird kontaktiert oder gebucht — trotzdem laeuft die
ECHTE Maschine (Listen, Lisa, SMS, Zusage-Seite, Buchung, Zaehler).

**Vorab:** Testpatient **Michael Petsassss** (id `demo_petsassss`), Mobil
**+491776004600** (= Chef-Handy). Gegenprobe: `node scripts/check-testpatient.mjs`.

1. **Fenster oeffnen (PowerShell in `F:\MAS-2\backend`):**
   `node scripts/set-live-test-redirect.mjs 120`
   -> 120 Minuten lang gehen ALLE Lisa-Anrufe/SMS an +491776004600 (mit
   [TESTLAUF]-Kennung), und ALLE Buchungswege (Online-Zusage, Sweep,
   Live-Buchung im Gespraech) buchen den Testpatienten — nie den echten.
2. Luecke erzeugen (Abwesenheit kuerzen, wie heute 13-15 Uhr) und Clara
   fragen: **"Wo habe ich heute Luecken?"** -> `gap_briefing`.
3. **"Wer sind die Kandidaten?"** -> Ansage nach Thema + Kandidaten-Karte
   mit Zaehlern am Handy.
4. **"Recall freigeben."** -> Anrufe klingeln auf dem Chef-Handy; SMS mit
   Zusage-Link kommen auf dem Chef-Handy an.
5. **SMS-Link antippen** -> Zusage-Seite (Praxis, Anlass, Slot). Auf
   **"Termin verbindlich zusagen"** tippen -> Seite bestaetigt, der Slot ist
   FEST gebucht (auf den Testpatienten), der Fall steht auf "Luecke gefuellt".
   Einen ZWEITEN SMS-Link antippen -> "Dieser Termin ist leider schon
   vergeben."
6. **"Wie laeuft der Recall?"** -> Zwischenstand nennt die Buchung
   ("davon 1 ueber den SMS-Link").
7. Im Pickadoc-Kalender nachsehen: Termin des Testpatienten steht im Slot.
   Danach den Testtermin loeschen.
8. **Fenster schliessen:** `node scripts/set-live-test-redirect.mjs off`
   (laeuft sonst nach 120 Minuten von selbst aus).

## Weg B: Gezieltes Einbestellen (Einzelfall, wie gehabt)

1. **"Such bitte den Patienten Michael Petsassss heraus."** -> `search_patient`.
2. **"Bestell ihn fuer morgen um zehn Uhr zur Kontrolle ein."**
   -> Clara liest die Lisa-Anweisung vor, fragt nach Bestaetigung.
3. **"Ja, bitte genau so anrufen."** -> Anruf kommt auf dem Chef-Handy an.
4. **"Was hat der Anruf von Lisa ergeben?"** -> `lisa_call_result` + Karte.

## Was bei Rot zu tun ist

- Kein Anruf/keine SMS nach Freigabe: MAS-Log nach `gapfill`/`recall`
  durchsuchen (`logs/`), Status: `POST /tools/recall-status`.
- Zusage-Seite laedt nicht: MAS-Health pruefen, Tunnel testen:
  `https://mas.pickadoc-tunnel.com/z/<clientId>/test` muss die
  "Link ungueltig"-Seite zeigen (404 ist dort richtig).
- Zusage gedrueckt, aber "wir melden uns" statt Bestaetigung: Buchung schlug
  fehl -> Fall im Monitor traegt eine ACHTUNG-Notiz mit dem Grund; der Slot
  bleibt frei fuer andere.
- Abbruch jederzeit: Fenster mit `set-live-test-redirect.mjs off` schliessen;
  ohne Freigabe passiert grundsaetzlich nichts.

Ergebnis bitte im VERKAUFSKERN (Punkt 16/17/18) eintragen: Datum + "Livetest
bestanden" oder Befund.
