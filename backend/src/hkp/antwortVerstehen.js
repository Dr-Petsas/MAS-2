// Antwort des Chefs auf MAS' eigene HKP-Rueckfrage verstehen (Demo 04.11.2026, Chef: "wenig Regeln, umso
// mehr LLM - die Tools und die Ausgabe von Daten muessen deterministisch sein"). Das Modell liest nur, WAS der
// Satz auf genau diese Frage bedeutet, und liefert festes JSON; was daraus folgt (Freigabe, Anlegen, Zaehne
// entfernen, Befund schreiben), entscheidet die Route deterministisch. Ohne Modell: null, die Route faellt auf
// ihre einfachen Wortregeln zurueck. Notaus MAS_HKP_ANTWORT_LLM=0.
import { chat, strongLlm } from "../mail/llm.js";
import { log } from "../log.js";
import { nummernZusammen, wissenSuchen } from "./wissen.js";
import { ausschluesseZwischen, ausschlussSatz } from "./ausschluss.js";

const ARTEN = new Set(["zustimmung", "ablehnung", "angabe", "abbruch", "neustart", "gegenfrage", "unklar"]);
const QUELLEN = new Set(["pvs", "lena", "neu", ""]);
const PLAN_ART = new Set(["allon", "totalprothese", "teleskopprothese", "bruecke", "kronen", "implantatkronen", "locator", "steg", "inlay"]);
const PLAN_NAME = {
  allon: (n) => `All-on-${n}-Prothese`,
  totalprothese: () => "Totalprothese",
  teleskopprothese: () => "Teleskopprothese",
  bruecke: () => "Brücke",
  kronen: () => "Krone",
  implantatkronen: () => "Implantatkronen",
  locator: () => "Locator-Prothese",
  steg: () => "Stegprothese",
  inlay: () => "Inlay",
};
// Ohne Zahnnummern rechnet die Engine diese Versorgungen nie. "Brücke im Unterkiefer" aus einem "Ja, stimmt."
// ersetzte am 06.11.2026 den gesprochenen Auftrag "Brücke von 14 auf 16" - sie bleiben in den Worten des Arztes.
const ZAHNGEBUNDEN = new Set(["bruecke", "kronen", "implantatkronen", "inlay"]);
// Wissensbasis fuer die Absicht. Klein und fest im Prompt: die Engine rechnet danach,
// das Modell sucht hier nur, welche Versorgung der Satz meint (auch Verhörer und Umschreibungen).
const WISSEN = `Wissensbasis Versorgung, nur diese Bedeutungen:
- allon: festsitzende Brücke auf vier oder sechs Implantaten je Kiefer, eine Prothese. Auch All-on-4, All-on-four, All on Six, All-on-6, Orlon, und Verhörer wie Ballon oder Balon, wenn ein Kiefer oder eine Implantatzahl dabei ist. "feste Brücke auf sechs Implantaten", "festsitzend auf vier Implantaten" ist allon, keine Brücke auf eigenen Zähnen. n ist 4 oder 6.
- totalprothese: herausnehmbar, schleimhautgetragen, ohne Implantate. Auch Vollprothese, Totale.
- teleskopprothese: herausnehmbar auf Teleskopkronen oder Doppelkronen.
- locator: herausnehmbar auf Locator, Kugelkopf, Druckknopf oder Novaloc.
- steg: Prothese auf einem Steg.
- bruecke: festsitzend auf eigenen Zähnen. Nicht, wenn der Kiefer zahnlos auf Implantaten versorgt wird.
- implantatkronen: einzelne Kronen auf Implantaten, keine durchgehende Prothese.
- kronen: Krone auf einem Zahn. inlay: Inlay, Onlay, Teilkrone.
Nennt er eine Alternative ("doch lieber", "stattdessen", "nicht das, sondern"), gilt die neue Versorgung. Eine reine Befundwahl ("den aus DS-Win", "neuen Befund aufnehmen") ist kein Plan.
Eine angehaengte Wissensbasis erklaert Begriffe und ihr Mapping auf Ziffern. Sie aendert diese JSON-Form nicht. Keine Ziffer gehoert in die Antwort.`;
const ZAHN = /^[1-4][1-8]$/;
// Zustand -> Wortlaut, den der Befund-Parser der Engine (befundVerstehen) eindeutig liest
const ZUSTAND = {
  vorhanden: ["vorhanden", "vorhanden"],
  fehlt: ["fehlt", "fehlen"],
  ueberkront: ["überkront", "überkront"],
  krone_noetig: ["krone nötig", "krone nötig"],
  erneuerungsbeduerftig: ["erneuerungsbedürftig", "erneuerungsbedürftig"],
  nicht_erhaltungswuerdig: ["nicht erhaltungswürdig", "nicht erhaltungswürdig"],
  ersetzt: ["durch prothese ersetzt", "durch prothese ersetzt"],
  implantat: ["hat implantat", "haben implantat"],
  teleskop: ["teleskop", "teleskop"],
  brueckenglied: ["brückenglied", "brückenglied"],
};
const REIHE = {
  OK: ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
  UK: ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"],
};
const kieferVon = (z) => (z[0] === "1" || z[0] === "2" ? "OK" : "UK");

