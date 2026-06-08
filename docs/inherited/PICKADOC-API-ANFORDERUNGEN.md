# Pickadoc – API-Anforderungen für die Integration mit MAS

Dieses Dokument richtet sich an die **Pickadoc-Entwickler**. Es beschreibt, welche **Daten und API-Endpunkte** MAS von Pickadoc benötigt bzw. bereitstellt, damit Aufgaben von **Clara** an **Mitarbeiter** (in Pickadoc hinterlegt) übergeben werden können und Mitarbeiterdaten in MAS (Nadine, Lisa, Adressbuch) genutzt werden können.

---

## 1. Ziel der Integration

- **MAS** (Clara, Nadine, Lisa, Lena) soll:
  - **Mitarbeiter** der Praxis aus Pickadoc kennen (Name, Rolle, ggf. E-Mail/Telefon).
  - **Aufgaben an Mitarbeiter** delegieren können (z. B. „Leite das an Frau Müller weiter“).
  - Optional: Patienten/Kontakte aus Pickadoc für Adressbuch/Nadine nutzen.
- **Pickadoc** liefert dafür Mitarbeiterdaten (und optional Kontakte) und kann ggf. Aufgaben von MAS entgegennehmen und anzeigen.

---

## 2. Was MAS von Pickadoc benötigt (von Pickadoc bereitzustellen)

### 2.1 Mitarbeiter-Liste (Pflicht)

MAS muss die **aktuellen Mitarbeiter** der Praxis abrufen können (z. B. für Aufgaben-Delegation und Anzeige in Clara/Nadine).

**Empfohlener Endpunkt (REST):**

| Methode | Pfad (Vorschlag) | Beschreibung |
|--------|-------------------|--------------|
| **GET** | `/api/staff` oder `/api/employees` | Liste aller aktiven Mitarbeiter |

**Erwartetes Antwortformat (JSON):**

```json
{
  "staff": [
    {
      "id": "string (eindeutig, stabil)",
      "display_name": "string (z. B. „Anna Müller“)",
      "first_name": "string (optional)",
      "last_name": "string (optional)",
      "email": "string | null (E-Mail für Aufgabenbenachrichtigung)",
      "phone": "string | null (optional)",
      "role": "string | null (z. B. „MFA“, „ZFA“, „Empfang“, „Leitung“)",
      "active": true
    }
  ]
}
```

- **id**: Eindeutige, stabile ID (UUID oder interne Pickadoc-ID). Wird von MAS gespeichert, um Aufgaben dem Mitarbeiter zuzuordnen.
- **display_name**: Anzeigename (z. B. für „Aufgabe an Anna Müller“).
- **email** / **phone**: Optional, für spätere Benachrichtigung oder Kontakt.
- **role**: Optional, für Filter/Anzeige (z. B. nur „Empfang“).
- **active**: Nur `true` = aktuell beschäftigt; inaktive können ausgeblendet werden.

**Alternative: Webhook**

- Statt Polling kann Pickadoc bei Änderungen einen **Webhook** an MAS senden (z. B. `POST https://mas-url/api/integrations/pickadoc/staff-sync`) mit gleichem JSON-Format. MAS aktualisiert dann die lokale Mitarbeiterliste.

---

### 2.2 Optional: Patienten / Kontakte für Adressbuch

Falls Pickadoc **Patienten- oder Kontaktdaten** (Anschrift, E-Mail, Telefon) verwaltet und diese für Nadine/Lisa genutzt werden sollen:

**Empfohlener Endpunkt:**

| Methode | Pfad (Vorschlag) | Beschreibung |
|--------|-------------------|--------------|
| **GET** | `/api/patients` oder `/api/contacts` | Liste oder Suche (mit Paginierung/Filter) |

**Erwartetes Format (minimal):**

```json
{
  "contacts": [
    {
      "id": "string",
      "display_name": "string",
      "address_line1": "string | null",
      "address_line2": "string | null",
      "postal_code": "string | null",
      "city": "string | null",
      "email": "string | null",
      "phone": "string | null",
      "type": "patient | contact | organization"
    }
  ],
  "total": 0,
  "page": 1,
  "per_page": 50
}
```

- MAS kann diese Daten ins **Adressbuch** übernehmen (mit Quellenvermerk „Pickadoc“) und für Briefe/E-Mails/Anrufe nutzen.
- **Datenschutz**: Nur mit Einwilligung/Konzept; Übertragung verschlüsselt (HTTPS), Zugriff nur mit Authentifizierung.

---

### 2.3 Optional: Aufgaben von MAS an Pickadoc übergeben

Wenn **Aufgaben**, die Clara an einen Mitarbeiter delegiert, **in Pickadoc erscheinen** sollen (z. B. in der Aufgabenliste des Mitarbeiters), muss Pickadoc einen Endpunkt bereitstellen, den MAS aufruft.

