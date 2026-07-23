# shared/ — neutrale, geteilte Bausteine

Hier liegt Code, den **sowohl Clara als auch Lena** brauchen und der keinem der
beiden allein "gehoert". Ziel: keine Duplikate, eine einzige Wahrheit.

## Regeln

- Nur **wirklich geteilte, seiteneffektarme** Helfer hierher (z. B. reine
  Utility-Funktionen ohne Clara-/Lena-spezifische Logik).
- Abhaengigkeitsrichtung: `clara -> shared` und `lena -> shared` sind erlaubt.
  `shared` darf **weder** von `clara` **noch** von `lena` importieren
  (sonst entstehen Zyklen).
- Beim Herausloesen einer bestehenden Funktion: am alten Pfad einen Re-Export
  (`export * from "../shared/<datei>.js"`) stehen lassen, damit bestehende
  Imports (v. a. Claras) unveraendert weiterfunktionieren.

## Kandidaten (noch nicht verschoben, Stand 23.07.2026)

- `inventsNumbers`  aus `../clara/summarize.js`  (genutzt von Clara + Lena)
- `writeTreatmentSummaryEvent` aus `../clara/treatmentDoc.js` (genutzt von Lena)

> Verschiebung erfolgt erst mit Git-Tag als Rollback und identischem
> Vorher/Nachher-Testlauf.
