# VERKAUFSKERN Clara (festgelegt vom Chef, 27.07.2026 abends)

Dieses Dokument ist der MASSSTAB fuer ein verkaufbares Produkt. Es listet die
Faehigkeiten, die Clara koennen MUSS, damit sie einer Praxis verkauft werden
kann. Alles, was hier nicht steht, ist Warteliste (Masterplan) — nicht
unwichtig, aber nicht Verkaufskern.

Jeder Punkt ist (oder wird) ein dauerhafter Testfall im Regressions-Register
(`F:\Clara-Voice\testsuite\register.json`, IDs `vk-*` und `reg-*`). Regeln:

1. **Ein gesicherter Punkt darf nie wieder unbemerkt kaputtgehen.** Kippt ein
   Register-Fall, ist der Lauf ROT — egal wie gut die Gesamtquote ist.
   (Blockierend im Gate ab dem ersten komplett gruenen Register-Lauf;
   bis dahin: messen und berichten.)
2. **Jede neue Beschwerde des Chefs wird ein Register-Fall** (`reg-*`) —
   mit dem Wortlaut des Chefs, BEVOR der Fix gebaut wird (erst rot, dann gruen).
3. **Eine Verhaltensaenderung pro Neustart. Kein Neustart, waehrend der Chef
   telefoniert.**

Status-Legende:
- `OK` — bestand vor dem 27.07., sollte gruen sein
- `REP-2707` — am 27.07. repariert, Beweis durch Register-Lauf faellig
- `UNBEWIESEN` — Werkzeug existiert, Ende-zu-Ende nie nachgewiesen
- `NEUBAU` — fehlt, wird gebaut
- `INTEGRATION` — nur im Lauf gegen echte Dienste messbar (nicht im SAFE-Modus)

## A. Termine

| Nr | Faehigkeit (Beispielsatz) | Werkzeuge | Status | Register |
|----|---------------------------|-----------|--------|----------|
| 1 | "Wie viele Termine habe ich noch?" — zaehlt ab jetzt, nur heute | `list_day_appointments` (remaining) | REP-2707 | vk-01 |
| 2 | "Wie sieht mein Tag heute aus?" — Tagesbriefing, auch automatisch morgens | `day_briefing` | OK | vk-02 |
| 3 | "Wer kommt als naechstes?" — Patienten-Briefing mit Hinweisen | `next_patients_briefing` | OK | vk-03 |
| 4 | "Welche Termine hatte ich am 20.7.?" — echte Vergangenheit | `list_day_appointments`/`day_briefing` (date) | REP-2707 | vk-04 |
| 5 | "Wann ist der naechste freie Termin?" | `next_free_slot` | OK | vk-05 |
| 6 | "Buch Frau X fuer Dienstag zehn Uhr" — erst Patient eindeutig, dann buchen | `search_patient` -> `book_for_patient` | OK | vk-06 |
| 7 | "Sag den Termin von Herrn Y ab" — NUR nach Rueckbestaetigung | `patient_next_appointment` -> `cancelAppointment` | UNBEWIESEN | vk-07 |
| 8 | "Verschieb ihn auf Donnerstag vierzehn Uhr" | `getFreeTimeSlotsForPostponeAppointment` -> `postponeAppointment` | UNBEWIESEN | vk-08 |

## B. Kommunikation

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 9 | "Schick Frau X eine SMS, dass ..." | `send_sms` (`find_contact` ohne Nummer) | OK | vk-09 |
| 10 | "Schreib eine Mail an ..." — Entwurf, Freigabe, Versand | `compose_email` -> `approve_and_send` | OK | vk-10 |
| 11 | "Ruf X an und sag ihm ..." — Auftrag wird WIRKLICH ausgeloest | `delegate_call` | REP-2707 | vk-11, reg-05 |
| 12 | Nach jedem Lisa-Anruf ein Gespraechsbericht | `lisa_call_result` (+ Push nach Anrufende) | REP-2707 | vk-12 |
| 13 | "Wie ist die Nummer von Doktor Petsas?" — aus dem festen Praxisverzeichnis | `find_contact`/`contact_card` (+ `mas_config/directory`) | REP-2707 | vk-13 |
| 14 | "Schick mir die Kontaktkarte" — Karte kommt WIRKLICH am Handy an | `contact_card`/`push_contact` | REP-2707 (Ankunft: INTEGRATION) | vk-14, reg-04 |
| 15 | "Hat gestern jemand angerufen?" | `call_log` | OK | vk-15 |