**Empfohlener Endpunkt (von Pickadoc bereitgestellt):**

| Methode | Pfad (Vorschlag) | Beschreibung |
|--------|-------------------|--------------|
| **POST** | `/api/integrations/mas/tasks` | Aufgabe von MAS entgegennehmen |

**Von MAS gesendeter Body (JSON):**

```json
{
  "task_id": "string (ID in MAS)",
  "staff_id": "string (Pickadoc-Mitarbeiter-ID)",
  "title": "string (z. B. „Unterlagen prüfen“)",
  "description": "string (freier Text)",
  "due_at": "ISO8601 datetime | null",
  "priority": "normal | high | low",
  "created_at": "ISO8601 datetime",
  "source": "clara",
  "context": {
    "patient_name": "string | null",
    "item_id": "string | null (z. B. Bezug auf Post-Item)"
  }
}
```

**Erwartete Antwort von Pickadoc:**

- **201 Created** mit Body z. B. `{ "id": "pickadoc-internal-task-id" }`  
  oder  
- **200 OK** mit gleichem Format.

So kann MAS die Aufgabe bei Bedarf später abgleichen (z. B. Status abfragen, falls Pickadoc dafür einen Endpunkt anbietet).

---

## 3. Was MAS für Pickadoc bereitstellt (optional)

Falls Pickadoc **Rückmeldungen** oder **Abrufe** von MAS braucht:

### 3.1 Webhook-URL für Mitarbeiter-Sync (von Pickadoc aufgerufen)

- **URL**: `POST {MAS_BASE_URL}/api/integrations/pickadoc/staff-sync`
- **Body**: Wie unter Abschnitt 2.1 (Mitarbeiter-Liste).
- **Authentifizierung**: API-Key oder signierter Request (Details in Absprache).

### 3.2 Abruf der aktuellen Aufgaben für einen Mitarbeiter (falls Pickadoc anzeigen will)

- **URL**: `GET {MAS_BASE_URL}/api/integrations/pickadoc/staff/{staff_id}/tasks`
- **Antwort**: Liste der von Clara an diesen Mitarbeiter delegierten Aufgaben (noch offen/erledigt).  
  *(Dieser Endpunkt kann von MAS bereitgestellt werden, wenn die Aufgaben in MAS geführt werden und Pickadoc sie nur anzeigen soll.)*

---

## 4. Authentifizierung und Sicherheit

- **Aufruf von MAS zu Pickadoc**  
  - API-Key im Header, z. B. `Authorization: Bearer <token>` oder `X-API-Key: <key>`.  
  - Key wird in MAS konfiguriert (z. B. `PICKADOC_API_KEY`, `PICKADOC_BASE_URL`).
- **Aufruf von Pickadoc zu MAS**  
  - MAS erwartet einen geheimen Key oder signierten Request (z. B. Webhook-Secret), der in Pickadoc konfiguriert wird.
- **HTTPS** für alle Aufrufe; keine personenbezogenen Daten unverschlüsselt.

---

## 5. Zusammenfassung: Endpunkte

| Richtung | Endpunkt | Bereitgestellt von | Zweck |
|----------|----------|---------------------|--------|
| MAS → Pickadoc | **GET** `/api/staff` (oder `/api/employees`) | **Pickadoc** | Mitarbeiter-Liste abrufen |
| MAS → Pickadoc | **GET** `/api/patients` oder `/api/contacts` (optional) | **Pickadoc** | Kontakte für Adressbuch |
| MAS → Pickadoc | **POST** `/api/integrations/mas/tasks` (optional) | **Pickadoc** | Aufgabe an Mitarbeiter übergeben |
| Pickadoc → MAS | **POST** `.../api/integrations/pickadoc/staff-sync` (optional) | **MAS** | Mitarbeiter-Update per Webhook |

---

## 6. Nächste Schritte für Pickadoc-Entwickler

1. **Mitarbeiter-API** implementieren: GET-Endpunkt mit Format wie in Abschnitt 2.1; Authentifizierung vereinbaren.
2. **Dokumentation** der genauen URLs, Query-Parameter (z. B. `?active=true`) und Fehlercodes (401, 404, 429) an MAS-Team übermitteln.
3. **Optional**: Kontakte/Patienten-API (Abschnitt 2.2) und Task-Entgegennahme (Abschnitt 2.3) planen; dann Webhook-URL und Payload mit MAS abgleichen.
4. **Staging/Test**: Test-API-Key und Test-URL für Integrationstests bereitstellen.

Bei Rückfragen oder Anpassungswünschen (z. B. andere Feldnamen, zusätzliche Felder) bitte mit dem MAS-Projektteam abstimmen.

---

*Stand: Anforderungen an Pickadoc für die Integration mit MAS (Clara, Nadine, Mitarbeiter-Aufgaben).*
