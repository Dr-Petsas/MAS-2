// Vorlesen vor der HKP-Anlage und Rueckfrage bei gleich klingenden Patienten.
// Pure Funktionen (kein I/O).
import { zahlWort, liste } from "./sprech.js";

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
export const KIEFER_ZAEHNE = { OK, UK };
const KIEFER_NAME = { OK: "Oberkiefer", UK: "Unterkiefer" };

// eHKP-Befundkuerzel -> gesprochene Gruppe (Reihenfolge = Vorlese-Reihenfolge)
const BEFUND_WORT = [
  ["x", "nicht erhaltungswürdig"],
  ["ww", "weitgehend zerstört"],
  ["pw", "mit Teildefekt"],
  ["ur", "unzureichende Retention"],
  ["k", "überkront"],
  ["kw", "Krone erneuerungsbedürftig"],
  ["t", "Teleskop vorhanden"],
  ["tw", "Teleskop erneuerungsbedürftig"],
  ["e", "ersetzt"],
  ["ew", "ersetzt und erneuerungsbedürftig"],
  ["b", "Brückenglied"],
  ["bw", "Brückenglied erneuerungsbedürftig"],
  ["i", "Implantat"],
  ["ix", "Implantat nicht erhaltungswürdig"],
  [")(", "Lückenschluss"],
];

/** Zusammenhaengende Zaehne in Kieferreihenfolge zu "14 bis 18" bzw. "13 bis 23" */
export function zahnBereiche(zaehne, kiefer) {
  const ordnung = KIEFER_ZAEHNE[kiefer] || [...OK, ...UK];
  const pos = zaehne.map((z) => ordnung.indexOf(String(z))).filter((i) => i >= 0).sort((a, b) => a - b);
  const laeufe = [];
  for (const i of pos) {
    const l = laeufe[laeufe.length - 1];
    if (l && i === l[l.length - 1] + 1) l.push(i);
    else laeufe.push([i]);
  }
  const teile = [];
  for (const l of laeufe) {
    const zs = l.map((i) => ordnung[i]);
    if (zs.length < 3) { teile.push(...zs); continue; }
    const a = zs[0], b = zs[zs.length - 1];
    teile.push(a[0] === b[0] ? `${Math.min(a, b)} bis ${Math.max(a, b)}` : `${a} bis ${b}`);
  }
  return teile;
}

/** "Oberkiefer: es fehlen 14 bis 18 und 24 bis 28; vorhanden sind 13 bis 23." */
export function befundSatz(zaehne, kiefer) {
  const saetze = [];
  for (const k of kiefer.filter((x) => KIEFER_ZAEHNE[x])) {
    const nachCode = new Map();
    for (const z of KIEFER_ZAEHNE[k]) {
      const c = String(zaehne?.[z]?.B ?? zaehne?.[z] ?? "").trim();
      nachCode.set(c, [...(nachCode.get(c) || []), z]);
    }
    const teile = [];
    const fehlt = nachCode.get("f") || [];
    nachCode.delete("f");
    if (fehlt.length === KIEFER_ZAEHNE[k].length) teile.push("alle Zähne fehlen");
    else if (fehlt.length) teile.push(`es ${fehlt.length === 1 ? "fehlt" : "fehlen"} ${liste(zahnBereiche(fehlt, k))}`);
    for (const [code, wort] of BEFUND_WORT) {
      const zs = nachCode.get(code);
      if (!zs?.length) continue;
      teile.push(`${wort}: ${liste(zahnBereiche(zs, k))}`);
      nachCode.delete(code);
    }
    const vorhanden = nachCode.get("") || [];
    nachCode.delete("");
    for (const [code, zs] of nachCode) teile.push(`Befund ${code}: ${liste(zahnBereiche(zs, k))}`);
    if (vorhanden.length === KIEFER_ZAEHNE[k].length) teile.push("alle Zähne vorhanden");
    else if (vorhanden.length) teile.push(`vorhanden: ${liste(zahnBereiche(vorhanden, k))}`);
    saetze.push(`${KIEFER_NAME[k]}: ${teile.join("; ")}.`);
  }
  return saetze.join(" ");
}

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const ORDINAL_TAG = ["", "ersten", "zweiten", "dritten", "vierten", "fünften", "sechsten", "siebten", "achten", "neunten", "zehnten",
  "elften", "zwölften", "dreizehnten", "vierzehnten", "fünfzehnten", "sechzehnten", "siebzehnten", "achtzehnten", "neunzehnten",
  "zwanzigsten", "einundzwanzigsten", "zweiundzwanzigsten", "dreiundzwanzigsten", "vierundzwanzigsten", "fünfundzwanzigsten",
  "sechsundzwanzigsten", "siebenundzwanzigsten", "achtundzwanzigsten", "neunundzwanzigsten", "dreißigsten", "einunddreißigsten"];

