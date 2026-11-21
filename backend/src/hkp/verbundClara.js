// Gekoppelte Konten (PlanR-Kopplung, hkp/verbund.js): welche Clara gilt? (Chef 21.11.2026)
//
// Es gibt eine Clara je Praxis. Sind ein Standalone-Konto und ein MAS-Konto gekoppelt, gilt fuer beide
// die volle Clara des MAS-Kontos - egal, welches der beiden den Kopplungscode erzeugt hat. Die Handys
// werden dann unter dem MAS-Konto gekoppelt und das Gespraech laeuft als dieses Konto (dessen Profil).
//
//   1. Das Konto, das den Code erzeugt hat, hat MAS      -> dessen volle Clara, fuer alle Gekoppelten.
//   2. Das eigene Konto hat MAS                          -> die eigene volle Clara bleibt.
//   3. Genau EIN anderes gekoppeltes Konto hat MAS       -> dessen volle Clara. Bei mehreren wird nicht geraten.
//   4. Kein MAS dabei, das Code-Konto hat das Sprachpaket -> dessen kleine Assistentin.
//   5. sonst, ohne Kopplung und bei jedem Fehler         -> das Konto selbst, wie bisher.
//
// Abgerechnet wird weiter jedes Konto fuer sich: /planr/berechtigung meldet die eigene Stufe
// unveraendert und die mitgenutzte nur zusaetzlich (claraVerbund).
// Notaus: MAS_VERBUND_CLARA=0 (und MAS_PLANR_VERBUND=0 schaltet die ganze Kopplung ab).
import { getBilling } from "../entitlements.js";
import { planrAusBilling } from "./planrBerechtigung.js";
import { gaesteFuer, hauptFuer } from "./verbund.js";

/** Hinweis fuer das Konto, das die Assistentin eines gekoppelten Kontos nutzt. */
export const kopplungHinweis = (stufe) => (stufe === "voll"
  ? "Sie nutzen die Assistentin aus dem gekoppelten MAS-Konto."
  : "Sie nutzen die Assistentin aus dem gekoppelten Standalone-Konto.");
export const kopplungName = (stufe) => (stufe === "voll"
  ? "Den Namen der Assistentin legt das gekoppelte MAS-Konto fest."
  : "Den Namen der Assistentin ändert das gekoppelte Standalone-Konto.");

const aus = () => String(process.env.MAS_VERBUND_CLARA || "").trim() === "0";
const stufeVon = (billing) => planrAusBilling(billing).clara;

let ladeBilling = getBilling;
let ladeHaupt = hauptFuer;
let ladeGaeste = gaesteFuer;

/** Nur fuer Tests. */
export function _setVerbundClaraLaden({ billing, haupt, gaeste } = {}) {
  ladeBilling = billing || getBilling;
  ladeHaupt = haupt || hauptFuer;
  ladeGaeste = gaeste || gaesteFuer;
}

/**
 * PUR: welches Konto stellt die Clara?
 * haupt = Konto, das den Code erzeugt hat ("" = dieses Konto selbst), gaeste = die daran gekoppelten Konten.
 * @param {{clientId: string, eigen?: object|null, haupt?: string, hauptBilling?: object|null, gaeste?: {id: string, billing: object|null}[]}} o
 * @returns {{praxis: string, verbund: false} | {praxis: string, verbund: true, stufe: "voll" | "planr"}}
 */
export function claraPraxisAus({ clientId, eigen = null, haupt = "", hauptBilling = null, gaeste = [] }) {
  const id = String(clientId || "").trim();
  const h = String(haupt || "").trim();
  const selbst = { praxis: id, verbund: false };
  const angehaengt = !!h && h !== id;
  const hauptStufe = angehaengt ? stufeVon(hauptBilling) : "aus";
  if (hauptStufe === "voll") return { praxis: h, verbund: true, stufe: "voll" };
  if (stufeVon(eigen) === "voll") return selbst;
  const volle = gaeste.filter((g) => g && g.id && g.id !== id && stufeVon(g.billing) === "voll");
  if (volle.length === 1) return { praxis: String(volle[0].id), verbund: true, stufe: "voll" };
  if (hauptStufe === "planr") return { praxis: h, verbund: true, stufe: "planr" };
  return selbst;
}

/**
 * Wie claraPraxisAus, liest Kopplung und Billing selbst. Wirft nie; im Zweifel das Konto selbst.
 * eigen = schon geladenes Billing dieses Kontos (spart das Lesen), undefined = bei Bedarf selbst lesen.
 */
export async function claraPraxisFuer(clientId, { eigen } = {}) {
  const id = String(clientId || "").trim();
  const selbst = { praxis: id, verbund: false };
  if (!id || aus()) return selbst;
  const eigenes = async () => (eigen !== undefined ? eigen : ladeBilling(id));
  const mitBilling = (ids) => Promise.all(ids.filter((g) => g !== id).map(async (g) => ({ id: g, billing: await ladeBilling(g) })));
  try {
    const haupt = await ladeHaupt(id);
    if (haupt) {
      const hauptBilling = await ladeBilling(haupt);
      if (stufeVon(hauptBilling) === "voll") return claraPraxisAus({ clientId: id, haupt, hauptBilling });
      const e = await eigenes();
      if (stufeVon(e) === "voll") return selbst;
      return claraPraxisAus({ clientId: id, eigen: e, haupt, hauptBilling, gaeste: await mitBilling(await ladeGaeste(haupt)) });
    }
    if (eigen !== undefined && stufeVon(eigen) === "voll") return selbst;
    const ids = await ladeGaeste(id);
    if (!ids.length) return selbst;
    const e = await eigenes();
    if (stufeVon(e) === "voll") return selbst;
    return claraPraxisAus({ clientId: id, eigen: e, gaeste: await mitBilling(ids) });
  } catch {
    return selbst;
  }
}
