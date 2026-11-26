// Welche Praxen ausser der Standardpraxis duerfen zur Clara V8? (26.11.2026)
//
// Die Clara V8 kann mehrere Praxen bedienen: jedes Gespraech bringt seine Praxis im Raumnamen und im
// Token mit. Umgeschaltet wird eine Praxis aber nie von selbst, sondern ueber eine Liste, die anfangs
// leer ist. Ohne Eintrag bleibt eine Praxis bei ihrem bisherigen Worker - genau wie vor dieser Datei.
//
// Liste: F:\Clara-V8\.run\praxen.txt (CLARA_V8_PRAXEN), eine Praxis je Zeile:
//   <clientId>        die Praxis laeuft auf der Clara V8, sobald die Betriebsmarke auf v8 steht
//   <clientId>=test   nur auf ausdruecklichen Wunsch (?ziel=v8), sonst weiter der bisherige Worker
//   # Kommentar
// Die Datei wird bei jedem Gespraechsbeginn gelesen; eine Aenderung braucht keinen Neustart.
// Notaus CLARA_V8=0 (keine Praxis geht zur V8) bzw. Zeile loeschen.

import fs from "node:fs";

const PFAD = (process.env.CLARA_V8_PRAXEN || "F:\\Clara-V8\\.run\\praxen.txt").trim();
const ZEICHEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";

function kennungGueltig(id) {
  return id.length > 0 && id.length <= 64 && [...id].every((z) => ZEICHEN.includes(z));
}

/** Text der Liste -> Map(clientId -> "voll" | "test"). Unlesbare Zeilen zaehlen nicht. */
export function praxenAusText(text) {
  const liste = new Map();
  for (const roh of String(text || "").split("\n")) {
    const zeile = roh.split("#")[0].trim();
    if (!zeile) continue;
    const i = zeile.indexOf("=");
    const id = (i < 0 ? zeile : zeile.slice(0, i)).trim();
    const art = i < 0 ? "voll" : zeile.slice(i + 1).trim().toLowerCase();
    if (!kennungGueltig(id) || (art !== "voll" && art !== "test")) continue;
    liste.set(id, art);
  }
  return liste;
}

export function praxenLesen(pfad = PFAD) {
  try { return praxenAusText(fs.readFileSync(pfad, "utf8")); } catch { return new Map(); }
}

/**
 * Ziel fuer eine Praxis, die NICHT die Standardpraxis ist: "v8" oder "alt".
 * Reine Entscheidung, alle Umstaende kommen als Argument.
 *   eintrag   "voll" | "test" | undefined (nicht in der Liste)
 *   wunsch    ?ziel= aus der Anfrage
 *   v8Laeuft  der Agent der Clara V8 nimmt Gespraeche an
 *   betrieb   die Betriebsmarke steht auf v8
 *   notaus    CLARA_V8=0
 */
export function zielFuerWeiterePraxis({ eintrag, wunsch, v8Laeuft, betrieb, notaus }) {
  if (notaus || !eintrag || !v8Laeuft) return "alt";
  const gewuenscht = String(wunsch || "").toLowerCase() === "v8";
  if (eintrag === "test") return gewuenscht ? "v8" : "alt";
  return betrieb || gewuenscht ? "v8" : "alt";
}
