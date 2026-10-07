// Registerfragen mit Zeitbezug ("Welche HKPs haben wir heute geschrieben?",
// "Was wurde diese Woche freigegeben?"). Clara gibt die Frage woertlich als
// `frage` weiter; Zeitraum und Ereignis werden HIER bestimmt, nie vom Modell.
import { resolveDateRange } from "../clara/dateRange.js";
import { zahlWort } from "./sprech.js";

const TZ = "Europe/Berlin";

/** Kalendertag (YYYY-MM-DD) in deutscher Zeit */
export function berlinTag(wann = new Date()) {
  const d = wann instanceof Date ? wann : new Date(wann);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function plusTage(tag, n) {
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const EINZELTAG = [
  [/\bvorgestern\b/, -2, "Vorgestern"],
  [/\bgestern\b/, -1, "Gestern"],
  [/\bheute?\b/, 0, "Heute"],
];

// Satzanfang je Label aus resolveDateRange; Zukunft und Jahreszeiten zaehlen nicht.
const VORSATZ = {
  "diese Woche": "Diese Woche", "letzte Woche": "Letzte Woche", "vorletzte Woche": "Vorletzte Woche",
  "dieser Monat": "Diesen Monat", "letzter Monat": "Letzten Monat",
  "dieses Quartal": "In diesem Quartal", "letztes Quartal": "Im letzten Quartal",
  "dieses Jahr": "Dieses Jahr", "letztes Jahr": "Letztes Jahr",
};

/** { von, bis, vorsatz } oder null. `bis` endet spaetestens heute. */
export function zeitraumAus(text, jetzt = new Date()) {
  const t = String(text || "").toLowerCase();
  const heute = berlinTag(jetzt);
  if (!t || !heute) return null;
  for (const [re, n, vorsatz] of EINZELTAG) {
    if (re.test(t)) {
      const tag = plusTage(heute, n);
      return { von: tag, bis: tag, vorsatz };
    }
  }
  const r = resolveDateRange(t, heute);
  if (!r) return null;
  const tage = /^letzte (\d+) Tage$/.exec(r.label);
  const vorsatz = tage ? `In den letzten ${zahlWort(Number(tage[1]))} Tagen` : VORSATZ[r.label];
  if (!vorsatz) return null;
  return { von: r.from, bis: r.to > heute ? heute : r.to, vorsatz };
}

const FREIGABE_RE = /\bfreigegeben\b|\bfreigeben\s+(?:lassen|worden)\b/;
const VERWORFEN_RE = /\bverworfen\b|\bgel(?:ö|oe)scht\b/;
const ZUSTAND_RE = /\bwarte\w*|\boffen\b|\bnoch nicht freigegeben\b/;

/**
 * Was die Registerfrage zaehlt: "erstellt" (Standard), "freigegeben" oder "verworfen".
 * Ohne Ereigniswort ist "heute" bei "Was wartet heute noch auf Freigabe?" ein
 * Zustand, kein Erstellungstag -> null.
 */
export function ereignisAus(text) {
  const t = String(text || "").toLowerCase();
  if (/\bnoch nicht freigegeben\b/.test(t)) return null;
  if (FREIGABE_RE.test(t)) return "freigegeben";
  if (VERWORFEN_RE.test(t)) return "verworfen";
  if (ZUSTAND_RE.test(t)) return null;
  return "erstellt";
}

const zeitpunkt = (h, ereignis) => (ereignis === "freigegeben" ? h.freigegeben
  : ereignis === "verworfen" ? h.aktualisiert : h.erstellt);

/** HKPs, deren Ereignis im Zeitraum liegt (neueste zuerst) */
export function imZeitraum(alle, zr, ereignis) {
  return alle.filter((h) => {
    if (ereignis === "freigegeben" && !h.freigegeben) return false;
    if (ereignis === "verworfen" && h.status !== "verworfen") return false;
    const tag = berlinTag(zeitpunkt(h, ereignis));
    return tag && tag >= zr.von && tag <= zr.bis;
  }).sort((a, b) => String(zeitpunkt(b, ereignis)).localeCompare(String(zeitpunkt(a, ereignis))));
}
