// Lese- und Einstell-Routen fuer die einfache Clara-Seite (/m/clara-start.html):
// Tagesliste, eigene Knopf-Texte der Praxis, Praxis-Auswahl. Rein additiv —
// gespeichert wird die Notiz selbst weiter ueber POST /brain/events.
import express from "express";
import { assertAppEnabled } from "../entitlements.js";
import { todayBerlin } from "../clara/daySchedule.js";
import { ladeTagesliste } from "../brain/tagesliste.js";
import { ladeVorlagen, setzeVorlage } from "../brain/notizVorlagen.js";
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
// Julias QM-Aufgaben als nachgeordneter Abschnitt.
router.get("/brain/tagesliste", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = todayBerlin();
    const nowMs = Date.now();
    const liste = await ladeTagesliste(clientId, { nowMs, endOfDayMs: endeDesTagesBerlin(date) });
    res.json({ ok: true, clientId, date, ...liste });
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
    res.json({ ok: true, clientId, texte: await ladeVorlagen(clientId) });
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
