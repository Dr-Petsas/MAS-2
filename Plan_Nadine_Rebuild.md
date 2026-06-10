# Nadine in MAS-2 – Umbauplan (entmüllt & neu eingebaut)

**Stand:** 09.06.2026 · Grundlage: Analyse des alten `F:\MAS` (Backend `mail.js`, `NadineTasksPanel.jsx`, `NadineMobilePage.jsx`, Konzept `ANFORDERUNGEN-CLARA-NADINE-LENA-TASKS.md`)

---

## ✅ Phase 1 ERLEDIGT (09.06.2026) – Delegations-Regelkreis geschlossen

Die wichtigste Funktion (Clara → Nadine, die früher brach) läuft jetzt end-to-end und ist getestet:

- **Backend:** `listCases` filtert nach `assignee`; `getCaseContext` liefert zusätzlich einen fertigen **Vorschlagsentwurf** (`buildEmailDraft`, deterministisch, mit Anrede + Betreff je Thema); neuer Endpunkt `POST /brain/cases/:id/draft` (`saveCaseDraft`) speichert E-Mail/Brief am Vorgang, protokolliert ihn im Audit-Trail und setzt offene Vorgänge auf `in_progress`.
- **Frontend (CalendR, neues Dark-Design):** neuer **„Nadine"-Tab** neben „Clara/Gehirn". Master-Detail: links Nadines Postkorb (nach Nadine delegierte aktive Vorgänge), rechts Auftrag von Clara + voller Kontext + Composer (E-Mail/Brief), vorbefüllt aus dem Vorschlagsentwurf bzw. dem bereits gespeicherten Entwurf. Aktionen: „Entwurf speichern", „Erledigt".
- **Verifiziert:** `scripts/test-nadine.mjs` (ALL PASS) + HTTP-Smoke gegen `meddent`. Filter trennt Nadine/Lisa sauber; Entwurf landet am Vorgang; Erledigen entfernt ihn aus der offenen Liste.

**Bewusste Entscheidung Versand:** Echter Mailversand (IMAP/SMTP + Konten/Secrets) ist Phase 2 — nicht nachts ohne echte Konten testbar. Bis dahin wird der Entwurf sauber am Vorgang gehalten/protokolliert (kein Datenverlust, voller Kontext bleibt erhalten).

**Bewusste Entscheidung Nadine-Stimme:** Eigene Stimme = starkes Marketing-Differenzierungsmerkmal, aber Gimmick-Risiko → optional in **Phase 3**, erst wenn Postfach steht. Funktion vor Show.

---

## ✅ Phase 2 ERLEDIGT (09.06.2026) – Echtes Postfach (IMAP/SMTP)

Der E-Mail-Client ist entmüllt aus dem alten MAS übernommen, mehrmandantenfähig neu gebaut und getestet:

