import express from "express";
import { timingSafeEqual } from "node:crypto";
import { offerSlotsForTask, bookSlotForTask } from "../lisa/callBooking.js";
import { log } from "../log.js";

// ============================================================================
// W-OUTREACH-2 — Webhook-Endpunkte für Lisas Kalender-Werkzeuge.
//
// Aufrufer ist NICHT ein Browser oder der Voice-Worker, sondern ElevenLabs
// (Lisas Agent ruft die Tools MITTEN im Patientengespräch auf). Deshalb:
//   - eigener Secret-Header (X-Lisa-Tool-Secret == LISA_TOOL_SECRET), in
//     auth.js als public gelistet — die Prüfung passiert HIER, timing-safe.
//   - task_id/client_id kommen als Dynamic Variables aus lisaStartCall —
//     der Task in mas_lisa_tasks ist die Autorität, WAS gebucht werden darf
//     (bookingContext). Ohne Kontext wird NICHTS gebucht.
//   - Antworten sind fürs LLM gebaut: `spoken` sagt Lisa, was sie sagen soll,
//     `slots[].iso` ist der Buchungsschlüssel für book_slot.
//
// Verdrahtung am Agenten: src/lisa/agentTools.js (Boot-Sync + Setup-Skript).
// ============================================================================

const router = express.Router();

function s(v) {
  return v == null ? "" : String(v).trim();
}

function secretOk(req) {
  const want = s(process.env.LISA_TOOL_SECRET);
  if (!want) return false; // ohne konfiguriertes Secret sind die Tools AUS
  const got = s(req.header("X-Lisa-Tool-Secret"));
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Fehler antworten wir mit 200 + spoken-Anweisung: ElevenLabs reicht auch
// Fehler-Bodies ans LLM weiter, aber ein sauberes `spoken` führt Lisa sicher
// durchs Gespräch, statt sie mit einem HTTP-Fehlertext allein zu lassen.
const SPOKEN_UNAVAILABLE =
  "Der Kalenderzugriff ist gerade nicht möglich. Versprich nichts Festes, sondern sage zu, dass die Praxis kurzfristig mit Terminvorschlägen zurückruft, und bedanke dich freundlich.";

function guard(req, res) {
  if (!secretOk(req)) {
    log.warn("lisa.tool.bad_secret", { path: req.path, ip: req.ip });
    res.status(401).json({ ok: false, spoken: SPOKEN_UNAVAILABLE });
    return null;
  }
  const clientId = s(req.body?.client_id);
  const taskId = s(req.body?.task_id);
  if (!clientId || !taskId) {
    log.warn("lisa.tool.missing_ids", { path: req.path, hasClient: !!clientId, hasTask: !!taskId });
    res.json({ ok: false, spoken: SPOKEN_UNAVAILABLE });
    return null;
  }
  return { clientId, taskId };
}

// Lisa: "Wann wäre denn noch etwas frei?" — freie Termine, optional nach
// Patientenwunsch gefiltert. Antwort: spoken + slots[{iso, spoken}].
router.post("/lisa/tools/offer-slots", async (req, res) => {
  const g = guard(req, res);
  if (!g) return;
  try {
    const out = await offerSlotsForTask(g.clientId, g.taskId, {
      wishText: s(req.body?.wish),
      excludeIso: s(req.body?.exclude_iso),
    });
    res.json(out);
  } catch (e) {
    log.warn("lisa.tool.offer_slots_error", { error: String(e?.message || e) });
    res.json({ ok: false, spoken: SPOKEN_UNAVAILABLE });
  }
});

// Lisa: Patient hat zugesagt — SOFORT fest buchen. Ist der Slot inzwischen
// vergeben, kommen im selben Zug neue Alternativen zurück (slotTaken=true).
router.post("/lisa/tools/book-slot", async (req, res) => {
  const g = guard(req, res);
  if (!g) return;
  try {
    const out = await bookSlotForTask(g.clientId, g.taskId, {
      slotIso: s(req.body?.slot_iso),
    });
    res.json(out);
  } catch (e) {
    log.warn("lisa.tool.book_slot_error", { error: String(e?.message || e) });
    res.json({ ok: false, spoken: SPOKEN_UNAVAILABLE });
  }
});

export default router;
