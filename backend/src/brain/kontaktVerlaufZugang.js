// Zugang zu den beiden Meldepfaden des Kontaktverlaufs (sendung, reaktion): nur mit dem eigenen Schluessel.
//
// Der Schluessel steht in einer Datei ausserhalb des Repos; die Umgebung nennt nur ihren Pfad
// (MAS_KONTAKT_VERLAUF_SCHLUESSEL_DATEI). Die Plattform schickt ihn im Kopf X-Service-Token.
// Bewusst nicht MAS_SERVICE_TOKEN: daraus leitet qm/portal.js die Links des QM-Portals ab (schon verschickte
// Links wuerden ungueltig), und tools/tunnel_watch.ps1 wuerde damit als Dienst statt als Praxis auftreten.
// Ohne eingerichteten Schluessel nehmen die Pfade nichts an.

import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const MINDESTENS = 32;
let gemerkt = { datei: "", stand: "", schluessel: "" };
let zuletztGewarnt = 0;

/** Der gueltige Schluessel oder "". Die Datei wird neu gelesen, sobald sie sich aendert. */
export async function meldeSchluessel() {
  const datei = (process.env.MAS_KONTAKT_VERLAUF_SCHLUESSEL_DATEI || "").trim();
  if (!datei) return "";
  try {
    const s = await stat(datei);
    const stand = `${s.mtimeMs}|${s.size}`;
    if (gemerkt.datei === datei && gemerkt.stand === stand) return gemerkt.schluessel;
    const roh = (await readFile(datei, "utf8")).replace(/^\uFEFF/, "").trim();
    const schluessel = roh.length >= MINDESTENS && !/\s/.test(roh) ? roh : "";
    gemerkt = { datei, stand, schluessel };
    return schluessel;
  } catch {
    return "";
  }
}

const abdruck = (s) => createHash("sha256").update(String(s)).digest();

/** Express-Waechter: laesst nur Anfragen mit dem gueltigen Schluessel durch. */
export async function nurMitSchluessel(req, res, next) {
  const soll = await meldeSchluessel();
  if (!soll) {
    return res.status(503).json({ ok: false, grund: "schluessel_nicht_eingerichtet", klartext: "Im MAS ist kein Schlüssel für die Meldungen eingerichtet." });
  }
  const ist = (req.header("X-Service-Token") || "").trim();
  if (ist && timingSafeEqual(abdruck(ist), abdruck(soll))) return next();
  if (Date.now() - zuletztGewarnt > 60_000) {
    zuletztGewarnt = Date.now();
    console.warn(`[kontakt-verlauf] Meldung abgelehnt: ${ist ? "falscher Schluessel" : "kein Schluessel"} (${req.path})`);
  }
  return res.status(401).json({ ok: false, grund: "schluessel_ungueltig", klartext: "Der Schlüssel im Kopf X-Service-Token fehlt oder stimmt nicht." });
}
