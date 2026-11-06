// Mitdenken fuer die freie Planung (Anruf 06.11.2026 07:58, Fanelas): Clara sah den Befund nur
// als "steht auf dem Handy" und plante All-on-6 auf schon gesetzten Implantaten als Chirurgie.
// Der Befundstand geht an das Modell (merken, nicht gesprochen). Liegt eine Versorgung auf
// vorhandenen Implantaten, wird aus impl Zahnersatz - oder es bleibt die eine Frage Kasse/privat.
// Notaus: MAS_PLAN_MITDENKEN=0.
import { befundSatz, KIEFER_ZAEHNE } from "./vorlesen.js";

const IMPLANTAT = new Set(["i", "ix", "sk", "skw", "sb", "sbw", "st", "stw", "se", "sew", "so", "sow"]);
const PROTHETIK = /all[\s-]*on|prothese|br[üu]cke|\bkrone|\bsteg\b|\blocator\b|\bteleskop/i;
// "gesetzt" ist schon da und zaehlt nicht als neue Chirurgie. "setzen" schon.
const CHIRURGIE = /\b(?:setzen|setzt|setze|einsetzen|implantieren|implantiert|sinuslift|knochenaufbau|augmentation|freilegung|sofortimplantat)\b/i;

const an = () => process.env.MAS_PLAN_MITDENKEN !== "0";

function kieferAus(text) {
  const t = ` ${String(text || "").toLowerCase()} `;
  const ok = /oberkiefer|\bok\b/.test(t) || /(?:^|[^\d])[12][1-8](?!\d)/.test(t);
  const uk = /unterkiefer|\buk\b/.test(t) || /(?:^|[^\d])[34][1-8](?!\d)/.test(t);
  if (ok && !uk) return ["OK"];
  if (uk && !ok) return ["UK"];
  return ["OK", "UK"];
}

function und(zs) {
  if (zs.length <= 1) return zs[0] || "";
  return `${zs.slice(0, -1).join(", ")} und ${zs.at(-1)}`;
}

/** Implantate je genanntem Kiefer, in Kieferreihenfolge. */
export function implantateIm(befund, kiefer) {
  const out = [];
  for (const k of kiefer) {
    const zs = (KIEFER_ZAEHNE[k] || []).filter((z) => IMPLANTAT.has(String(befund?.[z] ?? "").trim()))
      .sort((a, b) => Number(a) - Number(b));
    if (zs.length) out.push({ k, zs });
  }
  return out;
}

function wo(liste) {
  return liste.map(({ k, zs }) => `${k === "OK" ? "im Oberkiefer" : "im Unterkiefer"} an ${und(zs)}`).join("; ");
}

/** "privat", "kasse" oder "" wenn der Satz die Art nicht hergibt. */
export function zahlungsart(text) {
  const t = String(text || "").toLowerCase();
  const privat = /\bprivat|\bkostenvoranschlag\b|\bselbstzahler\b/.test(t);
  const kasse = /\bkasse\b|\bgesetzlich\b|\bhkp\b|heil- und kostenplan/.test(t);
  if (privat && !kasse) return "privat";
  if (kasse && !privat) return "kasse";
  return "";
}

/**
 * planart impl plus eine Versorgung (All-on, Krone, Bruecke, Prothese, Steg).
 * { planart } = einfach mit dieser Art weiterrechnen.
 * { antwort, hinweis } = dem Chef antworten (hinweis sieht nur das Modell).
 * null = nichts zu korrigieren.
 */
export function planartKorrigieren(planart, versorgung, befund) {
  if (!an() || planart !== "impl" || !PROTHETIK.test(String(versorgung || ""))) return null;
  const text = String(versorgung || "");
  const chirurgie = CHIRURGIE.test(text);
  if (chirurgie) {
    return {
      hinweis: "Nächster Aufruf ist hkp_fall_rechnen, nicht hkp_plan_rechnen mit planart impl. Chirurgie und Versorgung zusammen. prothese=kasse oder prothese=privat nach der Antwort.",
      antwort: {
        ok: true, rueckfrage: "fall", stimme: "daten",
        message: "Das ist die Implantation und danach die Versorgung. Für die Versorgung: über die Kasse oder privat?",
      },
    };
  }
  const da = implantateIm(befund, kieferAus(text));
  if (!da.length) {
    return {
      hinweis: "Im genannten Kiefer steht kein Implantat. Sollen sie erst gesetzt werden: hkp_fall_rechnen. Stehen sie schon: Zähne per hkp_befund eintragen, dann Zahnersatz mit planart kasse oder privat.",
      antwort: {
        ok: true, rueckfrage: "fall", stimme: "daten",
        message: "Im Befund stehen dort noch keine Implantate. Sollen sie erst gesetzt werden, rechne ich Chirurgie und Versorgung zusammen. Stehen sie schon, nennen Sie mir die Zähne.",
      },
    };
  }
  const art = zahlungsart(text);
  if (art) return { planart: art };
  return {
    hinweis: "Nicht noch einmal planart impl. Die vorhandenen Implantate sind die Pfeiler. Nach der Antwort hkp_plan_rechnen mit planart kasse oder privat, dieselbe Versorgung, ohne nach System oder Position zu fragen.",
    antwort: {
      ok: true, rueckfrage: "planart", stimme: "daten",
      message: `Im Befund stehen schon Implantate, ${wo(da)}. Die Versorgung sitzt darauf, neue Implantate plane ich nicht. Für die Prothese: über die Kasse oder privat?`,
    },
  };
}

/** Befundstand fuer das Modell. Wird nicht gesprochen. */
export function befundMerken(stand) {
  const satz = befundSatz(stand || {}, ["OK", "UK"]).trim();
  return satz ? `Befundstand, nicht sprechen: ${satz}` : "";
}

/** "15, 12 und 11" oder ["15", 12] -> ["15", "12", "11"]: nur gueltige Zahnnummern, ohne Doppelte */
export function zahnListe(x) {
  const text = Array.isArray(x) ? x.join(" ") : String(x ?? "");
  return [...new Set(text.match(/(?<!\d)[1-4][1-8](?!\d)/g) || [])];
}

// Schon weg oder schon zum Entfernen markiert: bleibt, wie es ist
const OHNE_ZAHN = new Set(["f", "x", "ix", "b", "bw", "e", "ew", "ab", "abw", "r", "rw"]);

/** Zaehne, die der Chef entfernen will, als Befund-Aenderung: Zahn x, Implantat ix. */
export function entfernenMarken(stand, zaehne) {
  const out = {};
  for (const z of zaehne) {
    const code = String(stand?.[z] ?? "").trim().toLowerCase();
    if (OHNE_ZAHN.has(code)) continue;
    out[z] = IMPLANTAT.has(code) ? "ix" : "x";
  }
  return out;
}

const ZAHN_RUECKFRAGE = new Set(["zahn_vorhanden", "glied_vorhanden", "restzaehne"]);

/** Rueckfrage der Engine zu stehenden Zaehnen: welche Zaehne gemeint sind, sieht nur das Modell. */
export function rueckfrageMerken(grund, zaehne) {
  const zs = zahnListe(zaehne);
  if (!an() || !ZAHN_RUECKFRAGE.has(String(grund || "")) || !zs.length) return "";
  const liste = zs.join(", ");
  return `Offene Rückfrage zu den Zähnen ${liste}, nicht sprechen: Sagt der Chef, sie kommen raus, `
    + `oder der Befund soll so angepasst werden, rechne sofort erneut mit derselben Versorgung und entfernen="${liste}", `
    + `ohne nachzufragen. Bleiben sie stehen: erhalten="${liste}".`;
}
