/**
 * Prosa in die Karteikarte (05.11.2026).
 * Ablauf: Patient suchen und abgleichen, dann „Was soll ich eintragen?“,
 * dann das Diktat. Der Text landet als Nachdiktat am Termin, dieselbe Stelle
 * wie die übrige Behandlungsdoku.
 */

export const AKTE_WARTE_MS = 15 * 60 * 1000;

export function geburtSatz(iso) {
  const s = String(iso || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [jahr, monat, tag] = s.split("-");
  return `${tag}.${monat}.${jahr}`;
}

/** Name, und das Geburtsdatum, wenn die Kartei eines hat. */
export function werAus(sel) {
  const name = `${sel?.firstName || ""} ${sel?.lastName || ""}`.trim() || "den Patienten";
  const geboren = geburtSatz(sel?.birthDate);
  return geboren ? `${name}, geboren am ${geboren}` : name;
}

const NUR_JA = new Set([
  "ja", "jap", "jo", "genau", "richtig", "stimmt", "passt", "korrekt",
  "ok", "okay", "jawohl", "ja bitte", "ja genau", "eintragen", "trag ein", "so eintragen",
]);

export function istNurBestaetigung(text) {
  const n = String(text || "").trim().toLowerCase().replace(/[.!?,]+$/g, "");
  return NUR_JA.has(n);
}

export function frageNachText(wer) {
  return `Akte von ${wer}. Was soll ich eintragen?`;
}

export function frageBestaetigen(wer) {
  return `Akte von ${wer}. Soll ich das so in die Karteikarte eintragen?`;
}

/**
 * @returns {{ art: 'suchen' | 'fragen' | 'schreiben', text?: string, message?: string, patient?: object }}
 */
export function schritt({ text = "", confirm = false, wartet = null, jetzt = Date.now() } = {}) {
  const satz = String(text || "").trim();
  const alt = Number(wartet?.at || 0);
  const frisch = wartet && alt && jetzt - alt < AKTE_WARTE_MS ? wartet : null;
  const ja = confirm === true || istNurBestaetigung(satz);
  if (frisch && satz && !ja) return { art: "schreiben", text: satz, patient: frisch };
  if (frisch?.text && ja) return { art: "schreiben", text: frisch.text, patient: frisch };
  if (frisch) return { art: "fragen", message: frageNachText(frisch.wer), patient: frisch };
  return { art: "suchen" };
}
