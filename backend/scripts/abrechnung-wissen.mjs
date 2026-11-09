// Baut die Wissensbasis für Claras Absicht: jede Ziffer aus den PlanR-Katalogen
// plus das Mapping der Engine (Befundkürzel, Therapiekürzel, Situation → Ziffer).
// Preise bleiben draußen. Neu bauen: node scripts/abrechnung-wissen.mjs
import fs from "node:fs";
import path from "node:path";

const PLANR = "F:/PlanR";
const ZIEL = path.join("F:/MAS-2/backend/src/hkp/wissen/abrechnung.json");
const HKP = path.join(PLANR, "ZE/HKP");

const kuerzen = (t, max = 180) => {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s\S*$/, "")}…` : s;
};

/** Sätze mit Beträgen fliegen raus, der Rest der Bestimmung bleibt. */
const BETRAG = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const ohneBetraege = (t) => String(t || "")
  .split(/(?<=[.;!?])\s+/)
  .filter((s) => !/€|\bEUR\b|\beuro\b|\bPunktwert/i.test(s))
  .join(" ")
  // Festzuschuss-Tabellen ohne Währungszeichen: Reihen von Beträgen und Einzelbeträge ab 100
  .replace(new RegExp(String.raw`(?:\b${BETRAG}\s+){2,}${BETRAG}\b`, "g"), "")
  .replace(/(?:\d{1,3}\.\d{3}|\d{3}),\d{2}\b/g, "")
  .replace(/\s{2,}/g, " ")
  .trim();

const saetzeVon = (t) => String(t || "").split(/(?<=[.;!?])\s+/).map((s) => s.trim()).filter(Boolean);

const ziffern = [];
const zifferIndex = new Map();
function add(k, n, t, h) {
  n = String(n || "").trim();
  t = kuerzen(t);
  if (!n || !t) return;
  const key = `${k}|${n.toLowerCase().replace(/\s/g, "")}`;
  const neu = ohneBetraege(String(h || "").replace(/\s+/g, " "));
  const da = zifferIndex.get(key);
  if (da) {
    // Gleiche Nummer aus einer weiteren Recherchequelle: deren Bestimmung ergänzen, nicht verwerfen
    const fehlt = saetzeVon(neu).filter((s) => !(da.h || "").includes(s.replace(/[.;!?]$/, "")));
    if (fehlt.length) da.h = kuerzen([da.h, ...fehlt].filter(Boolean).join(" "), 1600);
    return;
  }
  const eintrag = { k, n, t };
  if (neu) eintrag.h = kuerzen(neu, 1600);
  zifferIndex.set(key, eintrag);
  ziffern.push(eintrag);
}

const bestimmungVon = (e) => [e.hinweis, e.kommentar, e.bestimmung, e.abrechnung, e.beschreibung]
  .filter((x) => typeof x === "string" && x.trim()).join(" ");

function ausJson(datei, katalog) {
  const j = JSON.parse(fs.readFileSync(datei, "utf8"));
  for (const e of j.eintraege || j.goz || []) add(katalog, e.nr, e.text || e.titel, bestimmungVon(e));
}

function ausTsPos(datei, katalog) {
  const src = fs.readFileSync(datei, "utf8");
  for (const m of src.matchAll(/nr:\s*'([^']+)'[\s\S]{0,80}?titel:\s*'([^']+)'/g)) add(katalog, m[1], m[2]);
  for (const m of src.matchAll(/r\('([^']+)',\s*'([^']+)'/g)) add(katalog, m[1], m[2]);
}

function ausDigital(datei) {
  const src = fs.readFileSync(datei, "utf8");
  const nr = {};
  for (const m of src.matchAll(/(\w+):\s*'(D\d+)'/g)) nr[m[1]] = m[2];
  for (const m of src.matchAll(/nr:\s*DIGITAL\.(\w+),\s*text:\s*'([^']+)'/g)) add("DIGITAL", nr[m[1]], m[2]);
}

function stringRecord(datei, name) {
  const src = fs.readFileSync(datei, "utf8");
  const start = src.indexOf(`export const ${name}`);
  const a = src.indexOf("{", start);
  let tiefe = 0;
  let i = a;
  for (; i < src.length; i++) {
    if (src[i] === "{") tiefe++;
    else if (src[i] === "}") {
      tiefe--;
      if (!tiefe) break;
    }
  }
  const body = src.slice(a + 1, i);
  const aus = [];
  for (const m of body.matchAll(/(?:'([^']+)'|([A-Za-z0-9]+))\s*:\s*'([^']*)'/g)) {
    aus.push({ kuerzel: m[1] || m[2], text: m[3] });
  }
  return aus;
}

function tpRecord(datei) {
  const src = fs.readFileSync(datei, "utf8");
  const start = src.indexOf("export const TP_ZUORDNUNG");
  const a = src.indexOf("= {", start) + 2;
  let tiefe = 0;
  let i = a;
  for (; i < src.length; i++) {
    if (src[i] === "{") tiefe++;
    else if (src[i] === "}") {
      tiefe--;
      if (!tiefe) break;
    }
  }
  const body = src.slice(a + 1, i);
  const aus = [];
  for (const m of body.matchAll(/(?:'([^']+)'|([A-Za-z0-9]+))\s*:\s*\{([^}]*)\}/g)) {
    const block = m[3];
    const goz = /goz:\s*'([^']*)'/.exec(block)?.[1] || "";
    const anker = /gozAnker:\s*'([^']*)'/.exec(block)?.[1] || "";
    const bebSrc = /beb:\s*\[([^\]]*)\]/.exec(block)?.[1] || "";
    const beb = [...bebSrc.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    aus.push({ kuerzel: m[1] || m[2], goz, anker, beb });
  }
  return aus;
}

ausJson(path.join(HKP, "src/data/goz-2012.json"), "GOZ");
ausJson(path.join(HKP, "src/data/bema/bema-2026.json"), "BEMA");
ausJson(path.join(HKP, "src/data/fz/fz-2026.json"), "FZ");
ausJson(path.join(HKP, "src/data/beb-itz-2024.json"), "BEB");
ausJson(path.join(PLANR, "Start/public/daten/goae-zahnarzt.json"), "GOÄ");
ausJson(path.join(PLANR, "KB/Privat-KB/src/data/goae-kb.json"), "GOÄ");
ausJson(path.join(PLANR, "KFO/Privat-KFO/src/data/goae-kfo.json"), "GOÄ");
ausJson(path.join(PLANR, "KB/Kassen-KB/src/data/bema-teil2.json"), "BEMA");
ausJson(path.join(PLANR, "KFO/Kassen-KFO/src/data/bema-kfo.json"), "BEMA");
ausJson(path.join(PLANR, "PAR/_quellen/privat-par.json"), "GOZ");

const belDir = path.join(HKP, "src/data/bel");
const belDateien = fs.readdirSync(belDir).filter((f) => f.endsWith(".json")).sort((a, b) => Number(b.includes("bayern")) - Number(a.includes("bayern")));
for (const f of belDateien) ausJson(path.join(belDir, f), "BEL");

ausTsPos(path.join(PLANR, "PAR/Kassen-PAR/src/data/bema-par.ts"), "BEMA");
ausTsPos(path.join(HKP, "src/engine/beb-standard.ts"), "BEB");
ausDigital(path.join(HKP, "src/engine/digital.ts"));

// Recherche der PlanR-Module (Stand Oktober 2026): Bestimmungen je Nummer mit Fundstelle
const recherche = (datei) => JSON.parse(fs.readFileSync(path.join(PLANR, datei), "utf8"));
const kassenKb = recherche("KB/_quellen/kassen-kb.json");
for (const e of kassenKb.bema || []) add("BEMA", e.nr, e.text, bestimmungVon(e));
for (const e of kassenKb.bel || []) add("BEL", e.nr, e.text, [bestimmungVon(e), e.begleit && `Zusammen mit ${[].concat(e.begleit).join(", ")}.`].filter(Boolean).join(" "));
const privatKb = recherche("KB/_quellen/privat-kb.json");
for (const e of privatKb.goz || []) add("GOZ", e.nr, e.text, bestimmungVon(e));
for (const e of privatKb.beb || []) add("BEB", e.nr, e.text, bestimmungVon(e));
const privatPar = recherche("PAR/_quellen/privat-par.json");
for (const e of privatPar.goz || []) add("GOZ", e.nr, e.text, bestimmungVon(e));
const teil2 = recherche("KB/Kassen-KB/src/data/bema-teil2.json");
for (const [nr, h] of Object.entries(teil2.belHinweise || {})) add("BEL", nr, textVonZiffer("BEL", nr) || `BEL ${nr}`, h?.abrechnung || "");

function textVonZiffer(k, nr) {
  return zifferIndex.get(`${k}|${String(nr).toLowerCase().replace(/\s/g, "")}`)?.t || "";
}

// ---------------------------------------------------------------------------
// Quelltexte: Wortlaut aus Kompendium, FAQ, BEMA-Texten und den Recherchehinweisen.
// Jede Stelle trägt ihre Fundstelle; Beträge fliegen raus.
const texte = [];
const ABSCHNITT_MAX = 1100;

function stueckeln(t, max = ABSCHNITT_MAX) {
  const saetze = String(t).replace(/\s+/g, " ").trim().split(/(?<=[.;:!?])\s+(?=[A-ZÄÖÜ0-9„"•·-])/);
  const aus = [];
  let jetzt = "";
  for (const s of saetze) {
    if (jetzt && jetzt.length + s.length + 1 > max) {
      aus.push(jetzt);
      jetzt = "";
    }
    jetzt = jetzt ? `${jetzt} ${s}` : s;
  }
  if (jetzt) aus.push(jetzt);
  return aus;
}

function textAdd(q, s, t) {
  const sauber = ohneBetraege(t);
  if (sauber.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length < 60) return;
  for (const teil of stueckeln(sauber)) texte.push({ q, s, t: teil });
}

/** Umlaute, die die Texterkennung verloren hat ("fur", "Zahne", "auBerhalb"), aus dem übrigen Korpus zurückholen. */
function umlautReparatur(korpus) {
  const flach = (w) => w.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/Ä/g, "A").replace(/Ö/g, "O").replace(/Ü/g, "U").replace(/ß/g, "B");
  // Nur ersetzen, wenn die Umlautform im sauberen Korpus häufiger ist als die flache ("schon" bleibt "schon")
  const zahl = new Map();
  const echt = new Map();
  for (const w of korpus.match(/[A-Za-zÄÖÜäöüß]{2,}/g) || []) zahl.set(w, (zahl.get(w) || 0) + 1);
  for (const [w, n] of zahl) {
    if (!/[äöüÄÖÜß]/.test(w)) continue;
    const f = flach(w);
    if (n > (zahl.get(f) || 0) && n >= (zahl.get(echt.get(f)) || 0)) echt.set(f, w);
  }
  // Verleser, bei denen die Texterkennung ü als i gelesen hat oder 0 statt O
  const VERLESEN = { abziglich: "abzüglich", Festzuschisse: "Festzuschüsse", Festzuschiisse: "Festzuschüsse", Bruicke: "Brücke", Briicke: "Brücke", Bricke: "Brücke", fir: "für", G0Z: "GOZ", BEMAIGOZ: "BEMA/GOZ", Materialund: "Material- und", Bezugsgroße: "Bezugsgröße", Bezugsgrosse: "Bezugsgröße" };
  for (const [falsch, richtig] of Object.entries(VERLESEN)) echt.set(falsch, richtig);
  // Wortteile in Zusammensetzungen (Befundkurzel, Festzuschusse, unmoglich), eindeutig ohne Umlaut nicht deutsch
  const TEILE = [["kurzel", "kürzel"], ["zuschusse", "zuschüsse"], ["moglich", "möglich"], ["betrage", "beträge"],
    ["anspruche", "ansprüche"], ["beschrank", "beschränk"], ["prufung", "prüfung"], ["prufen", "prüfen"], ["gultig", "gültig"], ["zahnarztlich", "zahnärztlich"],
    ["regelmaßig", "regelmäßig"], ["zusatzlich", "zusätzlich"], ["nachtraglich", "nachträglich"], ["ausfuhr", "ausführ"], ["gemaß", "gemäß"], ["fullung", "füllung"],
    ["bruck", "brück"], ["konnen", "können"], ["mussen", "müssen"], ["uber", "über"], ["erhaltungswurdig", "erhaltungswürdig"], ["zerstor", "zerstör"], ["hartefall", "härtefall"]];
  const teilFix = (w) => {
    if (/[äöüß]/.test(w)) return w;
    let aus = w;
    for (const [f, r] of TEILE) {
      aus = aus.replace(new RegExp(f, "g"), r).replace(new RegExp(f[0].toUpperCase() + f.slice(1), "g"), r[0].toUpperCase() + r.slice(1));
    }
    return aus;
  };
  return (t) => t
    .replace(/\bG0Z\b/g, "GOZ")
    .replace(/([a-zäöü])B(?=[a-zäöü])/g, "$1ß")
    .replace(/[A-Za-zß]{2,}/g, (w) => echt.get(w) || echt.get(w.replace(/ß/g, "B")) || teilFix(w));
}

const lies = (datei) => fs.readFileSync(path.join(PLANR, datei), "utf8");
const seiten = (roh) => roh.split(/\n?=+ ?Seite (\d+) ?=+\n?|\n--- S (\d+)\n/).reduce((acc, teil, i, arr) => {
  if (i % 3 === 0 && teil.trim()) acc.push({ nr: arr[i - 2] || arr[i - 1] || "1", text: teil });
  return acc;
}, []);

// Korpus für die Umlaut-Reparatur: alle sauberen Texte, die wir haben
const sauberKorpus = [
  lies("PAR/_quellen/kzvlb_faq.txt"), lies("PAR/_quellen/bema_teil4_2026.txt"), lies("ZE/HKP/_quellen/bema_kurz_2026.txt"),
  lies("PAR/_quellen/dampsoft_par_handbuch.txt"), JSON.stringify(ziffern),
  // nur als Wörterliste für die Umlaute, nicht als Wissen
  lies("ZE/HKP/src/data/lexikon-beb.json"), lies("ZE/HKP/src/data/lexikon-bel.json"), JSON.stringify(kassenKb), JSON.stringify(privatKb), JSON.stringify(privatPar),
].join(" ");
const reparieren = umlautReparatur(sauberKorpus);

// KZBV: Hinweise und Berechnungsbeispiele zu Festzuschüssen (OCR, Umlaute repariert)
for (const { nr, text } of seiten(lies("ZE/HKP/_quellen/regeln/kompendium_ocr.txt"))) {
  const zeilen = text.split("\n")
    .map((z) => z.trim())
    .filter((z) => z.length > 3 && !/^\d[\d\s.-]*$/.test(z) && !/^(TP|B|R|xxx+)$/i.test(z) && !/Auflage/.test(z));
  textAdd("KZBV Hinweise und Berechnungsbeispiele zu Festzuschüssen", `Seite ${nr}`, reparieren(zeilen.join(" ").replace(/(\w)- (\w)/g, "$1$2")));
}

// KZV Land Brandenburg: FAQ zur PAR-Richtlinie
for (const { nr, text } of seiten(lies("PAR/_quellen/kzvlb_faq.txt"))) {
  textAdd("KZV LB FAQ zur PAR-Behandlungsstrecke", `Seite ${nr}`, text.replace(/\uFFFE/g, "").replace(/(\w)- ?\n(\w)/g, "$1$2"));
}

// BEMA Teil 4 (PAR) mit Abrechnungsbestimmungen, KZBV 01.01.2026
for (const [i, absatz] of lies("PAR/_quellen/bema_teil4_2026.txt").split(/\n\s*\n/).entries()) {
  textAdd("BEMA Teil 4 (KZBV, 01.01.2026)", `Absatz ${i + 1}`, absatz.replace(/(\w) (\w{2,})/g, "$1 $2"));
}

// BEMA-Kurzfassung KZBV 01.01.2026 (Leistungsbeschreibungen)
for (const { nr, text } of seiten(lies("ZE/HKP/_quellen/bema_kurz_2026.txt"))) {
  textAdd("BEMA-Kurzfassung (KZBV, 01.01.2026)", `Seite ${nr}`, text.replace(/(\w)-\s*\n(\w)/g, "$1$2"));
}

// Spitta: Fallbeispiel richtlinienkonforme PAR-Behandlung
textAdd("Spitta Fallbeispiele Abrechnung (PAR)", "Fall 1", lies("PAR/_quellen/spitta_text.txt").replace(/õ/g, "ä").replace(/û/g, "–"));

// Hinweise und Regeln aus den Recherchen der Fachmodule
const flachText = (v, pfad = "") => {
  if (v == null) return [];
  if (typeof v === "string") return [pfad ? `${pfad}: ${v}` : v];
  if (typeof v === "number" || typeof v === "boolean") return [];
  if (Array.isArray(v)) return v.flatMap((x) => flachText(x, pfad));
  return Object.entries(v).flatMap(([k, x]) => flachText(x, pfad ? `${pfad} ${k}` : k));
};
const RECHERCHE = [
  ["KB/_quellen/kassen-kb.json", "Recherche Kassen-Kieferbruch/Schienen"],
  ["KB/_quellen/privat-kb.json", "Recherche Privat-Kieferbruch/Schienen"],
  ["KFO/_quellen/kassen-kfo.json", "Recherche Kassen-KFO"],
  ["KFO/_quellen/privat-kfo.json", "Recherche Privat-KFO"],
  ["PAR/_quellen/privat-par.json", "Recherche Privat-PAR"],
  ["KB/Kassen-KB/src/data/bema-teil2.json", "BEMA Teil 2"],
];
for (const [datei, q] of RECHERCHE) {
  const j = recherche(datei);
  const stand = typeof j.stand === "string" ? ` (${j.stand.slice(0, 120)})` : "";
  for (const feld of ["hinweise", "regeln", "genehmigung", "formular"]) {
    const zeilen = flachText(j[feld]).filter((z) => !/^felder\b/.test(z));
    if (zeilen.length) textAdd(`${q}${stand}`, feld, zeilen.join(" • "));
  }
}
for (const a of privatPar.analog || []) {
  textAdd("BZÄK/Beratungsforum Analogempfehlung PAR", a.nr,
    `Analogempfehlung ${a.nr}: ${a.text}. ${a.vorschlag || ""}. ${a.begruendung || ""} BEMA-Gegenstück ${a.bemaGegenstueck || "keins"}. Quelle: ${a.quelle || ""}${a.variante ? `, Variante ${a.variante}` : ""}.`);
}
textAdd("Recherche Privat-PAR: BEMA und GOZ im Vergleich", "Gegenüberstellung", (privatPar.bemaVergleich || [])
  .map((v) => `BEMA ${v.bema} entspricht GOZ ${v.goz}: ${v.hinweis}${v.unsicher ? ` Unsicher: ${v.unsicherGrund || ""}` : ""}`).join(" • "));

// Kopfkommentare und Hinweistexte der Fachkataloge (Regeln, die die Engines umsetzen)
const KATALOGE = [
  ["KONS/MKV/src/data/katalog.ts", "Kassen-Füllungen und Mehrkosten"],
  ["KONS/Privat-Kons/src/data/katalog.ts", "Privat-Konservierend"],
  ["KB/Kassen-KB/src/data/katalog.ts", "Kassen-Kieferbruch/Schienen"],
  ["KB/Privat-KB/src/data/katalog.ts", "Privat-Kieferbruch/Schienen"],
  ["KFO/Kassen-KFO/src/data/katalog.ts", "Kassen-KFO"],
  ["KFO/Privat-KFO/src/data/katalog.ts", "Privat-KFO"],
  ["PAR/Kassen-PAR/src/data/kacheln.ts", "Kassen-PAR"],
  ["PAR/Privat-PAR/src/data/katalog.ts", "Privat-PAR"],
  ["Implantologie/Privat-Impl/src/data/goz-sonderregeln.ts", "Implantologie GOZ-Sonderregeln"],
  ["Implantologie/Privat-Impl/src/data/analog-katalog.ts", "Implantologie Analogkatalog"],
];
for (const [datei, q] of KATALOGE) {
  const src = lies(datei);
  const kommentare = [...src.matchAll(/^\s*\/\/ ?(.*)$/gm)].map((m) => m[1]).join(" ")
    + " " + [...src.matchAll(/\/\*\*?([\s\S]*?)\*\//g)].map((m) => m[1].replace(/^\s*\* ?/gm, "")).join(" ");
  const felder = [...src.matchAll(/(?:hinweis|begruendung|bestimmung|regel|kurz|titel|text)\s*:\s*'((?:[^'\\]|\\.){25,})'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  textAdd(`PlanR ${q}`, "Regeln", [kommentare, ...felder].join(" • "));
}

const ALIAS = {
  f: ["fehlt", "luecke", "gezogen", "entfernt", "zahnlos"],
  x: ["nicht erhaltungswuerdig", "muss raus", "extraktion"],
  ww: ["weitgehend zerstoert", "krone noetig", "starke zerstoerung"],
  kw: ["krone erneuerungsbeduerftig", "alte krone"],
  k: ["ueberkront", "intakte krone", "krone vorhanden"],
  pw: ["teilkrone", "substanzdefekt", "inlayfaehig"],
  ur: ["zu wenig halt", "retention fehlt"],
  b: ["brueckenglied vorhanden"],
  bw: ["brueckenglied erneuern"],
  e: ["ersetzt", "prothesenzahn"],
  ew: ["prothese erneuern"],
  t: ["teleskop vorhanden", "doppelkrone"],
  tw: ["teleskop erneuern"],
  sk: ["implantatkrone vorhanden", "suprakonstruktion"],
  skw: ["implantatkrone erneuern"],
  ix: ["implantat entfernen", "implantat raus"],
  i: ["implantat bleibt", "implantat vorhanden"],
  rw: ["wurzelstiftkappe"],
  st: ["implantat teleskop"],
  so: ["steg", "locator", "verbindungselement"],
};

const befunde = stringRecord(path.join(HKP, "src/engine/zahnschema.ts"), "BEFUND_KUERZEL").map((b) => ({
  ...b, alias: ALIAS[b.kuerzel] || [],
}));

const therapieText = new Map(stringRecord(path.join(HKP, "src/engine/zahnschema.ts"), "THERAPIE_KUERZEL").map((t) => [t.kuerzel, t.text]));
const therapien = tpRecord(path.join(HKP, "src/engine/therapie.ts")).map((t) => ({
  ...t, text: therapieText.get(t.kuerzel) || t.kuerzel,
}));

/** Situationen, wie die Engine sie auf Ziffern legt. Die Texte der Ziffern kommen beim Nachschlagen dazu. */
const situationen = [
  { id: "krone-regel", worte: ["krone", "vollkrone", "ueberkront", "zerstoert", "ww"], fz: ["1.1"], bema: ["20a", "20b"], bel: ["1021", "1024", "1620"], goz: [], beb: [],
    text: "Erhaltungswürdiger Zahn mit weitgehender Zerstörung: Festzuschuss 1.1, Regelkrone BEMA 20a, im Verblendbereich 15–25 und 34–44 BEMA 20b plus Verblendung BEL 1620." },
  { id: "teilkrone", worte: ["teilkrone", "teilkr"], fz: ["1.2"], bema: ["20c"], bel: [], goz: ["2220"], beb: [],
    text: "Zahn mit großen Substanzdefekten, vestibuläre oder orale Substanz erhalten: Festzuschuss 1.2, BEMA 20c, andersartig GOZ 2220." },
  { id: "bruecke", worte: ["bruecke", "luecke", "pfeiler", "brueckenglied"], fz: ["2.1", "2.2", "2.3", "2.4", "2.5"], bema: ["92", "91a", "91b"], bel: ["1100"], goz: ["5010", "5030"], beb: [],
    text: "Zahnbegrenzte Lücke bis vier fehlende Zähne, keine Freiendsituation: Festzuschuss 2.1 bis 2.5, BEMA 92 je Spanne, Anker 91a oder im Verblendbereich 91b. Eine Brücke auf eigenen Zähnen, nicht auf Implantaten." },
  { id: "modellguss", worte: ["modellguss", "klammer", "partielle", "herausnehmbar", "freiend"], fz: ["3.1"], bema: ["96a", "96b", "96c", "98g", "98h/1", "98h/2"], bel: ["2010"], goz: [], beb: [],
    text: "Freiend oder übrige Lücken: Festzuschuss 3.1, Modellguss, BEMA 96a bis 96c nach der Zahl der ersetzten Zähne, Halteelement BEMA 98h, BEL 2010." },
  { id: "teleskop", worte: ["teleskop", "doppelkrone", "konus", "cover", "deckprothese"], fz: ["3.2", "4.6", "4.7"], bema: ["91d", "90"], bel: ["1200", "1201"], goz: ["5040"], beb: ["3001"],
    text: "Teleskop- oder Konuskrone: BEMA 91d, BEL 1200, bei Verblendung Festzuschuss 4.7. Am Restzahn Festzuschuss 4.6 oder 3.2. Andersartig GOZ 5040, BEB 3001." },
  { id: "total", worte: ["totalprothese", "vollprothese", "zahnlos", "totale"], fz: ["4.1", "4.2", "4.3", "4.4"], bema: ["97a", "97b", "98b", "98c"], bel: ["3010", "3020"], goz: ["5220", "5230"], beb: [],
    text: "Zahnlos oder höchstens drei Restzähne: Festzuschuss 4.1 bis 4.4, Totalprothese BEMA 97a Oberkiefer oder 97b Unterkiefer. Restzähne als Teleskope. Ohne Implantate schleimhautgetragen." },
  { id: "interim", worte: ["interim", "interimsprothese", "provisorische prothese"], fz: ["5.1", "5.2", "5.3", "5.4"], bema: ["96a", "97a", "97b"], bel: [], goz: [], beb: [],
    text: "Interimsversorgung: Festzuschuss 5.1 bis 5.4, je nach Zahl der fehlenden Zähne BEMA 96 oder bei Zahnlosigkeit 97." },
  { id: "implantat-krone", worte: ["implantatkrone", "suprakonstruktion", "einzelimplantat"], fz: ["7.1", "7.2", "1.3"], bema: [], bel: [], goz: ["2200", "5000", "9050"], beb: ["2101"],
    text: "Einzelne Krone auf einem Implantat: GOZ 2200, als Brückenanker GOZ 5000. Erneuerung einer Suprakonstruktion Festzuschuss 7.1 in einer Einzelzahnlücke, sonst 7.2, Verblendung 1.3. Ein vorhandenes Implantat bleibt, es wird nicht gezogen." },
  { id: "allon", worte: ["allon", "all-on", "all on", "orlon", "olon", "ollon", "alon", "ballon", "balon", "feste bruecke implantat", "sechs implantat", "vier implantat"], fz: ["4.2", "4.4"], bema: [], bel: [], goz: ["2200", "5000"], beb: ["2101", "2362"],
    text: "All-on-4 oder All-on-6: festsitzende Brücke auf vier oder sechs Implantaten je Kiefer, eine Prothese. Therapie SK oder SKV oder SKM am Implantat, SB oder SBM als Glied. GOZ 2200, Anker GOZ 5000. Implantate, die schon stehen, bleiben. Keine Extraktion der Implantate und keine Brücke auf eigenen Zähnen. Stehende eigene Zähne im Bogen müssen fehlen oder entfernt werden. Festzuschuss wie der zahnlose Kiefer, 4.2 oder 4.4." },
  { id: "locator-steg", worte: ["locator", "kugelkopf", "druckknopf", "novaloc", "steg", "herausnehmbar implantat"], fz: ["7.5"], bema: [], bel: [], goz: ["5030", "5080", "5090", "5210"], beb: [],
    text: "Herausnehmbare Prothese auf Implantaten: Locator oder Kugelkopf GOZ 5030 je Implantat und GOZ 5080 je Verbindungselement. Steg GOZ 5090. Festzuschuss 7.5. Nicht All-on." },
  { id: "inlay", worte: ["inlay", "onlay", "einlagefuellung", "veneer"], fz: [], bema: [], bel: [], goz: ["2150", "2160", "2170", "2220"], beb: ["2301", "2302", "2551"],
    text: "Inlay: einflächig GOZ 2150, zweiflächig 2160, drei- und mehrflächig 2170. Deckt es Höcker, ist es eine Teilkrone GOZ 2220. Keramik steht in der BEB als eigene Nummer, nicht als Krone." },
  { id: "vollkeramik", worte: ["vollkeramik", "zirkon", "vollverblendet", "keramik", "monolithisch", "vollanatomisch"], fz: [], bema: [], bel: [], goz: ["2210"], beb: ["2281", "2612", "2251"],
    text: "Vollkeramik oder keramisch vollverblendet ist andersartig: Therapie KM, GOZ 2210, BEB 2281 und Verblendung 2612. Vollanatomisch BEB 2251. Nicht die Regelkrone BEMA 20a." },
  { id: "implantat-sitzung", worte: ["freilegen", "freilegung", "gingivaformer", "aufbauelement", "aufbauteil"], fz: [], bema: [], bel: [], goz: ["9000", "9010", "9040", "9050", "9060"], beb: [],
    text: "Implantat, rekonstruktive Phase. GOZ 9040: Freilegen und Einfügen eines Aufbauelements, zum Beispiel Gingivaformer, beim zweiphasigen System. GOZ 9050: Entfernen, Wiedereinsetzen oder Auswechseln der Aufbauelemente, in der Regel zweimal je Implantat (Abformung und Eingliederung), höchstens dreimal je Implantat und einmal je Sitzung, nicht neben 9010 und nicht neben 9040. GOZ 9060: Wechsel im Reparaturfall, höchstens einmal je Implantat und Sitzung. Die chirurgischen Nummern 9000 bis 9040 gehören nicht in den Heil- und Kostenplan, sie werden gesondert geplant." },
];

const exoten = JSON.parse(fs.readFileSync(path.join(PLANR, "ZE/Privat-HKP/src/data/exoten.json"), "utf8"));
for (const e of exoten) textAdd("PlanR Exoten je Versorgung", e.titel, `${e.titel}. ${e.kurz} ${e.text}`);
textAdd("PlanR Exoten je Versorgung", "Regler",
  "Der Schieberegler Zusatzleistungen liest die Exoten je Versorgung aus dieser Wissensbasis. Führend ist die speziellste Versorgung: All-on-6, All-on-4, Teleskopprothese, Teleskopkronen, Brücke, Suprakonstruktion, Krone. Die Funktionsanalyse kommt nur von der führenden Versorgung. Vorbereitende Nummern kommen aus jeder passenden Versorgung, jede Nummer nur einmal. Das Modell sucht die passende Versorgung hier. Es gibt keine Wortregel im Rechenweg.");

const basis = {
  stand: "2026-11-09",
  hinweis: "Ziffern, Bestimmungstexte (Feld h), Abrechnungsbeispiele und Exoten je Versorgung. Praxispositionen kommen live aus dem PVS, nicht aus dieser Datei. Keine Preise, keine Punktwerte.",
  zaehlung: ziffern.reduce((m, z) => ({ ...m, [z.k]: (m[z.k] || 0) + 1 }), {}),
  ziffern, befunde, therapien, situationen, exoten, texte,
};

fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
fs.writeFileSync(ZIEL, JSON.stringify(basis));
const kb = fs.statSync(ZIEL).size;
const kommentare = ziffern.filter((z) => z.h).length;
console.log(`wissen ${ziffern.length} Ziffern, ${kommentare} Kommentare, ${befunde.length} Befunde, ${therapien.length} Therapien, ${situationen.length} Situationen, ${exoten.length} Exoten, ${texte.length} Quelltexte, ${kb} Bytes`);
console.log(texte.reduce((m, t) => ({ ...m, [t.q.slice(0, 50)]: (m[t.q.slice(0, 50)] || 0) + 1 }), {}));
console.log(basis.zaehlung);
