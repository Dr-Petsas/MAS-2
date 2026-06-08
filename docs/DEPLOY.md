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
  `DEFAULT_CLIENT_ID`.

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