## C. Terminluecken und Recall

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 16 | "Wo habe ich morgen Luecken?" | `gap_briefing` | OK | vk-16 |
| 17 | "Wen koennen wir dafuer anrufen?" — Kandidaten aus den Recall-Toepfen (CampaignR) | `list_recall_candidates` | OK | vk-17 |
| 18 | Recall-Anruf NUR nach Freigabe — und dann passiert er wirklich | `approve_recall` / `gapfill_call_patient` | OK | vk-18 (Dialog) |
| 19 | An Abwesenheitstagen KEINE Lueckenfueller-Vorschlaege | Abwesenheits-Filter in `gapFill`/`daySchedule` | REP-2707 | INTEGRATION |

## D. Abwesenheiten

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 20 | "Wann bin ich wieder in der Praxis?" — Spanne + Rueckkehrtag, gesiezt | `getDoctorVacation` (eigener Kalender) | REP-2707 | vk-20 |
| 21 | "Hat Frau Mueller naechste Woche frei?" — auch Mitarbeiter | `getDoctorVacation`/`getDoctorAvailability` | REP-2707 | vk-21 |
| 22 | "Trag mir Urlaub von ... bis ... ein" — eintragen und genehmigen | `plan_absence` -> `approve_absence` | OK | vk-22 |

## E. Ueberwachen, Fristen, Zahlungen

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 23 | "Was ist heute reingekommen?" — Mails + Anrufe + Empfang | `comms_digest` | OK | vk-23 |
| 24 | Fristen-Waechter: Fristen aus E-Mails, gescannter Post (Mail-Anlage -> `mail/ocr.js`) UND Telefonaten; Wiedervorlage bis "erledigt" | NEUBAU (Basis: Eskalationsliste, OCR-Strecke, Anruf-Transkripte) | NEUBAU | folgt |
| 25 | Rechnungs-/Zahlungs-Waechter aus denselben drei Quellen; Betrag NUR auf der Karte, gesprochen wird die Frist (Regel: keine Euro-Betraege in gesprochenen Briefings) | NEUBAU | NEUBAU | folgt |
| 26 | Kritisches sofort melden, ohne Fehlalarm durch Werbe-Fusszeilen | `brain/critical.js` (`ohneFusszeile`) | REP-2707 | MAS: `scripts/test-critical-fusszeile.mjs` |

## F. Anzeige

| Nr | Faehigkeit | Werkzeuge | Status | Register |
|----|------------|-----------|--------|----------|
| 27 | Jede angekuendigte Karte erscheint WIRKLICH am Handy und ist vertiefbar (W-FLIP-TIEFE) | Karten-Push + `call.html`/`clara-chat.js` | INTEGRATION | folgt |

## G. Bianca (Patiententelefon) — Platzhalter, bewusst leer

Bianca gehoert zum Verkaufskern, wird aber KOMPLETT NEU und eigenstaendig
entwickelt (Chef 27.07.). Die Zusammenfuehrung mit Clara ("Hochzeit") kommt
erst, wenn Clara steht. Bis dahin: keine Bianca-Faelle im Register, keine
Bianca-Arbeit in Clara-Sessions.

## Offene Punkte zum Neubau (24/25)

- Eingangsweg Post: Hauspost kommt GESCANNT ALS E-MAIL-ANLAGE an; die lokale
  Texterkennung existiert (`backend/src/mail/ocr.js`, Vision + Tesseract,
  DSGVO-lokal). Neu sind: (a) Fristen-/Betrags-Extraktion auf dem Text,
  (b) Wiedervorlage-Mechanik mit Sprach-Quittung "erledigt",
  (c) dieselbe Extraktion ueber Telefon-Transkripte (eingehend UND Lisa).
- Anrufer wie Anwaelte/Behoerden/Rechnungssteller am Telefon muessen in
  denselben Waechter laufen wie eine Mail (EIN Waechter, EINE Liste,
  drei Quellen).
