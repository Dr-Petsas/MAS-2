# MAS-2 Deploy (HTTPS) + LiveKit Cloud — Grundlage

Ziel: MAS-2-Backend (Token + Tools + Clara-Seiten) über **HTTPS** erreichbar, damit
das **Handy-Mikrofon** funktioniert, und Sprach-Transport über **LiveKit Cloud**
(getrennt pro Mandant/Projekt, skalierbar).

## Komponenten & wo sie laufen

| Teil | Was | Hosting (Vorschlag) |
|------|-----|---------------------|
| MAS-2 Backend (Node) | `/clara/session`, `/tools/*`, QR/Connect-Seiten | Container (Cloud Run) hinter HTTPS |
| Clara Voice-Worker (Python) | STT→Qwen→TTS, LiveKit-Agent | **zentraler GPU-Server** |
| LLM (Qwen via Ollama) | lokal beim Worker | GPU-Server |
| Transport | WebRTC-SFU | **LiveKit Cloud** (wss) |
| Plattform (React) | „MAS"-Kachel → QR-Seite | bestehendes Firebase Hosting (HTTPS) |

## MAS-2 Backend als Container

```bash
cd backend
docker build -t mas-2-backend .
# lokal testen:
docker run -p 8080:8080 --env-file .env mas-2-backend
```

Auf **Cloud Run** (GCP, Projekt `docgenda`):
- Kein Service-Account-Key nötig: `firebase.js` nutzt ohne `GOOGLE_APPLICATION_CREDENTIALS`
  die **Runtime-Service-Account-Credentials** (ADC). Dem Cloud-Run-Dienst die nötigen
  Firestore-Rechte geben.