const SYSTEM = `Du fuehrst das Gespraech zur Heil- und Kostenplanung mit dem Zahnarzt.
Er redet frei. Der Text kommt aus einer Spracherkennung und enthaelt Hoerfehler
("Heilung-Kostenplan", "Oberkaefer", "Legt" statt "Leg").
Du triffst die Entscheidung und reagierst. Die Engine setzt danach Zaehne, Befund und Positionen
genau so, wie du sie in die Felder schreibst. Betraege, Punktwerte und Gebuehrenlisten nennst du nicht.

Antworte ausschliesslich mit einem JSON-Objekt, ohne Text davor oder danach:
{"art": "...", "quelle": "...", "entfernen": [], "erhalten": [], "angabe": "", "befund": null, "plan": null, "sagen": ""}

${WISSEN}
plan – nur bei art "angabe", und nur wenn er eine Versorgung nennt oder eine Alternative zum bisherigen Plan. Sonst null.
{"versorgung":"allon|totalprothese|teleskopprothese|bruecke|kronen|implantatkronen|locator|steg|inlay","n":4,"kiefer":"OK|UK|beide"}
n nur bei allon, sonst weglassen. kiefer "OK" Oberkiefer, "UK" Unterkiefer, "beide" wenn er beide nennt oder "oben und unten". Keine Zähne erfinden. Verhörer derselben Versorgung behalten die Zahl aus dem bisherigen Plan, wenn er keine neue Zahl sagt.

art – genau einer dieser Werte:
- "zustimmung": er bejaht die Frage ohne Einschraenkung ("Ja", "Das stimmt", "Der Befund stimmt", "Okay", "Passt",
  "Leg ihn so an", "Legt den erst mal so an", "Ja, gib das frei", "Ja genau, stell den Plan zusammen", "Mach so").
  Bei einer Auswahlfrage ("A oder B?") ist ein blosses "Ja" ebenfalls "zustimmung".
  Zustimmung heisst: er sagt Ja zu GENAU dem, was gefragt wurde. Eine Zustimmung kann etwas ins Praxisprogramm
  schreiben oder einen Plan anlegen – im Zweifel ist es KEINE Zustimmung. Waehlt er etwas, das in der Frage gar
  nicht zur Wahl stand (z. B. "Den aktuellen." auf "Stimmt der Befund so?" oder auf "Soll ich so anlegen?"),
  ist das "unklar".
- "ablehnung": er verneint ohne neue Angabe ("Nein", "Stimmt nicht", "So nicht", "Nein, lass den alten").
- "angabe": er nennt Inhalt – eine Auswahl, Zaehne, Material, eine Korrektur, eine Versorgung. Auch "Nein, 26 fehlt"
  oder "Ja, aber in Gold" sind "angabe", ebenso "Wir nehmen einen neuen Befund auf" (mit quelle "neu").
- "abbruch": er will diesen Plan nicht weitermachen ("vergiss es", "lass das", "machen wir noch mal von vorne").
- "neustart": er beginnt selbst einen neuen Auftrag ("Ich möchte für Herrn X einen Heil- und Kostenplan erstellen").
  Einen neuen BEFUND aufnehmen wollen ("Wir nehmen einen neuen Befund auf") ist kein neustart, sondern quelle "neu".
- "gegenfrage": er stellt selbst eine Frage, statt zu antworten.
- "unklar": die Antwort passt nicht zur Frage oder ist unverstaendlich (Selbstgespraech, Bemerkung an Kollegen).

quelle – bei der Frage, welchen Befund er nimmt ("Welchen Befund nehme ich ...: den aktuellen aus DS-Win ... oder ..."):
"pvs" fuer das Praxisprogramm (DS-Win, Dampsoft, "den aktuellen", "den ersten", "den aus der Kartei"), "lena" fuer
Lenas Erstuntersuchung, "neu" fuer einen neuen Befund. Ein blosses "Ja" meint die zuerst genannte Moeglichkeit;
"Nein, den von DS-Win" ist "pvs". Bei den anderen Befundfragen ("Stimmt der Befund so?", "Was stimmt am Befund
nicht?", "Gilt der noch?") nur "neu", wenn er den Befund ganz neu aufnehmen will ("Wir nehmen einen neuen Befund auf",
"Ich diktiere ihn neu"), sonst "". Bei allen anderen Fragen immer "".

entfernen / erhalten – nur wenn die Frage nach stehenden Zaehnen fragt (entfernen oder stehen lassen): die Zaehne
als zweistellige FDI-Nummern (Strings). "Zwoelf wird entfernt" -> entfernen ["12"]; "eins drei bleibt" -> erhalten
["13"]. Sagt er pauschal "alle raus" oder bejaht er "Sollen die alle entfernt werden?", stehen in entfernen ALLE in
der Frage genannten Zaehne. Sonst beide leer.

angabe – bei art "angabe": sein fachlicher Inhalt als kurzer deutscher Satz in seinen Worten, Zahnnummern als
zweistellige FDI-Zahlen ("1,3" / "eins drei" / "dreizehn" -> 13). Fuellwoerter, Hoerfehler und Hoeflichkeit weg.
Erfinde nichts dazu, ergaenze keine Zaehne, die er nicht genannt hat. Was schon in quelle, entfernen oder erhalten
steht, wiederholst du hier NICHT ("Nein, den von DS-Win bitte" -> quelle "pvs", angabe ""; "Wir nehmen einen neuen
Befund auf" -> quelle "neu", angabe ""). Sonst "".
Was er zum Befund sagt (welcher Zahn fehlt, steht, ueberkront ist ...), gehoert NICHT in angabe, sondern in befund.

befund – sobald er sagt, in welchem Zustand Zaehne SIND (Befund-Diktat, Korrektur eines vorgelesenen Befunds,
"13 und 23 stehen, alle anderen fehlen"), sonst null. Dann ist art "angabe". Form:
{"kiefer": "OK" | "UK" | "beide" | "", "zaehne": {"13": "vorhanden", "23": "vorhanden"}, "rest": "fehlt" | "vorhanden" | ""}
- zaehne: jeder ausdruecklich genannte Zahn (FDI, zweistellig) mit genau einem Zustand aus: "vorhanden", "fehlt",
  "ueberkront", "krone_noetig", "erneuerungsbeduerftig", "nicht_erhaltungswuerdig", "ersetzt", "implantat",
  "teleskop", "brueckenglied". "steht", "ist da", "ist noch drin" = "vorhanden". "ist raus", "ist gezogen",
  "ist entfernt", "ist weg", "Luecke" = "fehlt" (ein Zahn, der schon entfernt IST, fehlt). "muss raus",
  "wird gezogen", "nicht zu halten" = "nicht_erhaltungswuerdig". Was er fuer die Versorgung PLANT ("bekommt eine
  Teleskopkrone", "wird ersetzt") ist kein Befund und gehoert nicht in zaehne.
- rest: Zustand aller NICHT genannten Zaehne, nur wenn er ihn ausdruecklich sagt ("alle anderen fehlen", "der Rest
  ist entfernt", "sonst stehen alle", "es stehen nur 13 und 23" -> "fehlt"). Sonst "".
  Sagt er den Rest je Kiefer verschieden, ist rest ein Objekt je Kiefer: "13 und 23 sind vorhanden, alle anderen im
  Oberkiefer fehlen, im Unterkiefer sind alle Zaehne da" -> "kiefer": "beide", "zaehne": {"13": "vorhanden",
  "23": "vorhanden"}, "rest": {"OK": "fehlt", "UK": "vorhanden"}.
- kiefer: der Kiefer, fuer den er spricht. "Im Oberkiefer stehen 13 und 23, alle anderen sind entfernt" -> "OK"
  ("alle anderen" sind dann die anderen im Oberkiefer). "beide" nur, wenn er ausdruecklich beide Kiefer oder den
  ganzen Mund meint; unbekannt "".

sagen – der eine Satz, den der Zahnarzt jetzt hoert. Gesprochenes Deutsch, ein oder zwei kurze Saetze.
Du reagierst auf das, was er gesagt hat, und nennst die Entscheidung beim Namen
(Totalprothese, Teleskopprothese, All-on-4, All-on-6, Bruecke, Krone).
Frag nur das eine, was du in den Feldern noch nicht entscheiden konntest.
Kein "ich rechne", keine Betraege, keine Punktwerte.

Abrechnungsfrage: fragt er, ob zwei Nummern in einer Sitzung zusammengehen, wie oft eine Nummer angesetzt wird,
oder was ein Kommentar dazu sagt, ist art "gegenfrage". Die Antwort steht in sagen und nur dort.
Sie kommt aus dem Kommentar oder dem Abrechnungsbeispiel der Wissensbasis, sonst aus einer Praxisposition,
die dort ausdruecklich steht. "Nicht neben" heisst: nicht in derselben Sitzung. Nenne die Nummern.
Steht kein Kommentar, der die beiden Nummern verknuepft, sag das. Erfinde keine Ausschlussregel,
kein Abrechnungsbeispiel und keine Analogposition.`;

