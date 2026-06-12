import fs from "node:fs";
import path from "node:path";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { deleteMessage } from "../mail/store.js";
import { log } from "../log.js";

// ============================================================================
// Datensparsamkeit (DSGVO): Kommunikationsdaten verfallen automatisch.
//
// Alles, was älter als RETENTION_DAYS (Standard 90 Tage) ist, wird beim
// täglichen Sweep endgültig gelöscht:
//
//   mas_events            Praxisgedächtnis-Einträge (Feld ts, epoch ms)
//   mas_cases             Tickets/Vorgänge — Maßstab ist die LETZTE Aktivität
//                         (updatedAt), nicht das Anlegedatum: ein Ticket, an
//                         dem 90 Tage nichts mehr passiert ist, ist tot.
//   mas_mail_messages     E-Mails inkl. Anhänge (über deleteMessage permanent)
//   mas_lisa_tasks        SMS-/Anruf-Aufträge inkl. Transkripten (Feld ts)
//   mas_lisa_dedupe       Kurzzeit-Duplikatsperren (Feld ts; eigentlich nach
//                         Minuten wertlos, wird hier mit abgeräumt)
//   Call-Transkripte      lokale JSON/WAV-Dateien des Voice-Workers
//                         (RETENTION_TRANSCRIPTS_DIR), nach Datei-Alter
//
// Jede Stufe ist best-effort und idempotent — ein Fehler in einer Quelle
// stoppt nie die anderen.
// ============================================================================

export const RETENTION_DAYS = Math.max(7, Number(process.env.RETENTION_DAYS) || 90);
const BATCH = 200; // Firestore-Batch-Limit ist 500 — wir bleiben bequem darunter

// --------------------------------------------------------------------------
// Speed-zu-Qualität-Regler (Cockpit): der Mandant bestimmt selbst, nach wie
// vielen Tagen Einträge aus dem Shared Memory verschwinden. Kurz = schnelles,
// schlankes Gehirn (Speed); lang = mehr Kontext für die Agenten (Qualität).
// Gespeichert in mas_config/retention, geklemmt auf 7..365 Tage. Ohne
// Einstellung gilt der Server-Standard (RETENTION_DAYS, 90).
// --------------------------------------------------------------------------
const RETENTION_MIN_DAYS = 7;
const RETENTION_MAX_DAYS = 365;

function clampDays(v, fallback = RETENTION_DAYS) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(RETENTION_MIN_DAYS, Math.min(RETENTION_MAX_DAYS, Math.round(n)));
}

export async function getRetentionConfig(clientId) {
  try {
    const snap = await masCollection(clientId, "mas_config").doc("retention").get();
    const data = snap.exists ? snap.data() : null;
    return {
      days: clampDays(data?.days),
      custom: !!(data && Number.isFinite(Number(data.days))),
      defaultDays: RETENTION_DAYS,
      minDays: RETENTION_MIN_DAYS,
      maxDays: RETENTION_MAX_DAYS,
      updatedAt: data?.updatedAt || null,
      updatedBy: data?.updatedBy || null,
    };
  } catch {
    return { days: RETENTION_DAYS, custom: false, defaultDays: RETENTION_DAYS, minDays: RETENTION_MIN_DAYS, maxDays: RETENTION_MAX_DAYS, updatedAt: null, updatedBy: null };
  }
}

export async function setRetentionDays(clientId, days, { by = "" } = {}) {
  const clamped = clampDays(days, RETENTION_DAYS);
  await masCollection(clientId, "mas_config").doc("retention").set({
    days: clamped,
    updatedAt: Date.now(),
    updatedBy: String(by || "").slice(0, 80) || null,
  }, { merge: true });
  return { days: clamped };
}

function cutoffMs(days) {
  return Date.now() - days * 86400000;
}

