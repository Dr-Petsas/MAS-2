# Trennung Erlebnis-Demo / Clara v7 (Chef 19.08.2026)

## Regel (woertlich)

- Clara v7 dev bleibt unberuehrt, waehrend wir an der Demo entwickeln.
- Jede Aenderung am MAS muss autark sein: sie muss fuer sich allein stehen
  koennen oder nur additiv sein.
- Es darf nichts umgebaut werden, das Clara v7 veraendert.
- Ist ein solcher Umbau noetig: zuerst die Weiche festlegen, dann den
  betroffenen Code erst duplizieren und danach die Kopie anpassen.

## Was wo liegt

| Teil | Ordner / Prozess | Darf Clara v7 anfassen? |
|---|---|---|
| Telefon-Clara live | F:\Clara-Voice, Worker 8091 | NEIN |
| Clara v7 dev | F:\Clara-Voice-dev, Worker 8093 | NEIN |
| Demo-Sprache | F:\Clara-Voice-DemoClara, Worker 8094, LiveKit lokal 7880 | eigene Kopie |
| Haupt-MAS | F:\MAS-2, Port 4000 | Clara-Router unveraendert |
| Demo-MAS | F:\MAS-2\backend\src\demo-server.js, Port 4010 | nur /demo |
| Demo-Seite | F:\pickadoc-live-base\demo-erleben | nein |

## Weiche im Haupt-MAS

`DEMO_IM_HAUPTPROZESS` in `backend/src/server.js`:

- nicht `0` (Standard): Demo-Routen bleiben im Hauptprozess gemountet,
  damit ein Live-Neustart die oeffentliche Demo nicht totlegt, solange
  der Demo-MAS noch keinen eigenen Tunnel hat.
- `0`: Haupt-MAS dient keine `/demo`-Routen mehr. Dann muss
  `start-demo-mas.ps1` laufen, und die Demo-Seite zeigt auf Port 4010
  (`?mas=http://127.0.0.1:4010`).

Clara-Router, Clara-Scheduler und F:\Clara-Voice* werden von dieser
Weiche nicht veraendert.

## Was diese Trennung nicht ist

Wegwerf-Konten liegen weiter in derselben Firestore-Kundenliste
(`isDemoAccount`), sichtbar im Superuser — spaeter separat, wie vom Chef
erlaubt. Das ist Daten-Sichtbarkeit, kein Eingriff in Clara v7.
