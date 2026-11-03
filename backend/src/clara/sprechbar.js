// Werkzeug-Antworten fuer Clara sprechbar machen (Funktionstest 03.11.2026).
//
// Die TelefonKI schreibt Gespraechs-Reports im Terminpopup-Stil ins
// Gedaechtnis ("Heiko Reuber — Laut Anruf (Bianca): Heiko Reuber — Gespraech
// ohne Kalenderaenderung"). Fuer die Plattform ist das richtig, vorgelesen
// klingt es wie ein Datenbankauszug. Statt jedes Werkzeug einzeln zu flicken,
// laeuft jede /tools/*-Antwort einmal hier durch.

const VERMERK_RE = /\bLaut Anruf\s*\([^)]{1,40}\)\s*:\s*/gi;
const LEER_RE = /\s*[—–-]?\s*\bGespr(?:ä|ae)ch ohne Kalender(?:ä|ae)nderung\b/gi;
const NAME = "[A-ZÄÖÜ][\\wäöüß.'-]+(?:\\s+[A-ZÄÖÜ][\\wäöüß.'-]+){0,3}";
const DOPPELT_RE = new RegExp(`(${NAME})\\s*[—–:]\\s*\\1\\b`, "g");
const HAENGEND_RE = /\s*[—–]\s*(?=[.,;!?]|$)/g;
const BETRAG_RE = /(?:\s(?:über|ueber|in Höhe von|in Hoehe von|im Betrag von|(?:einen|ein) Betrag von|von))?\s?(?:[$€]\s?\d(?:[\d.,]*\d)?|\b\d(?:[\d.,]*\d)?\s?(?:€|Euro|EUR|USD|Dollar|\$))(?:\s?(?:brutto|netto))?/gi;

// Kommunikations-Uebersichten: Betraege gehoeren nicht in Briefings (AGENTS.md).
const OHNE_BETRAEGE = new Set([
  "/tools/comms-digest", "/tools/day-briefing", "/tools/morning-briefing",
  "/tools/read-briefing", "/tools/call-log", "/tools/evening-briefing",
]);

export function sprechbar(text, { ohneBetraege = false } = {}) {
  if (typeof text !== "string" || !text) return text;
  let t = text.replace(VERMERK_RE, "").replace(LEER_RE, "");
  t = t.replace(DOPPELT_RE, "$1");
  if (ohneBetraege) t = t.replace(BETRAG_RE, "").replace(/\(\s*\)/g, "").replace(/\s+([.,;])/g, "$1");
  t = t.replace(HAENGEND_RE, "");
  return t.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;!?])/g, "$1").trim();
}

export function sprechbarMiddleware() {
  return (req, res, next) => {
    if (!req.path.startsWith("/tools/")) return next();
    const ohneBetraege = OHNE_BETRAEGE.has(req.path);
    const json = res.json.bind(res);
    res.json = (body) => {
      if (body && typeof body === "object" && typeof body.message === "string") {
        body = { ...body, message: sprechbar(body.message, { ohneBetraege }) };
      }
      return json(body);
    };
    next();
  };
}