function jsonAus(text) {
  const t = String(text || "");
  const a = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (a < 0 || e <= a) return null;
  try {
    return JSON.parse(t.slice(a, e + 1));
  } catch {
    return null;
  }
}

const zaehneAus = (x, erlaubt) => [...new Set((Array.isArray(x) ? x : []).map((z) => String(z).trim()))]
  .filter((z) => ZAHN.test(z) && (!erlaubt?.length || erlaubt.includes(z)));

const restZustand = (r) => (r === "fehlt" || r === "vorhanden" ? r : "");
const restJeKiefer = (rest) => !!rest && typeof rest === "object";

function befundPruefen(b) {
  if (!b || typeof b !== "object") return null;
  const zaehne = {};
  for (const [z, s] of Object.entries(b.zaehne && typeof b.zaehne === "object" ? b.zaehne : {})) {
    if (ZAHN.test(String(z).trim()) && ZUSTAND[s]) zaehne[String(z).trim()] = s;
  }
  let rest = restZustand(b.rest);
  if (restJeKiefer(b.rest)) {
    const je = Object.fromEntries(["OK", "UK"].map((k) => [k, restZustand(b.rest[k])]).filter(([, r]) => r));
    rest = Object.keys(je).length ? je : "";
  }
  const kiefer = ["OK", "UK", "beide"].includes(b.kiefer) ? b.kiefer : "";
  return Object.keys(zaehne).length || (rest && (kiefer || restJeKiefer(rest))) ? { kiefer, zaehne, rest } : null;
}

/** Struktur aus dem Modell -> Satz, den die Engine versteht. Alles andere wird verworfen. */
export function planSatz(plan) {
  if (!plan || typeof plan !== "object" || !PLAN_ART.has(plan.versorgung) || ZAHNGEBUNDEN.has(plan.versorgung)) return "";
  const n = Number(plan.n);
  if (plan.versorgung === "allon" && n !== 4 && n !== 6) return "";
  const name = PLAN_NAME[plan.versorgung](n);
  if (plan.kiefer === "beide") {
    return plan.versorgung === "allon"
      ? `${name} im Oberkiefer und ${name} im Unterkiefer`
      : `${name} im Oberkiefer und im Unterkiefer`;
  }
  if (plan.kiefer === "OK") return `${name} im Oberkiefer`;
  if (plan.kiefer === "UK") return `${name} im Unterkiefer`;
  return "";
}

/** Modellantwort -> festes Ergebnis; ungueltig -> null */
export function antwortPruefen(roh, frageZaehne = []) {
  const d = roh && typeof roh === "object" ? roh : null;
  if (!d || !ARTEN.has(d.art)) return null;
  const erlaubt = frageZaehne.map(String);
  const befund = befundPruefen(d.befund);
  // Ein genannter Befund ist nie ein blosses Ja/Nein; "neuer Befund" (quelle "neu") ist kein neuer Plan (Probe 04.11.2026)
  const art = befund && (d.art === "zustimmung" || d.art === "ablehnung") ? "angabe"
    : d.art === "neustart" && d.quelle === "neu" ? "angabe" : d.art;
  const plan = art === "angabe" ? planSatz(d.plan) : "";
  const sagen = sagenPruefen(d.sagen);
  return {
    art,
    quelle: QUELLEN.has(d.quelle) ? d.quelle : "",
    entfernen: zaehneAus(d.entfernen, erlaubt),
    erhalten: zaehneAus(d.erhalten, erlaubt),
    angabe: art === "angabe" ? String(d.angabe || "").trim().slice(0, 400) : "",
    befund,
    ...(plan ? { plan } : {}),
    ...(sagen ? { sagen } : {}),
  };
}

/** Gesprochener Satz des Modells. Betraege und Punktwerte fliegen raus, Nummern und Katalogworte bleiben. */
export function sagenPruefen(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length < 8 || t.length > 420) return "";
  if (/€|\beuro\b|punktwert/i.test(t)) return "";
  return t;
}

const aufzaehlen = (zs) => (zs.length <= 1 ? zs.join("") : `${zs.slice(0, -1).join(", ")} und ${zs[zs.length - 1]}`);

/**
 * Verstandener Befund -> Befundsatz im Wortlaut der Engine ("13 und 23 vorhanden, 11, 12 ... fehlen").
 * "rest" gilt fuer die nicht genannten Zaehne des genannten Kiefers (ohne Kiefer: die Kiefer der genannten Zaehne,
 * sonst planKiefer), nie ausserhalb der Kiefer des Plans. Deterministisch, damit derselbe Befund immer denselben Satz ergibt.
 */
export function befundSatz(befund, planKiefer = []) {
  if (!befund) return "";
  const genannt = Object.keys(befund.zaehne);
  const plan = planKiefer.filter((k) => REIHE[k]);
  const je = restJeKiefer(befund.rest);
  const kiefer = (je ? Object.keys(befund.rest) : befund.kiefer === "beide" ? ["OK", "UK"] : befund.kiefer ? [befund.kiefer]
    : genannt.length ? [...new Set(genannt.map(kieferVon))] : plan).filter((k) => !plan.length || plan.includes(k));
  const zustand = { ...befund.zaehne };
  for (const k of kiefer) {
    const rest = je ? befund.rest[k] : befund.rest;
    if (rest) for (const z of REIHE[k]) if (!(z in zustand)) zustand[z] = rest;
  }
  const gruppen = new Map();
  for (const k of ["OK", "UK"]) {
    for (const z of REIHE[k]) if (z in zustand) gruppen.set(zustand[z], [...(gruppen.get(zustand[z]) || []), z]);
  }
  return [...gruppen].map(([s, zs]) => `${aufzaehlen(zs)} ${ZUSTAND[s][zs.length > 1 ? 1 : 0]}`).join(", ");
}

