# Clara Live-Monitor (Termine live am Bildschirm mitverfolgen)

Wenn jemand per Handy mit Clara spricht, soll der Praxis-Monitor live mitlaufen:
der Kalender springt auf den richtigen Tag und der frisch gebuchte Termin öffnet
sich im Popup. Dieses Dokument beschreibt den (sauberen) Aufbau.

## Architektur (Entscheidung)

- **Voice-Worker bleibt generisch.** Keine Änderungen an der v5.2-Pipeline. Clara
  ruft Kalenderaktionen ausschließlich über `custom_tools` (HTTP) auf MAS-2.
- **MAS-2 ist die Quelle der Wahrheit** für Claras Kalenderaktionen. Es ruft
  dieselben Pickadoc-Cloud-Functions wie der Telefon-Agent (`getFreeTimeSlots`,
  `createAppointment`, ohne Auth) **und** schreibt dabei Live-Kommandos nach
  Firestore.
- **Live-Kanal = Firestore** (nativ realtime, keine neue Infrastruktur). Die
  Plattform hört per `onSnapshot` zu und spiegelt die Aktion auf dem Monitor.

```
Handy (Clara, Sprache)
  └─ LiveKit ─ Voice-Worker (Clara-Voice, v5.2-Instanz)
        └─ custom_tool HTTP ─▶ MAS-2  POST /tools/find-slots | /tools/book-appointment
                                  ├─ Cloud Function (Buchung)         → clients/{cid}/locations/{lid}/appointments
                                  └─ Live-Kommando                    → clients/{cid}/mas_sessions/{sid}.lastCommand
Plattform-PC (CalendR)  ◀─ onSnapshot ── clients/{cid}/mas_sessions/{sid}
        └─ setSelectedDate(Tag) + Termin-Popup öffnen
```

## Firestore-Schema (alles unter `clients/{clientId}`, nur MAS-eigene `mas_*`)

- `mas_config/booking` — pro Mandant: `clientId`, `locationId`, `source`,
  `calendars[]`, `visitMotives[]`, `defaultCalendarId`, `cfBaseUrl?`.
  Seed: `node scripts/seed-booking.mjs <clientId>` (liest das Voice-Profil).
- `mas_config/live_session` — Zeiger `{ sessionId }` auf die *aktuell aktive*
  Live-Session. Voice-Tools kennen nur `clientId` und lösen darüber die Session auf.
- `mas_sessions/{sessionId}` — `status`, `commandSeq`, `lastCommand`, `history[]`.
  `lastCommand` ist das, worauf der Monitor reagiert:
  - `{ type: "navigate", date, calendarId, calendarName, slots[] }`
  - `{ type: "appointment_created", date, slotIso, calendarId, patient, visitMotiveName }`

Eine aktive Live-Session pro Mandant genügt für den Praxisbetrieb. Mehrere
parallele Live-Sessions (mehrere Telefone gleichzeitig auf verschiedene Monitore)
sind ein späteres Refinement (per-Session-Profile / Raum→Session-Mapping).

## MAS-2-Endpunkte

- `POST /clara/session-start` `{clientId}` → `{sessionId}`; setzt den `live_session`-Zeiger.
- `POST /clara/session-end` `{clientId, sessionId?}`.
- `POST /tools/find-slots?clientId=…` — Slots suchen (read-only) + `navigate`-Kommando.
- `POST /tools/book-appointment?clientId=…` — Termin buchen + `appointment_created`-Kommando.

Sicherheit: `MAS_BOOKING_DRY_RUN=1` verhindert echte Buchungen (für Tests/CI).

## Clara-Profil

`tools.getFreeTimeSlots` / `tools.createAppointment` sind **deaktiviert** und durch
die `custom_tools` **`find_slots`** und **`book_appointment`** ersetzt (Live-fähig,
zeigen am Bildschirm an). Verschieben/Absagen/Nachschlagen bleiben v5.2-Built-ins.

Nach Profiländerung: Profil nach `F:\Clara-Voice\profiles\clara_meddent\profile.json`
kopieren und den Voice-Worker neu starten, damit die neuen Tools geladen werden.

## Plattform (pickadoc-platform-main / docgendaweb)

- `src/services/liveFollowService.ts` — `onSnapshot` auf `live_session` →
  Session → liefert jedes neue `lastCommand` (read-only, nur `mas_*`).
- `src/components/pages/calendarPage.tsx` — kleiner, isolierter Hook:
  - `navigate`/`appointment_created` → `setSelectedDate(Tag)` + Tagesansicht.
  - `appointment_created` → merkt sich `{slotIso,lastName}`; sobald der Termin über
    den bestehenden Appointments-`onSnapshot` eintrifft, wird das Popup geöffnet
    (Match über Startzeit + Nachname, weil `createAppointment` keine ID zurückgibt).
- `src/components/pages/claraPage.tsx` — startet die Session, zeigt QR (mit
  `?session=…`), ein Live-Statuspanel und einen Button „Im Kalender mitverfolgen".

### Deployment-Check (wichtig)
Die Firestore-**Security-Rules** müssen dem eingeloggten Praxis-User Lesezugriff auf
`clients/{clientId}/mas_sessions/**` und `clients/{clientId}/mas_config/**` erlauben.
Bei einer rekursiven Regel `match /clients/{clientId}/{document=**}` für eigene
Mandanten-User ist das automatisch erfüllt. Sonst ergänzen.

## Lokaler Test (PC)

1. MAS-2 läuft auf `http://127.0.0.1:4000` (`npm start` im `backend/`).
2. Booking-Config geseedet (`scripts/seed-booking.mjs`).
3. Clara-Voice-Worker läuft (`start-clara.ps1 -WithSfu`), neues Profil geladen.
4. Plattform: `MAS` öffnen → Session startet, QR erscheinen lassen, „Im Kalender
   mitverfolgen" klicken (oder selbst zu `/calendr` gehen).
5. Mit Handy QR scannen, mit Clara sprechen: „Such einen Termin bei Petsas für
   Kontrolluntersuchung am 9. Juni" → Kalender springt auf den Tag. „Buche Max
   Mustermann, 0170…, 9 Uhr" → Termin erscheint und Popup öffnet sich.

Backend-Validierung ohne Sprache:
```
POST /clara/session-start  {}
POST /tools/find-slots      {"doctorName":"Petsas","visitMotiveName":"KCH Kontrolluntersuchung","startDate":"2026-06-09"}
# Firestore: clients/{cid}/mas_sessions/{sid}.lastCommand == navigate
```
