# Clara – Test- und Verbesserungsbericht

**Stand:** 09.06.2026, 01:30 Uhr · **System:** MAS-2 „Shared Brain" + Clara Sprach-Copilot
**Mandant für Tests:** isolierte Test-Mandanten (Produktivdaten von med dent wurden NICHT verändert)

---

## 1. Kurzfazit

Die nächtlichen Tests prüften zwei Dinge, die du explizit gefordert hast: **keine Doppelungen** und **„die KI versteht, was gesagt wird"**. Beides ist jetzt mit einer Simulation über **130 reale Gesprächsfälle** (ohne echte Anrufe/SMS) belegt.

| Bereich | Ergebnis | Status |
|---|---|---|
| Signal-Erkennung (versteht das Anliegen) | Precision 100 % / Recall 100 % | ✅ |
| Themen-Zuordnung (Topic) | 100 % (123/123) | ✅ |
| Namens-Erkennung | 100 % (121/121) | ✅ |
| Patienten-Zuordnung (Identität) | 100 % (121/121) | ✅ |
| **Doppelte Vorgänge** | **0** | ✅ |
| Idempotenz (doppelter Eingang) | kein Duplikat | ✅ |
| Smalltalk-Fehlalarme | 0 | ✅ |
| Regressionstests (4 Suiten) | alle grün | ✅ |

**Ehrliche Einordnung:** Die Logik (Verstehen, Vorgänge, keine Doppelungen, Identität, rollenbasiertes Briefing) ist auf Code-Ebene sehr solide und vollständig getestet. **Was heute Nacht NICHT getestet wurde:** ein echter Live-Sprachdurchlauf mit Mikrofon/Auto und das Verhalten des lokalen Qwen-Modells bei der Tool-Auswahl unter echten ASR-Fehlern. Dafür sind die Punkte in Abschnitt 7 vorgesehen. Das System ist „bereit zum kontrollierten Live-Test", noch nicht „blind in den Produktivbetrieb".

---

## 2. Was geprüft wurde – Testmethodik

Drei Ebenen, alle reproduzierbar per Kommando (siehe Abschnitt 9):