const merker = new Map();
const MERK_MS = 2 * 60 * 1000;
let fragen = (messages, opts) => chat(messages, opts);
export function _setFragen(fn) { fragen = fn || ((messages, opts) => chat(messages, opts)); merker.clear(); }

/**
 * frage: MAS' Rueckfrage im Wortlaut; satz: die woertliche Antwort; zaehne: in der Frage genannte Zaehne.
 * -> { art, quelle, entfernen, erhalten, angabe } | null (kein Modell erreichbar oder Antwort ungueltig)
 */
export async function antwortVerstehen({ frage, satz, zaehne = [], bisher = "", praxis = null }) {
  if (process.env.MAS_HKP_ANTWORT_LLM === "0") return null;
  const f = String(frage || "").trim();
  const s = String(satz || "").trim();
  const planBisher = String(bisher || "").trim();
  if (!f || !s) return null;
  const praxisStempel = praxis?.stand || praxis?.pvs || "";
  const k = `${f}\n${planBisher}\n${praxisStempel}\n${s}`;
  const alt = merker.get(k);
  if (alt && Date.now() - alt.at < MERK_MS) return alt.r;
  const { base, model } = strongLlm();
  const wissen = await wissenSuchen(s, praxis);
  const user = `Rueckfrage der Software: "${f}"${zaehne.length ? `\nIn der Frage genannte Zaehne: ${zaehne.join(", ")}` : ""}${planBisher ? `\nBisheriger Plan: "${planBisher}"` : ""}\nAntwort des Zahnarztes: "${s}"${wissen ? `\n\n${wissen}` : ""}`;
  // Ein ganzer Kieferbefund braucht gut 10 s; Clara wartet hoechstens 30 s auf das ganze Werkzeug.
  const res = await fragen([{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    { temperature: 0, maxTokens: 900, model, baseUrl: base, timeoutMs: Number(process.env.MAS_HKP_ANTWORT_MS || 20000) });
  const r = res?.ok ? antwortPruefen(jsonAus(res.text), zaehne) : null;
  if (r) {
    for (const [key, v] of merker) if (Date.now() - v.at > MERK_MS) merker.delete(key);
    merker.set(k, { r, at: Date.now() });
  }
  return r;
}

const MUND_SYSTEM = `Du bist die Abrechnungsassistentin der Zahnarztpraxis und sprichst gerade mit dem Zahnarzt
ueber Befund und Heil- und Kostenplan. Du kennst GOZ, BEMA, BEL, BEB, Festzuschuesse und die Abrechnungsregeln.
Die Software hat seinen Satz schon verarbeitet und gibt dir das ERGEBNIS: was jetzt feststeht und welche Frage offen ist.
Du sagst ihm das jetzt in deinen eigenen Worten, wie eine erfahrene Kollegin am Behandlungsstuhl.

- Reagiere zuerst kurz auf das, was er gesagt hat. Wiederhole seinen Satz nicht.
- Jede Zahnnummer, jedes Datum, jeder Name und jede Ziffer aus dem ERGEBNIS kommt in deiner Antwort
  genau so geschrieben vor, als Ziffern (16, nicht sechzehn). Lass keine weg und erfinde keine dazu.
- Stellt das ERGEBNIS eine Frage, stellst du genau diese Frage, inhaltlich gleich, als letzten Satz mit Fragezeichen.
  Keine andere und keine zusaetzliche Frage. Stellt es keine Frage, stellst du keine.
- Entscheide nichts, was nicht im ERGEBNIS steht. Behaupte nicht, etwas sei angelegt oder uebertragen, wenn es dort nicht steht.
- Stellt er eine Abrechnungsfrage, beantworte sie knapp aus der Wissensbasis, vor der offenen Frage.
  "Nicht neben" heisst nicht in derselben Sitzung. Steht dazu nichts in der Wissensbasis, sag das.
- Hoechstens drei kurze Saetze, gesprochenes Deutsch, keine Aufzaehlungszeichen. Du siezt den Zahnarzt immer.
- Keine Betraege, keine Punktwerte, kein "ich rechne". Sag All-on-4 und All-on-6, nie "allon".
Antworte nur mit dem gesprochenen Text.`;

let mundFragen = null;
export function _setMund(fn) { mundFragen = fn; }

const ZAHL_RE = /\d+/g;

/** Gesprochener Satz des Modells zum Ergebnis der Engine, oder "" (dann gilt der Text der Engine). */
export function mundPruefen(text, fakten) {
  const t = String(text || "").replace(/\s+/g, " ").replace(/^["„]|["“]$/g, "").trim();
  if (t.length < 8 || t.length > 700 || /[{}]|€|\beuro\b|punktwert|\ballon\b/i.test(t)) return "";
  const soll = String(fakten || "");
  for (const z of new Set(soll.match(ZAHL_RE) || [])) {
    if (!new RegExp(`(^|\\D)${z}(\\D|$)`).test(t)) return "";
  }
  if (soll.includes("?") !== t.includes("?")) return "";
  return t;
}

/**
 * Das Modell spricht: satz = was der Zahnarzt gesagt hat, fakten = Ergebnis der Engine (Zaehne, offene Frage).
 * Die Engine hat entschieden und geschrieben; hier entsteht nur der Wortlaut. Notaus MAS_HKP_MUND=0.
 */
export async function mundSprechen({ satz = "", fakten = "", einordnung = "", praxis = null }) {
  if (process.env.MAS_HKP_MUND === "0" || process.env.MAS_HKP_ANTWORT_LLM === "0") return "";
  const f = String(fakten || "").trim();
  if (!f || /€|\beuro\b/i.test(f)) return "";
  const s = String(satz || "").trim();
  const wissen = await wissenSuchen(`${s} ${f}`, praxis);
  const user = `Satz des Zahnarztes: «${s || "(Auftrag ohne weiteren Satz)"}»\n\nERGEBNIS der Software: «${f}»`
    + `${einordnung ? `\n\nDeine erste Einordnung seines Satzes (nur verwenden, wenn sie zum ERGEBNIS passt): «${einordnung}»` : ""}`
    + `${wissen ? `\n\n${wissen}` : ""}`;
  const { base, model } = strongLlm();
  const frage = mundFragen || fragen;
  const res = await frage([{ role: "system", content: MUND_SYSTEM }, { role: "user", content: user }],
    { temperature: 0.4, maxTokens: 300, model, baseUrl: base, timeoutMs: Number(process.env.MAS_HKP_MUND_MS || 7000) })
    .catch(() => null);
  return res?.ok ? mundPruefen(res.text, f) : "";
}

const PLAN_SYSTEM = `Du liest nur die Absicht eines Zahnarztes fuer die Heil- und Kostenplanung.
Der Text kommt aus der Spracherkennung. Du planst keine Zaehne und keine Gebuehren.
${WISSEN}
Antworte nur mit JSON: {"plan": null} oder {"plan": {"versorgung": "allon", "n": 6, "kiefer": "beide"}}
versorgung ist genau eine von: allon, totalprothese, teleskopprothese, bruecke, kronen, implantatkronen, locator, steg, inlay.
kiefer ist "OK", "UK" oder "beide". n nur bei allon: 4 oder 6.
Wenn der Satz keine Versorgung ist, plan null.
Die angehaengte Wissensbasis erklaert Begriffe und Ziffern. Keine Ziffer in die Antwort kopieren.`;

/**
 * Gesprochener Auftrag ohne offene Rueckfrage -> kanonischer Plansatz, oder "".
 * Dieselbe Wissensbasis wie bei der Antwort auf eine Frage. Notaus MAS_HKP_INTENT=0.
 */
export async function planIntent({ satz, bisher = "", frage = "", praxis = null }) {
  if (process.env.MAS_HKP_INTENT === "0" || process.env.MAS_HKP_ANTWORT_LLM === "0") return "";
  const s = String(satz || "").trim();
  if (!s) return "";
  const k = `plan\n${bisher}\n${frage}\n${s}`;
  const alt = merker.get(k);
  if (alt && Date.now() - alt.at < MERK_MS) return alt.r?.plan || "";
  const { base, model } = strongLlm();
  const wissen = await wissenSuchen(s, praxis);
  const user = `Bisheriger Plan: "${bisher || "keiner"}"\nLetzte Frage: "${frage || "keine"}"\nAntwort des Zahnarztes: "${s}"${wissen ? `\n\n${wissen}` : ""}`;
  const res = await fragen([{ role: "system", content: PLAN_SYSTEM }, { role: "user", content: user }],
    { temperature: 0, maxTokens: 200, model, baseUrl: base, timeoutMs: Number(process.env.MAS_HKP_ANTWORT_MS || 20000) });
  const plan = res?.ok ? planSatz(jsonAus(res.text)?.plan) : "";
  if (plan) {
    for (const [key, v] of merker) if (Date.now() - v.at > MERK_MS) merker.delete(key);
    merker.set(k, { r: { plan }, at: Date.now() });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Fachgespraech (Chef 05.11.2026: "freies LLM-Gespraech mit Knowledgebase, kein starres Regex mehr").
// Kein fester Ablauf: das Modell liest Satz, Verlauf, Befund, Plan und die Rueckmeldung der Engine und entscheidet
// selbst, was jetzt passiert (Befund aendern, Plan setzen, rechnen, nach DS-Win uebertragen, abbrechen) und was es
// sagt. Die Route fuehrt nur aus und prueft: geschrieben wird deterministisch, nach DS-Win nur nach Vorlesen + Ja.
// ---------------------------------------------------------------------------

const FACH_SYSTEM = `Du bist die Abrechnungsassistentin der Zahnarztpraxis, mit allen Wassern gewaschen: GOZ, BEMA, BEL, BEB,
Festzuschuesse, eHKP-Befundkuerzel. Du fuehrst mit dem Zahnarzt frei das Gespraech zu Befund und Heil- und Kostenplan
seines Patienten. Es gibt keinen festen Ablauf: du entscheidest in jedem Zug selbst, was jetzt zu tun ist.
Die Software (Engine) aendert den Befund, rechnet den Plan und schreibt nach DS-Win; sie meldet dir Fakten und
Rueckfragen zurueck. Der Text kommt aus der Spracherkennung, Verhoerer sind moeglich (z. B. "Ballon" fuer All-on).

Du sprichst mit dem Zahnarzt, nicht mit dem Patienten. Keine Begruessung, kein Name des Zahnarztes.

Antworte NUR mit JSON:
{"befund": {}, "rest": {}, "plan": "", "rechnen": false, "uebertragen": false, "abbrechen": false, "sagen": ""}

befund: nur Zaehne, deren Befund sich durch das Gesagte aendert, sonst {}. Werte sind eHKP-Kuerzel:
"" natuerlicher Zahn ohne Befund (steht), "f" fehlt, "i" Implantat ohne Suprakonstruktion, "k" intakte Krone, "kw" erneuerungsbeduerftige Krone,
"ww" weitgehend zerstoert (braucht Krone), "pw" partielle Defekte, "x" nicht erhaltungswuerdig, "e" ersetzter Zahn,
"b" Brueckenglied, "t" Teleskopkrone, "tw" erneuerungsbeduerftige Teleskopkrone, "sk" implantatgetragene Krone,
"ix" zu entfernendes Implantat, ")(" Lueckenschluss.
"Das sind Implantate" oder "Implantat ohne Suprakonstruktion" heisst "i". Das Kuerzel fuer ein gesetztes Implantat ohne Suprakonstruktion ist immer i.
i ist kein Zahn und stoert eine Totalprothese nicht.
Frag nie, ob es entfernt wird. Schreib es nicht als "werden entfernt" in den Plan und setze seinen Befund nicht auf x oder leer.
Es bleibt liegen und gilt wie ein fehlender Zahn. Nur eine Implantatkrone oder ein natuerlicher Zahn ist eine Rueckfrage.
rest: gilt fuer alle Zaehne eines Kiefers, die nicht in befund stehen. "Alle anderen im Oberkiefer fehlen" heisst
"rest": {"OK": "f"}, fuer den Unterkiefer "UK". Sonst {}.

plan: der vollstaendige Plan als EIN Satz in der Sprache der Engine, nur wenn er neu ist oder sich aendert, sonst "".
Formen: "All-on-6-Prothese im Oberkiefer und All-on-6-Prothese im Unterkiefer", "All-on-4-Prothese im Unterkiefer",
"Totalprothese im Oberkiefer und im Unterkiefer", "Teleskopprothese im Oberkiefer mit Teleskopen auf 13 und 23",
"Locatorprothese im Oberkiefer auf den Implantaten 14 und 24", "Stegprothese im Unterkiefer auf den Implantaten 33 und 43",
"Brücke von 14 bis 16", "Krone auf 26", "Kronen auf 11 und 21, vollverblendet", "Implantatkrone auf 36".
Was mit stehenden natuerlichen Zaehnen geschieht, haengst du an, die Zaehne mit "und" verbunden:
"Totalprothese im Oberkiefer, 16 und 14 und 13 werden entfernt" oder "Totalprothese im Oberkiefer, 23 und 24 bleiben erhalten".
Implantate ohne Suprakonstruktion (i) haengst du nicht an.
Eine Deckprothese auf Implantaten ist eine Locator- oder Stegprothese. Material und Analogpositionen, die er nennt,
uebernimmst du woertlich in den Satz. Erfinde keine Analogziffer.

rechnen: true, sobald Plan und Befund fuer die Rechnung reichen. Die Engine rechnet dann sofort und liest den Plan vor;
sagen ist dann nur eine kurze Ueberleitung ohne Frage. Meldet die Engine danach eine Rueckfrage, bekommst du sie.
uebertragen: true nur, wenn du in deiner LETZTEN Aeusserung die geaenderten Zaehne vorgelesen und gefragt hast,
ob sie nach DS-Win sollen, und er jetzt zustimmt. Ohne sein Ja nie.
abbrechen: true, wenn er den Plan fallen laesst.

sagen: was du ihm jetzt sagst. Gesprochenes Deutsch, du siezt ihn, hoechstens drei kurze Saetze, hoechstens EINE Frage.
Reagiere auf das, was er gesagt hat. Frag nichts, was du schon weisst oder was die Engine nicht braucht. Der Befund aus
DS-Win gilt, bis er etwas anderes sagt; frag nicht nach der Befundquelle. Zaehne nennst du mit Nummern. Stellt er eine
Abrechnungsfrage, beantworte sie aus der Wissensbasis ("nicht neben" heisst nicht in derselben Sitzung).
Keine Betraege, keine Punktwerte, kein "ich rechne". Sag All-on-4 und All-on-6, nie "allon".
Meldet die Software eine Rueckfrage, loese sie selbst, wenn das Gespraech die Antwort schon enthaelt
(plan anpassen, rechnen), sonst frag ihn genau danach.`;

const KUERZEL_KURZ = {
  "": "steht", f: "fehlt", i: "Implantat ohne Suprakonstruktion",
  ix: "Implantat nicht erhaltungswürdig", x: "nicht erhaltungswürdig", k: "Krone", kw: "Krone erneuerungsbedürftig",
  ww: "braucht Krone", e: "ersetzt", b: "Brückenglied", t: "Teleskop", sk: "Implantatkrone",
};
const NACKTES_IMPLANTAT = new Set(["i", "ix"]);
const WILL_ENTFERNEN = /\b(?:entfern\w*|extrah\w*|explant\w*|zieh\w*|gezogen|heraus)\b/i;

/**
 * Telefon-Clara plant selbst und haelt i fuer einen Zahn. Ohne ausdrückliches Entfernen im Satz des Zahnarztes
 * bleiben nackte Implantate liegen: kein Befundwechsel auf leer/x/ix, kein "werden entfernt", keine Entfernungsfrage.
 */
export function nackteNichtEntfernen(d, befund, satz) {
  if (!d || WILL_ENTFERNEN.test(String(satz || ""))) return d;
  const nackt = new Set(Object.entries(befund || {})
    .filter(([, c]) => NACKTES_IMPLANTAT.has(String(c ?? "").trim().toLowerCase()))
    .map(([z]) => z));
  if (!nackt.size) return d;
  const neuBefund = { ...(d.befund || {}) };
  for (const [z, c] of Object.entries(neuBefund)) {
    const neu = String(c ?? "").trim().toLowerCase();
    if (nackt.has(z) && (neu === "" || neu === "x" || neu === "ix")) delete neuBefund[z];
  }
  const plan = String(d.plan || "").replace(/,?\s*((?:\d{2}\s*(?:,|und)\s*)+\d{2}|\d{2})\s+werden entfernt/gi, (ganz, liste) => {
    const zs = liste.match(/\d{2}/g) || [];
    return zs.length && zs.every((z) => nackt.has(z)) ? "" : ganz;
  }).replace(/\s{2,}/g, " ").replace(/,\s*$/, "").trim();
  const zahlen = String(d.sagen || "").match(/\b[1-4][1-8]\b/g) || [];
  const fragtRaus = /entfern|extrah|stehen noch|bleiben welche|bleibt er stehen/i.test(String(d.sagen || ""));
  if (fragtRaus && zahlen.length && zahlen.every((z) => nackt.has(z))) {
    return {
      ...d, befund: neuBefund, plan,
      sagen: "Die Implantate ohne Suprakonstruktion bleiben liegen. Ich plane die Prothese darüber.",
      rechnen: true,
    };
  }
  return { ...d, befund: neuBefund, plan };
}
let fachFragen = null;
export function _setFach(fn) { fachFragen = fn; }

/** Befund als kurze Liste fuer das Modell: "fehlt: 18, 17; Implantat: 16, 14; steht: 13" */
export function befundListe(befund) {
  const nach = new Map();
  for (const k of ["OK", "UK"]) {
    for (const z of REIHE[k]) {
      if (!(z in (befund || {}))) continue;
      const c = String(befund[z] ?? "");
      const name = KUERZEL_KURZ[c] ?? c;
      nach.set(name, [...(nach.get(name) || []), z]);
    }
  }
  return [...nach].map(([n, zs]) => `${n}: ${zs.join(", ")}`).join("; ");
}

/** Modellantwort -> { befund, plan, rechnen, uebertragen, abbrechen, sagen } | null. kuerzel: erlaubte Befundkuerzel */
export function fachPruefen(d, kuerzel) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const erlaubt = new Set(["", "i", ...(kuerzel || [])]);
  const befund = {};
  for (const [z, c] of Object.entries(d.befund && typeof d.befund === "object" ? d.befund : {})) {
    const zahn = String(z).trim();
    const code = String(c ?? "").trim();
    if (ZAHN.test(zahn) && erlaubt.has(code)) befund[zahn] = code;
  }
  for (const [k, c] of Object.entries(d.rest && typeof d.rest === "object" ? d.rest : {})) {
    const kiefer = String(k).toUpperCase();
    const code = String(c ?? "").trim();
    if (!REIHE[kiefer] || !erlaubt.has(code)) continue;
    for (const z of REIHE[kiefer]) if (!(z in befund)) befund[z] = code;
  }
  const sagen = String(d.sagen || "").replace(/\s+/g, " ").trim();
  const sagenOk = sagen.length <= 700 && !/[{}]|€|\beuro\b|punktwert|\ballon\b/i.test(sagen);
  const rechnen = d.rechnen === true;
  if (!sagenOk || (!sagen && !rechnen)) return null;
  return {
    befund, plan: String(d.plan || "").replace(/\s+/g, " ").trim().slice(0, 400),
    rechnen, uebertragen: d.uebertragen === true, abbrechen: d.abbrechen === true, sagen,
  };
}

/**
 * Ein Zug im Fachgespraech. stand: { patient, pvs, pvsBefund, offen, uebertragen, plan }, verlauf: [{ wer, text }],
 * rueck: Rueckmeldung der Engine auf den letzten Schritt. -> geprueftes Ergebnis oder null. Notaus MAS_HKP_FACH=0.
 */
export async function fachEntscheiden({ satz = "", stand = {}, verlauf = [], rueck = "", praxis = null, kuerzel = [], timeoutMs = 0 }) {
  if (process.env.MAS_HKP_FACH === "0") return null;
  const s = String(satz || "").trim();
  const zeilen = (verlauf || []).slice(-12).map((v) => `${v.wer}: ${v.text}`).join("\n");
  const befund = stand.pvsBefund && Object.keys(stand.pvsBefund).length
    ? `Befund aus ${stand.pvs || "dem Praxisprogramm"}${stand.datum ? ` vom ${stand.datum}` : ""}: ${befundListe(stand.pvsBefund)}`
    : `Kein Befund aus dem Praxisprogramm${stand.meldung ? ` (${stand.meldung})` : ""}.`;
  const offen = Object.keys(stand.offen || {}).length ? befundListe(stand.offen) : "keine";
  const user = [
    `Patient: ${stand.patient || "unbekannt"}${stand.privat ? " (Privatplan)" : ""}`,
    befund,
    `Im Gespraech geaendert, noch nicht in DS-Win: ${offen}`,
    stand.uebertragen ? `Nach ${stand.uebertragen} uebertragen: ja` : "",
    `Plan bisher: ${stand.plan ? `"${stand.plan}"` : "keiner"}`,
    rueck ? `Rueckmeldung der Software auf deinen letzten Schritt: ${rueck}` : "",
    zeilen ? `Bisheriges Gespraech:\n${zeilen}` : "",
    `Satz des Zahnarztes jetzt: «${s}»`,
  ].filter(Boolean).join("\n");
  const wissen = await wissenSuchen(`${s} ${stand.plan || ""}`, praxis);
  const { base, model } = strongLlm();
  const frage = fachFragen || fragen;
  const res = await frage([{ role: "system", content: FACH_SYSTEM }, { role: "user", content: `${user}${wissen ? `\n\n${wissen}` : ""}` }],
    { temperature: 0.2, maxTokens: 700, model, baseUrl: base, timeoutMs: timeoutMs || Number(process.env.MAS_HKP_FACH_MS || 20000) })
    .catch(() => null);
  return res?.ok ? fachPruefen(jsonAus(res.text), kuerzel) : null;
}

// ---------------------------------------------------------------------------
// Abrechnungsfragen (Chef 05.11.2026: "Clara nutzt nicht die Wissensdatenbank, sie halluziniert frei").
// Die Antwort kommt NUR aus dem Ausschnitt der Wissensbasis. Jede Gebuehrennummer der Antwort muss in der Frage
// oder im Ausschnitt stehen, sonst gilt die Antwort als erfunden und es spricht der Ausschnitt selbst.
// ---------------------------------------------------------------------------
const ABRECHNUNG_SYSTEM = `Du bist die Abrechnungsexpertin einer Zahnarztpraxis (GOZ, BEMA, BEL, BEB, GOÄ, Festzuschüsse).
Der Zahnarzt stellt eine Abrechnungsfrage. Du bekommst einen Ausschnitt aus der Wissensbasis der Praxis.
Antworte AUSSCHLIESSLICH aus diesem Ausschnitt. Kein Wissen von außen, keine Vermutung, auch wenn du glaubst, es besser
zu wissen. Jede Nummer und jede Regel, die du nennst, muss wörtlich im Ausschnitt oder in seiner Frage stehen.
Nenne keine weitere Nummer, auch keine "passendere" Alternative, wenn sie nicht im Ausschnitt steht.
- Nenne die Regel mit der Nummer, aus der sie stammt, zum Beispiel: "Laut Bestimmung zur GOZ 9050 ist sie nicht neben 9040 berechnungsfähig."
Der Ausschnitt hat Abschnitte:
[GEFRAGTE NUMMERN]: Leistungstext und eigene Bestimmung ("Kommentar") der gefragten Nummern. Das ist deine Hauptquelle.
[ANDERE NUMMERN ...]: Bestimmungen anderer Nummern, die eine gefragte Nummer erwähnen. Nutze so eine Zeile nur, wenn
  ihr Satz genau die Frage betrifft, zum Beispiel "9050 ist nicht neben 9040 berechnungsfähig" auf die Frage nach 9040
  und 9050 oder nach dem Kommentar der 9040. Nennt sie die gefragte Nummer nur in einem anderen Zusammenhang
  ("im Zusammenhang mit 1000 und 1010 ist 4000 nur begründet berechnungsfähig"), lass sie weg.
[QUELLTEXTE]: Wortlaut aus Richtlinien, KZBV-Hinweisen, KZV-FAQ, Kommentaren und Recherchen, die Fundstelle steht
  vorne in Klammern. Für Fragen ohne Nummer (Härtefall, Bewilligung, Wiederherstellung, Festzuschuss-Befunde, PAR-Ablauf)
  ist das deine Hauptquelle. Gib die Regel sinngetreu wieder und nenne die Fundstelle kurz ("laut KZBV-Hinweisen zum
  Festzuschuss", "laut BEMA-Richtlinie"). Seitenzahlen sprichst du nicht. Passt kein Quelltext genau zur Frage, nutze ihn nicht.
[WEITERE TREFFER]: Abrechnungsbeispiele und verwandte Nummern, nur ergänzend.
- Fragt er nach dem Kommentar (der Bestimmung) einer Nummer: nenne den Leistungstext und ihre eigene Bestimmung. Hat sie
  keine, sag das ("Zur GOZ 9040 selbst gibt es keine eigene Abrechnungsbestimmung.") und nenne dann die Regeln aus
  Bestimmungen anderer Nummern, die sie ausdrücklich betreffen.
- Nenne die Quelle richtig: "Bestimmung zur GOZ 9050" nur für einen Kommentar dieser Nummer, "Leistungstext" für den
  Text, "Abrechnungsbeispiel" für ein Beispiel. Schreib eine Regel nie einer anderen Nummer zu.
- Fragt er, ob zwei Nummern nebeneinander gehen, und keine Bestimmung der beiden verbindet sie: "In den Bestimmungen zu
  ... steht kein Ausschluss."
- Gehören die gefragten Nummern zu verschiedenen Gebührenordnungen (BEMA ist die Kasse, GOZ privat), sag das kurz.
- "Nicht neben" bedeutet: nicht in derselben Sitzung.
- Steht im Ausschnitt zu den gefragten Nummern keine Ausschlussregel, sag genau das: "In den Bestimmungen zu ... steht kein Ausschluss." Erfinde keinen.
- Steht die gefragte Nummer gar nicht im Ausschnitt oder beantwortet er die Frage nicht, sag ehrlich: "Dazu steht in meiner Wissensbasis nichts."
- Eine STT-Schreibweise wie "0-1" meint die Nummer 01. GOZ-Nummern sind vierstellig, BEMA-Nummern kurz (01, Ä1, 13a).
- Keine Beträge, keine Euro, keine Punktwerte.
- Gesprochenes Deutsch, du siezt ihn, höchstens drei kurze Sätze, keine Rückfrage, keine Aufzählungszeichen.
Antworte nur mit dem Satz für den Zahnarzt.`;

let abrechnungFragen = null;
export function _setAbrechnung(fn) { abrechnungFragen = fn; }

const nummernIn = (s) => [...nummernZusammen(s).matchAll(/\b\d{2,4}[a-z]?\b/gi)].map((m) => m[0].toLowerCase());

/** Nur Form: leere oder abgebrochene Antworten zaehlen nicht. Was gesagt werden darf, regelt der Prompt. */
export function abrechnungPruefen(text) {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\s+/g, " ").trim();
  return t.length >= 8 ? t : "";
}

/** Halluzinations-Stop: Gebührennummern der Antwort, die weder in der Frage noch im Ausschnitt stehen */
export function nummernFremd(antwort, frage, wissen) {
  const erlaubt = new Set([...nummernIn(frage), ...nummernIn(wissen)]);
  return [...new Set(nummernIn(antwort))].filter((n) => !erlaubt.has(n));
}

/** Ohne Modell: die Bestimmungen der gefragten Nummern im Wortlaut */
export function abrechnungAusWissen(frage, wissen) {
  const gefragt = new Set(nummernIn(frage));
  const zeilen = String(wissen || "").split("\n").filter((z) => {
    const m = z.match(/^(GOZ|BEMA|BEL|BEB|GOÄ|FZ) (\S+):/);
    return m && gefragt.has(m[2].toLowerCase());
  });
  if (!zeilen.length) return "";
  return zeilen.slice(0, 3).map((z) => z.replace(/^(\S+) (\S+): /, "$1 $2: ").replace(/\. Kommentar: /, ". Bestimmung: ")).join(" ").slice(0, 600);
}

/** -> { ok, message, quelle: "wissen" | "modell" | "leer" } */
export async function abrechnungAntwort({ frage = "", praxis = null, fachbegriffe = "" }) {
  const f = nummernZusammen(String(frage || "").trim());
  // Ausschluss-Tabelle: bei Konflikt gewinnt sie (Chef 06.11.2026)
  const tabelleSatz = ausschluesseZwischen(nummernIn(f)).slice(0, 2).map(ausschlussSatz).join(" ");
  // fachbegriffe: Claras Umschreibung in die Sprache der Bestimmungen ("arm" -> "Härtefall"); sucht mit, wird nicht gefragt
  const gefunden = await wissenSuchen(fachbegriffe ? `${f}\n${String(fachbegriffe).slice(0, 400)}` : f, praxis);
  if (!gefunden && !tabelleSatz) return { ok: true, quelle: "leer", message: "Dazu steht in meiner Abrechnungs-Wissensbasis nichts. Das müsste ich offenlassen." };
  const wissen = [tabelleSatz ? `[AUSSCHLUSS-TABELLE, gilt immer]: ${tabelleSatz}` : "", gefunden].filter(Boolean).join("\n\n");
  const roh = tabelleSatz || abrechnungAusWissen(f, wissen);
  if (process.env.MAS_HKP_ANTWORT_LLM === "0") return { ok: true, quelle: tabelleSatz ? "tabelle" : "wissen", message: roh || "Dazu steht in meiner Abrechnungs-Wissensbasis nichts." };
  const { base, model } = strongLlm();
  const res = await (abrechnungFragen || fragen)([
    { role: "system", content: ABRECHNUNG_SYSTEM },
    { role: "user", content: `Frage des Zahnarztes: «${f}»\n\n${wissen}` },
  ], { temperature: 0.1, maxTokens: 300, model, baseUrl: base, timeoutMs: Number(process.env.MAS_ABRECHNUNG_MS || 15000) }).catch(() => null);
  const satz = res?.ok ? abrechnungPruefen(res.text) : "";
  const fremd = nummernFremd(satz, f, wissen);
  if (fremd.length) log.warn?.(`[hkp] abrechnung-frage: Modell nennt ${fremd.join(", ")} ohne Fundstelle - Antwort verworfen`);
  // Die Tabelle schliesst aus; eine Antwort ohne "nicht" widerspricht ihr
  const widerspruch = tabelleSatz && satz && !/\bnicht\b/i.test(satz);
  if (widerspruch) log.warn?.(`[hkp] abrechnung-frage: Modell widerspricht der Ausschluss-Tabelle - Tabelle gilt`);
  if (satz && !fremd.length && !widerspruch) return { ok: true, quelle: "modell", message: satz };
  return { ok: true, quelle: tabelleSatz ? "tabelle" : "wissen", message: roh || "Dazu steht in meiner Abrechnungs-Wissensbasis nichts. Das müsste ich offenlassen." };
}
