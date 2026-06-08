# Clara → Nadine, Lisa, Lena & Mitarbeiter – Aufgabentypen und Anforderungen

Dieses Dokument beschreibt die **Aufgaben**, die Clara (Conversational AI) an **Nadine** (Postbearbeitung), **Lisa** (Telefon), **Lena** (Behandlungsdokumentation) und an **Mitarbeiter** (Pickadoc) stellen können soll, sowie die **Fähigkeiten**, die Nadine und Lisa dafür brauchen (Adressbuch, Internet-Recherche).

---

## 1. Übersicht: Wer macht was?

| Ziel | Rolle | Typische Aufgaben |
|------|--------|-------------------|
| **Nadine** | Post & E-Mail | E-Mails schreiben/versenden, Briefe vorbereiten/versenden, Unterlagen anfordern, Bestätigungen versenden |
| **Lisa** | Telefon | Anrufe tätigen (Recall, Terminbestätigung, Nachfragen), Voicemail/Ergebnis zurückmelden |
| **Lena** | Sprechzimmer/Dokumentation | Session starten/zuordnen, Transkript bereitstellen, Export anfordern |
| **Mitarbeiter** (Pickadoc) | Reale Personen | Aufgaben delegieren, Erinnerungen, Rückmeldung einholen |

---

## 2. Schreibaufgaben in der Praxis – vollständige Liste (Nadine)

Nadine soll **alle** Schreibaufgaben einer Praxis abdecken können. Dazu muss sie in der Lage sein, **Anschrift und E-Mail-Adresse** des Empfängers zu ermitteln (Adressbuch oder Internet) und den Vorgang **vollständig vorzubereiten** bzw. auszuführen.

### 2.1 E-Mail-Aufgaben (Clara → Nadine)

| Aufgabe | Beschreibung | Nadine-Aktion |
|--------|--------------|----------------|
| **E-Mail an [Empfänger] schreiben** | Inhalt/Betreff von Clara vorgegeben oder aus Kontext | Empfänger-Adresse ermitteln (Adressbuch/Internet), E-Mail-Entwurf erstellen, optional versenden |
| **E-Mail an [Firma/Behörde] senden** | z. B. KV, Labor, Krankenkasse | E-Mail-Adresse ermitteln (Adressbuch oder Recherche), Entwurf mit Betreff/Inhalt, Versand |
| **Antwort auf eingehende E-Mail** | Bezug auf bestehendes Item | Antwort-Entwurf mit Signatur, Versand aus gewähltem Konto |
| **Terminbestätigung per E-Mail** | An Patient/Labor/Partner | Anschrift/E-Mail aus Adressbuch, Vorlage + persönliche Daten, Versand |
| **Unterlagen anfordern (E-Mail)** | z. B. bei Patient oder externer Stelle | E-Mail-Text + Empfänger ermitteln, versenden |
| **Rechnung/Einladung/Fortbildung per E-Mail** | Anhang optional | Empfängerliste, Betreff, Text, ggf. Anhang aus Praxis |

### 2.2 Brief-Aufgaben (Clara → Nadine)

| Aufgabe | Beschreibung | Nadine-Aktion |
|--------|--------------|----------------|
| **Brief an [Empfänger] schreiben** | Inhalt von Clara oder Vorlage | Postanschrift ermitteln (Adressbuch/Internet), Brief mit Briefbogen-PDF erzeugen, zum Versand vorbereiten |
| **Brief an [Behörde/Firma]** | z. B. KV, MDK, Labor | Adresse ermitteln, Brieftext, PDF mit Briefkopf erzeugen |
| **Kostenvoranschlag / Ablehnung / Stellungnahme** | Formale Schreiben | Anschrift + Anrede, Briefinhalt, PDF generieren |
| **Mahnung / Erinnerung** | Schriftlich | Adresse aus Adressbuch, Text + Brief-PDF |
| **Terminbestätigung per Post** | Falls kein E-Mail-Kontakt | Postadresse, Brief mit Termindaten, PDF/ Druck |

### 2.3 Weitere Schreib-/Post-Aufgaben

- **Fax** (falls integriert): wie E-Mail/Brief, Empfänger-Faxnummer aus Adressbuch/Recherche  
- **Nachricht an Praxis-Team** (intern): z. B. Memo oder Aufgabe an Pickadoc-Mitarbeiter  
- **Rückruf-Anfrage** (schriftlich): „Bitte rufen Sie uns zurück“ – Nadine bereitet vor, Lisa führt ggf. Anruf aus  

---

## 3. Was Nadine können muss

### 3.1 Adressbuch (Pflicht)

- **Adressbuch führen und aktuell halten**
  - Einträge: Name, ggf. Patient/Institution, **Postanschrift**, **E-Mail**, ggf. Telefon, Fax
  - Quellen: manuelle Pflege, Übernahme aus eingehender Post/E-Mail (Absender), Übernahme aus Pickadoc (Patienten/Mitarbeiter)
- **Suche**: Nach Name, Firma, Rolle – liefert Anschrift und/oder E-Mail für Briefe und E-Mails
- **API/UI**: Adressbuch in MAS (Nadine) abfragbar, damit Clara/Nadine „Empfänger = XY“ in konkrete Adresse/E-Mail auflösen kann

### 3.2 Adresse / E-Mail aus dem Internet besorgen

- Wenn **kein Eintrag im Adressbuch**: Nadine (oder eine zentrale „Recherche“-Funktion) soll **Adresse oder E-Mail im Internet ermitteln** können.
  - Beispiele: KV Nordrhein, Labor XY, Stadtverwaltung, bestimmte Ärzte
  - Technisch: z. B. strukturierte Suche (KI/API) oder manuelle Eingabe durch Nutzer mit Speicherung ins Adressbuch
