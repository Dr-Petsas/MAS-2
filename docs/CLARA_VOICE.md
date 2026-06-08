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

## Test (End-to-End)

1. MAS-2 Backend starten: `cd backend && npm run dev`.
2. QR-Seite öffnen: `http://127.0.0.1:4000/clara/MEe4ZQHEzOPzLcexyhdT`.
3. Auf „Verbinden & sprechen" tippen, Mikro erlauben.
4. Sagen: *„Notiere bitte: Rückruf Herr Meier, Nummer 0177…, dringend."*
5. Erwartung: Clara bestätigt kurz; in Firestore erscheint ein Dokument unter
   `clients/MEe4ZQHEzOPzLcexyhdT/mas_tasks`. Prüfen via
   `GET http://127.0.0.1:4000/tools/open-tasks` (Header `X-Client-Id`).

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
