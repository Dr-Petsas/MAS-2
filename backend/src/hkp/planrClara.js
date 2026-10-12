// HKP-Clara fuer PlanR-Standalone-Kunden (Chef 12.10.2026).
//
// Nur Praxen mit eigenem PlanR-Abo OHNE MAS sind betroffen:
//   - Sprachsteuerung gebucht  -> Zugang "planr": Sitzung laeuft immer mit dem
//     Profil clara_planr (Patientensuche, HKP, Rueckgaengig) und jedes andere
//     Werkzeug wird hier serverseitig gesperrt.
//   - nicht gebucht            -> Zugang "gesperrt": keine Clara-Sitzung.
// Alle anderen Praxen (MAS, meddent, Demo, ohne Billing) bleiben "unberuehrt" —
// der Waechter faellt bei jedem Fehler auf "unberuehrt" zurueck (bzw. auf den
// letzten bekannten Stand), damit nie ein MAS-Kunde ausgesperrt wird.
//
// Zweite Sicherung neben dem Worker (Clara-Voice services/mandant_sitzung.py).
// Notaus: MAS_PLANR_SPERRE=0.
import { getBilling } from "../entitlements.js";
import { planrAusBilling } from "./planrBerechtigung.js";

export const SPERRSATZ = "Das kann ich hier leider nicht. In PlanR bin ich Ihre Assistentin für Heil- und Kostenpläne. "
  + "Termine, Telefon, Post und alles Weitere gibt es mit Pickadoc MAS, mehr dazu auf pickadoc Punkt A I.";
export const NICHT_GEBUCHT = "Die Sprachsteuerung ist für diese Praxis nicht gebucht. Sie lässt sich in PlanR unter Abo dazubuchen.";

export const planrProfilId = () => String(process.env.CLARA_PLANR_PROFILE_ID || "clara_planr").trim();

const ERLAUBT = [/^\/tools\/search-patient\/?$/, /^\/tools\/hkp-[a-z-]+\/?$/, /^\/tools\/undo-last\/?$/];
const GESCHUETZT = (p) => p.startsWith("/tools/") || p === "/clara/team/ask";

/** "planr" | "gesperrt" | "unberuehrt" aus dem Billing-Dokument. */
export function claraZugang(billing) {
  const b = planrAusBilling(billing);
  if (b.mas || !b.planr) return "unberuehrt";
  return b.clara === "planr" ? "planr" : "gesperrt";
}

export const werkzeugErlaubt = (pfad) => ERLAUBT.some((r) => r.test(String(pfad || "")));

let laden = getBilling;
const _cache = new Map();
const CACHE_MS = 60000;

/** Nur fuer Tests. */
export function _setBillingLaden(fn) {
  laden = fn || getBilling;
  _cache.clear();
}

export function invalidateClaraZugang(clientId) {
  if (clientId) _cache.delete(String(clientId).trim());
  else _cache.clear();
}

/** Zugang je Praxis, 60 s gecacht, wirft nie. */
export async function claraZugangFuer(clientId) {
  const id = String(clientId || "").trim();
  if (!id) return "unberuehrt";
  const hit = _cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.zugang;
  try {
    const zugang = claraZugang(await laden(id));
    _cache.set(id, { at: Date.now(), zugang });
    return zugang;
  } catch {
    return hit?.zugang || "unberuehrt";
  }
}

const sperreAus = () => String(process.env.MAS_PLANR_SPERRE || "").trim() === "0";

/** Express-Middleware vor den Werkzeug-Routern. */
export function planrClaraSperre(resolveClientId) {
  return async (req, res, next) => {
    const pfad = req.path || "";
    if (sperreAus() || !GESCHUETZT(pfad)) return next();
    let clientId = "";
    try { clientId = resolveClientId(req); } catch { return next(); }
    const zugang = await claraZugangFuer(clientId);
    if (zugang === "unberuehrt" || (zugang === "planr" && werkzeugErlaubt(pfad))) return next();
    const satz = zugang === "planr" ? SPERRSATZ : NICHT_GEBUCHT;
    res.json({ ok: false, gesperrt: true, error: "planr_sperre", message: satz, spoken: satz });
  };
}

/** Profil fuer /clara/session: erzwingt clara_planr bzw. sperrt. */
export async function sitzungsProfil(clientId, gewuenscht) {
  if (sperreAus()) return { profileId: gewuenscht };
  const zugang = await claraZugangFuer(clientId);
  if (zugang === "gesperrt") return { gesperrt: true, message: NICHT_GEBUCHT };
  if (zugang === "planr") return { profileId: planrProfilId(), zugang };
  return { profileId: gewuenscht };
}

const NAME_RE = /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]{2,19}$/;

/** Ruf-Name pruefen: EIN Wort (er ist zugleich Weckwort), 3–20 Buchstaben, Bindestrich erlaubt. */
export function rufnameSaeubern(roh) {
  const n = String(roh ?? "").trim();
  if (!n) return { ok: true, name: "" };
  if (!NAME_RE.test(n)) return { ok: false, error: "name_ungueltig" };
  return { ok: true, name: n.charAt(0).toUpperCase() + n.slice(1) };
}
