// Nachschlagen in der Abrechnungswissensbasis. Die ganze Liste liegt in
// wissen/abrechnung.json (node scripts/abrechnung-wissen.mjs). In den Prompt
// kommt nur der Ausschnitt, der zum Satz passt. Preise stehen nicht drin.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { praxisWissenSuchen, praxisZeilen } from "./praxisWissen.js";
import { praxisStilAbschnitt } from "./praxisStil.js";

const DATEI = path.join(path.dirname(fileURLToPath(import.meta.url)), "wissen", "abrechnung.json");
const VEKTOR_DATEI = path.join(path.dirname(fileURLToPath(import.meta.url)), "wissen", "abrechnung.vektoren.json");
let basis = null;
const laden = () => (basis ??= JSON.parse(fs.readFileSync(DATEI, "utf8")));

export const kurzHash = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 12);
/** Text, der für die Bedeutungssuche eingebettet wird (Quelltext "t" oder Ziffer "z"). */
export const eintragText = (art, x) => (art === "t" ? `${x.q}. ${x.t}` : `${x.k} ${x.n}: ${x.t}${x.h ? `. ${x.h}` : ""}`);
export const eintragSchluessel = (art, x) => (art === "t" ? `t|${kurzHash(`${x.q}|${x.s}|${x.t}`)}` : `z|${x.k}|${x.n}`);

const STOP = new Set(`befund plan plaene zahn zaehne kiefer oberkiefer unterkiefer bitte etwas
aendern handy steht stehen noch soll sollen wir fuer eine einen einer einem beim patient patienten
herrn frau genau stimmt passt aktuell dampsoft nehmen neuen neue aufnehmen mal erst muss muessen sitzung sitzungen
den dem die das und oder mit von auf im zu zur zum ja nein nee okay richtig schon hier dann auch
nicht mehr sehr ganz oben unten beide dieser diese dieses einen einen werde werden wird sein sind
habe haben moechte moechte einen heil kostenplan erstellen`.split(/\s+/).filter(Boolean));

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

function stamm(w) {
  return w.replace(/(en|er|e|n)$/, "");
}

function aehnlich(text, wort) {
  if (text.includes(wort)) return true;
  const s = stamm(wort);
  return s.length >= 5 && text.includes(s);
}

// Die Spracherkennung schreibt Nummern Ziffer fuer Ziffer ("0-1-Position", "9-0-4-0"): wieder zusammenziehen
export const nummernZusammen = (s) => String(s || "").replace(/\b\d(?:\s?-\s?\d)+\b/g, (m) => m.replace(/\D/g, ""));

function suchworte(satz) {
  const roh = norm(nummernZusammen(satz));
  const woerter = [...new Set(roh.split(/[^a-z0-9.]+/).filter((w) => w.length >= 4 && !STOP.has(w) && !/^[1-4][1-8]$/.test(w)))];
  const codes = [...roh.matchAll(/\b\d{4}a?\b|\b\d{2,3}[a-z](?:\/\d)?\b|\b\d\.\d{1,2}\b|\b0[1-9]\b|\bae ?\d\b/g)]
    .map((m) => m[0].replace(/\s/g, "").replace(/^ae/, "ä"));
  // Zweistellige BEMA-Nummern sind sonst nicht von Zaehnen zu unterscheiden: nur nach "BEMA", "Ziffer", "Nummer", "Position"
  for (const m of roh.matchAll(/\b(?:bema|ziffer|nummer|position|pos)\s+(\d{1,3}[a-z]?)\b/g)) codes.push(m[1]);
  return { roh, woerter, codes: [...new Set(codes)] };
}

const textVon = (b, katalog, nr) => b.ziffern.find((z) => z.k === katalog && z.n.toLowerCase() === String(nr).toLowerCase())?.t || "";

const nrGleich = (nr, codes) => codes.includes(String(nr || "").toLowerCase().replace(/\s/g, ""));

/** Kommentar, der eine gefragte Nummer nennt, auch wenn die Zeile selbst eine andere Nummer trägt. */
function kommentarNennt(z, codes) {
  if (!z.h || !codes.length) return false;
  return codes.some((c) => new RegExp(`\\b${esc(c)}\\b`, "i").test(z.h));
}

function zeileVon(z) {
  const basis = `${z.k} ${z.n}: ${z.t}`;
  return z.h ? `${basis}. Kommentar: ${z.h}` : basis;
}

