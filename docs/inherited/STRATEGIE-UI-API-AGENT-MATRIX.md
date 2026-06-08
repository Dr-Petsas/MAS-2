# UI-Route, API und Agent-Zuordnung

**Stand:** 2026-03-24  
**Zweck:** Referenz, welche Frontend-Routen welche Backend-APIs nutzen und welche Unter-KI fuer Sprache/Chat zustaendig ist. Ergaenzung zu [STRATEGIE-CLARA-VOICE-GESAMTPLAN.md](./STRATEGIE-CLARA-VOICE-GESAMTPLAN.md).

**Legende:** **Fakten** = typische GET/Query fuer KI-Tools; **Aktion** = POST/PATCH mit Seiteneffekten.

---

## Querschnitt

| Thema | APIs (Auszug) | Agent |
|-------|----------------|-------|
| Voice-Turn | `POST /api/voice/turn` | Clara |
| Team-Chat | `GET/POST /api/team-chat` | Clara (+ Routing) |
| Gedaechtnis | `GET /api/memory/context`, `GET /api/memory/events` | Clara + Fachagent |
| Faelle | `GET /api/cases/*`, `POST .../resolve`, … | Clara |
| Operational Dringlich | `buildInboxWorkItems` + `buildCallReportItems` (Server) | Clara / Nadine-Kontext |
| TTS | `GET|POST /api/tts` | Clara |

---

## Routen (Frontend `main.jsx`)

### `/login`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Login-Hub, PIN | `GET /api/login-hub/doctors`, `GET /api/login-hub/hub-pair-status`, `POST /api/employee-auth/*` | Clara |

### `/teamchat`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Chat, Entwuerfe | `GET/POST /api/team-chat`, `DELETE …/messages`, `team_chat_drafts/*` | Clara, Nadine |
| Anwesenheit | `GET/POST /api/team-chat/presence` | Clara |
| Agent-Reports | `GET /api/team-chat/agent-reports` | Clara |

### `/uebersicht` (HomePage)

| Inhalt | APIs | Agent |
|--------|------|-------|
| Scan-URL, Links | `GET /api/settings/scan-base-url`, `GET /api/employee-auth/login-links` | Clara |
| Geraete | `GET /api/devices/status`, `POST …/disconnect` | Clara |

### `/inbox`, `/sent`, `/drafts`, `/trash` (App)

| Inhalt | APIs | Agent |
|--------|------|-------|
| Items | `GET/PATCH/DELETE /api/items`, `POST /api/items`, `from-image` | Nadine |
| Anhaenge | `GET …/attachments/:id`, `…/text` | Nadine |
| Entwuerfe | `GET/POST /api/drafts` | Nadine |
| Mail | `POST /api/mail/fetch`, `send`, `send-batch` | Nadine |
| Konten | `GET/POST/PUT/DELETE /api/settings/mail*` | Nadine |
| Adressbuch | `GET/POST/PATCH /api/address-book*` | Nadine |
| KI | `POST /api/ai/suggest-reply`, `email-compose-assist`, … | Nadine |

### `/add-account`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Token | `GET/POST /api/settings/add-account-token` | Nadine |

### `/scan`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Upload | `POST /api/items/from-image`, `GET/POST …/upload-token` | Nadine |

### `/clara`, `/monitor`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Voice | `POST /api/voice/turn` | Clara |
| Tools | `GET /api/clara/tools/*` | Clara |
| Live-Klaerungen | `…/live-clarifications` | Clara, Bianca |

### `/bianca`, `/lisa`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Gespraeche | `GET /api/bianca/conversations`, `…/:id`, `audio` | Bianca / Lisa |
| Tasks | `GET/POST/PATCH/DELETE /api/tasks`, `call-lisa`, `send-sms`, `fetch-transcript` | Lisa, Bianca |
| Reports | `GET /api/call-reports/work-items`, `search` | Lisa, Bianca |

### `/lena`, `/lena/record`, `/lena/sessions`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Sessions | `GET/POST/PATCH/DELETE /api/lena/sessions*`, `upload`, `export`, `audio` | Lena |

### `/sophie`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Platzhalter | (noch keine Produkt-APIs) | Sophie (spaeter) |

### `/julia`

| Inhalt | APIs | Agent |
|--------|------|-------|
| QM | `GET/PATCH/POST /api/qm/*` (Buecher, Kalender, Schedules, pending-requests, …) | Julia |

### `/tasks/:id`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Thread | `GET …/tasks/:id/thread`, `PATCH`, `create-draft` | Lisa / Nadine |

### `/voice-chat`, `/stats`, `/training`, `/voice-smoke`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Metriken, Training | `/api/stats/voice-*`, `/api/voice/training/*`, `golden-cases` | Clara |

### `/dictation`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Diktat | `GET/POST /api/dictation-sessions/:token/*` | Clara |

### `/aze`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Anwesenheit, Push | `GET /api/login-hub/overview`, `POST /api/marie/send-push`, `GET /api/marie/push-history`, `GET /api/employees` | Marie |

### `/mitarbeiter`, `/mitarbeiter-geraet`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Portal | `GET /api/employee-portal/*`, `POST …/mobile-sessions/*` | Marie |
| AZE | `GET/PATCH /api/aze/*` | Marie |
| Urlaub | `GET/POST/PATCH /api/employee-leave/*` | Marie |
| Push | `POST /api/push/subscribe`, `unsubscribe` | Marie |

### `/tagesinfos`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Memos | `GET/POST/PATCH/DELETE /api/memos` | Clara / Lisa (Betrieb) |

### `/einstellungen`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Praxis, Briefkopf | `GET/PUT /api/settings/practice` | Nadine / Clara |
| Mitarbeiter | `GET/POST/PATCH/DELETE /api/employees` | Marie |
| QM-Buch aktivieren | `PATCH /api/qm/books/:key` | Julia |
| KI-Kosten | `GET/POST /api/stats/ai-costs` | Clara |

### `/adressbuch`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Kontakte | `GET /api/address-book`, `search`, `resolve`, `upsert`, `PATCH` | Nadine |

### Arztbriefe (in App eingebettet)

| Inhalt | APIs | Agent |
|--------|------|-------|
| Drafts | `/api/doctor-letter-drafts*`, `doctor-letter-blocks*`, `doctor-letter-context/ocr` | Nadine |

### `/api-doc`

| Inhalt | APIs | Agent |
|--------|------|-------|
| Statische Doku | Frontend | Clara |

---

## Weitere Backend-Module (ohne eigene React-Route)

| Modul | Datei / Praefix | Agent |
|-------|------------------|-------|
| Live-Presence, Marie, AZE | `live-presence.js` (`/api/marie`, `/api/mobile-sessions`, `/api/aze`, …) | Marie |
| Voice-Training | `voice-training-routes.js` | Clara |

---

*Vollstaendige OpenAPI-artige Liste: bei Bedarf aus `app.get/post` in `index.js`, `clara-lisa.js`, `live-presence.js` generieren.*
