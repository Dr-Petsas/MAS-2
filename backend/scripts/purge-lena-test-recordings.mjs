// Einmaliger Testphase-Cleanup: ALLE Lena-Page-Aufnahmen stoppen + loeschen.
// ---------------------------------------------------------------------------
// Es gibt kein persistiertes Roh-Audio. Lena speichert pro Termin:
//   clients/{c}/locations/{l}/appointments/{a}/dictations/*        (STT-Textsegmente)
//   clients/{c}/locations/{l}/appointments/{a}/treatment/main      (Notiz/Struktur/Billing)
//   clients/{c}/locations/{l}/appointments/{a}/treatment/recorder  (Aufnahme-Zustand -> Zombie-Quelle)
//   clients/{c}/locations/{l}/appointments/{a}/treatment/companion (Geraete-Presence)
//   Brain-Events  lena-doc:{appt}:...                              (Timeline/Cockpit)
//
// Dieses Script:
//   1. stoppt jeden Recorder (status recording/paused -> idle, Felder geleert),
//   2. loescht alle Diktat-Segmente + treatment/main,
//   3. zieht die lena-doc-Brain-Events pro Termin nach.
//
// Idempotent + best-effort. Nutzt collectionGroup (kein Composite-Index noetig).
//
//   node scripts/purge-lena-test-recordings.mjs          # ausfuehren
//   node scripts/purge-lena-test-recordings.mjs --dry     # nur zaehlen, nichts loeschen
import "dotenv/config";
import admin from "../src/firebase.js";
import { deleteEventsByIdPrefix } from "../src/brain/eventStore.js";

const db = admin.firestore();
const DRY = process.argv.includes("--dry");

const IDLE_RECORDER = {
  status: "idle",
  command: "",
  commandAtMs: 0,
  deviceId: "",
  deviceLabel: "",
  by: "",
  mode: "idle",
  startedAtMs: 0,
  accumMs: 0,
  updatedAtMs: Date.now(),
};

// clients/{c}/locations/{l}/appointments/{a}/<sub>/<doc>
function parsePath(path) {
  const p = path.split("/");
  const ci = p.indexOf("clients");
  if (ci < 0) return null;
  return {
    clientId: p[ci + 1],
    locationId: p[ci + 3],
    appointmentId: p[ci + 5],
  };
}

async function commitInChunks(refs, mutate) {
  let done = 0;
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 400)) { mutate(batch, ref); done++; }
    if (!DRY) await batch.commit();
  }
  return done;
}

async function main() {
  console.log(`[purge-lena] Start ${DRY ? "(DRY RUN)" : "(LIVE)"} ${new Date().toISOString()}`);

  // --- 1) treatment/* (recorder, main, companion) ---
  const treatSnap = await db.collectionGroup("treatment").get();
  const recorderRefs = [];
  const mainRefs = [];
  const companionRefs = [];
  const apptSet = new Set(); // "clientId|appointmentId"
  let zombies = 0;

  for (const doc of treatSnap.docs) {
    const ids = parsePath(doc.ref.path);
    if (!ids) continue;
    apptSet.add(`${ids.clientId}|${ids.appointmentId}`);
    if (doc.id === "recorder") {
      recorderRefs.push(doc.ref);
      const st = doc.data()?.status;
      if (st === "recording" || st === "paused") zombies++;
    } else if (doc.id === "main") {
      mainRefs.push(doc.ref);
    } else if (doc.id === "companion") {
      companionRefs.push(doc.ref);
    }
  }

  // --- 2) dictations/* ---
  const dictSnap = await db.collectionGroup("dictations").get();
  const dictRefs = dictSnap.docs.map((d) => d.ref);
  for (const d of dictSnap.docs) {
    const ids = parsePath(d.ref.path);
    if (ids) apptSet.add(`${ids.clientId}|${ids.appointmentId}`);
  }

  console.log(`[purge-lena] gefunden: ${recorderRefs.length} recorder (davon ${zombies} aktiv/paused), ${mainRefs.length} treatment/main, ${companionRefs.length} companion, ${dictRefs.length} Diktat-Segmente, ${apptSet.size} betroffene Termine`);

  // --- 3) Recorder -> idle (stoppt Zombies) ---
  const recSet = await commitInChunks(recorderRefs, (batch, ref) => {
    batch.set(ref, { ...IDLE_RECORDER, updatedAtMs: Date.now() }, { merge: true });
  });
  console.log(`[purge-lena] Recorder auf idle gesetzt: ${recSet}`);

  // --- 4) Diktat-Segmente + main + companion loeschen ---
  const dictDel = await commitInChunks(dictRefs, (batch, ref) => batch.delete(ref));
  const mainDel = await commitInChunks(mainRefs, (batch, ref) => batch.delete(ref));
  const compDel = await commitInChunks(companionRefs, (batch, ref) => batch.delete(ref));
  console.log(`[purge-lena] geloescht: ${dictDel} Diktat-Segmente, ${mainDel} treatment/main, ${compDel} companion`);

  // --- 5) Brain-Events (lena-doc:{appt}:...) pro Termin ---
  let memDeleted = 0;
  if (!DRY) {
    for (const key of apptSet) {
      const [clientId, appointmentId] = key.split("|");
      if (!clientId || !appointmentId) continue;
      try {
        const { deleted } = await deleteEventsByIdPrefix(clientId, `lena-doc:${appointmentId}:`);
        memDeleted += deleted;
      } catch (e) {
        console.warn(`[purge-lena] Brain-Cleanup fehlgeschlagen fuer ${key}: ${e?.message || e}`);
      }
    }
  }
  console.log(`[purge-lena] Brain-Events (lena-doc) geloescht: ${memDeleted}`);

  console.log(`[purge-lena] Fertig ${DRY ? "(DRY RUN — nichts geaendert)" : ""}.`);
  process.exit(0);
}

main().catch((e) => { console.error("[purge-lena] Fehler:", e); process.exit(1); });