/** Löscht query-weise in Batches, bis nichts Altes mehr übrig ist. */
async function deleteByQuery(buildQuery, label, stats) {
  let total = 0;
  for (let round = 0; round < 50; round++) {
    const snap = await buildQuery().limit(BATCH).get();
    if (snap.empty) break;
    const batch = admin.firestore().batch();
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < BATCH) break;
  }
  stats[label] = total;
  return total;
}

/** Lokale Call-Transkripte (JSON + WAV) älter als der Cutoff löschen. */
function sweepLocalTranscripts(cutoff, stats) {
  const dir = (process.env.RETENTION_TRANSCRIPTS_DIR || "").trim();
  stats.transcriptFiles = 0;
  if (!dir || !fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (!st.isFile() || st.mtimeMs >= cutoff) continue;
      fs.unlinkSync(p);
      stats.transcriptFiles++;
    } catch { /* einzelne Datei darf nie den Sweep stoppen */ }
  }
}

/**
 * Der tägliche Aufräumlauf für EINEN Mandanten. Gibt die Löschzahlen je
 * Quelle zurück (für Log + manuellen Aufruf über den Service-Endpoint).
 */
export async function runRetentionSweep(clientId, { days } = {}) {
  // Ohne expliziten Override gilt die Mandanten-Einstellung vom Regler.
  if (!Number.isFinite(Number(days)) || Number(days) <= 0) {
    days = (await getRetentionConfig(clientId)).days;
  }
  const cutoff = cutoffMs(days);
  const cutoffDate = new Date(cutoff);
  const stats = { clientId, days, cutoffIso: cutoffDate.toISOString() };

  // 1) Praxisgedächtnis-Events (ts = epoch ms).
  await deleteByQuery(
    () => masCollection(clientId, "mas_events").where("ts", "<", cutoff),
    "events", stats
  ).catch((e) => log.warn("retention.events_failed", { clientId, err: String(e?.message || e) }));

  // 2) Tickets/Vorgänge — letzte Aktivität älter als der Cutoff.
  await deleteByQuery(
    () => masCollection(clientId, "mas_cases").where("updatedAt", "<", cutoffDate),
    "cases", stats
  ).catch((e) => log.warn("retention.cases_failed", { clientId, err: String(e?.message || e) }));

  // 3) E-Mails — über deleteMessage(permanent), damit die Anhänge in
  //    mas_mail_attachments garantiert mitgelöscht werden.
  stats.mails = 0;
  try {
    for (let round = 0; round < 50; round++) {
      const snap = await masCollection(clientId, "mas_mail_messages")
        .where("date", "<", cutoff).limit(BATCH).get();
      if (snap.empty) break;
      for (const d of snap.docs) {
        await deleteMessage(clientId, d.id, true).catch(() => {});
        stats.mails++;
      }
      if (snap.size < BATCH) break;
    }
  } catch (e) {
    log.warn("retention.mails_failed", { clientId, err: String(e?.message || e) });
  }

  // 4) Lisa-Aufträge (SMS/Anrufe inkl. Transkript-Text; ts = epoch ms).
  await deleteByQuery(
    () => masCollection(clientId, "mas_lisa_tasks").where("ts", "<", cutoff),
    "lisaTasks", stats
  ).catch((e) => log.warn("retention.lisa_failed", { clientId, err: String(e?.message || e) }));

  // 5) Dedupe-Sperren (nach Minuten wertlos — alles älter als 1 Tag weg).
  await deleteByQuery(
    () => masCollection(clientId, "mas_lisa_dedupe").where("ts", "<", cutoffMs(1)),
    "dedupe", stats
  ).catch(() => {});

  // 6) Lokale Voice-Transkripte (Dateialter).
  try {
    sweepLocalTranscripts(cutoff, stats);
  } catch (e) {
    log.warn("retention.transcripts_failed", { err: String(e?.message || e) });
  }

  log.info("retention.sweep_done", stats);
  return { ok: true, ...stats };
}