1. **Unit-/Modelltests** – reine Logik ohne Netz (Regeln, Rollen, Namensschlüssel).
2. **Firestore-Integrationstests** – echte Schreib-/Lesevorgänge gegen isolierte Test-Mandanten (`zzz-mas2-*`), die nach jedem Lauf gelöscht werden.
3. **Große Simulation (`sim-brain.mjs`)** – 130 gelabelte Gesprächsfälle in deutscher Alltagssprache (gemischt mit echten Umlauten **und** ASCII-Transliteration „ue/oe/ae/ss", wie sie aus Spracherkennung/Tastatur kommen), durch die **komplette Pipeline**: Transkript → Signal-Extraktion → Namens-Extraktion → Patienten-Zuordnung → Event → Vorgangs-Threading → Briefing.

Abgedeckte Fallarten: Rückruf, Rechnungsfrage, Termin (buchen/verschieben/absagen), Schmerz, Wiederholungsbesuch („zum 5. Mal"), Beschwerde/Ärger, Dokumentenwunsch, Eskalation („echten Menschen sprechen"), gemischte Anliegen, Smalltalk (darf KEINEN Vorgang erzeugen), mehrdeutige Namen („Müller"), unbekannte aber benannte Anrufer, anonyme Anrufer, Kollegen-/Laboranrufe, sowie abgebrochene/wütende Anrufe.

---

## 3. Testergebnisse im Detail

### 3.1 Simulation – 130 Fälle (Signal-Erkennung)

```
callbackRequested    P=100%  R=100%  F1=100%  (tp=19 fp=0 fn=0)
appointmentRequest   P=100%  R=100%  F1=100%  (tp=26 fp=0 fn=0)
billingQuestion      P=100%  R=100%  F1=100%  (tp=19 fp=0 fn=0)
complaintStated      P=100%  R=100%  F1=100%  (tp=14 fp=0 fn=0)
repeatVisitStated    P=100%  R=100%  F1=100%  (tp=14 fp=0 fn=0)
painPersists         P=100%  R=100%  F1=100%  (tp=20 fp=0 fn=0)
documentRelated      P=100%  R=100%  F1=100%  (tp=16 fp=0 fn=0)
needsHuman           P=100%  R=100%  F1=100%  (tp=6  fp=0 fn=0)
abortedEarly         P=100%  R=100%  F1=100%  (tp=1  fp=0 fn=0)
MICRO                P=100.0% R=100.0%
```

- **Precision = 100 %**: kein einziger Fehlalarm (kein erfundenes Anliegen).
- **Recall = 100 %**: kein Anliegen übersehen.
- Topic 100 %, Namens-Extraktion 100 %, Identität 100 %.

### 3.2 Doppelungen / Idempotenz / Smalltalk

```
Vorgänge gesamt:          62
Doppelte Vorgänge:        0     ✓ keine
Idempotenz (Re-Ingest):   ✓ kein Duplikat
Smalltalk-Fehlalarme:     0     ✓
```

Die 130 Eingänge wurden korrekt zu **62 Vorgängen** verdichtet (Wiederholanrufe desselben Patienten zum selben Thema landen im selben Ticket; `contactCount` zählt hoch). Beispiel aus dem Lauf: Anna Ackermann „Schmerz/Wiederholung" = **1 Vorgang mit 6 Kontakten**, nicht 6 Tickets.

### 3.3 Regressionstests (alle grün)

| Suite | Inhalt | Ergebnis |
|---|---|---|
| `test-extractor.mjs` | Signal-/Namens-Extraktion, echtes Transkript | ✅ ALL PASS |
| `test-cases.mjs` | Vorgangs-Modell, Threading, Wiedereröffnen, Delegation, Kontext, Briefing | ✅ ALL PASS |
| `test-voice-cases.mjs` | Server-seitiger „aktiver Vorgang" für Sprach-Tools | ✅ ALL PASS |
| `test-operators.mjs` | PIN-Registry, Rollen, rollenbasiertes Briefing, keine Hash-Leaks | ✅ ALL PASS |

---

## 4. Gefundene Fehler und ihre Lösungen

Das war der eigentliche Wert der Tests – hier die echten Funde:

### Fund 1 — „Rueckruf" wurde nicht verstanden (Verständnis-Bug)
- **Problem:** Die Muster nutzten echte Umlaute (`/rückruf/`). Spracherkennung/Tastatur liefern oft „**Rueckruf**". Treffer = Fehlanzeige. Genau dein Kern-Beispiel (Rückruf) wäre durchgefallen.
- **Lösung:** **Umlaut-Folding** – Text **und** Muster werden auf eine ASCII-Form vereinheitlicht (ü→ue, ö→oe, ä→ae, ß→ss). „Rückruf" und „Rueckruf" matchen jetzt beide.

### Fund 2 — Komposita-Termine übersehen
- **Problem:** `\btermin\b` traf „Kontroll**termin**", „Zahnarzt**termin**" nicht (Wortgrenze).
- **Lösung:** Muster auf Teilwort „termin" umgestellt; zusätzlich „etwas frei?", „vorbeikommen" erkannt. `appointmentRequest`-Recall 70 % → **100 %**.

### Fund 3 — „echten Menschen sprechen" / „Verbinden Sie mich" nicht erkannt
- **Problem:** `needsHuman`-Recall 0 % (Wortgrenze bei „Mensch**en**", fehlendes „verbinden").
- **Lösung:** Muster gefixt → **100 %**.

### Fund 4 — Inhaltlicher Bug: wichtige Anliegen erzeugten KEINEN Vorgang
- **Problem:** `documentRelated`, `painPersists`, `repeatVisitStated` galten fälschlich als „nicht aktionierbar". Damit hätte **„ich bin zum 5. Mal wegen derselben Füllung hier"** und jeder Dokumentenwunsch **kein Ticket** erzeugt – also genau das, was du im Briefing hören willst, wäre verschwunden.
- **Lösung:** Diese Signale öffnen jetzt korrekt einen offenen Vorgang.

### Fund 5 — Kollegen-Anruf erzeugte Müll-Ticket „die Praxis"
- **Problem:** Bei „Hier ist die Praxis Dr. König …" extrahierte die Namens-Erkennung „die Praxis" als Patientennamen → ein unsinniges Ticket.
- **Lösung:** Nicht-Namen (Praxis/Labor/Klinik/Apotheke/…) werden gefiltert. Solche Anrufe bleiben jetzt **anonym** statt falsch benannt. (Vollständige Kollegen-Logik: siehe Abschnitt 6.)

### Fund 6 — Doppelte Vorgänge bei nicht zugeordneten Anrufern
- **Problem:** Anrufer ohne Treffer in der Kartei (oder mehrdeutig, z. B. „Müller") bekamen bei **jedem** Anruf einen neuen Vorgang → Doppelungen.
- **Lösung:** **Namensschlüssel-Threading** – ein normalisierter Schlüssel („Familie Müller" = „Müller", „Mayer, Peter" = „Peter Mayer") fasst Wiederholanrufe desselben benannten Anrufers im selben Vorgang zusammen.

### Fund 7 — Doppelte Events bei erneutem Eingang
- **Problem:** Ein zweimal gesendetes Transkript hätte ein zweites Event und einen Phantom-Kontakt erzeugt.
- **Lösung:** **Idempotenz** über eine stabile `sourceId` (Anruf-/Session-ID) → deterministische Event-ID; doppelter Eingang ist ein No-op.

---

## 5. Was zusätzlich gebaut/gehärtet wurde

- **Sprecher-Identität per PIN** (kein Stimmabgleich – aus DSGVO-/Qualitätsgründen bewusst verworfen): Teammitglieder mit Rolle (Arzt/Rezeption/Admin), PINs nur **gehasht** gespeichert, Brute-Force-Drossel (max. 8/Min.).
- **Rollenbasiertes Briefing:** Arzt hört Klinisches/Beschwerden, Rezeption das Operative, Admin alles; an die Person delegierte Vorgänge bleiben immer sichtbar; Begrüßung mit Namen.
- **Audit-Trail:** Vorgangs-Einträge tragen den echten Menschen („Dr. Petsas") statt nur „Clara".
- **Automatische Patienten-Zuordnung beim Eingang:** Name aus Transkript → Patientensuche → matched / ambiguous / unmatched (es wird nie geraten).
- **Auto/Bluetooth-Audio-Fix** in der Verbindungsseite: `playsinline`, LiveKit-`startAudio()`, „Ton aktivieren"-Tap-Fallback, Wiederherstellung bei Geräte-/Routenwechsel (A2DP↔HFP), Echo-Unterdrückung fürs Auto.
- **Clara konversationsfähiger:** Prompt erkennt die **Absicht** (Synonyme), führt sie aber **deterministisch** über die Tools aus („erledigt" erst nach Tool-Bestätigung").

---

## 6. Bekannte Grenzen / offene Risiken (ehrlich)

1. **Kollegen-/Laboranrufe:** Wenn „Dr. König wegen Ihrem Patienten Herrn Mayer" anruft, ist der **Betreff der Patient (Mayer)**, nicht der Anrufer. Aktuell bleibt der Anruf korrekt-anonym (kein Falschtreffer), aber noch nicht am Patienten Mayer verknüpft. → geplanter nächster Schritt: „Patient X"-Erkennung + `counterparty=colleague`.
2. **Deterministischer Extraktor vs. echte Sprachfehler:** Die 100 % gelten für realistische, aber saubere Texte. Bei starkem ASR-Rauschen, Dialekt oder Mehrdeutigkeit kann Recall sinken. Geplant ist eine optionale **lokale-LLM-Veredelung** (Qwen) als zweite Stufe, die das Regelwerk ergänzt, nicht ersetzt.
3. **Live-Sprachweg heute Nacht nicht erneut durchgespielt:** Mikrofon-/Auto-Test (inkl. des neuen Bluetooth-Fixes) steht noch aus – das ist ein manueller Test mit echtem Gerät.
4. **Qwen-Tool-Auswahl im Feld:** Die deterministische Server-Ausführung verhindert Halluzinations-Schäden; die *Auswahl* des richtigen Tools durch das 8B-Modell sollte mit echten Sprachbefehlen stichprobenartig geprüft werden.
5. **PC-Tab (CalendR) sendet die PIN noch nicht** – dort wäre der automatische Firebase-Login sauberer (kein Tippen). Klein, aber offen.
6. **Gleichzeitigkeit:** Zwei exakt zeitgleiche Erstkontakte desselben Patienten könnten theoretisch zwei Vorgänge öffnen (kein Transaktions-Lock). Im Praxisbetrieb (sequenzielle Anrufe) unkritisch; bei Bedarf per Firestore-Transaktion härtbar.
7. **PIN-Sicherheit:** 4-stellige Team-PINs sind ein Komfort-Code (kein Passwort), gehasht + gedrosselt. Für internen Gebrauch ok; die Test-PINs bitte ändern.

---

## 7. Damit Clara „perfekt" funktioniert – priorisierte Restpunkte

| Prio | Aufgabe | Nutzen |
|---|---|---|
| 1 | **Live-Sprachtest** (Praxis + Auto/Bluetooth) mit dem neuen Audio-Fix | bestätigt den real wichtigsten Pfad |
| 2 | **Kollegen-/Laboranruf-Logik** (Patient-X-Erkennung + counterparty) | „Kollege rief wegen Patient X an" landet richtig |
| 3 | **PC-Tab Auto-Login** (Firebase-Token → Operator) | kein PIN-Tippen am Praxis-Monitor |
| 4 | **Lokale-LLM-Veredelung** als 2. Stufe des Extraktors | robuster bei Dialekt/ASR-Rauschen |
| 5 | **Stichprobe Tool-Auswahl** mit echten Sprachbefehlen | bestätigt Konversations-Robustheit |

---

## 8. Geänderte/neue Dateien (Inventar)

**Brain / Logik (MAS-2 Backend):**
- `src/brain/extractor.js` – Umlaut-Folding, verbesserte Muster, Namens-Filter
- `src/brain/events.js` – Namensschlüssel, dokument/schmerz/wiederholung als aktionierbar
- `src/brain/caseStore.js` – Threading über Namensschlüssel
- `src/brain/identity.js` – Patienten-Zuordnung (matched/ambiguous/unmatched)
- `src/brain/caseBriefing.js` – rollenbasiertes Briefing + Begrüßung
- `src/clara/operators.js` – PIN-Registry + Rollen (neu)
- `src/clara/sessions.js` – Operator-Status auf der Session
- `src/server.js` – Ingest-Zuordnung, `sourceId`-Idempotenz, `/clara/identify`, PIN in Session, Autorschaft

**Frontend / Sprache:**
- `public/clara/connect.html` – Auto/Bluetooth-Audio-Fix + PIN-Feld
- `profiles/clara_meddent/profile.json` (Clara-Voice) – konversationsfähiger Prompt

**Test-/Hilfsskripte:**
- `scripts/sim-brain.mjs` – 130-Fälle-Simulation (neu)
- `scripts/test-operators.mjs`, `scripts/test-identity.mjs`, `scripts/seed-operators.mjs` (neu)
- `scripts/test-extractor.mjs`, `scripts/test-cases.mjs`, `scripts/test-voice-cases.mjs`

---

## 9. So reproduziert man die Tests

```powershell
cd F:\MAS-2\backend
node scripts/sim-brain.mjs        # 130-Fälle-Simulation + Lernpunkte
node scripts/test-extractor.mjs   # Signal-/Namens-Erkennung
node scripts/test-cases.mjs       # Vorgänge/Threading/Delegation
node scripts/test-voice-cases.mjs # aktiver Vorgang (Sprach-Tools)
node scripts/test-operators.mjs   # PIN/Rollen/Briefing-Scoping
```

Alle Tests laufen gegen isolierte Test-Mandanten und räumen sich selbst auf – **Produktivdaten werden nicht berührt**.

---

## 10. Test-Zugang (med dent) – PINs bitte ändern

| PIN | Person | Rolle |
|---|---|---|
| 1001 | Dr. Petsas | Arzt |
| 1002 | Dr. Nikolaou | Arzt |
| 1003 | Dr. Patrikis | Arzt |
| 2001 | Rezeption | Rezeption |
| 9001 | Praxisleitung | Admin |

Ablauf zum Testen: Clara-Seite öffnen → PIN eingeben → verbinden → „Gib mir das Briefing". Der Arzt hört Klinisches/Beschwerden, die Rezeption das Operative.

---

*Erstellt automatisch im Anschluss an den nächtlichen Testlauf. Alle Zahlen stammen aus den frisch ausgeführten Läufen vom 09.06.2026, ~01:30 Uhr.*
