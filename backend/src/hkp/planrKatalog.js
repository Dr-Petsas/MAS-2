// Praxiskatalog aus PlanR fuer Claras HKP (Chef 14.10.2026): Preise & Positionen, die PlanR aus dem
// PVS der Praxis uebernommen hat (Eigenlabor-Positionen, Praxis-GOZ, BEL-Preise, Komplexe).
// Die HKP-Engine mischt ihn wie der Browser (listenFuer) und ordnet die Positionen den
// Leistungsschritten zu - ohne dass in PlanR erst jemand "Freigeben" klickt.
// GET /api/intern/praxiskatalog, Schluessel PLANR_HKP_KEY. Notaus: MAS_PLANR_KATALOG=0.
const basis = () => String(process.env.PLANR_URL || "https://planr.pickadoc.de").trim().replace(/\/+$/, "");
const schluessel = () => String(process.env.PLANR_HKP_KEY || "").trim();
const GUELTIG_MS = 10 * 60 * 1000;
const FEHLER_MS = 2 * 60 * 1000;

const cache = new Map();
let holen = (...a) => fetch(...a);
/** Nur fuer Tests. */
export function _setHolen(fn) { holen = fn || ((...a) => fetch(...a)); cache.clear(); }

/** PraxisKatalog | null. Wirft nie. Haelt Antworten 10 min; ist PlanR nicht erreichbar, gilt 2 min der letzte Stand. */
export async function praxisKatalog(clientId) {
  if (String(process.env.MAS_PLANR_KATALOG || "").trim() === "0" || !schluessel() || !clientId) return null;
  const hit = cache.get(clientId);
  if (hit && Date.now() < hit.bis) return hit.katalog;
  let katalog = null;
  let beantwortet = false;
  try {
    const url = `${basis()}/api/intern/praxiskatalog?${new URLSearchParams({ clientId })}`;
    const r = await holen(url, { headers: { "X-PlanR-Key": schluessel() }, signal: AbortSignal.timeout(4000) });
    const d = await r.json().catch(() => ({}));
    beantwortet = r.ok || r.status === 404;
    if (r.ok && d?.ok && d.katalog && Array.isArray(d.katalog.eigenlabor)) katalog = d.katalog;
  } catch { /* PlanR nicht erreichbar */ }
  if (!beantwortet) katalog = hit?.katalog ?? null;
  cache.set(clientId, { katalog, bis: Date.now() + (beantwortet ? GUELTIG_MS : FEHLER_MS) });
  return katalog;
}
