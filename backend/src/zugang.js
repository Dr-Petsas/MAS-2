// Zugang von aussen: woher eine Anfrage kommt, was sie mitbringt, und die Regel fuer den Tunnel.
//
// Das MAS haengt hinter einem Cloudflare-Tunnel (mas.pickadoc-tunnel.com). Was dort hereinkommt, traegt Koepfe,
// die Cloudflare setzt und die ein Aufrufer von aussen nicht weglassen kann. Aufrufer auf diesem Rechner
// (Clara V8, Waechter, Laeufe) und im Praxisnetz kommen ohne diese Koepfe. Setzt ein eigener Aufrufer einen
// davon, gilt er als Tunnel und wird strenger behandelt, nie milder.
//
// Ins Protokoll geht davon nur: Herkunft, Art des Nachweises, Art des Programms, die aufrufende Seite.
// Keine Adresse des Aufrufers, keine Abfrage, kein Inhalt.

const TUNNEL_KOEPFE = [
  "cf-ray", "cf-connecting-ip", "cf-visitor", "cf-ipcountry", "cdn-loop",
  "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-real-ip", "forwarded",
];
const EIGENER_RECHNER = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** "tunnel" (von aussen), "lokal" (dieser Rechner) oder "netz" (Praxisnetz). */
export function herkunft(req) {
  const koepfe = req?.headers || {};
  for (const name of TUNNEL_KOEPFE) if (koepfe[name]) return "tunnel";
  return EIGENER_RECHNER.has(String(req?.socket?.remoteAddress || "")) ? "lokal" : "netz";
}

/** Art des aufrufenden Programms aus dem User-Agent, nur der Produktname. */
export function programm(req) {
  const ua = String(req?.headers?.["user-agent"] || "");
  if (!ua) return "ohne";
  if (/PowerShell/i.test(ua)) return "powershell";
  if (/^Mozilla\//.test(ua)) {
    if (/iPad/.test(ua)) return "browser-ipad";
    if (/iPhone|Android.*Mobile/.test(ua)) return "browser-handy";
    return "browser";
  }
  const m = /^([A-Za-z][A-Za-z0-9._-]{0,23})/.exec(ua);
  return m ? m[1].toLowerCase() : "sonst";
}

/**
 * Von welcher Seite ein Browser ruft: der Rechnername aus Origin oder Referer, bei einer Seite des MAS dazu der
 * Dateiname. Pfade und Abfragen sonst nie: darin koennen Kennungen und Namen stehen.
 */
export function seite(req) {
  const koepfe = req?.headers || {};
  const roh = String(koepfe.referer || koepfe.origin || "");
  if (!roh) return undefined;
  try {
    const u = new URL(roh);
    const datei = /^\/(?:m\/)?[A-Za-z0-9_.-]+\.html$/.test(u.pathname) ? u.pathname : "";
    return (u.host + datei).slice(0, 90);
  } catch {
    return undefined;
  }
}

// Uebergang (27.11.2026): Bianca V8 und Lisa V8 schicken noch keinen Schluessel. Ihre vier Pfade bleiben am
// Tunnel offen, bis sie einen schicken; danach wird diese Liste leer.
const UEBERGANG = new Set([
  "GET /brain/caller-context",
  "POST /brain/caller-context/resolve",
  "POST /brain/events",
  "POST /brain/lisa-anrufe",
]);

export function uebergang(req) {
  return UEBERGANG.has(`${req?.method} ${req?.path}`);
}

/**
 * Die Regel fuer den Tunnel, gedacht fuer Anfragen ohne Anmeldung und ohne Schluessel auf einem Pfad, der sich
 * nicht selbst schuetzt: von aussen abgelehnt, ausser auf den Pfaden des Uebergangs.
 */
export function tunnelLehntAb(req) {
  return herkunft(req) === "tunnel" && !uebergang(req);
}