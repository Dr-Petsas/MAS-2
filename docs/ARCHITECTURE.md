# MAS-2 — Architektur (Stand: Greenfield-Start)

Dieses Dokument hält die vereinbarten Architekturentscheidungen für den Neuaufbau fest.
Es ist der **kanonische** Plan; die Dokumente unter `inherited/` sind übernommene Ideen
aus dem Altstand und werden hier nur referenziert.

## 1. Produktvision

Eine **mandantenfähige** Assistenzplattform für Zahnarztpraxen im Pickadoc-Ökosystem.
Jeder Kunde nutzt im Rahmen seiner **MAS-Lizenz** die für ihn freigeschalteten KIs,
gesteuert per Sprache über **Clara** (Conversational AI). Ziel ist der Betrieb für
hunderte Praxen ohne Code-Forks pro Kunde: **eine Codebasis, viele Mandanten**.

## 2. Harte Leitplanken (nicht verhandelbar)

1. **`tenant_id` überall.** Jede Tabelle, jede Query, jeder Endpoint trägt den
   Mandanten-Kontext. Kein Cross-Tenant-Zugriff möglich.
2. **Conv-AI ≠ Telefon-KI.** Clara nutzt eine Conversational AI (ElevenLabs), die
   STT/TTS/Transport selbst übernimmt und nur **Server-Tools** (HTTP) aufruft. Es wird
   **keine** LiveKit-/WebRTC-Medienpipeline ins MAS gebaut. Die Telefon-KI bleibt ein
   separates Repo (`telefonki-v5.2`) und wird nicht mit MAS verschmolzen.
3. **Verträge vor Code.** Jede Systemgrenze (Pickadoc-Platform, Telefon-KI, ElevenLabs)
   ist ein versionierter HTTP-Vertrag (OpenAPI). Kein geteilter Laufzeit-Code.
4. **Kein Code aus dem alten MAS.** Übernommen werden Datenmodelle und Konzepte als
   Spezifikation — nicht der Monolith (`index.js` 822 KB) und nicht die alte
   `voice-*.js`-Sprachpipeline.

## 3. Control Plane vs. Data Plane

```
┌──────────────── Pickadoc OS (Control Plane) ─────────────────┐
│ Tenants · Lizenzen/Entitlements · Provisioning · Billing      │
│ "Welcher Kunde darf welche KI?"                               │
└───────────────┬───────────────────────────────┬──────────────┘
                │                                 │ provisioniert
        ┌───────▼────────┐               ┌────────▼───────────┐
        │ MAS-2 (multi-  │  Clara ruft   │ telefonki-Instanz  │
        │ tenant)        │  (gated) ───► │ pro Kunde          │
        │ Clara + Sub-KIs│  Server-Tools │ (eigenes Repo)     │
        └────────────────┘               └────────────────────┘
```

- **Control Plane:** kennt Mandanten, Lizenzen und Entitlements (welche KIs/Features
  freigeschaltet sind), provisioniert Instanzen, macht Billing.
- **Data Plane:** MAS-2 (multi-tenant) + Clara-Tools; Telefon-KI je Kunde als eigene
  Instanz aus dem Golden-Image.
- **Gating:** Clara prüft bei **jedem** Tool-Aufruf Tenant + Entitlement.

## 4. Clara — 3-Schichten (aus `inherited/STRATEGIE-CLARA-VOICE-GESAMTPLAN.md`)

1. **Fakten-Schicht:** deterministische Tool-Endpoints (gleiche Quelle wie die UI),
   z. B. Work-Items, Cases, Tasks. Kein Freitext-Raten.
2. **Routing:** dünner Orchestrator (Intent → Zielagent), kein Mega-Prompt.
3. **Sprache:** Conv-AI formuliert nur aus gelieferten Fakten.

Untergeordnete Agenten (getrennte, kurze Prompts): **Nadine** (Posteingang/Mail/Brief),
**Lisa** (Outbound-Calls — delegiert an die Telefon-KI), **Lena** (Doku), **Julia** (QM),
**Marie** (Mitarbeiterportal). Sophie (Abrechnung) erst, wenn Backend existiert.

## 5. Mandanten-Modell (Vorbild Telefon-KI)

Die Telefon-KI ist bereits mandantenfähig über **Basisprofil + Overlay**
(`campaign_overlay.py`). Dieses Muster wird im MAS gespiegelt:
- **Tenant = Basisprofil** (Praxis-Setup) + **Entitlements** (freigeschaltete KIs).
- Konfiguration pro Kunde lebt in Daten/Config, **nie** in kundenspezifischem Code.

## 6. Integrationsverträge (aus `inherited/PICKADOC-API-ANFORDERUNGEN.md`)

- **MAS ↔ Pickadoc-Platform:** Mitarbeiter-Liste (`/api/staff`), optional Kontakte,
  Task-Übergabe (`/api/integrations/mas/tasks`), Mitarbeiter-Sync per Webhook.
- Diese werden als **OpenAPI** festgeschrieben, bevor implementiert wird.

## 7. Was aus dem alten MAS übernommen wird (Idee, nicht Code)

| Übernehmen | Verwerfen |
|---|---|
| Case-/Vorgang-Datenmodell | `index.js` (822-KB-Monolith) |
| Clara-Tool-Endpoint-Design (`/api/clara/tools/*`) | `voice-*.js` (~40 Dateien, alte Sprachpipeline) |
| 3-Schichten-Konzept | `deepgram-live.js`, eigener STT/Intent-Stack |
| Aufgaben-/Memory-Konzept (`inherited/KONZEPT-AUFGABEN-MEMORY-CHAT.md`) | flache `src/`-Struktur ohne Module |
| Integrationsverträge zu Pickadoc | Altlast-/Debug-Logs, `delete/`-Ordner |

## 8. Offene Entscheidungen (vor dem ersten Code-Schnitt)

- **Stack:** Backend (Node/TypeScript vs. anderes), DB (Postgres empfohlen statt SQLite
  wegen Multi-Tenant + Skalierung), Frontend (React/Vite wie gehabt?).
- **Tenant-Isolation:** Shared-DB mit `tenant_id` (Row-Level) vs. DB-pro-Tenant.
- **Auth/Identity:** woher kommt der Tenant-Kontext (Pickadoc OS SSO?).
- **Entitlement-Schema:** Felder/Format der Lizenz-Freischaltung.
