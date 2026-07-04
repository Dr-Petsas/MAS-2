# Arbeitsregeln MAS-2 (verbindlich fuer alle Sessions)

**MASTERPLAN (ab 04.07.2026):** Der verbindliche Umsetzungsplan liegt in
`docs/MASTERPLAN_CLARA_2026-07.md`. KEIN Abschweifen: neue Ideen kommen auf
die Warteliste dort, nicht sofort in den Code. Arbeitspakete werden FERTIG
gebaut (Definition of Done), bevor das naechste beginnt.

Dies ist das **produktive MAS-Backend** (Express auf Port 3100, geteiltes
Gedaechtnis, Clara-Tools, Nadine-Mail, Firestore). Clara, Bianca, Lisa und das
Frontend haengen live an diesem Prozess — **erreichte Funktionen duerfen nicht
verloren gehen**.

## Eiserne Regeln

1. **Vor jedem Backend-Neustart pruefen:** `npm test` in `backend/` (falls
   vorhanden) bzw. mindestens `node --check` auf alle geaenderten Dateien.
   Danach den Clara-Stack-Gate mitlaufen lassen:
   `powershell -File F:\Clara-Voice\tools\release_gate.ps1` (Clara spricht mit
   diesem Backend — ein kaputter Endpoint faellt dort sofort auf).
2. **Git ist Pflicht.** Jede fertige Aenderung sofort committen (deutsche
   Commit-Message: was + warum). Gruene Staende taggen: `git tag stabil-JJJJ-MM-TT`.
3. **Vertrags-Treue:** Die Endpunkte unter `/brain/*`, `/clara/*`, `/testtrain/*`
   sind von Clara-Voice, dem Frontend und ElevenLabs-Webhooks fest verdrahtet.
   Bestehende Routen/Antwortformate nicht umbenennen oder umbauen — nur erweitern.
4. **Kalender-Paritaet:** `src/clara/daySchedule.js` blendet virtuelle Termine
   (Status `needsConfirmation`/`declined`) genauso aus wie der Plattform-Kalender
   (`showVirtualAppointments`). Diesen Filter nie entfernen — sonst liest Clara
   wieder Termine vor, die niemand im Kalender sieht (Vorfall 12.06.2026).
5. **Feiertage/Wochenenden:** `src/clara/holidays.js` ist die EINE Quelle fuer
   "ist dieser Tag besonders?". Kein Modul raet das selbst.
6. **Umsatz-/Euro-Zahlen** gehoeren NICHT in Briefings oder Clara-Antworten
   (Vorgabe: separates Element mit Lena/Sophie).

## Kanonische Ordner (Stand 12.06.2026)

- `F:\MAS-2` — Backend (dieses Repo)
- `F:\Clara-Voice` — Sprach-Stack
- `F:\pickadoc-live-base` — Plattform-Frontend, einzige Deploy-Quelle
- `F:\MAS`, `TelefonKI v4.4/v5.2`, `pickadoc-platform*` sind Altbestand:
  **nicht hineinschreiben, nicht von dort deployen.**
