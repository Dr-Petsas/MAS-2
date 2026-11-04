// Antwort des Chefs auf MAS' eigene HKP-Rueckfrage verstehen (Demo 04.11.2026, Chef: "wenig Regeln, umso
// mehr LLM - die Tools und die Ausgabe von Daten muessen deterministisch sein"). Das Modell liest nur, WAS der
// Satz auf genau diese Frage bedeutet, und liefert festes JSON; was daraus folgt (Freigabe, Anlegen, Zaehne
// entfernen, Befund schreiben), entscheidet die Route deterministisch. Ohne Modell: null, die Route faellt auf
// ihre einfachen Wortregeln zurueck. Notaus MAS_HKP_ANTWORT_LLM=0.
import { chat, strongLlm } from "../mail/llm.js";

const ARTEN = new Set(["zustimmung", "ablehnung", "angabe", "abbruch", "neustart", "gegenfrage", "unklar"]);
const QUELLEN = new Set(["pvs", "lena", "neu", ""]);
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

const SYSTEM = `Du bist der Sprachversteher fuer die Heil- und Kostenplanung einer Zahnarztpraxis.
Die Planungssoftware hat dem Zahnarzt eine Rueckfrage gestellt, er hat darauf geantwortet. Der Text kommt aus
einer Spracherkennung und enthaelt Hoerfehler ("Heilung-Kostenplan", "Oberkaefer", "Legt" statt "Leg").
Du entscheidest NICHTS und planst NICHTS. Du sagst nur, was die Antwort auf GENAU DIESE Frage bedeutet.

Antworte ausschliesslich mit einem JSON-Objekt, ohne Text davor oder danach:
{"art": "...", "quelle": "...", "entfernen": [], "erhalten": [], "angabe": "", "befund": null}

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
  ganzen Mund meint; unbekannt "".`;

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

/** Modellantwort -> festes Ergebnis; ungueltig -> null */
export function antwortPruefen(roh, frageZaehne = []) {
  const d = roh && typeof roh === "object" ? roh : null;
  if (!d || !ARTEN.has(d.art)) return null;
  const erlaubt = frageZaehne.map(String);
  const befund = befundPruefen(d.befund);
  // Ein genannter Befund ist nie ein blosses Ja/Nein; "neuer Befund" (quelle "neu") ist kein neuer Plan (Probe 04.11.2026)
  const art = befund && (d.art === "zustimmung" || d.art === "ablehnung") ? "angabe"
    : d.art === "neustart" && d.quelle === "neu" ? "angabe" : d.art;
  return {
    art,
    quelle: QUELLEN.has(d.quelle) ? d.quelle : "",
    entfernen: zaehneAus(d.entfernen, erlaubt),
    erhalten: zaehneAus(d.erhalten, erlaubt),
    angabe: art === "angabe" ? String(d.angabe || "").trim().slice(0, 400) : "",
    befund,
  };
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
export async function antwortVerstehen({ frage, satz, zaehne = [] }) {
  if (process.env.MAS_HKP_ANTWORT_LLM === "0") return null;
  const f = String(frage || "").trim();
  const s = String(satz || "").trim();
  if (!f || !s) return null;
  const k = `${f}\n${s}`;
  const alt = merker.get(k);
  if (alt && Date.now() - alt.at < MERK_MS) return alt.r;
  const { base, model } = strongLlm();
  const user = `Rueckfrage der Software: "${f}"${zaehne.length ? `\nIn der Frage genannte Zaehne: ${zaehne.join(", ")}` : ""}\nAntwort des Zahnarztes: "${s}"`;
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
