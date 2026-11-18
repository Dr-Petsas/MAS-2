// Abrechnungscoach (Chef 06.11.2026): "Wie rechne ich XY ab?" ergibt eine komplette Rechnung.
// Mehrere Teile (Implantation und die spätere Prothese) sind EIN Fall. Beträge stehen nur auf der
// Karte fürs Handy und in PlanR, nie im gesprochenen Satz. Ohne Patient ist es eine Musterrechnung.
import * as E from "../vendor/hkp-engine.mjs";
import * as P from "../vendor/privat-ze-engine.mjs";
import * as I from "../vendor/impl-engine.mjs";
import * as M from "../vendor/mkv-engine.mjs";
import * as K from "../vendor/kons-engine.mjs";
import * as KB from "../vendor/privat-kb-engine.mjs";
import { planPruefen } from "./ausschluss.js";
import { begleitleistungen, begleitSatz, begleitWahl } from "./begleit.js";

const ARTEN = new Set(["kasse", "privat", "impl", "kons", "mkv", "schiene"]);
const istSchiene = (t) => String(t?.planart || "").trim().toLowerCase() === "schiene";
/** Schiene privat: das Modell wählt die Vorlagen als Werkzeugfeld, kein Satz wird zerlegt */
const schieneTeil = (t) => ({
  planart: "schiene", versorgung: String(t?.versorgung || t?.text || "").trim() || "Schiene",
  schienen: Array.isArray(t?.schienen) ? t.schienen : String(t?.schienen || "").split(",").map((x) => x.trim()).filter(Boolean),
  abformung: String(t?.abformung || "").trim().toLowerCase(),
});
const zahl = (x) => Math.round((Number(x) || 0) * 100) / 100;
const euro = (n) => `${(Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const zeilenKurz = (t) => {
  const s = String(t || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (s.length <= 72) return s;
  const kurz = s.slice(0, 72);
  const ende = kurz.lastIndexOf(" ");
  return (ende > 40 ? kurz.slice(0, ende) : kurz).replace(/[,;:\s]+$/, "");
};
const PROTHESE = /all[\s-]*on|prothetik|suprakonstruktion|implantatgetragen/i;
const CHIRURGIE = /implantat|sinus|augmentation|knochenaufbau/i;

/** "regio 2, 4, 6 auf beiden Quadranten" im Oberkiefer → 12, 14, 16, 22, 24, 26. */
export function regioZaehne(text) {
  const roh = String(text || "");
  const k = roh.toLowerCase();
  const m = k.match(/regio\s+([1-8](?:\s*(?:,|und)\s*[1-8])*)/);
  if (!m) return [];
  const nums = [...m[1].matchAll(/[1-8]/g)].map((x) => x[0]);
  if (!nums.length) return [];
  const ok = /\boberkiefer\b|\bok\b/.test(k) || !/\bunterkiefer\b|\buk\b/.test(k);
  const uk = /\bunterkiefer\b|\buk\b/.test(k);
  // "rechts und links" nur als Paar. "Sinuslift rechts und internem … links" ist keine Seitenangabe der Region.
  const beide = /beiden?\s+quadranten|beiden?\s+seiten|rechts\s+und\s+links|links\s+und\s+rechts/.test(k);
  const rechtsWort = /\brechts\b/.test(k);
  const linksWort = /\blinks\b/.test(k);
  const quads = [];
  const seite = (rechts, links) => {
    if (beide) quads.push(rechts, links);
    else if (rechtsWort && !linksWort) quads.push(rechts);
    else if (linksWort && !rechtsWort) quads.push(links);
  };
  if (ok) seite("1", "2");
  if (uk) seite("4", "3");
  return [...new Set(quads.flatMap((q) => nums.map((n) => q + n)))];
}

const fdiSchonDa = (t) => /(?<!\d)[1-4][1-8](?!\d)/.test(t);

/** Engine-Text: fehlende Zahnnummern aus "regio …" ergänzen. Strukturierte Angaben überschreiben nichts Gesagtes. */
export function versorgungFuerEngine(teil) {
  let t = String(teil?.versorgung || teil?.text || "").trim();
  const extra = [];
  const zaehne = Array.isArray(teil?.zaehne) ? teil.zaehne.map(String).filter((z) => /^[1-4][1-8]$/.test(z)) : [];
  if (!fdiSchonDa(t)) {
    const liste = zaehne.length ? zaehne : regioZaehne(t);
    if (liste.length) {
      t = t.replace(/regio\s+[1-8](?:\s*(?:,|und)\s*[1-8])*/i, " ").replace(/\s{2,}/g, " ").trim();
      extra.push(`an ${liste.join(", ")}`);
    }
  }
  const sinus = teil?.sinus && typeof teil.sinus === "object" ? teil.sinus : null;
  if (sinus?.rechts && !/sinus\w*\s+rechts|rechts\s+\w*sinus/i.test(t)) {
    extra.push(`${sinus.rechts === "intern" ? "interner" : "externer"} Sinuslift rechts`);
  }
  if (sinus?.links && !/sinus\w*\s+links|links\s+\w*sinus/i.test(t)) {
    extra.push(`${sinus.links === "intern" ? "interner" : "externer"} Sinuslift links`);
  }
  return extra.length ? `${t}${t ? ", " : ""}${extra.join(", ")}` : t;
}

/** Nur das Gesagte. Ein gesetztes Werkzeugfeld ist noch keine Antwort des Zahnarztes. */
export function protheseGesagt(text) {
  const t = String(text || "");
  if (/\bprivat/.test(t) && !/\bkasse|gesetzlich/.test(t)) return "privat";
  if (/\bkasse|gesetzlich|\bhkp\b|festzuschuss/.test(t)) return "kasse";
  return "";
}

/**
 * Prothese: das Gesagte schlägt die Akte, die Akte schlägt ein mitgegebenes Feld.
 * Ohne alles bleibt die Art leer, dann wird einmal gefragt.
 */
export function protheseWahl(text, angegeben, akte = "") {
  const gesagt = protheseGesagt(text);
  if (gesagt) return { art: gesagt, quelle: "gesagt" };
  if (akte === "kasse" || akte === "privat") return { art: akte, quelle: "akte" };
  const a = String(angegeben || "").trim().toLowerCase();
  if (a === "kasse" || a === "privat") return { art: a, quelle: "angabe" };
  return { art: "", quelle: "" };
}

export function protheseArt(text, angegeben, akte = "") {
  return protheseWahl(text, angegeben, akte).art;
}

const BONUS_WORT = { "60": "60", "70": "70", "75": "75", "100": "100" };

/** „70“, „fünf Jahre“, „ohne Bonus“, „Härtefall“ → Festzuschuss-Stufe. */
export function bonusNorm(roh) {
  const t = String(roh || "").toLowerCase().replace("%", "").trim();
  if (!t) return "";
  if (BONUS_WORT[t]) return BONUS_WORT[t];
  if (/härte|haerte/.test(t)) return "100";
  if (/zehn|10 jahre|\b75\b/.test(t)) return "75";
  if (/fünf|fuenf|5 jahre|\b70\b/.test(t)) return "70";
  if (/ohne|kein|\b60\b/.test(t)) return "60";
  return "";
}

/** Versicherung und Bonus, soweit die Akte sie trägt. Leer heißt: nicht raten. */
export function akteVon(p) {
  const o = p || {};
  const text = `${o.versicherung || ""} ${o.insurance || ""}`.toLowerCase();
  const privat = o.privateInsurance === true || /\bprivat/.test(text);
  const kasse = o.privateInsurance === false || /gesetz|kasse|\bgkv\b/.test(text);
  return {
    versicherung: privat && !kasse ? "privat" : kasse && !privat ? "kasse" : privat ? "privat" : "",
    bonus: bonusNorm(o.bonus || o.bonusheft || ""),
  };
}

/** Bonus aus dem Satz, sonst aus der Antwort, sonst aus der Akte. */
export function bonusAus(text, angegeben, akteBonus = "") {
  let erkannt = "";
  try { erkannt = E.auftragVerstehen(String(text || "")).bonus || ""; } catch { erkannt = ""; }
  return erkannt || bonusNorm(angegeben) || bonusNorm(akteBonus);
}

/** Implantation und die spätere Prothese sind ein Fall. Eine Prothese auf schon stehenden Implantaten bleibt ein Plan. */
export function verbundSatz(text) {
  const t = String(text || "");
  const setzt = /implantatversorgung|implantation|sinus|augmentation|knochenaufbau|\b(?:\d+|zwei|drei|vier|sechs|acht)\s+implantat/i.test(t);
  const darauf = /auf (?:den |die )?implantat/i.test(t);
  return setzt && !darauf && PROTHESE.test(t);
}

function protheseSatz(text) {
  const n = String(text).match(/all[\s-]*on[\s-]*(4|vier|four|6|sechs|six)/i);
  const sechs = !n || /6|sechs|six/.test(n[1]);
  const uk = /\buk\b|unterkiefer/i.test(text) && !/\bok\b|oberkiefer/i.test(text);
  return `All-on-${sechs ? 6 : 4} ${uk ? "Unterkiefer" : "Oberkiefer"}`;
}

function artAus(teil, text) {
  const a = String(teil?.planart || "").trim().toLowerCase();
  if (ARTEN.has(a)) return a;
  if (CHIRURGIE.test(text) && !(PROTHESE.test(text) && !/implantat(?!\w*(?:kron|getragen|br|prothes))/i.test(text))) return "impl";
  if (PROTHESE.test(text)) return protheseArt(text, teil?.prothese);
  return a;
}

/** Die ZE-Engine findet keine Versorgung, die Kons-Engine aber einen Zahn mit Therapie (Füllung, Inlay, Wurzelbehandlung). */
function nurKons(text) {
  let ze = null;
  try { ze = E.auftragVerstehen(text); } catch { ze = null; }
  if (ze?.versorgung) return false;
  let kons = null;
  try { kons = K.konsAuftragVerstehen(text); } catch { kons = null; }
  return Object.keys(kons?.zaehne || {}).length > 0;
}

/**
 * Ein Satz oder eine Teile-Liste wird zu den Engine-Aufträgen. Fehlende Kasse/Privat-Angabe bleibt eine Frage —
 * außer in der Musterrechnung (`engineArt`): dort rechnet reine Zahnerhaltung als private Kons.
 */
export function teileAufloesen(body, { engineArt = false, akte = "" } = {}) {
  const roh = typeof body?.teile === "string" && body.teile.trim().startsWith("[")
    ? (() => { try { return JSON.parse(body.teile); } catch { return null; } })()
    : body?.teile;
  let teile = [];
  let versicherungQuelle = "";
  if (Array.isArray(roh) && roh.length) {
    teile = roh.map((t) => {
      if (istSchiene(t)) return schieneTeil({ ...t, schienen: t.schienen ?? body?.schienen, abformung: t.abformung ?? body?.abformung });
      const versorgung = versorgungFuerEngine(t);
      return { planart: artAus(t, versorgung), versorgung };
    }).filter((t) => t.versorgung);
  } else if (istSchiene(body)) {
    teile = [schieneTeil(body)];
  } else {
    const text = String(body?.versorgung || body?.auftrag || "").trim();
    if (!text) return { teile: [], frage: "Was soll ich rechnen?" };
    const chirurgie = CHIRURGIE.test(text);
    const prothese = PROTHESE.test(text);
    const wahl = protheseWahl(text, body?.prothese, akte);
    if (chirurgie && prothese) {
      teile = [
        { planart: "impl", versorgung: versorgungFuerEngine({ versorgung: text, zaehne: body?.zaehne, sinus: body?.sinus }) },
        { planart: wahl.art, versorgung: protheseSatz(text) },
      ];
    } else {
      const versorgung = versorgungFuerEngine({ versorgung: text, zaehne: body?.zaehne, sinus: body?.sinus });
      const planart = artAus({ planart: body?.planart, prothese: wahl.art }, versorgung);
      teile = [{ planart, versorgung }];
    }
    versicherungQuelle = wahl.quelle;
  }
  teile = teile.map((t) => (t.planart === "privat" || (engineArt && !t.planart)) && nurKons(t.versorgung)
    ? { ...t, planart: "kons" } : t);
  if (teile.some((t) => !t.planart && PROTHESE.test(t.versorgung))) {
    return { teile, frage: "Für die Prothese: über die Kasse mit Festzuschuss, oder privat?" };
  }
  if (teile.some((t) => !ARTEN.has(t.planart))) {
    return { teile, frage: "Welche Planart: Kassen-HKP, privater Zahnersatz, Implantologie, private Kons, Füllungs-MKV oder Schiene privat?" };
  }
  return { teile, frage: "", versicherungQuelle };
}

function zeilenAus(r) {
  const rech = r?.rechnung;
  const kalk = r?.kalkulation;
  // Kons und Mehrkosten führen ihre Positionen je Zahn; bei Mehrkosten steht die BEMA-Leistung der Kasse daneben.
  const jeZahn = Array.isArray(rech?.zaehne)
    ? rech.zaehne.flatMap((z) => [...(z?.zeilen || []), ...(z?.kasse ? [{ ...z.kasse, zahn: z.zahn }] : [])])
    : [];
  const roh = [
    ...(rech ? [...(Array.isArray(rech.honorar) ? rech.honorar : []), ...(rech.honorarGoz || []), ...(rech.honorarGoae || []), ...(rech.material || []), ...(rech.labor || [])] : []),
    ...jeZahn,
    ...(Array.isArray(rech?.begleit) ? rech.begleit : []),
    ...(Array.isArray(rech?.frei) ? rech.frei : []),
    ...(kalk ? [...(kalk.honorar || []), ...(kalk.material || []), ...(kalk.labor || [])] : []),
    ...(r?.ergebnis?.positionen || []),
  ];
  return roh.filter((p) => p && p.nr).map((p) => ({
    ebene: String(p.ebene || ""),
    nr: String(p.nr),
    zahn: String(p.zahn || ""),
    text: String(p.text || p.bezeichnung || "").replace(/\s+/g, " ").slice(0, 90),
    anzahl: Number(p.anzahl) || 1,
    betrag: zahl(p.betrag ?? (p.preis != null ? Number(p.preis) * (Number(p.anzahl) || 1) : p.summe ?? 0)),
  }));
}

function summenVon(planart, r) {
  const z = r.zusammenfassung || {};
  if (planart === "impl") return { summe: zahl(z.summe), honorar: zahl(z.honorar), materialLabor: zahl(z.materialLabor) };
  if (planart === "kons") return { summe: zahl(z.summe) };
  if (planart === "schiene") return { summe: zahl(z.summe), honorar: zahl(z.honorar), labor: zahl(z.labor) };
  if (planart === "mkv") return { mehrkosten: zahl(z.mehrkosten), kassenanteil: zahl(z.kassenanteil) };
  if (planart === "privat") return { gesamt: zahl(z.gesamt), honorar: zahl(z.honorar), labor: zahl(z.labor), material: zahl(z.material) };
  const s = r.ergebnis?.summen || {};
  return {
    gesamt: zahl(s.gesamt), festzuschuss: zahl(s.festzuschuss), kassenanteil: zahl(s.kassenanteil),
    eigenanteil: zahl(s.eigenanteil),
  };
}

function summeZeilen(planart, summen) {
  if (planart === "impl" || planart === "kons" || planart === "schiene") return [`Gesamt ${euro(summen.summe)}`];
  if (planart === "mkv") return [`Mehrkosten ${euro(summen.mehrkosten)}`, `Kasse ${euro(summen.kassenanteil)}`];
  if (planart === "privat") return [`Gesamt ${euro(summen.gesamt)}`];
  return [
    `Gesamt ${euro(summen.gesamt)}`, `Festzuschuss ${euro(summen.festzuschuss)}`, `Eigenanteil ${euro(summen.eigenanteil)}`,
    ...(summen.kzv ? [`Begleitleistungen über die KZV ${euro(summen.kzv)}`] : []),
  ];
}

/** Private Begleitleistungen erhöhen Rechnung bzw. Mehrkosten; die der Kasse laufen über die KZV. */
function summenMitBegleit(planart, summen, neu) {
  const summe = (zs) => zahl(zs.reduce((s, z) => s + z.betrag, 0));
  const privat = neu.filter((z) => !z.kzv);
  const p = summe(privat);
  const kzv = summe(neu.filter((z) => z.kzv));
  const s = { ...summen };
  if (planart === "kons" || planart === "schiene") s.summe = zahl(s.summe + p);
  if (planart === "mkv") Object.assign(s, { mehrkosten: zahl(s.mehrkosten + p), kassenanteil: zahl(s.kassenanteil + kzv) });
  if (planart === "privat") {
    const material = summe(privat.filter((z) => z.ebene === "MAT"));
    Object.assign(s, { gesamt: zahl(s.gesamt + p), honorar: zahl(s.honorar + p - material), material: zahl(s.material + material) });
  }
  if (planart === "kasse" && kzv) s.kzv = kzv;
  return s;
}

// Befund ohne eigenen Zahn: fehlend, nicht erhaltungswürdig, ersetzt, Implantat.
const OHNE_ZAHN = /^(?:f|x|e|ew|b|bw|ab|abw|i\w*|s\w*)$/;

/** Zähne, an denen weder Anästhesie noch Pfeilerröntgen anfällt: Implantate des Falls und Lücken im Befund. */
function ohneEigenenZahn(teile, befund) {
  const ohne = new Set(teile.filter((t) => t.planart === "impl").flatMap((t) => Object.keys(t.r?.plan?.zaehne || {})));
  for (const t of teile) {
    let ausAuftrag = {};
    try { ausAuftrag = E.befundVerstehen(t.versorgung) || {}; } catch { ausAuftrag = {}; }
    for (const [zahn, code] of Object.entries({ ...ausAuftrag, ...befund })) {
      if (OHNE_ZAHN.test(String(code || "").trim().toLowerCase())) ohne.add(zahn);
    }
  }
  return ohne;
}

const kchCache = new Map();
/** KCH-Punktwert der Praxis-KZV. Die Tabelle der KZVen führt die Füllungs-MKV-Engine. */
function kchPunktwert(ctx) {
  const key = `${ctx.praxisPlz || ""}|${ctx.kzvNr || ""}`;
  if (!kchCache.has(key)) {
    const r = M.mkvEntwurf("Füllung o an 16", {}, { praxis: { plz: ctx.praxisPlz || "", kzvNr: ctx.kzvNr || "" } });
    kchCache.set(key, Number(r?.rechnung?.punktwert) || 0);
  }
  return kchCache.get(key);
}

function begleitDazu(teile, body, ctx, befund) {
  const wahl = begleitWahl(body?.begleit);
  const ohne = ohneEigenenZahn(teile, befund);
  for (const t of teile) {
    // Nur die MKV-Engine rechnet mit dem KCH-Punktwert; der Kassen-HKP führt den ZE-Punktwert.
    const punktwert = () => (t.planart === "mkv" && Number(t.r?.rechnung?.punktwert)) || kchPunktwert(ctx);
    const neu = begleitleistungen(t, { ohne, wahl, punktwert });
    if (!neu.length) continue;
    t.zeilen = [...t.zeilen, ...neu];
    t.summen = summenMitBegleit(t.planart, t.summen, neu);
  }
}

/** Musterbefund, den Clara für Zahnersatz ohne Patient mitgibt ("36 fehlt, 35 und 37 ww"). */
function musterBefund(body) {
  const text = String(body?.befund || "").trim();
  if (!text) return {};
  try { return E.befundVerstehen(text) || {}; } catch { return {}; }
}

const KIEFER_ZAEHNE = {
  OK: ["11", "12", "13", "14", "15", "16", "17", "21", "22", "23", "24", "25", "26", "27"],
  UK: ["31", "32", "33", "34", "35", "36", "37", "41", "42", "43", "44", "45", "46", "47"],
};
const ZAHN_VERSORGUNG = new Set(["kronen", "bruecke", "implantatkronen", "inlay"]);

/**
 * Zahnersatz-Muster ohne Befund: der typische Ausgangsbefund steckt im Auftrag selbst.
 * Pfeiler sind erneuerungsbedürftig, Glieder und Implantatsitze fehlen; bei einer
 * Kieferprothese fehlt der Rest des Kiefers. Totalprothese und All-on rechnen ohne Befund.
 */
function standardBefund(teile) {
  const befund = {};
  for (const t of teile) {
    if (t.planart !== "privat" && t.planart !== "kasse") continue;
    let a = null;
    try { a = E.auftragVerstehen(t.versorgung); } catch { a = null; }
    if (!a?.versorgung || a.versorgung === "totalprothese" || a.versorgung === "allon") continue;
    const kiefer = !ZAHN_VERSORGUNG.has(a.versorgung) ? KIEFER_ZAEHNE[a.kiefer] || [] : [];
    for (const z of kiefer) befund[z] ??= "f";
    for (const z of a.glieder || []) befund[z] = "f";
    for (const z of a.pfeiler || []) befund[z] = a.aufImplantat ? "f" : "ww";
    for (const z of a.entfernen || []) befund[z] = "x";
  }
  return befund;
}

const KANAELE_GESAGT = { 1: "einen Kanal", 2: "zwei Kanäle", 3: "drei Kanäle" };

/** Typische Kanalzahl für die Musterrechnung: Molaren drei, obere Vierer zwei, sonst einer. */
function typischeKanaele(zahn) {
  const pos = Number(String(zahn).slice(-1));
  if (pos >= 6) return 3;
  return pos === 4 && Number(String(zahn)[0]) <= 2 ? 2 : 1;
}

/** Endo-Muster ohne Kanalzahl: die typische an den Auftrag hängen, damit die Engine rechnet. */
function mitTypischenKanaelen(teil) {
  let ohne = [];
  try { ohne = K.konsAuftragVerstehen(teil.versorgung).ohneKanaele || []; } catch { ohne = []; }
  if (!ohne.length) return null;
  const n = [...ohne].sort((a, b) => Number(a) - Number(b)).map((z) => [z, typischeKanaele(z)]);
  return {
    teil: { ...teil, versorgung: `${teil.versorgung}, ${n.map(([z, k]) => `${z} mit ${k} Kanälen`).join(", ")}` },
    satz: `Als Beispiel nehme ich ${aufzaehlen(n.map(([z, k]) => `an ${z} ${KANAELE_GESAGT[k]}`))} an.`,
  };
}

function aufzaehlen(zaehne) {
  return zaehne.length > 1 ? `${zaehne.slice(0, -1).join(", ")} und ${zaehne.at(-1)}` : zaehne[0];
}

/** Der angenommene Befund als Satz; viele fehlende Zähne eines Kiefers heißen "die übrigen Zähne". */
function befundSatz(befund) {
  const nach = (code) => Object.keys(befund).filter((z) => befund[z] === code).sort();
  const teile = [];
  const ww = nach("ww");
  const f = nach("f");
  const x = nach("x");
  if (ww.length) teile.push(`${aufzaehlen(ww)} ${ww.length > 1 ? "sind" : "ist"} erneuerungsbedürftig`);
  if (x.length) teile.push(`${aufzaehlen(x)} ${x.length > 1 ? "werden" : "wird"} entfernt`);
  if (f.length > 4) teile.push("die übrigen Zähne im Kiefer fehlen");
  else if (f.length) teile.push(`${aufzaehlen(f)} ${f.length > 1 ? "fehlen" : "fehlt"}`);
  if (!teile.length) return "";
  return `Als Ausgangsbefund nehme ich an: ${teile.length > 1 ? `${teile.slice(0, -1).join(", ")} und ${teile.at(-1)}` : teile[0]}.`;
}

function titelVon(planart, r) {
  if (planart === "impl") return I.implVersorgungSatz(r.zusammenfassung);
  if (planart === "schiene") return KB.kbVersorgungSatz(r.zusammenfassung);
  const z = r.zusammenfassung || {};
  if (z.ankerGesagt) return String(z.ankerGesagt);
  const zaehne = (planart === "kons" || planart === "mkv") && Array.isArray(r.rechnung?.zaehne) ? r.rechnung.zaehne : [];
  const teile = zaehne.filter((t) => t?.titel && t?.zahn).map((t) => `${t.titel} an ${t.zahn}`);
  if (teile.length) return teile.length > 1 ? `${teile.slice(0, -1).join(", ")} und ${teile.at(-1)}` : teile[0];
  if (planart === "privat") return "Privater Zahnersatz";
  if (planart === "kons") return "Kostenvoranschlag Kons";
  if (planart === "mkv") return "Füllungs-Mehrkosten";
  return "Kassenplan";
}

const KURZ = { impl: "Implantation", kasse: "Kassenplan", privat: "Privatplan", kons: "Kons", mkv: "Mehrkosten", schiene: "Schiene" };

function rechnenTeil(teil, ctx) {
  const befund = ctx.befund || {};
  const patient = ctx.patientDaten || {};
  const system = ctx.implantatSystem || "";
  if (teil.planart === "schiene") return KB.kbEntwurf({ vorlagen: teil.schienen || [], abformung: teil.abformung || "" }, { patient });
  if (teil.planart === "impl") return I.implEntwurf(teil.versorgung, befund, { patient, implantatSystem: system });
  if (teil.planart === "kons") return K.konsEntwurf(teil.versorgung, befund, { patient });
  if (teil.planart === "mkv") return M.mkvEntwurf(teil.versorgung, befund, { patient, praxis: { plz: ctx.praxisPlz || "", kzvNr: ctx.kzvNr || "" } });
  if (teil.planart === "privat") return P.privatZeEntwurf(teil.versorgung, befund, { patient, implantatSystem: system });
  return E.hkpEntwurf(teil.versorgung, befund, {
    patient, einstellungen: ctx.einstellungen || {}, implantatSystem: system,
    ...(ctx.bonus ? { bonus: ctx.bonus, haertefall: ctx.bonus === "100" } : {}),
  }, ctx.listen || {});
}

const VORRANG = new Set(["9010", "9040", "9050", "9000", "9100", "9110", "9120", "5000", "5040", "5070"]);

function leistungsname(t) {
  return zeilenKurz(String(t || "").replace(/\s+Knochenfensterung\b.*/i, "").replace(/\s+Mit einer Leistung\b.*/i, ""));
}

function rechnungZeilen(zeilen) {
  const map = new Map();
  for (const z of zeilen) {
    const name = leistungsname(z.text);
    const key = `${z.ebene}|${z.nr}|${name}`;
    const g = map.get(key) || { ...z, text: name, anzahl: 0, betrag: 0 };
    g.anzahl += z.anzahl;
    g.betrag = zahl(g.betrag + z.betrag);
    map.set(key, g);
  }
  const rang = (z) => (z.ebene === "MAT" ? 2 : z.ebene === "BEL" || z.ebene === "BEB" ? 3 : VORRANG.has(z.nr) ? 0 : 1);
  const geordnet = [...map.values()].sort((a, b) => rang(a) - rang(b) || String(a.nr).localeCompare(String(b.nr), "de"));
  const sichtbar = geordnet.slice(0, 18);
  const zeilenText = sichtbar.map((z) => {
    const geld = z.betrag ? ` · ${euro(z.betrag)}` : "";
    return { text: `${z.ebene} ${z.nr}${z.text ? ` ${z.text}` : ""} · ${z.anzahl}×${geld}`.replace(/\s+/g, " ") };
  });
  if (geordnet.length > sichtbar.length) zeilenText.push({ text: `${geordnet.length - sichtbar.length} weitere Positionen` });
  return zeilenText;
}

function karteBauen(teile, { muster, label, fallTitel }) {
  const items = [];
  for (const t of teile) {
    items.push({ icon: "list", level: "ok", text: `${t.kurz} · ${t.titel}` });
    for (const g of rechnungZeilen(t.zeilen)) {
      items.push({ icon: "list", level: "info", text: `${t.kurz} · ${g.text}` });
    }
    for (const s of summeZeilen(t.planart, t.summen)) {
      items.push({ icon: "euro", level: "ok", text: `${t.kurz} · ${s}` });
    }
  }
  return {
    kind: "hkp",
    tag: muster ? "Musterrechnung" : "Rechnung",
    title: label || (muster ? "Musterrechnung" : "Rechnung"),
    subtitle: fallTitel,
    heading: "Positionen und Beträge",
    items: items.slice(0, 48),
    footer: muster ? "Musterrechnung, nichts gespeichert. Beträge nur hier." : "Beträge nur hier. Anlegen erst nach Ihrem Ja.",
  };
}

/**
 * Rechnet jeden Teil. Rückfrage der Engine oder fehlende Planart kommt vor der Karte.
 * `teile` der Antwort trägt das Engine-Ergebnis fürs spätere Ablegen.
 */
/** Was Clara für eine Musterrechnung selbst angenommen hat (Beispielzahn, Material), als ganzer Satz vorneweg. */
function annahmeSatz(body, ctx) {
  const satz = String(body?.annahme || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!satz || !ctx.muster || /€|euro/i.test(satz)) return "";
  return /[.!?]$/.test(satz) ? satz : `${satz}.`;
}

export function fallRechnen(body, ctx = {}) {
  const annahme = annahmeSatz(body, ctx);
  const akte = ctx.akte || akteVon(ctx.patientDaten);
  const auf = teileAufloesen(body || {}, { engineArt: Boolean(ctx.muster), akte: akte.versicherung });
  if (auf.frage) return { status: "rueckfrage", frage: auf.frage };
  const kasseText = auf.teile.filter((t) => t.planart === "kasse").map((t) => t.versorgung).join(" ");
  const bonus = bonusAus(`${body?.versorgung || ""} ${kasseText}`, body?.bonus, akte.bonus);
  if (!ctx.muster && auf.teile.some((t) => t.planart === "kasse") && !bonus) {
    return { status: "rueckfrage", frage: "Welcher Bonus steht in der Akte: ohne Bonus, fünf Jahre oder zehn Jahre?" };
  }
  let befund = Object.keys(ctx.befund || {}).length ? ctx.befund : ctx.muster ? musterBefund(body) : {};
  let befundAnnahme = "";
  if (ctx.muster && !Object.keys(befund).length) {
    befund = standardBefund(auf.teile);
    befundAnnahme = befundSatz(befund);
  }
  const rctx = { ...ctx, befund, bonus };
  // Der Musterbefund beschreibt Zahnersatz ("25 k"); Zahnerhaltung und Implantologie rechnen im Muster ohne ihn,
  // sonst sperrt die Krone an 25 die Beispielfüllung.
  const ohneMusterBefund = { ...rctx, befund: {} };
  const ctxFuer = (planart) => (ctx.muster && planart !== "privat" && planart !== "kasse" ? ohneMusterBefund : rctx);
  const fertig = [];
  const angenommen = [];
  for (let teil of auf.teile) {
    let r = rechnenTeil(teil, ctxFuer(teil.planart));
    if (teil.planart === "kasse" && r.status === "rueckfrage" && nurKons(teil.versorgung)) {
      const mkv = rechnenTeil({ ...teil, planart: "mkv" }, ctxFuer("mkv"));
      if (mkv.status === "ok") {
        teil = { ...teil, planart: "mkv" };
        r = mkv;
      }
    }
    if (ctx.muster && teil.planart === "kons" && r.status === "rueckfrage" && r.grund === "kanaele") {
      const typisch = mitTypischenKanaelen(teil);
      if (typisch) {
        teil = typisch.teil;
        r = rechnenTeil(teil, ctxFuer(teil.planart));
        if (r.status === "ok") angenommen.push(typisch.satz);
      }
    }
    if (r.status !== "ok") {
      return {
        status: "rueckfrage",
        frage: r.frage || "Dazu fehlt mir noch eine Angabe.",
        grund: r.grund || "",
        teil: teil.planart,
        karte: fertig.length ? karteBauen(fertig, { muster: ctx.muster, label: ctx.patientLabel, fallTitel: fallTitel(fertig) }) : null,
      };
    }
    const zeilen = zeilenAus(r);
    fertig.push({
      planart: teil.planart,
      sprachPlan: ["impl", "kons", "mkv", "schiene"].includes(teil.planart) ? teil.planart : "",
      privat: teil.planart === "privat",
      versorgung: teil.versorgung,
      kurz: KURZ[teil.planart] || teil.planart,
      titel: titelVon(teil.planart, r),
      zeilen, summen: summenVon(teil.planart, r),
      hinweise: [...(r.hinweise || [])].filter((h) => !/€|euro/i.test(h)).slice(0, 4),
      r,
    });
  }
  // Patientenpläne gehen mit dem Engine-Plan nach PlanR; Zusatzzeilen nur in der Musterrechnung.
  if (ctx.muster) begleitDazu(fertig, body, ctx, befund);
  const titel = fallTitel(fertig);
  const pruefung = planPruefen(fertig.flatMap((t) => t.zeilen));
  const hinweis = [...fertig.flatMap((t) => t.hinweise), ...pruefung.slice(0, 2).map((e) => e.hinweis)].slice(0, 3);
  const teilSatz = (t) => t.planart === "impl" ? `die Implantation: ${t.titel}`
    : t.planart === "kasse" ? `die Prothese über die Kasse: ${t.titel}`
      : t.planart === "privat" ? `die Prothese privat: ${t.titel}`
        : t.titel;
  const namen = fertig.map((t, i) => `${["Erstens", "Zweitens", "Drittens"][i] || "Außerdem"} ${teilSatz(t)}.`);
  const satz = fertig.length === 1
    ? `Die Rechnung: ${fertig[0].titel}.`
    : `Die Rechnung hat ${fertig.length === 2 ? "zwei Teile" : `${fertig.length} Teile`}. ${namen.join(" ")}`;
  const wo = ctx.anzeige === "text" ? "in der Rechnung hier im Gespräch" : "auf dem Handy";
  const schluss = ctx.muster
    ? `Das ist eine Musterrechnung, ich speichere nichts. Alle Positionen und Beträge stehen ${wo}.`
    : `Alle Positionen und Beträge stehen ${wo}. Soll ich den Entwurf so anlegen?`;
  const begleitung = ctx.muster ? begleitSatz(fertig) : "";
  // Kons-, MKV- und ZE-Engine nennen ihre Annahmen (Material, Flächen, Kanäle, Abdruck) selbst; ein freier
  // Modellsatz ("Als Beispiel nehme ich eine Keramikkrone") widerspräche dort der Rechnung. In der Implantologie
  // nennt er den Beispielzahn, ohne den die Engine gar nicht rechnet.
  const modellAnnahme = fertig.every((t) => t.planart === "impl") ? annahme : "";
  const akteSatz = auf.versicherungQuelle === "akte"
    ? (akte.versicherung === "privat" ? "Die Versicherung steht in der Akte: privat." : "Die Versicherung steht in der Akte: gesetzlich.")
    : "";
  const bonusSatz = !ctx.muster && bonus && akte.bonus === bonus && !bonusAus(body?.versorgung || "", body?.bonus, "")
    ? `Der Bonus steht in der Akte: ${bonus} Prozent.`
    : "";
  const message = [modellAnnahme, akteSatz, bonusSatz, befundAnnahme, ...angenommen, satz, ...hinweis, begleitung, schluss]
    .filter(Boolean).join(" ");
  return {
    status: "ok",
    message,
    card: karteBauen(fertig, { muster: ctx.muster, label: ctx.patientLabel, fallTitel: titel }),
    fallTitel: titel,
    teile: fertig,
  };
}

function fallTitel(teile) {
  const prothese = teile.find((t) => /All-on-/.test(t.titel));
  if (prothese && teile.some((t) => t.planart === "impl")) return `${prothese.titel} mit Implantation`;
  if (teile.length === 1 && (teile[0].planart === "kons" || teile[0].planart === "mkv" || teile[0].planart === "schiene")) return teile[0].titel;
  return teile.map((t) => t.kurz).join(" und ");
}