export function jahrWort(j) {
  const n = Number(j);
  if (n >= 1100 && n < 2000) return `${zahlWort(Math.floor(n / 100))}hundert${n % 100 ? zahlWort(n % 100) : ""}`;
  return zahlWort(n);
}

/** "geboren am zehnten Mai neunzehnhundertzweiundsiebzig" bzw. Hinweis ohne Datum */
export function geburtSprech(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "in der Kartei ohne Geburtsdatum";
  return `geboren am ${ORDINAL_TAG[Number(m[3])]} ${MONATE[Number(m[2]) - 1]} ${jahrWort(m[1])}`;
}

export const jahrgang = (p) => (/^\d{4}/.test(String(p?.birthDate || "")) ? String(p.birthDate).slice(0, 4) : "");

const ORDINAL = ["erstens", "zweitens", "drittens", "viertens", "fünftens"];

function vetterLabel(p) {
  const name = `${p.firstName || ""} ${p.lastName || ""}`.replace(/\s+/g, " ").trim();
  const j = jahrgang(p);
  if (j) return `${name}, Jahrgang ${jahrWort(j)}`;
  const angelegt = /^(\d{4})-(\d{2})/.exec(String(p.createdAt || ""));
  return `${name}, ohne Geburtsdatum${angelegt ? `, angelegt im ${MONATE[Number(angelegt[2]) - 1]} ${jahrWort(angelegt[1])}` : ""}`;
}

/** Rueckfrage bei gleich klingenden Kartei-Eintraegen (Petsas/Petzas) */
export function vetternFrage(kandidaten, { erneut = false } = {}) {
  const pool = kandidaten.slice(0, ORDINAL.length);
  const aufzaehlung = pool.map((p, i) => `${ORDINAL[i]} ${vetterLabel(p)}`).join("; ");
  if (erneut) {
    return `Die Namen klingen gleich, deshalb brauche ich den Unterschied: ${aufzaehlung}. Welchen meinen Sie – den ersten oder den zweiten, oder nennen Sie den Jahrgang?`;
  }
  const anzahl = pool.length === 2 ? "zwei" : zahlWort(pool.length);
  return `Vorsicht, in der Kartei gibt es ${anzahl} gleich klingende Einträge: ${aufzaehlung}. Welchen meinen Sie?`;
}

/** Wahl per Jahrgang ("der von 1972") oder "ohne Geburtsdatum" */
export function jahrgangWahl(text, kandidaten) {
  const t = String(text || "").toLowerCase();
  const jahre = [...t.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => m[1]);
  const kurz = [...t.matchAll(/\b(?:jahrgang|von|aus|geboren|baujahr)\s+(?:neunzehnhundert)?(\d{2})\b/g)].map((m) => m[1]);
  if (jahre.length || kurz.length) {
    const treffer = kandidaten.filter((p) => jahre.includes(jahrgang(p)) || kurz.includes(jahrgang(p).slice(2)));
    return treffer.length === 1 ? treffer[0] : null;
  }
  if (/ohne\s+(geburts|datum|jahrgang)|kein(en)?\s+(geburts|jahrgang)/.test(t)) {
    const ohne = kandidaten.filter((p) => !jahrgang(p));
    return ohne.length === 1 ? ohne[0] : null;
  }
  return null;
}

/** Vorlese-Frage vor der Anlage */
export function vorleseSatz({ patient, versorgungText, kiefer, zaehne, versorgung, summen = "", doppelt = "" }) {
  const anrede = patient.anredeLabel?.startsWith("Herrn ") ? "Herrn " : patient.anredeLabel?.startsWith("Frau ") ? "Frau " : "";
  const name = `${anrede}${patient.firstName || ""} ${patient.lastName || ""}`.replace(/\s+/g, " ").trim();
  const befund = befundSatz(zaehne || {}, kiefer);
  return `Bevor ich anlege, bitte prüfen: ${versorgungText} für ${name}, ${geburtSprech(patient.birthDate)}.`
    + `${befund ? ` Befund ${befund}` : ""}${versorgung ? ` Geplant: ${versorgung}.` : ""}`
    + `${summen ? ` Voraussichtlich ${summen}.` : ""}${doppelt ? ` ${doppelt}` : ""} Soll ich den Entwurf so anlegen?`;
}
