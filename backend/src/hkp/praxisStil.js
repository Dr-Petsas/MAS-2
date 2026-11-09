// Praxisstil (Fallkatalog der Einrichtung): deterministische Regeln aus den hochgeladenen Plänen
// einer Praxis. PlanR schickt sie nach jedem vollständigen Upload (POST /planr/praxis-stil).
// Clara bekommt nur die Zeilen, deren Planart zum Satz passt. Keine Beträge, kein Modell.
// Notaus: MAS_PRAXIS_STIL=0.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORDNER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "praxis-stil");
const aus = () => String(process.env.MAS_PRAXIS_STIL || "").trim() === "0";
const dateiVon = (clientId) => path.join(ORDNER, `${String(clientId).replace(/[^A-Za-z0-9_-]/g, "_")}.json`);

const norm = (s) => String(s || "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[-/]+/g, " ")
  .replace(/[^a-z0-9.\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function wortDrin(wort, roh) {
  const n = norm(wort);
  if (!n) return false;
  if (n.includes(" ")) return roh.includes(n);
  return new RegExp(`\\b${esc(n)}`).test(roh);
}

const speicher = new Map();

function lesen(clientId) {
  if (!clientId) return [];
  if (speicher.has(clientId)) return speicher.get(clientId);
  let regeln = [];
  try {
    const d = JSON.parse(fs.readFileSync(dateiVon(clientId), "utf8"));
    if (Array.isArray(d.regeln)) regeln = d.regeln;
  } catch { /* noch nichts */ }
  speicher.set(clientId, regeln);
  return regeln;
}

/** Regeln säubern und je Praxis ablegen. Wirft nie. */
export function praxisStilMerken(clientId, roh) {
  if (aus() || !clientId) return { ok: false, regeln: 0 };
  const regeln = [];
  for (const r of Array.isArray(roh) ? roh.slice(0, 400) : []) {
    const zeile = String(r?.zeile || "").replace(/\s+/g, " ").trim().slice(0, 300);
    const slot = String(r?.slot || "").slice(0, 40);
    if (!zeile || !slot || /€|\beuro\b/i.test(zeile)) continue;
    const worte = (Array.isArray(r.worte) ? r.worte : []).map((w) => norm(w)).filter(Boolean).slice(0, 8);
    regeln.push({
      slot, zeile, worte,
      ebene: String(r.ebene || "").slice(0, 8),
      nr: String(r.nr || "").slice(0, 12),
      belegt: Number(r.belegt) || 0,
      von: Number(r.von) || 0,
    });
  }
  fs.mkdirSync(ORDNER, { recursive: true });
  const datei = dateiVon(clientId);
  fs.writeFileSync(`${datei}.tmp`, JSON.stringify({ gebaut: new Date().toISOString(), regeln }));
  fs.renameSync(`${datei}.tmp`, datei);
  speicher.set(clientId, regeln);
  return { ok: true, regeln: regeln.length };
}

export function praxisStilStand(clientId) {
  const regeln = aus() ? [] : lesen(clientId);
  return { regeln: regeln.length };
}

/**
 * Zeilen der Planarten, die der Satz am genauesten trifft.
 * Eine Mehrwort-Wendung wiegt mehr als ein einzelnes Wort, damit „private Krone“ nicht in der Kassenkrone landet.
 */
export function stilZeilen(regeln, satz, max = 12) {
  const roh = norm(satz);
  if (!roh || !regeln?.length) return [];
  const gruppen = new Map();
  for (const r of regeln) {
    const g = gruppen.get(r.slot) || { worte: r.worte || [], regeln: [] };
    g.regeln.push(r);
    gruppen.set(r.slot, g);
  }
  let best = 0;
  const scored = [];
  for (const g of gruppen.values()) {
    const score = g.worte.reduce((n, w) => n + (wortDrin(w, roh) ? (w.includes(" ") ? w.split(" ").length + 1 : 1) : 0), 0);
    if (score > best) best = score;
    if (score) scored.push({ score, regeln: g.regeln });
  }
  if (!best) return [];
  return scored.filter((s) => s.score === best)
    .flatMap((s) => s.regeln)
    .sort((a, b) => (b.belegt - a.belegt) || String(a.nr).localeCompare(String(b.nr)))
    .slice(0, max)
    .map((r) => r.zeile);
}

export function praxisStilAbschnitt(clientId, satz) {
  if (aus() || !clientId) return "";
  const zeilen = stilZeilen(lesen(clientId), satz);
  if (!zeilen.length) return "";
  return ["[PRAXISSTIL: Feste Regeln dieser Praxis aus ihren hochgeladenen Plänen. Passt der Fall, nennst du genau diese Positionen als den Weg dieser Praxis. Keine weiteren Praxisregeln, keine Beträge. Die Gebührenordnung prüft die Engine.]", ...zeilen].join("\n");
}

/** Nur für Tests. */
export function _praxisStilSetzen(clientId, regeln) { speicher.set(clientId, regeln); }
export function _praxisStilLeeren() { speicher.clear(); }
