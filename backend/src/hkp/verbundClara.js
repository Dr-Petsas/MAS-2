// Praxis-Verbund: die Gast-Praxis nutzt die Clara der Haupt-Praxis (Chef 21.11.2026).
//
// Es gibt eine Clara je Praxis. Im Verbund (hkp/verbund.js) zaehlt dafuer die Haupt-Praxis:
// die Gast-Praxis bekommt keine eigene, ihre Handys werden unter der Haupt-Praxis gekoppelt
// und das Gespraech laeuft als Haupt-Praxis (deren Profil, deren Stufe).
//
//   - Haupt-Praxis hat eine Clara (voll oder HKP-Clara) -> sie gilt auch fuer den Gast.
//   - Haupt-Praxis hat keine                            -> der Gast behaelt, was er selbst gebucht hat.
//   - kein Verbund, Haupt-Praxis selbst, jeder Fehler   -> die Praxis selbst, wie bisher.
//
// Abgerechnet wird weiter jede Praxis fuer sich: /planr/berechtigung meldet die eigene Stufe
// unveraendert und die geliehene nur zusaetzlich (claraVerbund).
// Notaus: MAS_VERBUND_CLARA=0 (und MAS_PLANR_VERBUND=0 schaltet den ganzen Verbund ab).
import { getBilling } from "../entitlements.js";
import { planrAusBilling } from "./planrBerechtigung.js";
import { hauptFuer } from "./verbund.js";

export const VERBUND_HINWEIS = "Im Praxis-Verbund nutzen Sie die Assistentin der Haupt-Praxis.";
export const VERBUND_NAME = "Den Namen der Assistentin ändert die Haupt-Praxis.";

const aus = () => String(process.env.MAS_VERBUND_CLARA || "").trim() === "0";

let ladeBilling = getBilling;
let ladeHaupt = hauptFuer;

/** Nur fuer Tests. */
export function _setVerbundClaraLaden({ billing, haupt } = {}) {
  ladeBilling = billing || getBilling;
  ladeHaupt = haupt || hauptFuer;
}

/**
 * PUR: welche Praxis stellt die Clara?
 * @returns {{praxis: string, verbund: false} | {praxis: string, verbund: true, stufe: "voll" | "planr"}}
 */
export function claraPraxisAus({ clientId, haupt, hauptBilling }) {
  const id = String(clientId || "").trim();
  const h = String(haupt || "").trim();
  if (!h || h === id) return { praxis: id, verbund: false };
  const stufe = planrAusBilling(hauptBilling).clara;
  return stufe === "voll" || stufe === "planr" ? { praxis: h, verbund: true, stufe } : { praxis: id, verbund: false };
}

/** Wie claraPraxisAus, liest Verbund und Billing selbst. Wirft nie; im Zweifel die Praxis selbst. */
export async function claraPraxisFuer(clientId) {
  const id = String(clientId || "").trim();
  const selbst = { praxis: id, verbund: false };
  if (!id || aus()) return selbst;
  try {
    const haupt = await ladeHaupt(id);
    if (!haupt) return selbst;
    return claraPraxisAus({ clientId: id, haupt, hauptBilling: await ladeBilling(haupt) });
  } catch {
    return selbst;
  }
}
