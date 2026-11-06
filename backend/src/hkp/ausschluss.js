// Ausschluss-Tabelle (W-PLANR-FREI, Chef 06.11.2026: "bei Konflikt gewinnt die Tabelle").
// Gebaut aus den Bestimmungstexten der Wissensbasis (Feld h in wissen/abrechnung.json), nicht von Hand gepflegt:
// jedes Paar traegt den Originalsatz und die Nummer, bei der er steht. Genutzt fuer Abrechnungsantworten und als
// Pruefung jedes gerechneten Plans. Keine Preise, keine Punktwerte.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATEI = path.join(path.dirname(fileURLToPath(import.meta.url)), "wissen", "abrechnung.json");

const ABKUERZUNG = /\b(Nr|bzw|ggf|z\. ?B|vgl|Abs|i\. ?V|u\. ?a)\.\s/g;
// Satzteile ohne Ausschluss: Erlaubnisse, Halbierungen, Begruendungspflichten
const KEIN_AUSSCHLUSS = /möglich|gesondert|nur bei|Hälfte|Drittel|begründen|daneben/i;
const BEDINGUNGEN = [
  [/zahn-\s*\/\s*sitzungsgleich/i, "am selben Zahn in derselben Sitzung", "zahn"],
  [/(?:für|am) denselben Zahn/i, "am selben Zahn", "zahn"],
  [/(?:in der gleichen|in derselben|in gleicher) Sitzung/i, "in derselben Sitzung", "sitzung"],
  [/je Behandlungstag/i, "am selben Behandlungstag", "sitzung"],
  [/Eingliederungssitzung/i, "in der Eingliederungssitzung", "sitzung"],
  [/dieselbe Kieferhälfte oder denselben Frontzahnbereich/i, "in derselben Kieferhälfte oder demselben Frontzahnbereich", "gebiet"],
  [/dasselbe Operationsgebiet/i, "im selben Operationsgebiet", "gebiet"],
  [/dieselbe Implantatkavität/i, "an derselben Implantatkavität", "zahn"],
];
const KOMMENTAR_QUELLE = [[/BZÄK/, "Hinweis der BZÄK"], [/Beratungsforum/, "Beratungsforum"], [/Liebold|Raff|Wissing/, "Kommentar Liebold/Raff/Wissing"]];

let tabelle = null;

function saetze(h) {
  return String(h || "").replace(ABKUERZUNG, (m) => m.replace(/\.\s$/, ".\u00a0"))
    // Die Texte kleben oft ohne Leerzeichen aneinander ("berechnungsfähig.Die Leistung")
    .split(/(?<=;)\s*|(?<=[a-zäöüß)\]][.!])\s*(?=[A-ZÄÖÜ])|(?<=\.)\s+(?=[A-ZÄÖÜ])/).map((s) => s.replace(/\u00a0/g, " ").trim()).filter(Boolean);
}

const zahlWert = (n) => Number.parseInt(String(n).replace(/\D/g, ""), 10);

// Nummern, die im Satz stehen, aber im Katalog der Wissensbasis fehlen, zaehlen mit, wenn sie
// die Form des Katalogs haben. Klammern (Analognummern, Jahreszahlen, Quellen) werden vorher entfernt.
// BEMA 119 und 120 gibt es im BEMA-Katalog nicht; die werden nicht erfunden.
const FORM = { GOZ: /^\d{4}$/, BEMA: /^(?:\d{1,3}[a-z]?|[A-Z]{1,2}\d{1,2}[a-z]?)$/ };

/** Nummern eines Satzteils; "2150 bis 2170" wird ueber den Katalog ausgeschrieben */
function nummern(teil, katalog, k = "") {
  const s = String(teil || "").replace(/\([^)]*\)/g, " ");
  const raus = new Set();
  for (const m of s.matchAll(/\b([A-Za-zÄä]{0,2}\d{1,4}[a-z]?)\s+bis\s+([A-Za-zÄä]{0,2}\d{1,4}[a-z]?)\b/g)) {
    const [von, bis] = [katalog.get(m[1].toLowerCase()), katalog.get(m[2].toLowerCase())];
    if (!von || !bis) continue;
    const [a, b] = [zahlWert(von), zahlWert(bis)];
    for (const n of katalog.values()) if (zahlWert(n) >= a && zahlWert(n) <= b) raus.add(n);
  }
  for (const m of s.matchAll(/\b[A-Za-zÄä]{0,2}\d{1,4}[a-z]?\b/g)) {
    const n = katalog.get(m[0].toLowerCase()) || (FORM[k]?.test(m[0]) && !/^(?:19|20)\d\d$/.test(m[0]) ? m[0] : "");
    if (n) raus.add(n);
  }
  return [...raus];
}

