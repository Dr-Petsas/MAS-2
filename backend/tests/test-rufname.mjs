// Ruf-Name der Assistentin (Phase W-NAME, Chef 26.08.2026):
// Genitiv, Text-Ersetzung und Default-Pfad duerfen nie brechen —
// der Name haengt im Push-/Sprachpfad (Anruf-Payload, Tour, Persona).

import "dotenv/config";
import {
  DEFAULT_ASSISTANT_NAME,
  getAssistantName,
  invalidateAssistantName,
  assistantNameGenitive,
  withAssistantName,
} from "../src/shared/rufname.js";

let ok = 0;
let fail = 0;
function check(name, cond, info = "") {
  if (cond) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

// --- Genitiv ---------------------------------------------------------------
check("Genitiv Standard", assistantNameGenitive("Luna") === "Lunas");
check("Genitiv s-Endung", assistantNameGenitive("Iris") === "Iris'");
check("Genitiv x-Endung", assistantNameGenitive("Alex") === "Alex'");
check("Genitiv leer -> Default", assistantNameGenitive("") === "Claras");

// --- withAssistantName -----------------------------------------------------
check(
  "Ersetzung Wortgrenze",
  withAssistantName("Clara ruft an. Claras Vorschlag.", "Luna") === "Luna ruft an. Lunas Vorschlag.",
);
check(
  "Default-Name = byte-identisch",
  withAssistantName("Clara ruft an.", "Clara") === "Clara ruft an.",
);
check(
  "kein Treffer mitten im Wort",
  withAssistantName("Deklaration bleibt.", "Luna") === "Deklaration bleibt.",
);
check("leerer Name = unveraendert", withAssistantName("Clara hilft.", "") === "Clara hilft.");
check("leerer Text bleibt leer", withAssistantName("", "Luna") === "");

// --- getAssistantName: Default-Pfade (nie werfen) ---------------------------
check("leere clientId -> Default", (await getAssistantName("")) === DEFAULT_ASSISTANT_NAME);
check("undefined -> Default", (await getAssistantName(undefined)) === DEFAULT_ASSISTANT_NAME);

// Nicht existenter Mandant: read-only Zugriff, muss Default liefern statt werfen.
// Ohne Firestore-Zugang (lokal ohne Credentials) greift der catch-Pfad — auch Default.
invalidateAssistantName();
const phantom = await getAssistantName("test-rufname-gibts-nicht");
check("unbekannter Mandant -> Default", phantom === DEFAULT_ASSISTANT_NAME, `bekam: ${phantom}`);

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
