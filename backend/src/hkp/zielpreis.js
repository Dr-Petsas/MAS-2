// Wunsch-Eigenanteil beim HKP (Chef 10.10.2026): Beim Vorlesen nur das billigste und das teuerste
// Ende nennen, auf den genannten Wunsch die Regler stellen (erst GOZ, dann Eigenlabor) und die
// Summen erst beim Anlegen sagen. Pure Funktionen (kein I/O).
import * as E from "../vendor/hkp-engine.mjs";
import { euroSprech, liste, zahlWort } from "./sprech.js";

const euroRund = (n) => euroSprech(Math.round(Number(n) || 0));

const ASCII = (s) => String(s ?? "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

/** "3.000 Euro", "2500", "dreitausend", "zweieinhalbtausend", "3 tausend" -> Zahl, sonst null */
export function zielpreisAus(x) {
  if (typeof x === "number") return Number.isFinite(x) && x > 0 ? x : null;
  const t = ASCII(x);
  const mitTausend = /(\d+(?:,\d+)?)\s*tausend/.exec(t);
  if (mitTausend) return Number(mitTausend[1].replace(",", ".")) * 1000;
  const ziffern = /\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b/.exec(t);
  if (ziffern) {
    const n = Number(ziffern[0].replace(/\./g, ""));
    return n > 0 ? n : null;
  }
  // "drei tausend fuenf hundert" -> zusammenhaengende Zahlwoerter zu einem Wort
  const gross = (w) => /hundert|tausend/.test(w);
  let lauf = [];
  for (const w of [...t.split(/[^a-z]+/), ""]) {
    if (w && (gross(w) || E.zahlwort(w) !== undefined)) { lauf.push(w); continue; }
    if (lauf.some(gross)) break;
    lauf = [];
  }
  if (!lauf.some(gross)) return null;
  const wort = lauf.join("");
  const halb = /^([a-z]+?)einhalbtausend$/.exec(wort);
  const n = halb ? (E.zahlwort(halb[1]) ?? NaN) * 1000 + 500 : E.zahlwort(wort);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Satz fuers Vorlesen: Spanne des Eigenanteils */
export function spanneSatz({ min, max }) {
  return `Den Eigenanteil kann ich mit den Reglern zwischen ${euroRund(min)} und ${euroRund(max)} einstellen.`;
}

const faktorSprech = (f) => {
  const zehntel = Math.round(f * 10);
  return zehntel % 10 ? `${zahlWort(Math.floor(zehntel / 10))} Komma ${zahlWort(zehntel % 10)}` : zahlWort(zehntel / 10);
};

/** Satz beim Anlegen: wohin die Regler fuer den Wunsch gestellt wurden */
export function reglerSatz(z) {
  const s = z.stand;
  const teile = [];
  if (s.gozZusatzStufe > 0) teile.push(`zusätzliche GOZ-Leistungen Stufe ${zahlWort(s.gozZusatzStufe)}, ${E.ZUSATZ_STUFEN[s.gozZusatzStufe]?.titel || ""}`.replace(/, $/, ""));
  if (s.honorarFaktor > 0) teile.push(`GOZ-Faktor ${faktorSprech(s.honorarFaktor)}`);
  if (s.eigenKasseProzent !== 100) teile.push(`Eigenlabor Kasse ${zahlWort(s.eigenKasseProzent)} Prozent`);
  if (s.eigenPrivatStufe > 0) teile.push(`Eigenlabor privat Stufe ${E.PRIVAT_STUFEN[s.eigenPrivatStufe]?.titel || zahlWort(s.eigenPrivatStufe)}`);
  if (s.eigenPrivatAufschlag > 0) teile.push(`BEB-Aufschlag ${zahlWort(s.eigenPrivatAufschlag)} Prozent`);
  const wunsch = euroRund(z.ziel);
  const satz = z.unterMin
    ? `Ihr Wunsch von ${wunsch} liegt unter dem billigsten Stand, deshalb stehen alle Regler unten${teile.length ? `: ${liste(teile)}` : ""}.`
    : z.ueberMax
      ? `Ihr Wunsch von ${wunsch} liegt über dem teuersten Stand, deshalb stehen alle Regler oben: ${liste(teile)}.`
      : `Für Ihren Wunsch von ${wunsch} habe ich die Regler gestellt: ${teile.length ? liste(teile) : "alle auf Standard"}.`;
  const warn = [
    ...(s.honorarFaktor > 2.3 ? ["Über Faktor zwei Komma drei braucht jede Position eine Begründung in PlanR."] : []),
    ...(s.eigenPrivatStufe > 0 ? ["Für die Privatstufe braucht es eine Mehrkostenvereinbarung."] : []),
  ];
  return [satz, ...warn].join(" ");
}
