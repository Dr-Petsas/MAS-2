// Lese- und Einstell-Routen fuer die einfache Clara-Seite (/m/clara-start.html):
// Tagesliste, eigene Knopf-Texte der Praxis, Praxis-Auswahl. Rein additiv —
// gespeichert wird die Notiz selbst weiter ueber POST /brain/events.
import express from "express";
import { assertAppEnabled } from "../entitlements.js";
import { todayBerlin } from "../clara/daySchedule.js";
import { ladeTagesliste } from "../brain/tagesliste.js";
import { speichereLisaAnruf } from "../brain/lisaAnrufe.js";
import { setzeZurueckgestellt } from "../brain/caseStore.js";
import { bisAus, bisGesprochen, zurueckstellenAktiv } from "../brain/zurueckstellen.js";
import { ladeVorgaben, ladeVorlagen, setzeVorlage } from "../brain/notizVorlagen.js";
import { aktiveMandanten } from "../tenants.js";
import { ladeLisaIdentitaet } from "../lisa/identitaet.js";
import { resolveClientId } from "./_shared.js";

const router = express.Router();

function endeDesTagesBerlin(dateStr) {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`).getTime();
  const berlinHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(new Date(noonUtc))
  );
  const startMs = new Date(`${dateStr}T00:00:00Z`).getTime() - (berlinHour - 12) * 3_600_000;
  return startMs + 24 * 3_600_000 - 1;
}

async function praxisName(clientId) {
  try {
    return String((await ladeLisaIdentitaet(clientId))?.praxisName || "").trim();
  } catch {
    return "";
  }
}

// Alles, worauf heute jemand reagieren muss: Patienten-Vorgaenge zuerst,
// Julias QM-Aufgaben als nachgeordneter Abschnitt — vorerst nur mit ?qm=1.
router.get("/brain/tagesliste", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = todayBerlin();
    const nowMs = Date.now();
    const endOfDayMs = endeDesTagesBerlin(date);
    const liste = await ladeTagesliste(clientId, { nowMs, endOfDayMs, startOfDayMs: endOfDayMs - 24 * 3_600_000 + 1, heute: date, mitQm: req.query?.qm === "1" });
    res.json({ ok: true, clientId, date, ...liste });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Lisa V8 meldet jeden Anruf, auch den ohne Abnehmen. Ein Eintrag je Anruf im
// Praxisgedaechtnis (feste Kennung, doppeltes Schicken erzeugt nichts). Bianca
// liest ihn ueber /brain/caller-context, die Seite ueber /brain/tagesliste.
router.post("/brain/lisa-anrufe", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await speichereLisaAnruf(clientId, req.body || {});
    if (!out.ok) return res.status(400).json(out);
    res.status(out.neu && !out.trocken ? 201 : 200).json({ clientId, ...out });
  } catch (e) {
    res.status(400).json({ ok: false, grund: "fehler", klartext: String(e?.message || e) });
  }
});

// Vorgang zurueckstellen ("spaeter"): Body { date?, time?, by?, dryRun? } bzw. { aufheben: true, by? }.
// Ohne Datum und Uhrzeit: bis zum naechsten Arbeitstag. Der Status des Vorgangs bleibt unveraendert.
const NICHT_MOEGLICH = {
  vergangen: "Der Zeitpunkt liegt in der Vergangenheit.",
  zu_weit: "Der Zeitpunkt liegt mehr als ein Jahr entfernt.",
  datum_unlesbar: "Das Datum ist nicht lesbar.",
  uhrzeit_unlesbar: "Die Uhrzeit ist nicht lesbar.",
  nicht_offen: "Der Vorgang ist nicht mehr offen.",
  not_found: "Den Vorgang gibt es nicht mehr.",
};
router.post("/brain/cases/:id/zurueckstellen", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    if (!zurueckstellenAktiv()) return res.json({ ok: false, reason: "abgeschaltet", message: "Zurückstellen ist abgeschaltet." });
    const by = String(req.body?.by || "Team").trim() || "Team";
    if (req.body?.aufheben === true) {
      const out = await setzeZurueckgestellt(clientId, req.params.id, { bisMs: 0, by, text: "Wieder vorgelegt" });
      return res.json(out.ok ? { ok: true, clientId, bisMs: null } : { ok: false, reason: out.reason, message: NICHT_MOEGLICH[out.reason] || "" });
    }
    const nowMs = Date.now();
    const bis = bisAus({ date: req.body?.date, time: req.body?.time, nowMs });
    if (!bis.ok) return res.json({ ok: false, reason: bis.reason, message: NICHT_MOEGLICH[bis.reason] || "" });
    const bisText = bisGesprochen(bis.bisMs, { mitUhrzeit: bis.mitUhrzeit, nowMs });
    if (req.body?.dryRun) return res.json({ ok: true, dryRun: true, clientId, bisMs: bis.bisMs, bisText });
    const out = await setzeZurueckgestellt(clientId, req.params.id, { bisMs: bis.bisMs, by, text: `Zurückgestellt bis ${bisText}` });
    if (!out.ok) return res.json({ ok: false, reason: out.reason, message: NICHT_MOEGLICH[out.reason] || "" });
    res.json({ ok: true, clientId, bisMs: bis.bisMs, bisText, anzahl: out.anzahl });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.get("/brain/notiz-vorlagen", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    res.json({ ok: true, clientId, texte: await ladeVorlagen(clientId), vorgaben: ladeVorgaben() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Body: { id, text, by? } — leerer Text stellt die Vorgabe wieder her.
router.put("/brain/notiz-vorlagen", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const texte = await setzeVorlage(clientId, req.body?.id, req.body?.text, { by: req.body?.by });
    res.json({ ok: true, clientId, texte });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Praxis-Auswahl: ein angemeldeter Praxis-Nutzer sieht nur die eigene Praxis,
// Superuser und Dienste alle aktiven.
router.get("/brain/praxen", async (req, res) => {
  try {
    const a = req.auth || {};
    const eigene = resolveClientId(req);
    const nurEigene = a.kind === "user" && !a.superUser;
    const ids = nurEigene ? [eigene].filter(Boolean) : await aktiveMandanten();
    const praxen = await Promise.all(ids.map(async (id) => ({ id, name: (await praxisName(id)) || id })));
    res.json({ ok: true, aktuell: eigene || ids[0] || "", praxen });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

export default router;