/**
 * Praxispositionen aus dem PVS der Praxis (praxisWissen.js), ohne Preise und ohne Punktwerte:
 * eigene GOZ-/Analogpositionen, Eigenlabor, Kassen-Eigenlabor (BEL), Leistungsketten.
 * Bedeutungstreffer (sinn) zuerst, dann Nummern-, Kürzel- und Worttreffer.
 */
function praxisAbschnitt(praxis, roh, codes, sinn = []) {
  if (!praxis || typeof praxis !== "object") return "";
  const alle = praxisZeilen(praxis);
  const zeilen = [];
  const nehmen = (zeile) => {
    if (zeilen.length < 12 && !zeilen.includes(zeile)) zeilen.push(zeile);
  };
  for (const s of sinn) nehmen(s.zeile);
  const nrTrifft = (nr) => nrGleich(nr, codes) || (/^\d{4}a$/i.test(nr) && nrGleich(nr.slice(0, 4), codes));
  // Neben der Bedeutung nur genaue Kennungen: Nummer, BEB-Ersatznummer, Kürzel
  for (const z of alle) {
    const kuerzel = z.art === "kette" ? z.nr : z.zeile.match(/Kürzel (\S+)/)?.[1]?.replace(/,$/, "");
    const trifft = nrTrifft(z.nr) || codes.some((c) => z.zeile.includes(`BEB ${c}`)) || (kuerzel && wortDrin(kuerzel, roh));
    if (trifft) nehmen(z.zeile);
  }
  if (!zeilen.length) return "";
  const pvs = praxis.pvs ? ` aus ${praxis.pvs}` : "";
  return [`[PRAXISPOSITIONEN: Positionen dieser Praxis${pvs}, beim Verbinden aus dem Praxisprogramm übernommen. Ohne Preise. Eine Analogposition gilt nur, wenn sie hier steht. Analogpositionen und Eigenlabor nennst du mit genau dieser Nummer.]`, ...zeilen].join("\n");
}

// --- Quelltexte (Kompendium, FAQ, BEMA-Bestimmungen, Recherchen): BM25 über Wortstämme und Nummern ---
const TEXT_STOP = new Set(`aber alle allem also auch auf aus bei beim bis da dabei damit dann darf das dass dem den der des die dies diese diesem diesen dieser dieses doch durch ein eine einem einen einer eines es fuer hat ich ihr im in ist je kann man mit muss nach nicht noch nur ob oder ohne sich sie sind so soll ueber um und unter vom von vor was welche welcher wenn werden wie wird wo zu zum zur
bitte genau eigentlich mal frage sagen sag gibt geht gehen kommt wieviel wie viel welches rechne rechnet abrechnen abgerechnet abrechnung abrechnungsfrage
wann warum wieso weshalb welchen welchem darf darfst kann kannst muss muessen oft gilt gelten bekommt bekommen steht stehen ziffer nummer position`.split(/\s+/).filter(Boolean));

const textStamm = (w) => (/^\d/.test(w) ? w : w.replace(/(ungen|ung|en|er|es|e|n|s)$/, ""));

function textTokens(s) {
  const roh = norm(nummernZusammen(s));
  const aus = [];
  for (const w of roh.split(/[^a-z0-9.]+/)) {
    const t = w.replace(/^\.+|\.+$/g, "");
    if (!t || TEXT_STOP.has(t)) continue;
    if (/^\d/.test(t)) {
      if (/^\d{4}[a-z]?$|^\d{1,3}[a-z](?:\/\d)?$|^\d\.\d{1,2}$|^0[1-9]$/.test(t)) aus.push(t);
      continue;
    }
    if (t.length >= 3) aus.push(textStamm(t));
  }
  return aus;
}

