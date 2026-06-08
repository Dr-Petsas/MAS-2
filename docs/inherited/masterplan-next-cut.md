# Masterplan – Naechster Architektur-Cut

Stand: 2026-03-13

## Kontext

Der backendgesteuerte Voice-/Team-Chat-Kern ist umgesetzt:

- Einheitliche Turn-Verarbeitung ueber `POST /api/voice/turn` und `POST /api/team-chat`
- Clara-Session-Layer mit `voice_sessions`, explizitem `dialog_state` (phase, pending_kind, pending_payload)
- Orchestrator loest Pending aus Session aus: `write_email_recipient`, `call_completion`, `sms_completion`, `draft_completion`
- Case-/Policy-Auswertung, Delegation an Lisa/Nadine/Clara, Persistenz in Messages/Tasks/Drafts

Bezug: `docs/voice-regression-matrix.md`, `docs/voice-smoke-test-checklist.md`.

---

## Prioritaet 1: Verbleibende Altpfade (Backend)

**Ziel:** Alle sprach-/chat-relevanten Einstiege laufen ueber den Orchestrator; keine parallelen Legacy-Pfade mehr.

### Audit-Ergebnis (Stand 2026-03-13)

**Bereits ueber Orchestrator:**

- `POST /api/voice/turn` – nutzt `processVoiceTurnRequest` + `handleVoiceTurn`, Session, Dialog-State.
- `POST /api/team-chat` – bei `VOICE_BACKEND_ORCHESTRATOR_ENABLED` zuerst `processVoiceTurnRequest`; Fallback `teamChatReply` + `finalizeTeamChatTurn`.

**Legacy-/Parallelpfade:**

| Route | Nutzung | Empfehlung |
|-------|---------|------------|
| `POST /api/clara/tools/call-tasks` | Ehemals ConvAI/Clara-Agent (ElevenLabs) | **ConvAI-Agent wird entfernt.** Route kann entfallen oder nur fuer UI/legacy bleiben. |
| `POST /api/clara/tools/write-tasks` | ehemals ConvAI Schreibauftraege | Wie oben. |
| `POST /api/cases/:id/actions/create-call-task` | UI: „Rueckruf anlegen“ aus Fallkontext | Kein Sprach-Intent; Payload kommt aus UI. Beibehalten, ggf. gleichen `createTaskFromPayload`-Kern nutzen (bereits so). |
| `POST /api/cases/:id/actions/create-write-task` | UI: „Schreibauftrag anlegen“ aus Fall | Wie oben. |
| `POST /api/team-chat` Sonderfaelle | Report, Work-Items, Important-Briefing, Immediate-Reply, Pending-Work-Item | Bewusst vor dem Orchestrator; bleiben als Sonderbefehle. |

**Behobener Punkt:**

- Team-Chat mit Orchestrator: Einzel-Antwort (execute/clarify) lief bisher mit `respondTeamChatCommand` und bypassed `finalizeTeamChatTurn` – Drafts wurden nicht in `team_chat_drafts` persistiert. Abstellung: Einzel-Antwort geht immer ueber `finalizeTeamChatTurn`.

**Entscheidung:**

- **ConvAI/ElevenLabs-Agent (Clara in der Cloud) wird entfernt.** Sprach-Clara laeuft ausschliesslich ueber Backend-Orchestrator (`/api/voice/turn`); Frontend nutzt bereits `useBackendClaraVoice` (ClaraPage, VoiceChatPage). Keine ConvAI-Integration mehr – ggf. Routen ` /api/clara/tools/call-tasks` und `/api/clara/tools/write-tasks` aufraeumen oder nur fuer UI behalten.
- Bianca/Lisa-Telefonie: Safe-Mode und gemeinsamer Task-Layer – bereits umgesetzt; Routen in `clara-lisa.js` (z. B. `POST /api/tasks/:id/call-lisa`) nutzen `createTaskFromPayload`/Execution-Layer.

**Naechster Cut:** Kein ConvAI-Umstellen noetig (Agent wird entfernt). Optional: obige Tool-Routen entfernen oder dokumentieren; ansonsten Prioritaet 2/3 wie gehabt.

---

## Prioritaet 2: Reporting und Observability