- Env setzen: `LIVEKIT_URL` (wss://…livekit.cloud), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `PUBLIC_BASE_URL` (die öffentliche HTTPS-URL des Dienstes), `CLARA_PROFILE_ID`,
  `DEFAULT_CLIENT_ID`, `MAIL_CRYPTO_KEY` (32-Byte-Hex), `ALLOWED_ORIGINS`
  (z.B. `https://ca.pickadoc.de`) und — falls Maschinen-Aufrufer das MAS-Backend
  rufen — `MAS_SERVICE_TOKEN` (langer Zufallswert).

## Authentifizierung (Pflicht in Prod)

- `NODE_ENV=production` schaltet die Auth automatisch scharf (oder explizit
  `MAS_REQUIRE_AUTH=1`). Dann gilt:
  - **Browser/Nutzer**: schicken ihr **Firebase-ID-Token** (`Authorization: Bearer`);
    das Backend verifiziert es per `firebase-admin` und liest Mandant + Admin-Rolle
    aus den Token-Claims (`clientId`, `isAdmin`, `role`). Client-Header zur Identität
    werden **nicht** mehr vertraut.
  - **Maschinen** (Voice-Worker / Tool-Webhooks / Jobs): `X-Service-Token` ==
    `MAS_SERVICE_TOKEN` → Praxis-(Admin-)Scope für den angegebenen `X-Client-Id`.
  - **Öffentlich** (ohne Login): nur `/health` und die PIN-geschützten Handy-
    Endpunkte (`/clara/<id>`, `/clara/<id>/connect`, `/clara/session`,
    `/clara/identify`).
- `ALLOWED_ORIGINS` in Prod auf die echten Origins setzen (Default `*` nur Dev).

## Firestore-Indizes

MAS-2 benötigt **keine** Composite-Indizes: Vorgangs-Threading läuft über eine
deterministische Dokument-ID (Transaktion), alle Listen-Abfragen sind single-field
(Gleichheit + In-Memory-Sort bzw. ein Feld Range+Order) und damit automatisch
indiziert. Die Firestore-Index-Verwaltung des Projekts `docgenda` bleibt also
unverändert; aus MAS-2 muss nichts deployt werden.

## DSGVO / Daten-Lifecycle

MAS-2 bietet pro Mandant Endpunkte für Auskunft/Export, Löschung und
Aufbewahrung. Alle erfordern **Admin-Rolle** und arbeiten ausschließlich auf
dem **eigenen** Tenant (`clientId` aus dem verifizierten Token; ein normales
Nutzer-Token kann keine fremde Praxis adressieren). Betroffen sind nur
MAS-eigene Daten unter `clients/{clientId}/mas_*` (Firestore) und
`mas-*/{clientId}/` (Storage) — Plattformdaten (Patienten/Termine,
`settings/billing`) werden **nicht** angefasst und müssen plattformseitig
behandelt werden.

- `GET /admin/tenant/export` – Art. 20 (Portabilität): ein JSON mit allen
  MAS-Datensätzen + Manifest der Storage-Dateien (1h-Signed-URLs).
  Mail-Passwörter werden standardmäßig redigiert; `?includeSecrets=1` exportiert
  die verschlüsselten Werte (nur mit `MAIL_CRYPTO_KEY` entschlüsselbar).
- `POST /admin/tenant/erase` – Art. 17 (Löschung): hartes Löschen aller
  MAS-Daten + Storage-Präfixe. **Standardmäßig Dry-Run** (liefert den Umfang +
  `confirmRequired`); erst `{ "confirm": "<clientId>" }` im Body führt die
  Löschung aus.
- `POST /admin/tenant/retention` – Aufbewahrung: purgt transiente Daten
  (Papierkorb-Mails > `trashDays`, beendete Sessions > `sessionDays`).
  Medizinische Akte (INBOX/Vorgänge/Events) bleibt erhalten. Dry-Run per
  Default; `{ "apply": true }` löscht wirklich. Empfehlung: als Cron/Job
  regelmäßig mit `apply:true` aufrufen.

## Skalierung / gebundene Lesezugriffe

- **Adressbuch** (`/mail/contacts`, `/mail/address-book`) liest cursor-basiert in
  Fenstern (Sortierung `lastSeenAt` desc) und liefert `nextCursor`/`contactsCursor`
  für „mehr laden". Kein Voll-Scan, kein Composite-Index; Speicher pro Request
  ist unabhängig von der Gesamtzahl der Kontakte begrenzt.
- **Events** sind bereits gebunden: `queryRecent` nutzt Range+Order auf `ts`
  (single-field), `queryByPatient` Equality + In-Memory-Sort mit hartem Limit.
  Da Daten pro Mandant isoliert sind, bleiben diese Mengen klein.

## Patienten-Zuordnung (Verwechslungsschutz)

Die Identitätsauflösung (`src/brain/identity.js`) rät **nie**:

- **E-Mail exakt** → `matched`, Methode `email` (stärkste Identität).
- **Genau ein Namens-Treffer** → nur `matched` (Methode `name`), wenn der
  **Nachname** auch wirklich im gesuchten Namen vorkommt; sonst `ambiguous`
  (verhindert, dass ein zufälliger Einzeltreffer eine falsche Akte trifft).
- **Mehrere/keine Treffer** → `ambiguous` / `unmatched`, Kandidaten bleiben für
  die manuelle Zuordnung erhalten.

`subject.matchMethod` wird auf Events/Vorgängen mitgespeichert. Bereitet Nadine
automatisch einen Entwurf vor und ist der Patient **nicht** eindeutig zugeordnet,
zieht sie **keine** frühere Patienten-Historie in den Entwurf und setzt einen
sichtbaren Warnhinweis („Empfänger prüfen"), bevor etwas freigegeben wird.

## LLM / KI-Verarbeitung (DSGVO)

- Nadines Schreib- und Klassifizierungs-KI läuft **vollständig lokal** auf eurem
  Qwen via Ollama (OpenAI-kompatible API, `src/mail/llm.js`). **Kein OpenAI, kein
  Cloud-Call.** Konfiguration: `MAS_LLM_*`, `MAS_LETTER_MODEL`, `MAS_CLASSIFY_MODEL`.
- **Lokalitäts-Guard:** Beim Start prüft das Backend, ob der LLM-Endpunkt
  lokal/privat ist (localhost / RFC-1918 / `.local`). Ist er es nicht, wird laut
  gewarnt; mit `MAS_LLM_REQUIRE_LOCAL=1` **verweigert das Backend den Start** —
  so kann eine falsch konfigurierte Cloud-URL nie Patientendaten erhalten.
- `/health/ready` meldet `llmLocal` und `llmReachable` (+ Modell/Endpunkt), damit
  man im Betrieb sieht, dass Nadines Gehirn läuft und on-prem ist. Ist Ollama aus,
  fällt Nadine auf deterministische Vorlagen zurück (keine Cloud-Eskalation).
- **Verbleibende Cloud-Abhängigkeit (nur Sprachausgabe):** Der TelefonKI-Voice-
  Worker nutzt für **TTS ElevenLabs** (US). LLM (Qwen) und STT (faster-whisper)
  laufen lokal/auf eurer GPU. Der gesprochene Text geht zur Sprachsynthese an
  ElevenLabs — wenn das DSGVO-seitig ausgeschlossen werden soll, muss TTS auf eine
  lokale/EU-Lösung umgestellt werden (separates Voice-Repo, nicht MAS-2).

## Brain-Zuverlässigkeit (Clara ↔ Nadine, keine verlorenen Vorgänge)

- **Eine einzige Logbahn:** Jede Kommunikation (eingehende Mail beim Sync, jede
  ausgehende Antwort/Compose/Brief, jeder Voice-Vorgang) geht über
  `recordCommunication` → Event **und** Case/Ticket. Es gibt **ein** Task-System
  (`mas_cases`); das alte `mas_tasks` ist auf Cases umgestellt.
- **Dead-Letter-Outbox (`mas_brain_outbox`):** Schlägt ein Event-/Case-Schreibvorgang
  nach erfolgtem Versand fehl, wird er **nicht** verworfen, sondern mit
  Exponential-Backoff erneut versucht (max. 8 Versuche, dann `dead`).
- **Scheduler standardmäßig AN** (alle 120 s; `MAIL_SYNC_INTERVAL_MS=0` deaktiviert,
  `<30000` wird als Sicherheitsuntergrenze abgelehnt). Jeder Tick synchronisiert
  Postfächer **und** leert die Outbox aller Mandanten.
- `/health/ready` meldet `brainOutboxDead` (globale Zahl unzustellbarer Jobs).
  Pro Mandant: `GET /mail/brain/outbox` (pending/dead), `POST /mail/brain/outbox/drain`.
- **Lebenszyklus gekoppelt:** Ein abgeschlossener Vorgang (`resolved`/`closed`) löst
  seine verknüpften offenen Events automatisch mit auf (auditierte Resolution).
- **Freigabe-Sicherheit:** Case-Versand schreibt ein explizites Freigabe-Audit
  („Freigegeben & gesendet von …") und verweigert das erneute Senden eines bereits
  abgeschlossenen Vorgangs (`409 case_already_closed`, Override `force:true`).
- **Voice ohne PC-Monitor:** Aktiver Vorgang/Operator liegen in `mas_config/voice_state`,
  nicht an einer Live-Session — Clara funktioniert auch im Auto. Falsche PIN wird
  **ehrlich** gemeldet (`pinError: "pin_invalid"`), kein stilles Anonym-Briefing.

## Tagesplan-Briefing (Clara liest den echten Kalender)

- **Quelle:** Der gebuchte Kalender `clients/{clientId}/locations/{locationId}/appointments`
  der Plattform wird **read-only** über das Admin-SDK gelesen (gleiches Firebase-Projekt).
  `locationId` und die Behandler/Terminarten kommen aus `mas_config/booking`.
- **Filter wie im Plattform-Kalender:** temporäre Reservierungen (ohne Patient, keine
  Sperrzeit) und mehrtägige Einträge werden ausgeblendet, damit die Zählung dem
  entspricht, was das Team sieht.
- **Voice-Tool `day_briefing`** (`POST /tools/day-briefing`, optional `date`, `doctorName`):
  Clara sagt pro Behandler Anzahl, Zeitspanne, **freie Lücken** (≥ 20 min) und Hinweise
  (Neupatienten, unbestätigte Termine, Video, Sperrzeiten). Ohne Datum = heute (Europe/Berlin).
  Bei aktiver Session springt der Monitor zusätzlich auf den Tag (`navigate`).
- **UI:** Tab „Tagesplan" in Claras Monitor (`GET /brain/day-schedule`) mit
  Behandler-Karten, Lücken und Terminliste; „▶ Vorlesen" nutzt denselben Sprechtext.
- **Abgrenzung:** `read_briefing` = offene **Vorgänge/Tickets**, `day_briefing` =
  **Terminkalender**. Beides getrennt, bewusst.

## Living Prompt (geführte Prompt-Evolution)

Der Prompt jeder KI-Dame ist **kein statischer Text**, sondern ein kompiliertes
Artefakt aus drei strikt geordneten Schichten:

1. **Verfassung** — hartkodiert in `src/brain/livingPrompt.js` (Datenschutz, keine
   Diagnosen/Preise, kein Druck, Rollen-Kern). Kann von keinem LLM und keiner
   Konfiguration verändert werden.
2. **Erkenntnisse** (`mas_prompt_lessons`) — gelernte Verhaltensregeln. Statusmaschine
   `proposed → active | rejected`, `active → retired`. **Nur menschlich freigegebene**
   Erkenntnisse wirken. Max. 15 aktive pro Agentin (Cap), Dedupe über normalisierten
   Regel-Schlüssel, Evidenz-Pflicht (verlinkte Vorgangs-IDs müssen existieren).
3. **Fakten** — optionale tagesaktuelle Hinweise zur Compile-Zeit.

- **Versionierung:** Jede Veröffentlichung erzeugt einen unveränderlichen Snapshot in
  `mas_prompt_versions` (voller Text + Hash + Lesson-IDs). Genau eine Version pro
  Agentin ist aktiv; **Rollback = ältere Version aktivieren** (1 Klick im Monitor).
  Identische Kompilate erzeugen keine neue Version (hash-idempotent).
- **Reflexion:** Nächtlich (nach 03:00 Berlin, max. 1×/Tag, Zustand in
  `mas_config/living_prompt`) liest das **lokale LLM** die jüngsten Vorgänge und
  schlägt Erkenntnisse vor — Schema-validiert, Evidenz geprüft, dedupliziert. LLM
  offline ⇒ einfach keine Vorschläge (kein Fehler). Manuell: „✨ Reflexion jetzt“
  im Monitor bzw. `POST /brain/lessons/reflect`.
- **Metriken pro Version:** Ereignisse tragen das Tag `pv:<agent>:<n>` in
  `event.tags`; `GET /brain/prompt/:agent/versions` aggregiert Kontakte, Abbrüche,
  negative Stimmung etc. pro Version (Selektionsdruck).
- **Abruf für Laufzeit-Agenten:** `GET /brain/prompt/:agent` liefert den aktiven
  kompilierten Prompt inkl. Version-Tag (für Lisa/Bianca-Worker, Zaluma-Anbindung).
- **UI:** Tab „Erkenntnisse“ in Claras Monitor: Vorschläge freigeben/ablehnen,
  aktive Erkenntnisse pensionieren, aktiven Prompt einsehen, Versionen + Rollback.

## Lückenfüller / Umsatz-Coach (Stufe 1) + Caller-Lookup

- **Echte Lücken:** Öffnungszeiten Behandler-zuerst (`users/{userId}.openingHours`,
  sonst Standort) minus Pause, gebuchte Termine und Sperrzeiten; virtuelle
  Recall-Platzhalter blockieren nicht (wie der Slot-Rechner der Plattform).
  Mindestlücke 25 min.
- **Kandidaten:** Kampagnen-Buckets (`campaigns/{id}/patients`, Status „gestartet“)
  + fällige virtuelle Recalls (`status needsConfirmation`, `createdBy
  recaller/campaign/predecessor`). Gates: nicht konvertiert, erreichbar, Behandlung
  passt in die Lücke, **Drossel** (kein Kontakt, wenn in den letzten 14 Tagen schon
  per Lisa kontaktiert — Quelle: das Gehirn selbst). Einwilligungen werden pro
  Kandidat angezeigt (Kampagne: `smsAllowed`/`reminderAllowed`; Recall: „prüfen“).
- **Gesprächsaufträge:** Pro Lücke EIN Vorgang (`gapfill_<hash>`, idempotent),
  Assignee **Lisa**, Status `waiting_approval`. Trägt Slot, gerankte Kandidaten mit
  Grund, DSGVO-neutrales **AB-Skript** und die Lisa-Prompt-Version. **Jede Liste
  wird einzeln freigegeben** (`POST /brain/gap-fill/:caseId/approve`) — auditiert
  im Vorgang. Freigegebene Listen werden von Folge-Läufen nicht überschrieben.
  Outbound (SMS/Anruf) folgt erst mit der Zaluma-Anbindung.
- **Voice:** `gap_briefing` („Wo ist morgen Luft?“) und `lookup_caller`
  („Wer ist 0171…?“ — findet Anrufliste-Kandidaten + jüngste Lisa-Kontakte und
  liefert den wissenden Begrüßungskontext für eingehende Rückrufe).
- **Kalender-Optik:** Konvertiert ein Kampagnen-/Recall-Patient (Cloud Function
  `attributeCampaignConversion`), wird der Termin mit `wonBack: true` markiert →
  goldener Rahmen + Trophäen-Icon im Plattform-Kalender (Frontend + Functions
  deployen).

## Clara ruft aufs Handy (Geräte-Pairing + Web-Push)

Clara kann gekoppelte Handys mit einer **anrufartigen Push-Mitteilung** klingeln
lassen („Clara ruft an“); ein Tipp öffnet die Anrufmaske (`/m/call.html`), die
sich per LiveKit verbindet — Clara weiß dabei PIN-los, **wer** abnimmt.

- **VAPID-Schlüssel (Pflicht):** einmalig `npx web-push generate-vapid-keys`,
  dann in die `.env`: `MAS_VAPID_PUBLIC_KEY`, `MAS_VAPID_PRIVATE_KEY`,
  `MAS_VAPID_SUBJECT` (mailto:). Ohne Keys antworten die Push-Routen mit
  `push_not_configured` (kein Crash). **Keys nie rotieren**, sonst verlieren
  alle gekoppelten Handys ihre Subscription.
- **HTTPS-Pflicht:** Web-Push + Service Worker funktionieren nur über HTTPS —
  `PUBLIC_BASE_URL` muss die öffentliche HTTPS-URL sein (dev: ngrok-Tunnel).
- **Pairing-Flow:** Einstellungen → „📱 Clara am Handy“ → Person wählen →
  QR erzeugen (`POST /clara/devices/pairing-token`, **einmalig, 10 min TTL**,
  an die Person gebunden). Handy scannt → `/m/pair.html` → ein Tipp
  („Jetzt aktivieren“) → Mitteilungs-Erlaubnis → `POST /clara/devices/register`
  (Token wird in einer Transaktion verbrannt). Das Handy erhält einen
  `deviceKey` (nur gehasht gespeichert) und steht ab dann in der Geräteliste.
- **iPhone-Besonderheit:** Push gibt es nur für die **installierte** Web-App —
  die Pairing-Seite führt durch „Teilen → Zum Home-Bildschirm“; die Einrichtung
  läuft in der installierten App automatisch weiter (Token steckt in der URL).
  iOS zeigt Titel + Text + App-Icon mit Standard-Ton; Android bekommt zusätzlich
  grüne/rote Buttons + Klingel-Vibration direkt in der Mitteilung.
- **Identität:** `/clara/session` akzeptiert jetzt `deviceId`+`deviceKey` als
  PIN-Ersatz (Operator wird gesetzt wie beim PIN-Login). Falscher Key →
  `device_invalid`, niemals stiller anonymer Fallback.
- **Anrufen:** `POST /clara/devices/:id/test-call` (Probeanruf, Settings-UI),
  `POST /clara/devices/self-test` (Handy klingelt sich selbst, deviceKey-gated),
  `POST /clara/call-operator` `{operatorId, reason}` — der Haken für
  proaktive Briefings (Scheduler). Payload ist PII-frei (nur neutraler Grund),
  TTL 90 s (ein „Anruf“ klingelt nicht verspätet), `urgency: high`.
- **Hygiene:** Antwortet der Push-Dienst 404/410, wird das Gerät automatisch
  entfernt. Die Pairing-/Anruf-Seiten + Service Worker + Icons liegen unter
  `backend/public/m/` und werden vom MAS-2-Backend selbst ausgeliefert —
  **kein** Eingriff in Routing/Build der Plattform.
- **Daten:** `mas_devices` (Subscription + Secret-Hash, kein Klartext),
  `mas_pairing_tokens` (verbrannt nach Nutzung). Beide hängen am normalen
  DSGVO-Lifecycle des Tenants.

## LiveKit Cloud

1. Projekt unter https://cloud.livekit.io anlegen → `wss://<projekt>.livekit.cloud` + API Key/Secret.
2. Dieselben Creds bekommen **MAS-2** (mintet Tokens) **und** der **Clara-Worker**
   (verbindet als Agent). Token von Projekt A wird von Projekt B abgelehnt — also gleiche
   Creds auf beiden Seiten.
3. Mehrkunden-Betrieb: pro Mandant eigenes LiveKit-Projekt **oder** Agent-Dispatch/
   Raum-Namensraum, damit Telefon- und Clara-Agenten sich nicht überschneiden.

## Plattform-Konfiguration

Die „MAS"-Kachel/Seite baut die QR-URL aus `REACT_APP_MAS_BASE_URL`
(Default `http://127.0.0.1:4000`). Für Prod beim Plattform-Build setzen, z.B.:

```
REACT_APP_MAS_BASE_URL=https://mas.pickadoc.de
```

## Offene Infra-Entscheidungen (brauche Input)

1. **Hosting MAS-2**: Cloud Run (empfohlen) oder anderes? Eigene Subdomain (z.B. `mas.pickadoc.de`)?
2. **LiveKit Cloud**: Konto/Projekt vorhanden? Ein Projekt für alle Mandanten oder pro Kunde?
3. **GPU-Server**: Zugang/Adresse für den Clara-Worker + Ollama? Wie viele parallele Sessions?
4. **MAS-Gating**: Soll die Clara-Kachel nur bei gebuchtem `mas`-Paket erscheinen?
   (Dafür `isAppEnabledFromBilling` in `appCatalog.ts` für MAS-Apps erweitern.)
