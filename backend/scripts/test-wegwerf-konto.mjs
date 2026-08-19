// Reine Logik: Wegwerf-IDs und das Entwickler-Geheimnis.
//   node scripts/test-wegwerf-konto.mjs

import { slugify, clientIdFuer, geheimStimmt } from "../src/demo/wegwerfKonto.js";

let ok = 0;
let fehl = 0;
function pruef(name, bedingung, gefunden) {
  if (bedingung) { ok += 1; console.log(`  ok   ${name}`); }
  else { fehl += 1; console.log(`  FEHL ${name}${gefunden === undefined ? "" : ` -> ${JSON.stringify(gefunden)}`}`); }
}

console.log("1) Praxisname wird zur Konto-ID");
pruef("Umlaute", slugify("Zahnärzte am Löwentor").includes("zahnaerzte"));
pruef("leer wird praxis", slugify("") === "praxis");
const id = clientIdFuer({ id: "abcdefghij", praxis: "Praxis Dr. Petsas" });
pruef("Vorspann wegwerf-", id.startsWith("wegwerf-"), id);
pruef("Lead-Kuerzel steckt drin", id.includes("abcdefgh"), id);

console.log("2) Geheimnis ohne Datei / ohne Treffer");
pruef("leeres Geheimnis gilt nicht", geheimStimmt("") === false);
pruef("falsches Geheimnis gilt nicht", geheimStimmt("xxx-nicht-das-geheime") === false);

console.log(`\n${ok} ok, ${fehl} fehl`);
if (fehl) process.exit(1);