**Ziel:** Sprachaktionen und Klärungsverlaeufe sind nachvollziehbar und auswertbar.

**Bereits vorhanden:**

- Logging und Metriken im Voice-Pfad (STT, Orchestrator, TTS)
- Latenz-Metriken in der API-Response und optional in der UI
- **Umgesetzt:** Turn-Outcomes werden in `ai_usage_events` erfasst (meta_json: mode, sourceChannel, taskCreated); Abfrage `getVoiceTurnOutcomeStats(days)` in `aiUsage.js`; **GET /api/stats/voice-outcomes?days=7** liefert Aggregation: total_turns, by_mode (execute/clarify/blocked/report/active), by_channel (voice_turn/team_chat), task_created_count, from_date, to_date.
- **Dashboard/UI:** Die **Clara-Leitstelle** (Clara Monitor Page) ist die zentrale Oberfläche für Observability und Steuerung (delegierte Aufgaben, Mikrofon, Latenz-Anzeige). Die **Voice- & Team-Chat-Statistik** unter **/stats** (VoiceStatsPage) bindet `/api/stats/voice-outcomes` an und zeigt Turns, Modi, Kanal, erstellte Tasks – damit ist die Dashboard-Anbindung erledigt.

**Optional / naechster Cut:**

- Optional: strukturierte Logs (z. B. JSON) fuer spaetere Auswertung; ggf. Verlinkung von der Clara-Leitstelle auf /stats

---

## Prioritaet 3: Voice-Regression (VR) und Smoke-Tests

**Ziel:** Die definierten 12 VR-Faelle sind als bestanden/fehlgeschlagen dokumentiert; Smoke-Checkliste wird nach jedem groesseren Cut durchlaufen.

**Ablauf:**

1. Smoke-Test-Reihenfolge aus `docs/voice-smoke-test-checklist.md` abarbeiten.
2. Pro Fall: Status (bestanden/fehlgeschlagen/teilweise) und kurzen Befund in der Checkliste oder in einer Ergebnisdatei festhalten.
3. Bei Fehlern: Betroffene Komponente und naechste Aktion notieren; ggf. Bugfix vor naechstem Cut.

**Umgesetzt:** Checkliste um Abschnitt „Letzter Smoke-Lauf“ erweitert (Datum, Umgebung, Bestanden/Fehlgeschlagen/Teilweise/Offen, Kurzbefund, optional Verweis auf `/api/stats/voice-outcomes`).

**Neu umgesetzt:** `voice_smoke_runs`-Persistenz im Backend sowie Laden/Speichern in `/voice-smoke`.

- `GET /api/stats/voice-smoke-run/latest` laedt den letzten gespeicherten Lauf
- `POST /api/stats/voice-smoke-run` speichert Status, aktuellen Fall und letztes Ergebnis
- `/voice-smoke` laedt den letzten Lauf und speichert jeden Klick auf `bestanden` / `teilweise` / `fehlgeschlagen`
- `/voice-smoke` fuehrt jetzt **Voice-Faelle VR-01 bis VR-06, VR-12** und **Team-Chat-Faelle VR-07 bis VR-11** in einer Seite zusammen

**Naechster Cut:** Vollstaendigen Smoke-Durchlauf in `/voice-smoke` ausfuehren und die gespeicherten Ergebnisse in `docs/voice-smoke-test-checklist.md` uebertragen.

---

## Kurzuebersicht

| Prioritaet | Bereich           | Naechster konkreter Schritt                          |
|-----------|-------------------|------------------------------------------------------|
| 1         | Altpfade          | ConvAI-Agent wird entfernt; Clara nur noch ueber Backend-Orchestrator. Optional: /api/clara/tools/* aufraeumen. |
| 2         | Reporting         | erledigt: API + Clara-Leitstelle + /stats (Voice-Statistik) als Dashboard |
| 3         | VR / Smoke        | `/voice-smoke` deckt Voice + Team-Chat ab; kompletten Smoke-Durchlauf ausfuehren und dokumentieren |

Die Reihenfolge kann je nach Ressource getauscht werden; Prioritaet 3 gibt Rueckmeldung ueber den aktuellen Stand und deckt Regressionen frueh auf.
