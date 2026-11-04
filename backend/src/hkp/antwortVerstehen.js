// Antwort des Chefs auf MAS' eigene HKP-Rueckfrage verstehen (Demo 04.11.2026, Chef: "wenig Regeln, umso
// mehr LLM - die Tools und die Ausgabe von Daten muessen deterministisch sein"). Das Modell liest nur, WAS der
// Satz auf genau diese Frage bedeutet, und liefert festes JSON; was daraus folgt (Freigabe, Anlegen, Zaehne
// entfernen, Befund schreiben), entscheidet die Route deterministisch. Ohne Modell: null, die Route faellt auf
// ihre einfachen Wortregeln zurueck. Notaus MAS_HKP_ANTWORT_LLM=0.
import { chat, strongLlm } from "../mail/llm.js";

const ARTEN = new Set(["zustimmung", "ablehnung", "angabe", "abbruch", "neustart", "gegenfrage", "unklar"]);
const QUELLEN = new Set(["pvs", "lena", "neu", ""]);
const ZAHN = /^[1-4][1-8]$/;

const SYSTEM = `Du bist der Sprachversteher fuer die Heil- und Kostenplanung einer Zahnarztpraxis.
Die Planungssoftware hat dem Zahnarzt eine Rueckfrage gestellt, er hat darauf geantwortet. Der Text kommt aus
einer Spracherkennung und enthaelt Hoerfehler ("Heilung-Kostenplan", "Oberkaefer", "Legt" statt "Leg").
Du entscheidest NICHTS und planst NICHTS. Du sagst nur, was die Antwort auf GENAU DIESE Frage bedeutet.

Antworte ausschliesslich mit einem JSON-Objekt, ohne Text davor oder danach:
{"art": "...", "quelle": "...", "entfernen": [], "erhalten": [], "angabe": ""}

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
  oder "Ja, aber in Gold" sind "angabe".
- "abbruch": er will diesen Plan nicht weitermachen ("vergiss es", "lass das", "machen wir noch mal von vorne").
- "neustart": er beginnt selbst einen neuen Auftrag ("Ich möchte für Herrn X einen Heil- und Kostenplan erstellen").
- "gegenfrage": er stellt selbst eine Frage, statt zu antworten.
- "unklar": die Antwort passt nicht zur Frage oder ist unverstaendlich (Selbstgespraech, Bemerkung an Kollegen).

quelle – nur bei einer Frage nach dem Befund ("Welchen Befund nehme ich ...: den aktuellen aus DS-Win ... oder ..."):
"pvs" fuer das Praxisprogramm (DS-Win, Dampsoft, "den aktuellen", "den ersten", "den aus der Kartei"), "lena" fuer
Lenas Erstuntersuchung, "neu" fuer einen neuen Befund. Ein blosses "Ja" meint die zuerst genannte Moeglichkeit;
"Nein, den von DS-Win" ist "pvs". Bei jeder anderen Frage (auch "Stimmt der Befund so?") immer "".

entfernen / erhalten – nur wenn die Frage nach stehenden Zaehnen fragt (entfernen oder stehen lassen): die Zaehne
als zweistellige FDI-Nummern (Strings). "Zwoelf wird entfernt" -> entfernen ["12"]; "eins drei bleibt" -> erhalten
["13"]. Sagt er pauschal "alle raus" oder bejaht er "Sollen die alle entfernt werden?", stehen in entfernen ALLE in
der Frage genannten Zaehne. Sonst beide leer.

angabe – bei art "angabe": sein fachlicher Inhalt als kurzer deutscher Satz in seinen Worten, Zahnnummern als
zweistellige FDI-Zahlen ("1,3" / "eins drei" / "dreizehn" -> 13). Fuellwoerter, Hoerfehler und Hoeflichkeit weg.
Erfinde nichts dazu, ergaenze keine Zaehne, die er nicht genannt hat. Was schon in quelle, entfernen oder erhalten
steht, wiederholst du hier NICHT ("Nein, den von DS-Win bitte" -> quelle "pvs", angabe ""). Sonst "".`;

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

/** Modellantwort -> festes Ergebnis; ungueltig -> null */
export function antwortPruefen(roh, frageZaehne = []) {
  const d = roh && typeof roh === "object" ? roh : null;
  if (!d || !ARTEN.has(d.art)) return null;
  const erlaubt = frageZaehne.map(String);
  return {
    art: d.art,
    quelle: QUELLEN.has(d.quelle) ? d.quelle : "",
    entfernen: zaehneAus(d.entfernen, erlaubt),
    erhalten: zaehneAus(d.erhalten, erlaubt),
    angabe: d.art === "angabe" ? String(d.angabe || "").trim().slice(0, 400) : "",
  };
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
  const res = await fragen([{ role: "system", content: SYSTEM }, { role: "user", content: user }],
    { temperature: 0, maxTokens: 160, model, baseUrl: base, timeoutMs: Number(process.env.MAS_HKP_ANTWORT_MS || 8000) });
  const r = res?.ok ? antwortPruefen(jsonAus(res.text), zaehne) : null;
  if (r) {
    for (const [key, v] of merker) if (Date.now() - v.at > MERK_MS) merker.delete(key);
    merker.set(k, { r, at: Date.now() });
  }
  return r;
}