- **Verschlüsselung (`mail/crypto.js`):** Konto-Passwörter werden mit **AES-256-GCM** verschlüsselt gespeichert (Key aus `MAIL_CRYPTO_KEY`). Manipulation wird erkannt. Klartext landet nie in Firestore.
- **Konten (`mail/accounts.js`, `mas_mail_accounts`):** CRUD pro Praxis; Public-/Listen-Shape enthält **nie** Secrets (nur „hat Passwort"). Update ändert nur das gesetzte Passwort.
- **Postfach (`mail/mailbox.js`):** IMAP-Abruf (ImapFlow) → Nachrichten in `mas_mail_messages`; **Threading** über Message-ID/References; **Auto-Adressbuch** (`mas_contacts`); Anhänge nach Cloud Storage (sofern Bucket), sonst Metadaten. **SMTP-Versand** (nodemailer) mit Ausgangskopie. `MAIL_DRY_RUN=1` testet den Versand ohne echten Server.
- **Lesemodelle (`mail/store.js`):** Nachrichtenliste/Detail/gelesen, Adressbuch-Suche.
- **API (`/mail/*`):** accounts CRUD, `accounts/test` (IMAP), `sync`, `messages`, `messages/:id`, `read`, `send`, `contacts`. Plus **`POST /brain/cases/:id/send`** = Vorgang per Mail beantworten → Versand + Audit-Log + automatisch erledigt.
- **Frontend (Nadine-Tab):** Unter-Reiter **Aufträge / Posteingang / Konten**. Composer mit Konto-Auswahl + **„Senden & erledigen"**. Posteingang als 3-Pane (Konto → Liste → Detail, mit HTML/Text + Anhänge). Konten-Verwaltung mit IMAP-Test, verschlüsselter Speicherung, Sync-Status.

**Verifiziert:** `test-mail-crypto.mjs`, `test-mail-accounts.mjs` (keine Secret-Leaks, Round-Trip, Tamper-Detection), `test-mail-send.mjs` (DRY_RUN: Versand → Ausgangskopie in SENT → Vorgang erledigt) — alle **ALL PASS**; HTTP-Smoke gegen `meddent` grün.

**Go-Live:** echtes Praxis-Konto unter „Konten" anlegen (IMAP/SMTP + Passwörter), `MAIL_CRYPTO_KEY` ist in `.env` gesetzt. Ohne `MAIL_DRY_RUN` geht echter Versand; mit `MAIL_DRY_RUN=1` Testbetrieb.

---

## ✅ Phase 2+ ERLEDIGT (09.06.2026) – Brief-PDF, Anhänge, Auto-Sync

Die zuvor offenen Ausbaupunkte (außer Stimme) sind gebaut und getestet:

- **Brief-PDF (`mail/letter.js`, pdfkit):** druckfertiges PDF im DIN-5008-nahen Layout (Briefkopf der Praxis aus dem Client-Doc, Empfängerblock, Datum, fetter Betreff, Fließtext). Routen `POST /brain/cases/:id/letter` (aus Vorgangs-Entwurf, archiviert + protokolliert) und `POST /mail/letter` (ad-hoc). Frontend: Button **„📄 Brief als PDF"** im Brief-Composer → sofortiger Download; Archivierung nach Cloud Storage (signierte URL), falls Bucket vorhanden.
- **Anhang-Download:** `GET /mail/messages/:id/attachments/:idx` liefert eine kurzlebige signierte URL; Anhänge im Posteingang sind klickbar (öffnen im neuen Tab). Greift, sobald ein Storage-Bucket konfiguriert ist.
- **Auto-Sync (`mail/scheduler.js`):** optionaler Hintergrund-Poller über **alle** Mandanten (eine `collectionGroup`-Abfrage auf `mas_mail_accounts`), per `MAIL_SYNC_INTERVAL_MS` aktivierbar (Standard: aus, Mindestintervall 30 s, kein Überlappen). Beim Serverstart automatisch berücksichtigt.

**Verifiziert:** `test-mail-letter.mjs` (gültiges %PDF inkl. EOF, Brief-Loop protokolliert, Scheduler-Sweep ok) — **ALL PASS**; HTTP-Smoke der Brief-Route gegen `meddent` grün (gültiges PDF).

**Hinweis Storage:** Für Anhang-Download und Brief-Archivierung muss ein Firebase-**Storage-Bucket** verfügbar sein (`admin.storage().bucket()`). Ohne Bucket funktioniert der Brief-PDF-Download trotzdem (Base64); Anhänge zeigen nur Metadaten.

**Bewusst offen:** separate Nadine-TTS-Stimme — eigenständiges, größeres Feature im Voice-Stack; bewusst nach hinten gestellt (Funktion vor Show).

---

## ✅ Phase 3a ERLEDIGT (09.06.2026) – Nadine spricht über Clara (funktionaler Kern)

Statt zuerst eine separate Stimme zu bauen (Kosmetik), ist der wertvolle Teil umgesetzt: **Clara kann Nadine fragen** und antwortet mit deren Stand.

- **`mail/briefing.js`:** deterministisches Nadine-Briefing — neue E-Mails von heute, ungelesene, Hauptabsender, offene Clara-Aufträge und wie viele schon einen Entwurf haben → natürlicher deutscher Sprechtext.
- **API:** `GET /mail/briefing` (Read-Model fürs UI) und Clara-Tool `POST /tools/nadine-briefing`.
- **Clara-Profil:** neues Tool **`ask_nadine`** („Was gab es heute für E-Mails?", „Frag mal Nadine") — liest Nadines Zusammenfassung vor.
- **Frontend:** Karte **„Nadine heute"** oben im Aufträge-Tab (Sprechtext + Zähler neu/ungelesen/Aufträge/Entwurf).

**Verifiziert:** `test-mail-briefing.mjs` (Zähler + Text für neue/ungelesene Mails, Hauptabsender, Aufträge/Entwürfe, Leer-Stand) — **ALL PASS**; HTTP-Smoke von `/mail/briefing` und `/tools/nadine-briefing` gegen `meddent` grün.

**Verbleibend (bewusst, optional):** echte separate ElevenLabs-Stimme für Nadine (Hülle) + Auto-Verknüpfung eingehender Mails an Vorgänge/Patienten.

---

## ✅ Brief-Editor NEU GEBAUT (09.06.2026) – komplett, ohne Alt-Schrott

Der alte Brief-Editor war schwach gebaut; hier ein sauberer Neubau (die Clara-Anbindung läuft bereits über das neue Vorgangs-/Delegationssystem, nicht über die alte kaputte Mechanik):

- **DIN-5008-Layout (`mail/letter.js`):** Briefkopf (Absender rechts), Rücksendezeile über dem Anschriftfeld, Anschriftfenster, Info-Spalte (Datum), fetter Betreff, Fließtext, **Signatur** (nur wenn nicht schon im Text), **Falt- und Lochmarken**, dreispaltige **Fußzeile**.
- **Briefkopf-Einstellungen (`mail/letterSettings.js`, `mas_config/letterhead`):** Absender, Anschrift, Kontakt, Rücksendezeile, Signatur (Name/Funktion), Fußzeile links/mitte/rechts — mit Fallback auf das Client-Doc.
- **Textbausteine (`mail/letterBlocks.js`, `mas_letter_blocks`):** Kategorien Anrede/Textbaustein/Grußformel, CRUD + 8 sinnvolle Standard-Bausteine (idempotenter Seed).
- **API:** `GET/PUT /mail/letter/settings`, `GET/POST/PATCH/DELETE /mail/letter/blocks`, `POST /mail/letter/preview` (Live-PDF), `POST /mail/letter` (ad-hoc), case-Letter nutzt jetzt den Briefkopf.
- **Frontend (Nadine → Reiter „Brief-Editor"):** Formular (Anschrift/Betreff/Text) + Bausteine-Chips zum Einfügen + **Live-PDF-Vorschau** (debounced, im iframe) + **PDF-Download** + ausklappbare Verwaltung für **Briefkopf & Bausteine**.

**Verifiziert:** `test-letter-editor.mjs` (Settings-Round-Trip + Teil-Update, Bausteine CRUD + idempotenter Seed + alle Kategorien, gültiges DIN-5008-PDF mit Briefkopf/Signatur) — **ALL PASS**; HTTP-Smoke (settings/blocks/preview) gegen `meddent` grün.

**Betriebshinweis:** Immer nur **einen** MAS-2-Server starten — mehrere Instanzen auf Port 4000 führten zu Sofort-Beendigungen/404 auf neue Routen.

---

## 1. Was übernommen wird (das Gute aus dem alten MAS)

**Vollwertiger E-Mail-Client:** Mehrere IMAP/SMTP-Konten, Versand mit Anhängen, Reply-Threading, Anhang-Vorschau (Bild/PDF), Auto-Adressbuch aus Absendern, KI-Klassifikation/Relevanz je Mail.

**Schreib-Werkstatt:** E-Mail-Entwürfe, Brief-PDFs mit Briefbogen, Arztbrief-Entwürfe, Signatur-Editor, Adressbuch.

**Optik/Workflow (1:1 erhalten):** 3-Bereiche-Layout (Ordner → Liste+Snippet/Relevanz → Detail → Composer) und der zentrale **„Entwurfsordner"** mit Status `Offen → Entwurf erstellt → Versendet` und Quelle (Clara/Chat/Voice/Nadine).

## 2. Was entmüllt/ersetzt wird

- **Alte Voice-Task-Tabelle** (`write_email`-Tasks über fragile custom_tools) → **ersetzt durch unser Vorgangs-/Case-System** (bereits gebaut: `assign_case`, `getCaseContext`).
- **SQLite (better-sqlite3, `user_id='default'`)** → **mandantenfähig** auf Pickadoc-Stack (Firestore + Storage), `clientId` überall.
- Verstreute Helfer/Doppellogik → ein sauberes Mail-Modul.

## 3. Warum die Delegation brach – und wie sie jetzt hält

**Ursachen früher:** (1) Task-Erstellung hing am unzuverlässigen Voice-Tool-Pfad (gleiche Klasse Fehler wie Claras Halluzinationen); (2) Nadine bekam **keinen Kontext**, nur einen dünnen Prompt.

**Lösung jetzt (Fundament steht):**
- `assign_case` setzt deterministisch `assignee = Nadine` + wörtliche Anweisung (server-seitiger aktiver Vorgang, kein ID-Jonglieren der LLM).
- `getCaseContext`/`compileCaseContext` liefert den **kompletten Vorgang** (alle Kontakte, Patient, Auftrag) als fertigen Text → genau das, was Nadine zum Schreiben braucht.
- Rückmeldung/Status fließt in den **append-only Audit-Trail** des Vorgangs (haben wir).

→ Nadine konsumiert künftig **zugewiesene Vorgänge**, nicht mehr eine separate Task-Tabelle.

## 4. Architektur-Entscheidung: Wo liegen E-Mails? (wichtig)

E-Mail-Volumen + Anhänge gehören **nicht** komplett in Firestore (Dokumentgröße/Kosten). Empfehlung:

| Datum | Speicherort |
|---|---|
| Mail-**Metadaten** (Absender, Betreff, Datum, Status, Thread-ID, Klassifikation, Vorgangs-Verknüpfung) | Firestore `clients/{clientId}/mas_mail_items` |
| **Rohtext/HTML-Body** | Firestore-Feld nur bis Limit; größere → Cloud Storage |
| **Anhänge** | Cloud Storage Bucket pro Mandant (`mas-mail/{clientId}/{itemId}/…`) |
| **Konto-Zugangsdaten (IMAP/SMTP-Passwörter)** | verschlüsselt (KMS/Secret), niemals im Klartext, niemals ins Repo |

IMAP-Abruf + SMTP-Versand laufen als **MAS-2-Backenddienst** (wie heute der Tools-Server) bzw. später als Cloud Function/Worker. So bleibt der Browser raus aus Mail-Credentials.

## 5. Multi-Tenancy & Sicherheit

- Alles unter `clients/{clientId}/mas_*` (wie der Shared Brain).
- Konten/Signaturen in `mas_config`, Items in `mas_mail_items`, Adressbuch in `mas_addressbook`.
- Zugang über das bestehende Entitlement (`assertAppEnabled(clientId, 'nadine')`) + Operator-Identität (PIN/Login) für Autorschaft.
- Mail-Passwörter verschlüsselt; DSGVO: Datenminimierung, Lösch-/Aufbewahrungsregeln je Mandant.

## 6. Roadmap (additiv, in Phasen)

**Phase 1 – Delegations-Regelkreis schließen (höchster Hebel, geringstes Risiko)**
- „Nadine"-Reiter im CalendR-Frontend: Liste der Vorgänge mit `assignee=Nadine`.
- Klick → `getCaseContext` füllt einen **Composer** mit vollem Kontext vor (Empfänger, Betreff, Entwurfstext).
- Versand/__„Entwurf bereit"__ schreibt Status zurück in den Vorgang.
- *Nutzt fast nur Bestehendes — beweist sofort, dass Clara→Nadine funktioniert.*

**Phase 2 – E-Mail-Client portieren (mandantenfähig)**
- IMAP/SMTP-Dienst, Konten-UI, 3-Pane-Layout + Entwurfsordner, Anhänge, Signatur, Adressbuch, KI-Klassifikation.
- Eingehende Mails optional automatisch in Vorgänge einspeisen (wie der Transkript-Ingest).

**Phase 3 – Nadines eigene Stimme (Marketing-Feature, optional/abschaltbar)**
- Clara übergibt, Nadine antwortet in eigener ElevenLabs-Stimme („heute kamen drei Mails…", „Entwurf liegt bereit").
- Dünne Präsentationsschicht über demselben deterministischen Backend; **nicht** kritischer Pfad.

## 7. Meine Empfehlung zur Stimme

Kein Schnickschnack, **wenn dosiert**: Eigene Stimmen pro KI-Kollegin verstärken die „echtes Team"-Illusion stark und sind ein echtes Alleinstellungsmerkmal („Ihr KI-Praxisteam — jede mit eigener Stimme und Zuständigkeit"). Aber: **erst der Regelkreis, dann die Stimme** — optional, abschaltbar, latenzbewusst.

## 8. Empfohlener Start

**Phase 1 (Delegation)** zuerst — sie schließt genau das, was „nicht ging", nutzt unser fertiges Case-System und ist klein/risikoarm. Danach Phase 2 (Client-Port), dann Phase 3 (Stimme).

---

## 9. KI-Schreibhilfe im Brief-Editor — UMGESETZT (gemeinsames Gehirn)

Der Brief-Editor erfasst jetzt **Kontext aus dem gemeinsamen Gehirn** und lässt
die KI daraus formulieren — genau nach dem Prinzip „antworte auf diesen Brief,
ich gebe die grobe Richtung vor":

- **Kontextquellen** (`src/mail/letterAI.js` → `assembleContext`):
  - **Telefonate / Vorgang**: `getCaseContext` (Verlauf der Kontakte, Auftrag an Nadine).
  - **Zugehörige E-Mails**: `mas_mail_messages` mit passender `caseId`.
  - **Hochgeladener/zitierter Brief**: per Upload (Text/PDF-Textlayer) oder eingefügt.
  - **Bezug per Name**: ohne `caseId` löst `resolvePatientSubject` → neuester aktiver Vorgang auf.
- **Entwurf** (`draftLetter`): grobe Richtung + Kontext → lokales LLM (`qwen3:8b`,
  `MAS_LETTER_MODEL` überschreibbar) → `{subject, body}`. Prompt verbietet
  erfundene Briefköpfe/Namen/Termine; Briefkopf+Signatur kommen aus den Settings.
- **Robust**: Modell offline → sauberer Vorlagen-Fallback (kein Crash).
- **Endpunkte**: `POST /mail/letter/ai-draft`, `POST /mail/letter/extract`.
- **Frontend**: KI-Assistent-Karte im Brief-Editor (Bezug, Brief-Upload/Einfügen,
  Richtung, „✨ Entwurf mit KI erstellen"); füllt Betreff+Text, zeigt genutzten Kontext.
- **Test**: `scripts/test-letter-ai.mjs` (Extraktion, Kontext-Bündelung, Offline-Fallback, Live-Entwurf).

*Mensch-im-Loop: Der Entwurf ist Hilfe, kein Autopilot — vor dem Senden prüfen/verfeinern.*
*Offen/optional: OCR für gescannte Bilder/PDF-ohne-Textlayer.*

## 10. Eigener Briefkopf als Datei (PDF/Bild) — UMGESETZT

Praxen können ihr gebrandetes Briefpapier hochladen statt die Textfelder zu nutzen:

- **Speicher** (`src/mail/letterhead.js`): Upload als PDF/PNG/JPG → Cloud Storage,
  Fallback inline (base64) in Firestore bei lokaler Entwicklung (Cap ~900 KB).
- **Rendering** (`src/mail/letter.js`): Bild → Vollseiten-Hintergrund via pdfkit;
  PDF → Overlay des Textlayers via `pdf-lib` (pro Seite, mehrseitig-fähig). Bei
  Asset-Modus werden Textfeld-Briefkopf + Fußzeile unterdrückt; `bodyTopMm`
  schiebt den Text bei hohem Kopf nach unten.
- **Einstellungen**: `letterheadMode` ("text" | "asset") + `bodyTopMm`.
- **Routen**: `POST/GET/DELETE /mail/letter/letterhead`.
- **Frontend**: Briefkopf-Quelle umschaltbar; Datei-Upload/Ersetzen/Entfernen,
  Offset-Feld, Live-Vorschau zeigt das Ergebnis sofort.
- **Test**: `scripts/test-letterhead.mjs` (Upload, Overlay-PDF, Bild-Hintergrund, Größen-Cap, Löschen) + HTTP-Smoke.
