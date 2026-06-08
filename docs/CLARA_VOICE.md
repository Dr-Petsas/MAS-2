# Clara — Sprach-Kanal (Schritt B)

Clara ist die **interne Sprach-Assistentin** des Praxisteams (Aufgaben delegieren),
**kein** Patienten-Telefonagent. Der Audio-Kern ist die **wiederverwendete v5.2-Pipeline**
(LiveKit WebRTC → faster-whisper → Qwen via Ollama → ElevenLabs), betrieben als
**Instanz/Kopie** — die Golden Source (`F:\TelefonKI v5.2`) bleibt unangetastet.

## Architektur

```
Browser (QR/Connect-Seite, MAS-2)
   │  POST /clara/session  → LiveKit-Token (Node, livekit-server-sdk)
   ▼
LiveKit SFU (ws://127.0.0.1:7880, Dev-Keys)
   ▲  Audio (mic ↔ agent)
   │
Voice-Runtime-Instanz (v5.2-Worker, audio_only, ohne Telefon)
   │  set_profile=clara_meddent  (Data-Channel topic "pickadoc.cmd")
   │  custom_tool create_task  →  HTTP POST
   ▼
MAS-2 Backend  POST /tools/create-task?clientId=…  →  Firestore clients/{clientId}/mas_tasks
```

- **Token** wird in MAS-2 (Node) erstellt, mit denselben Dev-Keys wie die lokale SFU,
  damit der Worker im selben Raum andockt.
- **clientId** reist im Tool-URL-Query (Custom-Tools können keine Header senden).
- **Profilwahl** über `set_profile` (genau das Protokoll des v5.2-Frontends).

## Voraussetzungen (lokale Dienste)

1. **LiveKit SFU** auf `:7880` (Dev-Keys aus `deploy/livekit/livekit.yaml`).
2. **Ollama** auf `:11434` mit dem Qwen-Modell.
3. **ElevenLabs API-Key** (Env `ELEVENLABS_API_KEY`).
4. **MAS-2 Backend** (`npm run dev`, Port 4000).

## Voice-Runtime-Instanz starten (Golden Source bleibt unberührt)

> Nicht in `F:\TelefonKI v5.2` arbeiten. Eine **Kopie/laufende Instanz** verwenden.

1. Clara-Profil in die `profiles/`-Ablage der Instanz legen (additiv):
   `voice/profiles/clara_meddent/`  →  `<voice-instanz>/profiles/clara_meddent/`
2. Worker im **Conv-AI-Modus** starten (kein Telefon, kein cloudflared, kein QR-Pairing):
   - `LIVEAVATAR_V3_RENDERER=audio_only`  (kein Lipsync/RunPod-Video)
   - LLM/STT/TTS-Env wie gehabt (Qwen via Ollama, faster-whisper, ElevenLabs)
   - LiveKit-Env auf die lokale SFU (`ws://127.0.0.1:7880`, Dev-Key/Secret)
3. Der Worker dispatcht automatisch in den `clara_*`-Raum, sobald der Browser verbindet.

## Was Clara kann (clara_meddent)

- **Kalender (echter med-dent-Kalender):** freie Slots suchen, Termin anlegen,
  verschieben, absagen, nachschlagen — die erprobten v5.2-Termin-Tools, gebunden
  an die med-dent-Buchungskonfiguration (3 Kalender, Behandlungsarten, Öffnungszeiten).
- **Aufgaben:** interne Notizen/Rückrufe via `create_task` → `mas_tasks`.

> Clara braucht **nicht** zu wissen, von welchem PC gescannt wurde. Sie kennt die
> **Praxis (`clientId`)** aus dem QR/Token/Profil; Termine landen im gemeinsamen
> med-dent-Kalender und sind überall sichtbar. (Eine PC-/Bildschirm-Bindung wäre
> nur für Live-Anzeige auf genau diesem Schirm nötig — optionales Extra.)

## Phone-Erreichbarkeit — HTTPS nötig

Browser-Mikrofon (`getUserMedia`) funktioniert nur im **sicheren Kontext**:
- **`localhost` (PC-Test):** Mikro erlaubt → ideal für den ersten End-to-End-Test.
- **Handy/LAN/Internet:** braucht **HTTPS** für die Seite **und** eine erreichbare
  LiveKit-Endpoint (LAN-IP+WSS-Tunnel oder LiveKit Cloud). Reines `http://<LAN-IP>`
  blockiert das Mikrofon. Optionen: HTTPS-Tunnel (wie v5.2 via cloudflared) **oder**
  MAS-2 auf eine HTTPS-Domain deployen + LiveKit Cloud.

## Test — Schritt 1: PC (localhost, schnellster Nachweis)

1. Lokale Dienste starten (SFU 7880, Ollama 11434, ElevenLabs-Key, Voice-Worker mit `clara_meddent`).
2. MAS-2 Backend: `cd backend && npm run dev`.
3. Im PC-Browser öffnen: `http://127.0.0.1:4000/clara/MEe4ZQHEzOPzLcexyhdT` → „Verbinden & sprechen".
4. Termin-Test: *„Lege bitte einen Termin bei Doktor Petsas für Herr Meier, 0177…, am Dienstag Vormittag an."*
   → Clara sucht freie Slots, bucht, bestätigt; der Termin erscheint im med-dent-Kalender.
5. Aufgaben-Test: *„Notiere: Rückruf Frau Schulz, dringend."* → erscheint in `mas_tasks`
   (`GET /tools/open-tasks`, Header `X-Client-Id`).

## Test — Schritt 2: Handy (nach HTTPS-Setup)

`PUBLIC_BASE_URL` auf die HTTPS-Adresse setzen → QR zeigt dann den HTTPS-Connect-Link;
Handy scannt, Mikro wird erlaubt, Rest identisch.

## Zombie-Vermeidung (statt PID-Dateien)

- **Eine** Session = **ein** LiveKit-Raum-Job; endet der Browser, räumt der Worker
  Mic-Tasks beim `participant_disconnected`/`track_unsubscribed` ab.
- Kein cloudflared, keine Doppel-Worker (local+cloud), kein QR-Pairing-State —
  genau die Quellen alter „Zombies" entfallen im Conv-AI-Setup.
- Token-TTL begrenzt verwaiste Sessions (`LIVEKIT_TOKEN_TTL_S`).

## Offen / nächste Schritte

- Profil-Bereitstellung perspektivisch zentral (Firestore/MAS-2 generiert pro Kunde),
  statt Datei-Kopie in die Instanz.
- Dedizierte Clara-Worker-Instanz vs. geteilte SFU mit dem Telefon-Worker
  (Agent-Name-Filter / getrennte LiveKit-Projekte) für den Mehrkunden-Betrieb.
