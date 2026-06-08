# MAS-2 — Mandantenfähige Praxis-Assistenz (greenfield)

Neuaufbau von **MAS** ("Mail-, Aufgaben- & Sprach-Assistenz") als **mandantenfähige
SaaS** im Pickadoc-Ökosystem. Einstieg über die Conversational-AI **Clara**, die die
untergeordneten KIs (Nadine, Lisa, Lena, …) orchestriert.

> **Status: Greenfield.** Dieser Code ersetzt den alten Prototyp unter `F:\MAS`
> (822-KB-Monolith, kein Mandanten-Konzept, eigene "kaputte" Sprachpipeline).
> Aus dem Altstand werden **Ideen & Konzepte** übernommen (siehe `docs/inherited/`),
> **kein Code**.

## Leitprinzipien

- **Mandantenfähig ab Commit 1:** `tenant_id` ist Pflichtfeld in jedem Datensatz und
  jeder Query. Kein Endpoint arbeitet ohne Tenant-Kontext.
- **Conv-AI statt eigener Sprachpipeline:** Clara läuft über eine Conversational AI
  (ElevenLabs) und ruft saubere **Server-Tools** auf — **vollständig unabhängig** von
  der Telefon-KI (eigenes Repo, siehe unten).
- **Verträge vor Code:** Grenzen zu Pickadoc-Platform, Telefon-KI und ElevenLabs sind
  versionierte HTTP-Verträge (OpenAPI), **kein geteilter Laufzeit-Code**.
- **Lizenz/Entitlements:** Welche KIs ein Kunde im Rahmen seiner MAS-Lizenz nutzen darf,
  steuert die Control-Plane (Pickadoc OS) — Clara prüft jeden Tool-Aufruf dagegen.

## Beziehung zu anderen Repos

| Repo | Rolle |
|---|---|
| `telefonki-v5.2` | eigenständige Telefon-KI (Golden, wird vendored/gepinnt konsumiert) |
| `pickadoc-platform` | Plattform & Deploy-Ziel; Integration nur über HTTP-Verträge |
| **`MAS-2`** (dieses) | Clara + untergeordnete KIs, mandantenfähig |

## Architektur

Siehe [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Übernommene Konzepte aus dem
Altstand liegen in [`docs/inherited/`](docs/inherited/).

## Entwicklung

Stack-Entscheidung noch offen (siehe ARCHITECTURE, Abschnitt „Offene Entscheidungen").
Das Code-Gerüst folgt mit dem ersten Implementierungs-Schnitt.
