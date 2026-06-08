# MAS: Aufgaben, Quellen, Shared Memory & KI-Chat

## 1. Ziele (Kernanforderungen)

- **Tasks definieren**, die in einer Arztpraxis typischerweise anfallen.
- **Pro KI brainstormen** und eine umsetzbare Task-Liste erstellen (schrittweise Umsetzung).
- **Quellenunabhängig**: Egal aus welcher Quelle ein Task kommt (Clara, Nadine, Lena, Bianca, Sophie, Team-Chat, manuell) – **immer in der zentralen Aufgabenliste (Monitor) landen**.
- **Rückmeldungen**: In der **Taskliste** und in der **persönlichen KI-Liste** auf **jeder Seite**, wo etwas ausgeführt wurde, sichtbar (z. B. „Von Nadine erledigt“, „Task #xy abgeschlossen“).
- **Shared Memory**: Alles **inhaltlich und aufgabentechnisch** in das gemeinsame Gedächtnis (`shared_memory` + `agent_messages`).
- **KI-Chat**:
  - KIs **miteinander über den Chat kommunizieren** (Agent-Nachrichten, sichtbar/steuerbar).
  - **Jede KI im Chat ansprechbar** („Nadine, schreib bitte …“, „Sophie, Abrechnung für …“).
  - **Clara nicht immer dazwischen**: Clara soll nicht jede Nachricht dominieren; sie kann sich **im Gesprächsverlauf anbieten**, einen Task zu überwachen.
  - **Andere KIs können sich einbringen** und Vorschläge machen („Das könnte man so besser machen“, „Soll ich übernehmen?“).

---

## 2. Typische Aufgaben pro KI (Brainstorm – Arztpraxis)

### Clara (Leitstelle / Orga)

| Task | Beschreibung | Quelle heute | Priorität |
|------|--------------|--------------|-----------|
| Rückruf planen | „Bitte Herrn X zurückrufen“ – Task an Lisa | Team-Chat, manuell | Hoch |
| E-Mail/Brief delegieren | „Schreib an Y …“ – Task an Nadine | Team-Chat, manuell | Hoch |
| Termin-Erinnerung | Rückruf zur Terminbestätigung | Team-Chat, Kalender | Mittel |
| Koordination mehrerer KIs | „Zuerst Nadine antwortet, dann Lisa ruft an“ | Team-Chat | Mittel |
| Task-Überwachung anbieten | „Soll ich den Task im Blick behalten?“ | Chat-Logik | Hoch |
| Offene Aufgaben zusammenfassen | „Was steht noch an?“ | Team-Chat / Monitor | Mittel |
| Priorisierung | Dringende vs. normale Aufgaben sortieren | Manuell / Chat | Niedrig |

### Nadine (Schriftverkehr)

| Task | Beschreibung | Quelle heute | Priorität |
|------|--------------|--------------|-----------|
| E-Mail beantworten | Antwort auf eingehende E-Mail (Item) | Nadine (Inbox), Team-Chat | Hoch |
| Neue E-Mail schreiben | E-Mail an Empfänger (nicht Antwort) | Team-Chat, Nadine | Hoch |
| Brief beantworten | Antwort auf eingegangenen Brief | Nadine (Briefpost), Team-Chat | Hoch |
| Neuen Brief schreiben | Brief an Empfänger | Team-Chat, Nadine | Hoch |
| Anhang einbeziehen | Ausgewählte Anhänge in Antwort | Nadine | Hoch |
| Kategorisierung / Relevanz | Item als relevant/Spam einstufen | Nadine (AI) | Mittel |
| Entwurf erstellen (für Clara-Task) | E-Mail/Brief-Entwurf aus Task | Monitor (create-draft) | Hoch |
| Versandbestätigung | „E-Mail versendet“ → Task + Memory | Nadine | Hoch |

### Lisa (Telefon ausgehend)

| Task | Beschreibung | Quelle heute | Priorität |
|------|--------------|--------------|-----------|
| Rückruf durchführen | Anruf mit Aufgabe (task_prompt) | Clara/Team-Chat → clara_tasks | Hoch |
| Anruf-Ergebnis melden | Nach Gespräch: Ergebnis in Task + Memory | ElevenLabs + Polling | Hoch |
| Mehrere Rückrufe nacheinander | Queue von call-Tasks | Monitor / Clara | Mittel |
| Sprachwahl | call_language (de, en, …) | Task-Payload | Mittel |

### Bianca (Telefon eingehend)

| Task | Beschreibung | Quelle heute | Priorität |
|------|--------------|--------------|-----------|
| Anruf entgegennehmen | Eingehender Anruf (falls integriert) | Telefonie-Integration | Hoch |
| Nachricht/Rückruf vereinbaren | „Ich rufe später zurück“ → Task für Lisa | Team-Chat / Integration | Hoch |
| Terminwunsch notieren | Aus Anruf → Task/Kalender | Integration | Mittel |

*Hinweis: Bianca ist aktuell vor allem konzeptionell („Telefon eingehend“). Konkrete Tasks hängen von Telefonie-Anbindung ab.*

### Lena (Dokumentation)

| Task | Beschreibung | Quelle heute | Priorität |
|------|--------------|--------------|-----------|
| Behandlungsdokumentation | Diktat/Transkript pro Patient/Session | Lena (iPad/QR), Pickadoc | Hoch |
| Session abschließen | Transkript filtern, speichern, Memory | Lena-Backend | Hoch |
| Nachbearbeitung | „Lena, ergänze bei Patient X …“ | Team-Chat (neu) | Mittel |
| Verknüpfung mit Task | Dokumentation einem offenen Task zuordnen | Memory / Tasks | Niedrig |

### Sophie (Abrechnung)

| Task | Beschreibung | Quelle heute | Priorität |
|------|--------------|--------------|-----------|
| Abrechnung vorbereiten | Abrechnungsdaten/Kassenabrechnung | Team-Chat (neu) | Hoch |
| Abrechnungsfrage beantworten | „Wie rechnen wir X ab?“ | Team-Chat | Mittel |
| Rückstellung prüfen | Offene Abrechnungen | Manuell / zukünftig | Niedrig |

*Hinweis: Sophie-Seite existiert; konkrete Task-Typen (z. B. „abrechnung_create“, „abrechnung_check“) können schrittweise definiert werden.*

### Weitere Quellen → zentrale Aufgaben

| Quelle | Was wird heute erzeugt? | Soll in Aufgaben landen als |
|--------|--------------------------|-----------------------------|
| **Nadine (Inbox)** | Items (E-Mails/Briefe), keine Tasks | Optional: „E-Mail beantworten“-Task pro Item (oder nur bei „Antwort vorschlagen“ + Nutzeraktion) |
| **Brief-Foto (from-image)** | Item (briefpost) | Optional: „Brief bearbeiten/beantworten“-Task |
| **Lena-Session** | lena_sessions | Optional: „Dokumentation prüfen“-Task oder nur Memory |
| **Memos (clara_memos)** | Nur Memos, keine Tasks | Optional: „Memo umsetzen“-Task oder Verknüpfung mit Task |
| **Manuell (Monitor)** | – | Task manuell anlegen (heute nur über Clara/Team-Chat) |

---

### 2.10 Delegation an echte Mitarbeiter

- Tasks müssen nicht nur an KIs, sondern an **reale Personen** delegierbar sein (z. B. „an Saghi“, „an Dr. X“).
- **Technisch**: Task-Modell um `assigned_to_human` (Name/ID des Mitarbeiters) erweitern; Filter „Mir zugewiesen“ / „An [Name]“ in der Aufgabenliste; Mitarbeiterliste aus der Mitarbeiter-Maske (Name, Funktion, Rollen, Aufgabenbereich).
- Rückmeldung „Erledigt“ kann von der zugewiesenen Person oder im System markiert werden. **Wo und wie** Mitarbeiter ihre Aufgaben erhalten und abarbeiten, siehe Abschnitt 2.22 (Mobile).

### 2.11 Konstanzprüfungen und Validierung (Endgeräte, Termine, Task)

- **Endgeräte zur Validierung**: Es wird erfasst, **welche Endgeräte** (bzw. Verfahren/Medizinprodukte) **validierungspflichtig** sind – z. B. Röntgengerät, Dosimeter, Laborgeräte, Sterilisatoren, Praxissoftware. Diese Liste (oder Erweiterung des Bestandsverzeichnisses/Medizinproduktebuchs) bildet die Grundlage für die Terminüberwachung.
- **Validierungstermine**: Pro Gerät/Verfahren werden **Validierungstermine** (nächste Fälligkeit) geführt – z. B. Konstanzprüfung Röntgen jährlich, MTK/STK nach Herstellerangabe, softwarebezogene Validierung nach Änderung oder periodisch. Die Termine werden in der Praxis (z. B. in Julia/QM-Modul oder Medizinproduktebuch) gepflegt.
- **Task bei Fälligkeit**: Wenn ein **Validierungstermin fällig** wird (oder sich annähert), **wird ein Task erstellt**, damit sich **jemand um die Validierung kümmern muss**: Julia meldet sich bei Clara mit der Fälligkeit (z. B. „Konstanzprüfung Röntgen fällig“, „Validierung Gerät X fällig“); Clara erstellt einen Task (z. B. „Validierung durchführen/beauftragen“ oder „Konstanzprüfung durchführen“) und weist ihn der zuständigen Person zu (`assigned_to_human`, z. B. Strahlenschutzbeauftragte oder in der Mitarbeiter-Maske hinterlegte Rolle). Nach Durchführung: Nachweis einpflegen, nächsten Validierungstermin eintragen.
- **Kurz**: Konstanzprüfung planen/durchführen lassen; Erinnerung vor Fälligkeit (z. B. Röntgen, Dosimeter). Julia/Clara überwachen Fristen; Delegation an zuständigen Mitarbeiter; Nachweise einpflegen und nächste Fälligkeit setzen.

### 2.12 QM-Management und Julia (QM-KI)

- **Julia** ist die eigenständige QM-KI: im Team-Chat ansprechbar, eigene Seite für QM-Übersicht/Checklisten, hält die Übersicht über alle fälligen und wiederkehrenden QM-Aufgaben (Konstanz, Hygiene, Notfall, Geräte, Handbuch, Patientenbefragung, Beschwerden).
- **Julia als QM-Zentrale**: Von den Ärzten und MFA hat in der Praxis oft **niemand den Überblick**, was wann gemacht werden muss. Julia ist die **zentrale Stelle**: Sie erinnert proaktiv und sorgt dafür, dass Eintragungen in die richtigen Bücher/Pläne einfließen. Ärzte und MFA arbeiten die zugewiesenen Tasks ab; Julia (und die App) zeigen jederzeit: Was steht an? Was ist fällig? Welches Buch muss gepflegt werden?
- **Offizieller Ablauf – Julia meldet sich bei Clara, Clara erstellt die Tasks**: Julia **meldet sich bei Clara** mit Task-Anfragen (z. B. „Notfallkoffer prüfen fällig“, „Sterilisationsprotokoll ausfüllen“, „Konstanzprüfung Röntgen erinnern“). **Clara erstellt die Tasks** (für eine KI wie Nadine/Lisa oder für einen Mitarbeiter, `assigned_to_human`). Julia erstellt also nicht direkt Tasks in der Datenbank, sondern kommuniziert mit Clara; Clara ist die zentrale Stelle für die Task-Erstellung. Diese **Kommunikation zwischen Julia und Clara muss im Team-Chat nachverfolgbar** sein – Nutzer und Team sehen, wie Julia sich an Clara wendet und welche Tasks Clara daraufhin anlegt oder zuweist (z. B. Julia-Nachricht → Clara-Antwort als Agent-Nachrichten im Chat).
- Task-Typen: `qm_reminder`, `qm_checklist`, `constancy_*`, `hygiene_plan_*`, `device_mtk`, `device_stk`, `device_einweisung`, `emergency_check`, `patient_survey`, `complaint_log`, `qm_handbook_update`, … Alle Tasks in zentrale Aufgabenliste (Monitor) und Shared Memory; `assigned_to_human` für Delegation an Mitarbeiter.

### 2.13 Geräte-Management

- Medizinproduktebuch führen, MTK/STK-Termine planen und Erinnerung setzen, Einweisungen dokumentieren. Delegation an verantwortliche Person; Julia überwacht Fristen und legt Tasks an („Eintrag Medizinproduktebuch nach Wartung“, „Einweisung dokumentieren“).

### 2.14 Hygienemanagement

- Hygieneplan erstellen/aktualisieren (Julia Entwurf, Mensch Freigabe), Reinigungsplan, Sterilisationsprotokoll, Reinigungsketten dokumentieren. Siehe Abschnitt „Hygienepläne mit QM-KI“. Schulung Hygiene: Erinnerung durch Julia, Durchführung und Dokumentation durch Mensch.

### 2.15 Notfallmanagement

- Notfallkoffer prüfen (Vollständigkeit, Verfallsdaten), Notfalltraining organisieren. Wiederkehrende Tasks (z. B. monatlich); Julia Erinnerung, Durchführung und Eintrag in Notfall-Checkliste durch Mitarbeiter.

### 2.16 Patientenbefragungen

- Befragung starten/auswerten (Zufriedenheit), Feedback einholen. Erinnerung durch Julia; Durchführung und Auswertung durch Praxisleitung/QM; ggf. KI-Unterstützung bei Auswertung.

### 2.17 Beschwerdemanagement

- Beschwerde erfassen (Nadine bei Schriftverkehr, Formular), Lösungsvorschlag erarbeiten, Maßnahmen dokumentieren. Julia kann Task zur Nachverfolgung anlegen und Nachfassung terminieren.

### 2.18 QM-Handbuch

- QM-Handbuch führen (Checklisten, Anweisungen, SOPs); Kapitel aktualisieren. Julia kann Kapitel/Checklisten vorschlagen oder aus Vorlagen generieren; Freigabe und Redaktion beim Menschen. Jährliche Review-Erinnerung durch Julia.

### 2.19 Hygienepläne mit QM-KI

- **Ablauf**: Vorlage (z. B. RKI/DGSV) → KI-Entwurf (Praxisname, Ansprechpartner, Geräte) → Versionierung und Ablage → jährliche Erinnerung „Hygieneplan aktualisieren“. Formulierung als Entwurf; fachliche Prüfung durch Verantwortliche erforderlich.
- **Technik**: Task-Typ `hygiene_plan_create` / `hygiene_plan_update`; Backend-Route z. B. `POST /api/qm/hygiene-plan-draft`; Ausgabe PDF oder Markdown.

### 2.20 Bücher, Pläne und Verzeichnisse – Checkliste und Fachrichtung

Die Praxis führt gesetzlich und QM-relevant **verpflichtende Bücher, Pläne und Verzeichnisse**. Julia entscheidet **pro Fachrichtung** (und Merkmalen wie operativ, Röntgen, Labor, infektiös), **welche Bücher geführt werden**, und **pflegt jedes Buch proaktiv** (Tasks anlegen, Erinnerungen, Eintragungen einpflegen). **Jedes geführte Buch/Plan/Verzeichnis muss einsehbar und exportierbar sein** (Ansicht in der App, Export PDF bzw. Excel/CSV für Prüfungen und Praxisübergabe).

**Fünf Kategorien**: (1) Medizinprodukte & Technik: Bestandsverzeichnis, Medizinproduktebuch pro Gerät, Einweisungsprotokolle. (2) Hygiene & Infektionsschutz: Hygieneplan, Reinigungs-/Desinfektionsplan, Chargendokumentation (Sterilisationsbuch), Hautschutzplan. (3) Arbeitssicherheit & Gefahrstoffe: Gefahrstoffverzeichnis, Biostoffverzeichnis, Unfallbuch. (4) Praxisorganisation & Personal: QM-Handbuch, Fortbildungsverzeichnis, Teambesprechungsprotokolle. (5) Patientensicherheit & Notfall: Notfall-Checkliste, Konstanzprüfungsbuch, Temperaturkontrollliste, Fehlerprotokolle (CIRS).

**Fachrichtungs-Matrix (Auswahl)**: **Zahnarztpraxis** → Sterilisationsbuch, Konstanzprüfungsbuch (Röntgen), Einweisungsprotokolle. **Hausarztpraxis** → Bestandsverzeichnis MP, Temperaturkontrollliste (Impfstoffe), bei Röntgen/Labor Konstanz/Gefahrstoff. **Facharzt** → wie Hausarzt; bei operativen Eingriffen zusätzlich Sterilisationsbuch, erweiterter Hygieneplan. **Ambulant chirurgisch** → Sterilisationsbuch, erweiterter Hygieneplan, Notfall-Checkliste (Narkose/Reanimation). **MVZ** → Union der relevanten Bücher pro Abteilung; QM-Handbuch zentral. **Röntgen = Ja** → Konstanzprüfungsbuch, Strahlenschutz-Fortbildung. **Labor = Ja** → Temperaturkontrollliste, Gefahrstoff-/Biostoffverzeichnis. **Infektiös** → Biostoffverzeichnis, erweiterter Hygieneplan, Schulungsnachweise. Immer u. a.: Hygieneplan, Gefahrstoffverzeichnis, Unfallbuch, QM-Handbuch, Fortbildungsverzeichnis, Teambesprechungsprotokolle, Notfall-Checkliste (wenn Koffer vorhanden). Nur bei aktiven Medizinprodukten: Bestandsverzeichnis, Medizinproduktebuch, Einweisungsprotokolle. Nur bei eigener Aufbereitung (operativ): Sterilisationsbuch. Nur bei Medikamentenkühlschrank: Temperaturkontrollliste.

**Proaktive Pflege**: Pro Buch fester Zyklus und Verantwortlicher (`assigned_to_human`); **Julia meldet sich bei Clara** mit der fälligen Aktion, **Clara erstellt den Task** und weist ihn dem Mitarbeiter zu; Mitarbeiter trägt ein, Einträge werden ins jeweilige Buch/den Plan übernommen. **Einsehbarkeit**: eigene Ansicht pro Buch (Einträge, letzte Aktualisierung). **Export**: PDF oder Excel/CSV je nach Buch-Typ (API und UI in Julia-Seite bzw. QM-Modul).

### 2.20a Julia-Seite: Erinnerungen, Aufgabenliste (fällig), Offene QM-Anfragen

**Struktur der Julia-Seite (QM-Zentrale):**

1. **Bücher & Pläne** – Aktivierung pro Buch, Verantwortliche/Beauftragte setzen, Rollen pro Buch.
2. **Erinnerungen (wiederkehrend)** – Wiederkehrende Erinnerungen pro Buch (täglich, wöchentlich, monatlich, vierteljährlich, jährlich). Pro Erinnerung: Titel (z. B. „Notfallkoffer prüfen“), Buch, Zyklus, optional zugewiesene Person (z. B. Saghi). Aktionen: Erinnerung anlegen, Bearbeiten, Löschen. Wenn der Zyklus abgelaufen ist, erscheint die Aufgabe in der **Aufgabenliste (fällig)**.
3. **Aufgabenliste (fällig)** – Fällige Aufgaben aus Erinnerungen und Validierungsgeräten (Konstanz). Bücher aktivieren, Verantw./Beauftr. setzen (bei Konstanz: Geräte in Stammdaten). „**In Planung übernehmen**“ nimmt die Aufgabe in die Planung und **postet in den Team-Chat** („Task übernehmen“).
4. **Offene QM-Anfragen** – Aufgaben, die in Planung genommen wurden, zugeordnet zum jeweiligen Buch/Plan. Im Team-Chat „Task übernehmen“ anklicken oder hier zuweisen und Task anlegen. Keine offenen Anfragen → Hinweis „Keine offenen Anfragen.“

**Beispiele für Erinnerungen:**

| Erinnerung | Buch/Plan | Zyklus | Zuweisung |
|------------|-----------|--------|-----------|
| Notfallkoffer prüfen (Vollständigkeit, Verfallsdaten) | Notfall-Checkliste | Monatlich | z. B. Saghi |
| Hygieneplan prüfen und ggf. aktualisieren | Hygieneplan | Jährlich | — |
| Sterilisationsprotokoll / Chargendokumentation ausfüllen | Chargendokumentation (Sterilisationsbuch) | Wöchentlich | — |
| Temperaturkontrollliste (z. B. Kühlschrank) führen | Temperaturkontrollliste | Täglich | — |

**Stammdaten (Mitarbeiter, Validierungsgeräte):** Die Pflege von **Mitarbeitern** und **zu validierenden Geräten** (z. B. Röntgen, Konstanzprüfung) wird **nicht mehr auf der Julia-Seite** geführt. Sie wird in einer **eigenen Struktur** (eigene Seite bzw. Einstellungsbereich) umgesetzt. Julia nutzt die Daten weiterhin für Fälligkeiten und Zuweisungen (z. B. Verantwortliche pro Buch, „Zuweisen an“ bei offenen QM-Anfragen); die **Anlage und Pflege** der Stammdaten erfolgt in der neuen Struktur.

### 2.21 Mitarbeiter-Maske und Schnittstelle (z. B. Pickadoc)

- **Klarstellung**: **Julia** ist ausschließlich der **Name der QM-KI** (keine reale Person). **Saghi** ist eine **reale Mitarbeiterin** in der Praxis und für die Sterilisation zuständig – Beispiel für die Anlage und Task-Zuweisung an echte Mitarbeiter.
- **Mitarbeiter anlegen und verwalten**: Maske zum Anlegen/Bearbeiten von Mitarbeitern mit:
  - **Name**, **Funktion** (z. B. MFA, Sterilgutassistentin, Arzt),
  - **Aufgabenbereich** als **Checkliste zum Ankreuzen** (z. B. Sterilisation, Konstanzprüfung, Notfallkoffer, Hygieneplan, Abrechnung, Empfang),
  - **Rollen** – **Rollen verteilen**: amtliche/beauftragte Funktionen als Checkliste oder Mehrfachauswahl, z. B. **Strahlenschutzbeauftragte/r**, **Datenschutzbeauftragte/r**, **Hygienebeauftragte/r**, **QM-Beauftragte/r**, **Brandschutzbeauftragte/r**, **Sicherheitsbeauftragte/r** (Arbeitssicherheit), **Infektionsschutzbeauftragte/r**, **Ersthelfer/in**, **Vertrauensperson**, ggf. weitere. Pro Rolle wird eine oder mehrere Personen zugewiesen. Die Rollen steuern, wer für welche QM-/rechtlichen Aufgaben angesprochen oder als `assigned_to_human` vorgeschlagen wird (z. B. Konstanzprüfung → Strahlenschutzbeauftragte; Datenschutz-Audit → Datenschutzbeauftragte).
- **Beispiel**: Saghi – reale Mitarbeiterin, Sterilgutassistentin, Aufgabenbereich Sterilisationsprotokoll, Chargendokumentation, Instrumentenaufbereitung; ggf. Rolle Hygienebeauftragte. Julia meldet sich bei Clara → Clara erstellt Task und weist an Saghi zu.
- **Schnittstelle zu Pickadoc**: In der Mitarbeiter-Maske bzw. unter Einstellungen „Mitarbeiter“ eine **Schnittstelle zum Import** (z. B. „Aus Pickadoc importieren“) für Name, Funktion, Rollen, Aufgabenbereiche.

### 2.22 Wo und wie reale Mitarbeiter ihre Aufgaben erhalten und abarbeiten (Mobile)

- **Anforderung**: Bei einer Praxis mit **vielen Mitarbeitern** (z. B. 50) kann die Zustellung und Abarbeitung von Tasks **keine reine Desktop-Lösung** sein – nicht jeder hat ständig Zugang zu einem PC; QM-Aufgaben (Sterilisationsprotokoll, Notfallkoffer, Temperatur usw.) fallen dezentral an. Es braucht eine **Stelle**, an der reale Personen **ihre zugewiesenen Aufgaben** sehen und **abarbeiten** können – **mobil**, auf dem **Handy (iPhone/Android)**.
- **Ablauf**: Mitarbeiter **melden sich auf dem Smartphone an** (Login, Account zugeordnet zur Mitarbeiter-Maske). Danach sehen sie **„Meine Aufgaben“** (nur Tasks mit `assigned_to_human` = sie). Sie öffnen einen Task, erfassen die nötigen Daten (Formular, Checkliste, Temperaturwert usw.) und markieren die Aufgabe als **erledigt**. Die Daten fließen ins System und werden in die Bücher/Pläne eingepflegt.
- **Stelle im System**: Eigene **Ansicht/App für Mitarbeiter am Handy** (getrennt vom Desktop-Monitor für Leitstelle/Clara). Zugang nur nach Login; Berechtigung „Mitarbeiter“ – nur „Meine Aufgaben“, kein Zugriff auf Team-Chat oder alle Tasks. Optional: **Push-Benachrichtigungen** bei neuer Zuweisung.
- **Technik**: Mobile-first oder responsive Web-Oberfläche (oder native App); Authentifizierung (Zuordnung eingeloggter Nutzer zu `assigned_to_human`); API z. B. `GET /api/my-tasks`, `PATCH /api/tasks/:id/complete` mit Nutzdaten; Darstellung für kleine Screens (große Buttons, kurze Formulare).

### 2.23 KI-Unterstützung pro Task für Mitarbeiter (konkrete Anleitung)

- **Anforderung**: Viele Mitarbeiter wissen bei QM- und Praxis-Aufgaben **nicht genau, was zu tun ist**. **Jeder Task für Mitarbeiter** soll **KI-unterstützt** sein: **konkrete Anleitung** bzw. **Lösungsvorschläge**, was genau zu tun ist.
- **Umsetzung**: Über **Chat mit Clara oder Julia** (Team-Chat): Der Mitarbeiter kann von der Aufgabenliste (Monitor) oder aus der Task-Detailansicht heraus **„Was tun? / KI-Hilfe“** wählen und wird in den Chat geführt (ggf. mit vorausgefüllter Frage wie „Was muss ich bei dieser Aufgabe genau tun?“). Clara oder Julia **antworten** mit konkreten Schritten, Checklisten oder Hinweisen zu der jeweiligen Aufgabe (z. B. „Bei Sterilisationsprotokoll: 1. … 2. …“). Der **Chat bleibt aktuell** (gleicher Kontext wie die Aufgabenliste), damit die Antworten zur laufenden Aufgabe passen.
- **Technik**: In der Aufgabenliste (Monitor) und im Task-Detail ein Link/Button **„KI-Hilfe“** oder **„Frage Clara / Julia“**, der zum Team-Chat führt und optional die aktuelle Task-Beschreibung als Kontext/Fragevorfüllung übergibt; Team-Chat (Clara/Julia) im Prompt berücksichtigt ggf. Task-Typ und Aufgabe für konkrete Antworten.

### 2.24 QM – ggf. weitere Themen (Ergänzung)

- Folgende Punkte können je nach Praxis noch ergänzt werden: **Interne Audits / QM-Reviews** (periodische Selbstbewertung), **Risikomanagement / Risikoanalyse** (eigenes Risikoregister neben CIRS), **Dokumentenlenkung** (Versionskontrolle, Freigabe), **Recall-System** (Patientenrückruf), **Schulungsnachweise / Unterweisungen** (bereits über Fortbildungsverzeichnis und Hygiene-Unterweisung angesprochen). Bei Bedarf in die Bücher-/Task-Listen und in Julia aufnehmen.

---

## 3. Architektur: Eine Aufgabenliste, alle Quellen

### 3.1 Zentrale Task-Quelle

- **Bestehend**: `clara_tasks` (Rückrufe, E-Mail/Brief-Delegation von Clara/Team-Chat), Anzeige auf **Monitor** (`/api/tasks` aus clara-lisa).
- **Ziel**: Jede Quelle, die eine „Aufgabe“ darstellt, soll **dieselbe** Task-Liste speisen:
  - **Ein** gemeinsames Task-Modell (oder klare Erweiterung von `clara_tasks`):
    - `source`: `team_chat` | `nadine` | `lena` | `bianca` | `sophie` | `julia` | `manual` | `inbox_item` | …
    - `task_type`: `call` | `write_email` | `reply_email` | `write_letter` | `reply_letter` | `lena_document` | `abrechnung_*` | `qm_*` | `constancy_*` | `hygiene_*` | `device_*` | `emergency_*` | `patient_survey` | `complaint_*` | …
    - `ref_type` / `ref_id`: Verknüpfung zu Item, Lena-Session, Memo, Buch/Plan, …
    - `assigned_to_human`: Name/ID des zugewiesenen Mitarbeiters (bei Delegation an reale Person).
  - **Alle** Erstellungswege (Team-Chat, Nadine-Aktion, Lena-Ende, manuell) schreiben in diese Tabelle (oder ein vereinheitlichtes API-Format).

### 3.2 Rückmeldungen in Taskliste und pro KI

- **In der Taskliste (Monitor)**:
  - Status pro Task: z. B. `queued` → `in_progress` → `draft_created` / `done` / `failed`.
  - Rückmeldungstext: z. B. `result_summary`, `nadine_result_summary`, `last_error`.
  - „Erledigt von“ / `completed_by_agent` (Nadine, Lisa, …) und Zeitstempel.
- **Auf jeder Seite, wo etwas ausgeführt wurde**:
  - **Nadine (Inbox)**: Nach „E-Mail/Brief versendet“ → Hinweis „Task #xy erledigt“ + Link zum Monitor.
  - **Lena**: Nach Session-Ende → „Dokumentation in Aufgaben vermerkt“ (oder Task-Link).
  - **Clara/Lisa**: Nach Anruf-Ende → bereits heute Memory + Agent-Nachricht; zusätzlich Task-Status auf „erledigt“ und in Monitor sichtbar.
  - **Team-Chat**: Bei erledigtem Task → kurze Meldung im Chat („[Nadine]: E-Mail versendet, Task #xy erledigt.“) und in der Taskliste.

### 3.3 Shared Memory: inhaltlich + aufgabentechnisch

- **Bereits vorhanden**:
  - `shared_memory`: Events pro `entity_key` (Anruf, E-Mail, Brief, Lena, Chat).
  - `agent_messages`: Nachrichten von User, Nadine, Lisa, Lena, …
- **Erweiterung**:
  - Jede **Task-Erstellung** und **Task-Erledigung** als Event in `shared_memory` (z. B. `task_created`, `task_completed`) mit `ref_type: 'task'`, `ref_id: taskId`.
  - Optional: Kurze **Agent-Nachricht** bei Erledigung („Nadine: E-Mail an X versendet.“) in `agent_messages`, damit der Chat/Kontext davon weiß.
  - Memory-Kontext für Team-Chat und für jede KI soll **offene und kürzlich erledigte Tasks** (z. B. Titel, Status, zugehörige KI) enthalten, damit KIs miteinander und mit dem Nutzer darauf Bezug nehmen können.

---

## 4. Chat-Verhalten: KIs ansprechbar, Clara zurückhaltend, KI-zu-KI

### 4.1 Jede KI im Chat ansprechbar

- Nutzer kann **explizit eine KI ansprechen**: „Nadine, schreib bitte an Herrn Y …“, „Sophie, Abrechnung für Oktober“, „Lisa, ruf Frau Z zurück.“
- **Technisch**: Im Team-Chat-Prompt beibehalten: „Nur wenn der Nutzer ausdrücklich eine andere Agentin anspricht, antworte als diese.“
- **Erweiterung**: Wenn der Nutzer mit **@Nadine** oder „an Nadine“ startet, die Nachricht als **an Nadine adressiert** behandeln und `teamChatReply` so aufrufen, dass bevorzugt Nadine antwortet (z. B. `preferredAgent: 'Nadine'`).

### 4.2 Clara nicht immer dazwischen

- **Aktuell**: System-Prompt sagt „Clara meldet sich zuerst“, „ohne Anforderung antworte immer als Clara“.
- **Ziel**: Clara **nicht** bei jeder Nachricht automatisch antworten lassen:
  - Option A: **Kontextbasiert** – wenn die letzte Antwort von Nadine/Lisa/… war und der Nutzer weiterschreibt (ohne neue KI zu nennen), kann **dieselbe KI** weitermachen.
  - Option B: **Explizite Weitergabe** – Clara übergibt an Nadine/Lisa mit einem Satz („Nadine übernimmt das.“) und danach antwortet Nadine, bis Nutzer oder KI das Thema wechselt.
  - Clara **kann sich anbieten**: „Soll ich den Task im Blick behalten und dir Bescheid sagen, wenn erledigt?“ – dann wird eine Art „Überwachung“ für diese Task-ID gespeichert (optional später umsetzbar).

### 4.3 KIs miteinander kommunizieren / Vorschläge

- **Agent-Nachrichten** (`agent_messages`) sind bereits für Lisa, Nadine, Lena, … vorgesehen.
- **Im Chat sichtbar**: Optional ausgewählte Agent-Nachrichten (z. B. „Nadine hat E-Mail versendet“) als **System-/Info-Zeile** im Team-Chat anzeigen, damit das Team und die KIs den Kontext haben.
- **KI schlägt vor**: Im System-Prompt ergänzen: „Andere Agentinnen können sich mit einem kurzen Vorschlag melden, z. B. [Nadine]: Das könnte ich so formulieren …“ – dann kann die antwortende KI (oder ein zweiter Aufruf) eine „Nadine“-Antwort generieren und als Nachricht einfügen.
- **Technisch**: Entweder eine **Multi-Turn-Logik** (erst Clara, dann „Nadine möchte etwas sagen“ als zweite Nachricht) oder ein **gemeinsamer Kontext** im Prompt („Nadine hat vorgeschlagen: …“), damit die antwortende KI darauf eingehen kann.

### 4.4 Konkret: Prompt- und API-Anpassungen (Vorschlag)

- **TEAM_CHAT_SYSTEM** anpassen:
  - Clara antwortet **nicht** mehr standardmäßig bei jeder Nachricht; stattdessen: „Antworte als die Agentin, die thematisch passt oder die der Nutzer anspricht. Bei Unsicherheit oder allgemeiner Frage kann Clara antworten.“
  - „Clara kann sich anbieten, einen Task zu überwachen. Andere Agentinnen können kurze Vorschläge machen (z. B. [Nadine]: …).“
- **teamChatReply** erweitern:
  - Parameter `preferredAgent` (aus Nutzer-Eingabe oder Kontext).
  - Optional: Nach der ersten Antwort prüfen, ob eine zweite KI „sich melden“ soll (z. B. Nadine schlägt Formulierung vor) → zweiter Aufruf oder zweite Nachricht im Verlauf.

---

## 5. Umsetzungsreihenfolge (Vorschlag)

1. **Tasks aus allen Quellen in eine Liste**
   - Task-Modell/API vereinheitlichen (`source`, `task_type`, `ref_*`, `assigned_to_human`).
   - Nadine: Beim Versand (E-Mail/Brief) bestehenden Task aktualisieren oder Task aus Item erzeugen (konfigurierbar).
   - Lena: Optional Task bei Session-Ende erzeugen.
   - Alle Task-Erstellungen über eine gemeinsame Funktion (z. B. `createTask(db, payload)`) und in Monitor sichtbar.

2. **Rückmeldungen**
   - Nach Erledigung (Versand, Anruf-Ende, Lena-Ende): Task-Status + `result_summary` / `completed_by_agent` setzen.
   - UI: Auf Nadine-Seite, Lena-Seite, ggf. Sophie-Seite einen Hinweis „In Aufgaben aktualisiert“ mit Link zum Monitor/Task.

3. **Shared Memory**
   - Bei Task-Erstellung und Task-Erledigung `addMemoryEvent` mit `type: task_created` / `task_completed`, `ref_type: 'task'`, `ref_id`.
   - Memory-Kontext für Team-Chat um „offene Tasks“ (Kurzliste) erweitern.

4. **Chat: KI ansprechbar + Clara zurückhaltend**
   - Prompt anpassen (Clara nicht mehr immer zuerst).
   - Optional: `preferredAgent` aus Nutzertext oder Auswahl („An Nadine“).

5. **Chat: KI-zu-KI und Vorschläge**
   - Agent-Nachrichten bei Erledigung im Chat als Info anzeigen.
   - Prompt: Andere KIs dürfen Vorschläge machen; ggf. Multi-Turn (z. B. erst Clara, dann Nadine-Antwort).

6. **Task-Listen pro KI schrittweise ausfüllen**
   - Die Tabellen in Abschnitt 2 als Backlog nutzen; pro KI die „Priorität Hoch“-Tasks zuerst umsetzen (API, UI, Memory, Chat).

7. **Julia (QM-KI) und QM-Tasks**
   - Julia einführen: eigene Seite, im Team-Chat ansprechbar; **Julia meldet sich bei Clara** mit Task-Anfragen, **Clara erstellt die Tasks** (für KI oder Mitarbeiter); **Kommunikation Julia ↔ Clara im Chat nachverfolgbar**.
   - Delegation an echte Mitarbeiter (`assigned_to_human`), Filter „Mir zugewiesen“ im Monitor.
   - **Mitarbeiter-Maske**: Name, Funktion, **Rollen** (Strahlenschutz-, Datenschutz-, Hygienebeauftragte/r, …) verteilen, Aufgabenbereich als Checkliste; Schnittstelle Pickadoc (Import); Beispiel Saghi (reale Mitarbeiterin, Sterilisation).
   - **Mitarbeiter-Aufgaben auf dem Handy**: Login auf iPhone/Android, „Meine Aufgaben“ abarbeiten (keine reine Desktop-Lösung bei z. B. 50 Mitarbeitern); eigene mobile Ansicht/App, Authentifizierung, API für my-tasks und complete; optional Push bei neuer Zuweisung.
   - Bücher, Pläne und Verzeichnisse: pro Fachrichtung aktivieren, proaktiv pflegen (Julia → Clara → Task → Mitarbeiter); **einsehbar und exportierbar** (Ansicht pro Buch, Export PDF/Excel).

---

## 6. Dateien / Stellen im Code (Referenz)

- **Tasks**: `backend/src/clara-lisa.js` (createTask, clara_tasks), `backend/src/index.js` (`/api/tasks`, create-draft, …).
- **Monitor**: `frontend/src/pages/MonitorPage.jsx` (Taskliste, Filter, Nadine-Entwurf).
- **Memory**: `backend/src/memory.js` (addMemoryEvent, addAgentMessage, getMemoryContextForEntity, onCallEnded, onEmailOrLetterSent, onLenaSessionProcessed, onTeamChatExchange).
- **Team-Chat**: `backend/src/ai.js` (TEAM_CHAT_SYSTEM, TEAM_AGENTS, teamChatReply), `backend/src/index.js` (POST /api/team-chat).
- **DB**: `backend/src/db.js` (clara_tasks, clara_memos, shared_memory, agent_messages, team_chat_*).

---

*Stand: März 2025. Dieses Dokument kann bei der schrittweisen Umsetzung ergänzt werden.*