/** Liste hinter "neben": endet vor Klammer-Kommentaren und angehaengten Nebenregeln */
const listenEnde = (s) => s.split(/\(| – | und nicht in /)[0];

function quelleVon(satz, h) {
  if (/nach (?:der|den) Nummer|^(?:Die|Der|Neben den|Neben der) (?:Leistung|Zuschl)/.test(satz)) return "Abrechnungsbestimmung";
  for (const [re, name] of KOMMENTAR_QUELLE) if (re.test(satz) || re.test(h)) return name;
  return "Hinweis der Wissensbasis";
}

/** Ein Satz -> [{ a: [...], b: [...] }] oder null */
function paareAus(satz, eigene, katalog, k) {
  if (!/neben/i.test(satz) || !/\bnicht\b/i.test(satz) || KEIN_AUSSCHLUSS.test(satz)) return null;
  if (/nebeneinander/i.test(satz)) {
    const alle = nummern(satz, katalog, k);
    return alle.length >= 2 ? { a: alle, b: alle } : null;
  }
  const t = satz.trim();
  if (/^neben\b/i.test(t)) {
    const verb = t.search(/\b(?:sind|ist)\b/);
    if (verb < 0) return null;
    return { a: nummern(t.slice(5, verb), katalog, k), b: nummern(listenEnde(t.slice(verb)), katalog, k) };
  }
  const i = t.search(/\bneben\b/i);
  const vorn = nummern(t.slice(0, i), katalog, k);
  return { a: vorn.length ? vorn : [eigene], b: nummern(listenEnde(t.slice(i)), katalog, k) };
}

function bauen(basis) {
  const kataloge = new Map();
  for (const z of basis.ziffern || []) {
    if (!kataloge.has(z.k)) kataloge.set(z.k, new Map());
    kataloge.get(z.k).set(String(z.n).toLowerCase(), String(z.n));
  }
  const eintraege = new Map();
  for (const z of basis.ziffern || []) {
    if (!z.h) continue;
    const katalog = kataloge.get(z.k);
    for (const satz of saetze(z.h)) {
      const p = paareAus(satz, String(z.n), katalog, z.k);
      if (!p) continue;
      const [bedingung, art] = (BEDINGUNGEN.find(([re]) => re.test(satz)) || [null, "", "sitzung"]).slice(1);
      const quelle = quelleVon(satz, z.h);
      for (const a of p.a) for (const b of p.b) {
        if (a === b) continue;
        const key = `${z.k}|${[a, b].sort().join("|")}`;
        const alt = eintraege.get(key);
        if (alt && (alt.quelle === "Abrechnungsbestimmung" || quelle !== "Abrechnungsbestimmung")) continue;
        eintraege.set(key, { k: z.k, a, b, bedingung, art, quelle, bei: String(z.n), satz });
      }
    }
  }
  return [...eintraege.values()];
}

export function ausschlussTabelle() {
  return (tabelle ??= bauen(JSON.parse(fs.readFileSync(DATEI, "utf8"))));
}

/** Fuer Tests: Tabelle aus einer eigenen Basis */
export function _ausschlussAus(basis) {
  return bauen(basis);
}

const klein = (s) => String(s || "").toLowerCase();

/** Ausschluesse zwischen den genannten Nummern; katalog optional (GOZ, BEMA, ...) */
export function ausschluesseZwischen(nrn, katalog = "") {
  const set = new Set([...nrn].map(klein));
  return ausschlussTabelle().filter((e) => (!katalog || e.k === katalog) && set.has(klein(e.a)) && set.has(klein(e.b)));
}

/** Gesprochener Satz mit Fundstelle */
export function ausschlussSatz(e) {
  const wo = e.quelle === "Abrechnungsbestimmung" ? `der Abrechnungsbestimmung zur ${e.k} ${e.bei}` : `${e.quelle} zur ${e.k} ${e.bei}`;
  return `Laut ${wo} ist die ${e.k} ${e.a} nicht neben der ${e.k} ${e.b} berechnungsfähig${e.bedingung ? `, ${e.bedingung}` : ""}.`;
}

function zaehneVon(zahn) {
  const s = String(zahn || "").trim();
  if (!s) return null;
  const raus = new Set();
  for (const teil of s.split(/[,\s]+/).filter(Boolean)) {
    const m = teil.match(/^(\d{2})-(\d{2})$/);
    if (m && m[1][0] === m[2][0]) {
      const [a, b] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
      for (let z = a; z <= b; z++) raus.add(String(z));
    } else raus.add(teil);
  }
  return raus;
}

/**
 * Pruefung eines gerechneten Plans: Paare aus der Tabelle, die beide im Plan stehen.
 * positionen: [{ ebene, nr, zahn }]. Bei zahngebundenen Ausschluessen zaehlt nur derselbe Zahn.
 * -> [{ ...eintrag, satz: gesprochener Satz }]
 */
export function planPruefen(positionen) {
  const pos = (positionen || []).filter((p) => p && p.nr && p.ebene);
  const treffer = [];
  for (const e of ausschlussTabelle()) {
    const as = pos.filter((p) => p.ebene === e.k && klein(p.nr) === klein(e.a));
    const bs = pos.filter((p) => p.ebene === e.k && klein(p.nr) === klein(e.b));
    if (!as.length || !bs.length) continue;
    const gleicherZahn = as.some((x) => bs.some((y) => {
      const [za, zb] = [zaehneVon(x.zahn), zaehneVon(y.zahn)];
      return !za || !zb || [...za].some((z) => zb.has(z));
    }));
    if (e.art === "zahn" && !gleicherZahn) continue;
    treffer.push({ ...e, hinweis: ausschlussSatz(e) });
  }
  return treffer;
}

/** Positionen eines Engine-Ergebnisses (Kasse: ergebnis.positionen, privat: kalkulation.honorar, Sprachplaene: plan) */
export function positionenVon(r) {
  const alle = [r?.ergebnis?.positionen, r?.kalkulation?.honorar, r?.plan?.positionen, r?.positionen]
    .filter(Array.isArray).flat().filter((p) => p && p.nr && p.ebene);
  const gesehen = new Set();
  return alle.filter((p) => {
    const key = `${p.ebene}|${p.nr}|${p.zahn || ""}`;
    return gesehen.has(key) ? false : gesehen.add(key);
  });
}
