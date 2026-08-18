// Lisas Agenten-Prompt: feste Praxis raus (Chef 18.08.2026).
//
// Anforderung im Wortlaut: "lisa muss sich von der richtigen praxis unter dem
// richtigen doktor melden."
//
// Befund: Im ElevenLabs-Agenten stand die Praxis dreimal FEST im Text —
//   Zeile  1: "Du bist Lisa, Telefonassistentin von Dr. Petsas."
//   Zeile 25: "Hallo, hier ist Lisa aus der Praxis Dr. Petsas." (Beispiel)
//   Zeile 92: dieselbe Zeile im zweiten Beispiel
// Damit meldet sich Lisa fuer JEDEN Mandanten als Praxis Dr. Petsas: falsch fuer
// jede zweite Praxis und fuer die Erlebnis-Demo, in der sie den Interessenten
// unter dessen eigenem Praxisnamen anrufen soll.
//
// Gegenstueck im Code: src/lisa/identitaet.js schickt die Identitaet pro Anruf
// im {{task_prompt}} mit (identitaetsRahmen). Dieses Skript nimmt dem Prompt nur
// die falsche Behauptung und verweist auf den Auftrag. KEINE neuen Variablen —
// der Agent kennt nur {{task_prompt}} und {{call_language}}, und ein Prompt, der
// eine nicht gelieferte Variable nennt, wuerde am Telefon als Rohtext auftauchen.
//
//   node scripts/lisa-agent-praxis-fix.mjs           (Vorschau, aendert nichts)
//   node scripts/lisa-agent-praxis-fix.mjs --apply   (schreiben, mit Sicherung)
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const KEY = process.env.ELEVENLABS_API_KEY;
const ID = process.env.LISA_AGENT_ID;

if (!KEY || !ID) {
  console.error("ELEVENLABS_API_KEY oder LISA_AGENT_ID fehlt in der .env — Abbruch.");
  process.exit(1);
}

const NEUE_ROLLE =
  "Du bist Lisa, Telefonassistentin einer Zahnarztpraxis. WELCHE Praxis du "
  + "vertrittst, steht als Identitaet im {{task_prompt}} — stelle dich immer mit "
  + "genau dieser Praxis vor und nenne niemals eine andere Praxis oder einen "
  + "anderen Arzt. Du fuehrst Outbound-Anrufe durch.";

const NEUES_BEISPIEL = "„Hallo, hier ist Lisa aus der Praxis <Praxisname aus dem Auftrag>.";

const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${ID}`, {
  headers: { "xi-api-key": KEY },
});
if (!r.ok) {
  console.error("Agent nicht abrufbar:", r.status, await r.text());
  process.exit(1);
}
const agent = await r.json();
const alt = agent?.conversation_config?.agent?.prompt?.prompt || "";
if (!alt) {
  console.error("Kein Prompt im Agenten gefunden — Abbruch.");
  process.exit(1);
}

const treffer = (alt.match(/Petsas/g) || []).length;
console.log(`Prompt geladen: ${alt.length} Zeichen, "Petsas" kommt ${treffer}x vor.`);
if (!treffer) {
  console.log("Nichts zu tun — die feste Praxis ist schon heraus.");
  process.exit(0);
}

let neu = alt;
// 1) Rollensatz am Anfang.
const rolleRe = /Du bist Lisa, Telefonassistentin von Dr\.? ?Petsas\.[^\n]*/;
if (rolleRe.test(neu)) {
  neu = neu.replace(rolleRe, NEUE_ROLLE);
  console.log("OK    Rollensatz ersetzt (keine feste Praxis mehr).");
} else {
  console.log("FEHLT Rollensatz nicht gefunden — bitte von Hand pruefen.");
}

// 2) Beispielzeilen ("Hallo, hier ist Lisa aus der Praxis Dr. Petsas.").
const beispielRe = /„?Hallo, hier ist Lisa aus der Praxis Dr\.? ?Petsas\./g;
const anzahl = (neu.match(beispielRe) || []).length;
neu = neu.replace(beispielRe, NEUES_BEISPIEL);
console.log(`OK    ${anzahl} Beispielzeile(n) auf den Auftrag umgestellt.`);

// 3) Rest absichern: sollte irgendwo noch "Petsas" stehen, sagen wir es laut,
// statt es stillschweigend stehen zu lassen.
const restlich = (neu.match(/Petsas/g) || []).length;
if (restlich) {
  console.log(`ACHTUNG "Petsas" steht noch ${restlich}x im Prompt:`);
  neu.split(/\r?\n/).forEach((z, i) => {
    if (z.includes("Petsas")) console.log(`  Zeile ${i + 1}: ${z}`);
  });
}

if (neu === alt) {
  console.error("Prompt unveraendert — Abbruch, damit nichts Halbes geschrieben wird.");
  process.exit(1);
}
console.log(`\nLaenge: ${alt.length} -> ${neu.length}`);

if (APPLY) {
  // Sicherung: der alte Prompt bleibt als Datei liegen, damit ein Rueckbau ohne
  // ElevenLabs-Historie moeglich ist.
  const stempel = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const sicher = path.join("config-snapshots", `lisa-prompt-vor-praxis-fix-${stempel}.txt`);
  await fs.writeFile(sicher, alt, "utf8");
  console.log(`Sicherung geschrieben: ${sicher}`);

  const p = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${ID}`, {
    method: "PATCH",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_config: { agent: { prompt: { prompt: neu } } } }),
  });
  if (!p.ok) {
    console.error("PATCH fehlgeschlagen:", p.status, await p.text());
    process.exitCode = 1;
  } else {
    console.log("Prompt aktualisiert. Lisa nennt jetzt die Praxis aus dem Auftrag.");
  }
} else {
  console.log("\n--- neuer Rollensatz ---");
  console.log(neu.split(/\r?\n/)[0]);
  console.log("\n--- neue Beispielzeile ---");
  console.log(NEUES_BEISPIEL);
  console.log("\nTrockenlauf. Mit --apply schreiben.");
}