- **Clara** kann diese Fähigkeit haben und das Ergebnis an Nadine weitergeben („Schreibe Brief an KV Nordrhein – hier die Adresse: …“), oder Nadine ruft selbst eine „Lookup“-Funktion auf.

### 3.3 Vollständige Vorbereitung

- **Brief**: Empfängeradresse, Anrede, Text, Briefbogen-PDF → PDF erzeugen (`POST /api/letters/generate`), zum Druck/Versand bereitstellen.
- **E-Mail**: Empfänger-E-Mail, Betreff, Body, Signatur → Entwurf anlegen oder direkt versenden (`POST /api/mail/send`).

---

## 4. Lisa: Telefonnummern finden

### 4.1 Anforderung

- **Telefonnummer** für Anrufe (Recall, Termin, Nachfrage) soll verfügbar sein.
- **Quellen**:
  1. **Adressbuch** (gemeinsam mit Nadine): Telefonnummer pro Kontakt
  2. **Internet-Recherche**: Wenn keine Nummer im Adressbuch – Nummer im Internet finden (z. B. Praxis, Firma, Behörde)
- **Zwei Wege**:
  - **Option A**: Lisa (bzw. MAS) hat eine „Telefonnummer suchen“-Funktion; Clara gibt z. B. „Ruf Frau Müller an“ → System sucht Nummer (Adressbuch, dann Internet) und legt Task mit `phone_number` an.
  - **Option B**: Clara hat die Fähigkeit „Telefonnummer im Internet finden“ und übergibt die gefundene Nummer beim Anlegen des Lisa-Tasks (`POST /api/tasks` mit `contact_name`, `phone_number`, `task_prompt`).

In beiden Fällen muss das Backend bzw. die Datenquelle (Adressbuch + ggf. Recherche-API) die Nummer bereitstellen oder Clara liefert sie nach Recherche.

---

## 5. Aufgaben an Lena (Behandlungsdokumentation)

- **Lena-Session starten/zuordnen**: z. B. „Starte Lena für Patient X / Termin Y“ → MAS erstellt oder verknüpft `lena_sessions` (bereits vorhanden: `POST /api/lena/sessions`).
- **Transkript/Export anfordern**: „Lena-Transkript von Session Z“ → GET Export (TXT/PDF).
- **Aufgabe an Lena** im Sinne von: „Notiere …“ / „Dokumentiere …“ – kann als Memo oder als Kontext für eine Session formuliert werden.

Technisch: Bestehende Endpunkte `GET/POST /api/lena/sessions`, `GET /api/lena/sessions/:id/export` nutzen; Clara ruft diese über Server-Tools auf oder delegiert an eine App-Oberfläche.

---

## 6. Aufgaben an Mitarbeiter (Pickadoc)

- **Mitarbeiter** sind reale Personen und in **Pickadoc** hinterlegt.
- **Clara** soll Aufgaben an **bestimmte Mitarbeiter** delegieren können, z. B.:
  - „Leite das an Frau Müller weiter“
  - „Erinnerung an Herrn Schmidt: Unterlagen prüfen“
- Dafür muss MAS:
  1. **Mitarbeiterliste** von Pickadoc beziehen (wer ist wer, ggf. E-Mail/Interne ID).
  2. **Aufgaben** an einen Mitarbeiter „anreichen“ – entweder in MAS als „Task für Mitarbeiter X“ mit Verweis auf Pickadoc, oder Pickadoc stellt eine API bereit, an die MAS die Aufgabe übergibt.

Details der Schnittstelle Pickadoc ↔ MAS siehe **PICKADOC-API-ANFORDERUNGEN.md**.

---

## 7. Zusammenfassung der Fähigkeiten

| Komponente | Fähigkeit | Umsetzung |
|------------|-----------|-----------|
| **Nadine** | Adressbuch | Neue Tabelle/API in MAS: Kontakte mit Anschrift, E-Mail, Telefon, Quelle |
| **Nadine** | Adresse/E-Mail aus Internet | Recherche-Funktion (KI/API oder manuell), Ergebnis ins Adressbuch übernehmen |
| **Lisa** | Telefonnummer | Adressbuch + gleiche Recherche (oder Clara liefert Nummer nach Recherche) |
| **Clara** | Tasks an Nadine | Neue Task-Typen: `write_email`, `write_letter` mit Empfänger, Betreff, Inhalt; Nadine löst Empfänger auf und führt aus |
| **Clara** | Tasks an Lena | Server-Tools: Lena-Session anlegen/abfragen, Export anfordern |
| **Clara** | Tasks an Mitarbeiter | Server-Tools: „Task an Mitarbeiter X“ – MAS speichert und/oder sendet an Pickadoc (siehe Pickadoc-Datasheet) |

---

## 8. Nächste Schritte (Implementierung)

1. **Adressbuch** in MAS: Schema, CRUD-API, UI in Nadine (Einstellungen oder eigener Bereich).
2. **Nadine-Tasks**: Neue Tabelle `nadine_tasks` (oder Erweiterung Tasks) mit Typ `email`/`letter`, Empfänger, Betreff, Body, Status; Clara legt an, Nadine zeigt Liste und führt aus.
3. **Recherche**: Optionaler Dienst/API „Adresse oder E-Mail oder Telefon zu Name/Firma suchen“ (intern oder extern), Anbindung an Nadine/Lisa/Clara.
4. **Pickadoc**: Anforderungsdokument umsetzen (Mitarbeiter-API, ggf. Task-Übergabe) – siehe **PICKADOC-API-ANFORDERUNGEN.md**.

---

*Stand: Konzept für Aufgaben Clara → Nadine, Lisa, Lena, Mitarbeiter und Anforderungen an Adressbuch sowie Pickadoc-Integration.*
