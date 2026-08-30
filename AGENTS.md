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
   Seit W1.2 (04.07.2026) liegen die Routen in `src/routes/*` (misc/tools/qm/
   brain/mail/testtrain/devices/clara + `_shared.js`); `server.js` ist nur noch
   Middleware + Mounts + Scheduler. Jede Route traegt ihren VOLLEN Pfad,
   gemountet ohne Prefix — `clara.js` MUSS als letzter Router gemountet bleiben
   (Catch-all `GET /clara/:clientId`). Routen-Inventar zum Gegenpruefen:
   `node scripts/route-inventory.mjs`.
4. **Kalender-Paritaet:** `src/clara/daySchedule.js` blendet virtuelle Termine
   (Status `needsConfirmation`/`declined`) genauso aus wie der Plattform-Kalender
   (`showVirtualAppointments`). Diesen Filter nie entfernen — sonst liest Clara
   wieder Termine vor, die niemand im Kalender sieht (Vorfall 12.06.2026).
5. **Feiertage/Wochenenden:** `src/clara/holidays.js` ist die EINE Quelle fuer
   "ist dieser Tag besonders?". Kein Modul raet das selbst.
6. **Umsatz-/Euro-Zahlen** gehoeren NICHT in Briefings oder Clara-Antworten
   (Vorgabe: separates Element mit Lena/Sophie).

## Mandanten (W-MANDANT, 30.08.2026)

- Registry: `src/tenants.js` — `aktiveMandanten()` = Praxen mit
  `mas_config/booking` + Default-Mandant (zzz-Testmandanten gefiltert,
  5-min-Cache). Hintergrundjobs laufen ueber `fuerAlleMandanten(job, fn)`
  mit Fehler-Isolation je Praxis — NEUE Scheduler-Bloecke nie fest auf
  `DEFAULT_CLIENT_ID` schreiben. Notaus `MAS_MULTI_TENANT_SCHEDULER=0`
  (exakt altes Verhalten), Override `MAS_MANDANTEN=id1,id2`.
- Requests: `resolveClientId(req)` ist die einzige Quelle des Mandanten;
  die Fernsteuerung (`/remote/*`) nimmt optional `clientId` an.
- Testmandant `praxis2` (clients/praxis2, Kalender "Dr. Vlachos") ist der
  stehende Mandantenfaehigkeits-Beweis — nicht loeschen. Smoke:
  `node scripts/smoke-praxis2.mjs` (Registry, Scheduler-Isolation, Buchung,
  Brain-Event, Gedaechtnis — alles mandanten-scharf).
- Lisa/Bianca-alt (ElevenLabs, `src/lisa/outbound.js`, `src/bianca/ingest.js`)
  bleibt BEWUSST single-tenant: wird durch die TelefonKI ersetzt
  (Chef 28.08.: "es geht nichts mehr zu elevenlabs").

## Kanonische Ordner (Stand 12.06.2026)

- `F:\MAS-2` — Backend (dieses Repo)
- `F:\Clara-Voice` — Sprach-Stack
- `F:\pickadoc-live-base` — Plattform-Frontend, einzige Deploy-Quelle
- `F:\MAS`, `TelefonKI v4.4/v5.2`, `pickadoc-platform*` sind Altbestand:
  **nicht hineinschreiben, nicht von dort deployen.**
