// ============================================================================
// Geraete-Inventar pro Praxis (Julia) — Persistenz + Job-Ableitung.
//
// Bei der Praxiserstellung wird das Inventar aus der Fachrichtung vorbelegt
// (qm-geraete.json) und ist editierbar: Geraete an-/abwaehlen, Attribute
// (z. B. Autoklav-Klasse) und die letzten Pruef-/Validierungsdaten eintragen.
// Aus jedem aktiven Geraet + Datum erzeugt generateGeraeteJobs() deterministisch
// die faelligen Pruef-/Validierungs-Jobs (idempotent ueber deviceRef).
//
// Ablage: clients/{clientId}/mas_qm_inventory/{praxisId} -> { items: [...] }
// item = { key, label?, active, count?, attrs?:{}, lastDates?:{ <typ>: iso } }
// ============================================================================

import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getProfile, listBooks } from "./books.js";
import { geraetById, geraeteFuerFachrichtung, jobsForGeraet, bookForPruefung } from "./geraete.js";
import { getArtifact } from "./catalog.js";
import { createSchedule, listSchedules } from "./schedules.js";
import { createJob } from "./jobs.js";
import { resolveActivePraxisId } from "./praxis.js";
import { isRecurring } from "./recurrence.js";
import { log } from "../log.js";

const FieldValue = admin.firestore.FieldValue;

function col(clientId) {
  return masCollection(clientId, "mas_qm_inventory");
}
function s(v) {
  return String(v ?? "").trim();
}

/** Ein rohes Item gegen den Katalog validieren/normalisieren (unbekannt -> null). */
function cleanItem(raw) {
  const dev = geraetById(raw?.key);
  if (!dev) return null;
  const lastDates = {};
  if (raw.lastDates && typeof raw.lastDates === "object") {
    for (const [k, v] of Object.entries(raw.lastDates)) {
      const iso = s(v);
      if (iso) lastDates[k] = iso;
    }
  }
  const attrs = {};
  if (raw.attrs && typeof raw.attrs === "object") {
    for (const [k, v] of Object.entries(raw.attrs)) attrs[k] = s(v);
  }
  return {
    key: dev.key,
    label: s(raw.label) || dev.label,
    active: raw.active !== false,
    count: Math.max(1, Number(raw.count) || 1),
    attrs,
    lastDates,
  };
}

/** Vorbelegtes Inventar fuer eine Fachrichtung (nur "typisch", alle aktiv). */
export function defaultInventoryFor(fachKey) {
  const { typisch } = geraeteFuerFachrichtung(fachKey);
  return typisch.map((dev) => ({ key: dev.key, label: dev.label, active: true, count: 1, attrs: {}, lastDates: {} }));
}

/**
 * Inventar einer Praxis lesen. Existiert noch keines, wird aus der Fachrichtung
 * (Client-Profil) ein Vorschlag geliefert (nicht gespeichert) — seeded=true.
 */
export async function getInventory(clientId, praxisId) {
  const pid = s(praxisId) || (await resolveActivePraxisId(clientId));
  if (!pid) return { praxisId: "", items: [], seeded: false };
  const snap = await col(clientId).doc(pid).get();
  if (snap.exists && Array.isArray(snap.data().items)) {
    return { praxisId: pid, items: snap.data().items.map(cleanItem).filter(Boolean), seeded: false };
  }
  const profile = (await getProfile(clientId)) || {};
  return { praxisId: pid, items: defaultInventoryFor(profile.fachrichtung), seeded: true };
}

/** Inventar einer Praxis speichern (ersetzt die Liste). */
export async function saveInventory(clientId, praxisId, items = []) {
  const pid = s(praxisId) || (await resolveActivePraxisId(clientId));
  if (!pid) return { ok: false, reason: "no_praxis" };
  const clean = (Array.isArray(items) ? items : []).map(cleanItem).filter(Boolean);
  await col(clientId).doc(pid).set({ items: clean, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, praxisId: pid, items: clean };
}

/**
 * Aus dem Inventar deterministisch die faelligen Pruef-/Validierungs-Jobs
 * erzeugen. Idempotent: legt pro (Buch, Geraet, Pruef-Typ) hoechstens EINEN
 * Schedule an (deviceRef = "<geraetKey>:<typ>"). Optional auf Geraete-Gruppen
 * eingrenzen (z. B. ["aufbereitung"] fuer die Sterilisation).
 * @returns {{ ok, created, skipped, overdue, jobs }}
 */
export async function generateGeraeteJobs(clientId, { praxisId, gruppen = null, onlyActiveBooks = true } = {}) {
  const inv = await getInventory(clientId, praxisId);
  const pid = inv.praxisId;
  const wantGroups = Array.isArray(gruppen) && gruppen.length ? new Set(gruppen) : null;

  // Regel „keine Jobs vor aktivem Plan": Geraetejobs nur in Buecher schreiben,
  // die (fuer diese Praxis) aktiv sind. So entstehen z. B. Roentgen-Jobs erst,
  // wenn das Konstanz-/Sachverstaendigenbuch aktiviert wurde.
  let activeSet = null;
  if (onlyActiveBooks) {
    const books = await listBooks(clientId, true, pid).catch(() => []);
    activeSet = new Set((books || []).map((b) => s(b.key)));
  }

  // Bestehende Schedules je Buch cachen (deviceRef-Set) fuer die Idempotenz.
  const existingByBook = new Map();
  const existingRefs = async (bookKey) => {
    if (!existingByBook.has(bookKey)) {
      const list = await listSchedules(clientId, { bookKey });
      existingByBook.set(bookKey, new Set(list.map((x) => s(x.deviceRef)).filter(Boolean)));
    }
    return existingByBook.get(bookKey);
  };

  let created = 0, skipped = 0, overdue = 0;
  const jobs = [];
  for (const item of inv.items) {
    if (item.active === false) continue;
    const dev = geraetById(item.key);
    if (!dev) continue;
    if (wantGroups && !wantGroups.has(dev.gruppe)) continue;

    const devJobs = jobsForGeraet({ key: item.key, label: item.label, lastDates: item.lastDates });
    for (const j of devJobs) {
      const bookKey = bookForPruefung(j.typ);
      if (!bookKey || !getArtifact(bookKey)) { skipped++; continue; }
      if (activeSet && !activeSet.has(bookKey)) { skipped++; continue; }
      const deviceRef = `${dev.key}:${j.typ}`;
      const refs = await existingRefs(bookKey);
      if (refs.has(deviceRef)) { skipped++; continue; }

      let recurrenceId = "";
      if (isRecurring(j.cycle)) {
        const sched = await createSchedule(clientId, {
          bookKey, title: j.title, cycle: j.cycle, mode: "fixed",
          leadDays: 14, assignedRole: j.role, deviceRef, firstDueAt: j.dueAt, praxisId: pid,
        });
        if (sched.ok) { recurrenceId = sched.schedule.id; refs.add(deviceRef); }
      }
      const job = await createJob(clientId, {
        bookKey, title: j.title, scheduledFor: j.dueAt, dueAt: j.dueAt, leadDays: 14,
        assignedRole: j.role, recurrenceId, recurrenceMode: recurrenceId ? "fixed" : "on_event",
        cycle: j.cycle, deviceRef, praxisId: pid, createdBy: "julia",
      });
      if (job.ok) { jobs.push(job.job); created++; if (j.overdue) overdue++; }
    }
  }
  log.info("qm.geraete_jobs", { clientId, praxisId: pid, created, skipped, overdue });
  return { ok: true, praxisId: pid, created, skipped, overdue, jobs };
}
