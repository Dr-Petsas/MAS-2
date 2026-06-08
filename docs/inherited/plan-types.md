# Plan-Typ-System für QM-Bücher

Das Plan-Typ-System erlaubt, verschiedene QM-Bücher mit Interview-Wizard, Plangenerierung und Ableitung wiederkehrender Maßnahmen zu betreiben – ohne Chat-, Extraktions- oder Generierungs-Code zu duplizieren. Die Steuerung erfolgt über eine zentrale **Plan-Typ-Registry** (`backend/src/planTypes.js`).

## Was ist ein Plan-Typ?

Ein **Plan-Typ** ist ein `bookKey` (z. B. `hygiene_plan`), für den in der Registry konfiguriert ist:

- **Schema:** Blöcke (Kapitel) und Felder mit Labels für das Interview
- **hasInterview:** Nutzer führt ein geführtes Gespräch (Wizard) mit Julia
- **hasPlanGeneration:** Aus den erhobenen Parametern werden konkrete Pläne (Dokumente) erzeugt
- **hasRecurringTasks:** Aus den Plänen werden wiederkehrende Maßnahmen (Schedules) abgeleitet
- **hasExportPlans:** Export nutzt `generated_plans` statt Buch-Einträge
- Optional: **usePracticeFachrichtung**, **useRiskScore**, **versionColumn**

Die Pipeline (Extraktion → Chat → Plangenerierung → Task-Ableitung) ist generisch; nur die Config und ggf. typ-spezifische Generator-/Task-Logik unterscheiden die Plan-Typen.

## Architektur (Kurz)

- **Config:** `backend/src/planTypes.js` – `getPlanConfig(bookKey)`, `getPlanSchema(bookKey)`, `hasInterviewSchema()`, `hasPlanGeneration()`, `hasRecurringTasks()`, `hasExportPlans()`
- **API:** Alle Buch-Operationen laufen über `:key` (z. B. `POST /api/qm/books/:key/chat`, `POST /api/qm/books/:key/regenerate-plans`, `POST /api/qm/books/:key/derive-recurring-measures`, `PATCH /api/qm/books/:key/plans`)
- **Frontend:** `hasPlanInterview(bookKey)` (aus Liste `BOOK_KEYS_WITH_PLAN_INTERVIEW`) steuert Modal, Wizard und URLs; alle Aufrufe verwenden `viewBook.key`

## Checkliste: Neuen Plan-Typ hinzufügen

1. **Backend – Registry**
   - In `backend/src/planTypes.js` einen neuen Eintrag in `PLAN_TYPE_REGISTRY` anlegen:
     - `schema`: `{ blocks: [ { id, label, fields } ], fieldLabels: { … } }`
     - `hasInterview`, `hasPlanGeneration`, `hasRecurringTasks`, ggf. `hasExportPlans`, `usePracticeFachrichtung`, `useRiskScore`, `versionColumn`
   - Falls Plangenerierung/Tasks benötigt werden: In `backend/src/ai.js` die generische Funktion erweitern:
     - `generatePlansForBook(bookKey, parameters, context)` – für den neuen Key einen Generator aufrufen (analog zu `juliaHygieneGeneratePlans`)
     - `deriveRecurringTasks(bookKey, plans, parameters)` – für den neuen Key eine Ableitungsfunktion aufrufen

2. **Datenbank**
   - Buch in `qm_books` anlegen (key, title, category, …). Optional: eigene Versionsspalte wie `hygiene_plan_version` oder gemeinsame Spalte nutzen.

3. **Frontend**
   - In `frontend/src/pages/JuliaPage.jsx` den Buch-Key in `BOOK_KEYS_WITH_PLAN_INTERVIEW` aufnehmen, falls der Interview-Wizard und die Plan-UI für dieses Buch genutzt werden sollen.
   - Optional: `BOOK_ROLES` und `taskTypeForBook` für das neue Buch ergänzen.

**Wichtig:** Es wird **kein** Chat-, Extraktions-, Generierungs- oder Task-Code kopiert; nur die Config (und bei Bedarf eine neue Generator-/Task-Funktion für diesen Typ) wird erweitert.

## Dateien

| Bereich    | Datei | Beschreibung |
|-----------|--------|--------------|
| Backend   | `backend/src/planTypes.js` | Registry, Schema, Feld-Labels, Kurzfunktionen |
| Backend   | `backend/src/ai.js` | `extractParamsForPlan`, `juliaBookChatReply`, `generatePlansForBook`, `deriveRecurringTasks`, Hygiene-Generatoren |
| Backend   | `backend/src/index.js` | Routen mit `:key`, Config-Abfragen |
| Frontend  | `frontend/src/pages/JuliaPage.jsx` | `BOOK_KEYS_WITH_PLAN_INTERVIEW`, `hasPlanInterview`, URLs mit `viewBook.key` |
| Frontend  | `frontend/src/components/HygienePlanModal.jsx` | Modal für Interview/Status (optional sections/labels aus Config) |