let textIndex = null;
function textIndexVon(b) {
  if (textIndex) return textIndex;
  const docs = (b.texte || []).map((x) => {
    const tf = new Map();
    const toks = textTokens(`${x.q} ${x.t}`);
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    return { x, tf, len: toks.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  textIndex = { docs, df, avg, n: docs.length, vokabel: [...df.keys()].filter((t) => !/^\d/.test(t)) };
  return textIndex;
}

const gemeinsamerAnfang = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** Zusammengesetzte Wörter: "interimsprothes" findet auch "interimsversorg" (gleicher Wortanfang ab 7 Zeichen). */
function erweitern(anfrage, vokabel) {
  const aus = anfrage.map((t) => ({ t, gewicht: /^\d/.test(t) ? 3 : 1, quelle: t }));
  for (const q of anfrage) {
    if (/^\d/.test(q) || q.length < 7) continue;
    for (const v of vokabel) {
      if (v === q || v.length < 7) continue;
      if (gemeinsamerAnfang(q, v) >= 7) aus.push({ t: v, gewicht: 0.5, quelle: q });
    }
  }
  return aus;
}

// --- Bedeutungssuche: vorberechnete Vektoren (scripts/abrechnung-vektoren.mjs), Anfrage live über Ollama ---
const EMBED_URL = () => (process.env.MAS_EMBED_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const EMBED_MODELL = () => process.env.MAS_EMBED_MODEL || "bge-m3";
let vektoren = null;

function vektorenLaden() {
  if (vektoren) return vektoren;
  vektoren = { texte: [], ziffern: [], dim: 0 };
  try {
    const v = JSON.parse(fs.readFileSync(VEKTOR_DATEI, "utf8"));
    if (v.modell !== EMBED_MODELL()) return vektoren;
    const nachId = new Map(v.eintraege.filter((e) => e.v).map((e) => [e.id, e]));
    const holen = (art, x) => {
      const e = nachId.get(eintragSchluessel(art, x));
      if (!e || e.hash !== kurzHash(eintragText(art, x))) return null;
      const b = Buffer.from(e.v, "base64");
      return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    };
    const b = laden();
    for (const x of b.texte || []) { const v2 = holen("t", x); if (v2) vektoren.texte.push({ x, v: v2 }); }
    for (const z of b.ziffern || []) { const v2 = holen("z", z); if (v2) vektoren.ziffern.push({ x: z, v: v2 }); }
    vektoren.dim = vektoren.texte[0]?.v.length || vektoren.ziffern[0]?.v.length || 0;
  } catch {
    // ohne Vektordatei bleibt es bei der Wortsuche
  }
  return vektoren;
}

const anfrageMerker = new Map();
async function anfrageVektor(satz) {
  const key = String(satz).trim();
  if (anfrageMerker.has(key)) return anfrageMerker.get(key);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(process.env.MAS_EMBED_MS || 2500));
  try {
    const res = await fetch(`${EMBED_URL()}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODELL(), input: [key], keep_alive: "24h" }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const v = (await res.json())?.embeddings?.[0];
    if (!Array.isArray(v)) return null;
    const f = Float32Array.from(v);
    if (anfrageMerker.size > 200) anfrageMerker.clear();
    anfrageMerker.set(key, f);
    return f;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Vektoren für viele Texte am Stück (Aufbau, nicht im Gesprächspfad). Float32Array[] oder null. */
export async function vektorenFuer(texte, ms = 120000) {
  try {
    const res = await fetch(`${EMBED_URL()}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODELL(), input: texte, keep_alive: "24h" }),
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    const v = (await res.json())?.embeddings;
    return Array.isArray(v) && v.length === texte.length ? v.map((x) => Float32Array.from(x)) : null;
  } catch {
    return null;
  }
}

export const embedModell = () => EMBED_MODELL();
export { anfrageVektor };

export const kosinus = (a, b) => {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return s / (Math.sqrt(na * nb) || 1);
};

/** Bedeutungstreffer zum Satz: { texte: [{x, sim}], ziffern: [{x, sim}] } oder null (Ollama aus, keine Vektoren). */
export async function bedeutungFuer(satz) {
  if (process.env.MAS_WISSEN_BEDEUTUNG === "0") return null;
  const vk = vektorenLaden();
  if (!vk.dim) return null;
  const q = await anfrageVektor(nummernZusammen(satz));
  if (!q || q.length !== vk.dim) return null;
  const rang = (liste, min, max) => liste.map((e) => ({ x: e.x, sim: kosinus(q, e.v) }))
    .filter((e) => e.sim >= min).sort((a, c) => c.sim - a.sim).slice(0, max);
  return { texte: rang(vk.texte, 0.5, 8), ziffern: rang(vk.ziffern, 0.58, 4) };
}

/** Die besten Quelltext-Abschnitte zum Satz: Wortsuche (BM25, Nummern dreifach) und Bedeutungssuche per Rangfusion. */
export function quelltexteFuer(satz, max = 4, bedeutung = null) {
  const wort = quelltexteWort(satz, 8);
  const sinn = (bedeutung?.texte || []).map((e) => e.x);
  if (!sinn.length) return wort.slice(0, max);
  const punkte = new Map();
  const zaehlen = (liste) => liste.forEach((x, i) => punkte.set(x, (punkte.get(x) || 0) + 1 / (60 + i)));
  zaehlen(wort);
  zaehlen(sinn);
  return [...punkte.entries()].sort((a, c) => c[1] - a[1]).slice(0, max).map(([x]) => x);
}

function quelltexteWort(satz, max = 4) {
  const b = laden();
  const { docs, df, avg, n, vokabel } = textIndexVon(b);
  if (!n) return [];
  const anfrage = [...new Set(textTokens(satz))];
  if (!anfrage.length) return [];
  const terme = erweitern(anfrage, vokabel);
  const k1 = 1.2;
  const bb = 0.75;
  const treffer = [];
  for (const d of docs) {
    let score = 0;
    const getroffen = new Set();
    for (const { t, gewicht, quelle } of terme) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (n - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += gewicht * idf * ((f * (k1 + 1)) / (f + k1 * (1 - bb + (bb * d.len) / avg)));
      getroffen.add(quelle);
    }
    // Kuratierte Versorgungstexte vor dem langen OCR-Korpus, sonst frisst „Krone“ die Kompendiumsseite.
    if (score > 0 && String(d.x.q).startsWith("PlanR Exoten")) score *= 3;
    if (score > 0) treffer.push({ score, woerter: getroffen.size, d });
  }
  treffer.sort((a, c) => c.score - a.score);
  const beste = treffer[0]?.score || 0;
  return treffer
    .filter((t) => t.score >= Math.max(2.5, beste * 0.45) && (t.woerter >= 2 || anfrage.length <= 2))
    .slice(0, max)
    .map((t) => t.d.x);
}

const MAX_WISSEN = 8000;
const MAX_QUELLTEXT = 3800;

/** Wie wissenFuer, aber mit Bedeutungssuche (Ollama-Embedding). Fällt ohne Ollama auf die Wortsuche zurück. */
export async function wissenSuchen(satz, praxis = null) {
  const [bedeutung, praxisSinn] = await Promise.all([
    bedeutungFuer(satz),
    praxis?.clientId && process.env.MAS_WISSEN_BEDEUTUNG !== "0" ? praxisWissenSuchen(praxis.clientId, satz, 6) : [],
  ]);
  return wissenFuer(satz, praxis, praxisSinn.length ? { ...(bedeutung || {}), praxis: praxisSinn } : bedeutung);
}

/** Passender Ausschnitt fuer den Prompt, oder "". praxis: Katalog der Einrichtung, ohne dass Preise in den Text gelangen. */
export function wissenFuer(satz, praxis = null, bedeutung = null) {
  const b = laden();
  const { roh, woerter, codes } = suchworte(satz);
  if (!woerter.length && !codes.length) return "";
  const zeilen = [];
  const sinnZiffern = bedeutung?.ziffern || [];
  const codeDrin = (nr) => nrGleich(nr, codes);
  const gefragt = [];
  const erwaehnt = [];
  const gesehen = new Set();
  const merk = (z, wohin) => {
    const key = `${z.k}|${z.n}`;
    if (gesehen.has(key)) return;
    gesehen.add(key);
    wohin.push(zeileVon(z));
  };
  if (codes.length) {
    for (const z of b.ziffern) if (nrGleich(z.n, codes)) merk(z, gefragt);
    for (const z of b.ziffern) if (kommentarNennt(z, codes)) merk(z, erwaehnt);
  }

  for (const s of b.situationen) {
    const trifft = s.worte.some((w) => wortDrin(w, roh))
      || [...(s.goz || []), ...(s.bema || []), ...(s.bel || []), ...(s.beb || []), ...(s.fz || [])].some(codeDrin);
    if (trifft) zeilen.push(`Abrechnungsbeispiel: ${s.text}`);
  }

  for (const t of b.therapien) {
    const worte = norm(t.text).split(/\s+/).filter((w) => w.length >= 5);
    const trifft = worte.some((w) => woerter.some((x) => aehnlich(w, x) || aehnlich(x, w)))
      || codeDrin(t.goz) || codeDrin(t.anker) || t.beb.some(codeDrin);
    if (!trifft) continue;
    const teile = [`TP ${t.kuerzel}: ${t.text}`];
    if (t.goz) teile.push(`GOZ ${t.goz}${textVon(b, "GOZ", t.goz) ? ` ${textVon(b, "GOZ", t.goz)}` : ""}`);
    if (t.anker) teile.push(`als Anker GOZ ${t.anker}`);
    if (t.beb.length) teile.push(`BEB ${t.beb.join(", ")}`);
    zeilen.push(teile.join(". "));
  }

  for (const f of b.befunde) {
    const trifft = (f.alias || []).some((w) => wortDrin(w, roh))
      || norm(f.text).split(/\s+/).some((w) => w.length >= 6 && woerter.some((x) => aehnlich(w, x)));
    if (trifft) zeilen.push(`Befund ${f.kuerzel}: ${f.text}`);
  }

  for (const { x: z } of sinnZiffern) {
    if (gesehen.has(`${z.k}|${z.n}`)) continue;
    gesehen.add(`${z.k}|${z.n}`);
    zeilen.unshift(zeileVon(z));
  }

  const treffer = [];
  for (const z of b.ziffern) {
    if (gesehen.has(`${z.k}|${z.n}`)) continue;
    const nn = z.n.toLowerCase().replace(/\s/g, "");
    let score = codeDrin(nn) ? 50 : 0;
    const text = norm(`${z.t} ${z.h || ""}`);
    for (const wort of woerter) if (aehnlich(text, wort)) score += wort.length >= 6 ? 6 : 3;
    if (score >= 6) treffer.push({ score, z });
  }
  treffer.sort((a, c) => c.score - a.score || a.z.n.localeCompare(c.z.n));
  for (const { z } of treffer.slice(0, 12)) zeilen.push(zeileVon(z));

  const praxisText = praxisAbschnitt(praxis, roh, codes, bedeutung?.praxis || []);
  const stilText = praxisStilAbschnitt(praxis?.clientId, satz);
  let quellText = "";
  for (const x of quelltexteFuer(satz, 4, bedeutung)) {
    const zeile = `(${x.q}, ${x.s}) ${x.t}`;
    if (quellText.length + zeile.length > MAX_QUELLTEXT) break;
    quellText += `\n${zeile}`;
  }
  if (quellText) quellText = `[QUELLTEXTE: Wortlaut aus Richtlinien, Kommentaren und Recherchen, mit Fundstelle in Klammern]${quellText}`;
  if (!gefragt.length && !erwaehnt.length && !zeilen.length && !praxisText && !quellText && !stilText) return "";
  const kopf = "Wissensbasis zu diesem Satz. Kommentare sind die Bestimmungstexte der Gebührenordnung. „Nicht neben“ gilt für dieselbe Sitzung. Steht zu zwei Nummern kein solcher Kommentar, erfinde keine Ausschlussregel. Abrechnungsbeispiele sind die Zuordnung der Engine. Die Engine setzt die Positionen. Nenne keine Beträge.";
  const abschnitt = (titel, z) => (z.length ? [`[${titel}]`, ...z] : []);
  const kern = [
    kopf,
    ...abschnitt("GEFRAGTE NUMMERN: Leistungstext und eigene Bestimmung. Fehlt \"Kommentar\", hat die Nummer keine eigene Bestimmung", gefragt),
    ...abschnitt("ANDERE NUMMERN, deren Bestimmung eine gefragte Nummer erwähnt. Gilt nur für das, was der Satz dort ausdrücklich sagt", erwaehnt),
    praxisText,
    stilText,
    quellText,
  ].filter(Boolean).join("\n");
  const rest = zeilen.length ? ["[WEITERE TREFFER: Abrechnungsbeispiele, Therapien, verwandte Nummern]", ...zeilen].join("\n") : "";
  let text = rest ? `${kern}\n${rest}` : kern;
  if (text.length > MAX_WISSEN) {
    const budget = MAX_WISSEN - kern.length - 1;
    const gekuerzt = budget > 80 ? rest.slice(0, budget).replace(/\n[^\n]*$/, "") : "";
    text = gekuerzt ? `${kern}\n${gekuerzt}` : kern.slice(0, MAX_WISSEN);
  }
  return text;
}
