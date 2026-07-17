import "dotenv/config";
import admin from "../src/firebase.js";
import { loadBooking, findSlots } from "../src/clara/booking.js";
import { composeRecallCallInstruction } from "../src/clara/outreachTemplates.js";
import { liveBookingConfigured } from "../src/lisa/agentTools.js";
import { lisaStartCall, getLisaTaskDetail } from "../src/lisa/outbound.js";

// ============================================================================
// DEMO-ANRUF pro Bucket (kfo|kb|kons). Nutzt den PRODUKTIONS-Composer
// composeRecallCallInstruction mit Live-Buchung + dem bucket-spezifischen
// cfg.phoneKi.prompt (vorsichtige Ansprache + Hintergrundwissen).
//
// Ruft AUSSCHLIESSLICH die im Bucket hinterlegte (Chef-)Nummer an, bucht bei
// Zusage LIVE (Name/Tel aus dem Patientensatz, wird nicht erneut erfragt),
// und liest danach Transkript + Buchungsergebnis aus.
//
//   node scripts/demo-bucket-call.mjs kfo
//   node scripts/demo-bucket-call.mjs kb   --day 2026-07-18
// ============================================================================

const clientId = "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const PRACTICE = "Praxis Dr. Petsas";
const TZ = "Europe/Berlin";

const key = (process.argv[2] || "").toLowerCase();
const CAMPAIGN_BY_KEY = { kfo: "demo_bucket_kfo", kb: "demo_bucket_kb", kons: "demo_bucket_kons" };
const campaignId = CAMPAIGN_BY_KEY[key];
if (!campaignId) { console.error("Bucket angeben: kfo | kb | kons"); process.exit(1); }

const wantDay = process.argv.includes("--day") ? process.argv[process.argv.indexOf("--day") + 1] : todayLocal();
const PATIENT_ID = "demo_petsassss";

function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function isoParts(iso) {
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  return m ? { date: m[1], time: `${m[2]}:${m[3]}` } : null;
}

const db = admin.firestore();
const campRef = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("campaigns").doc(campaignId);
const patRef = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("patients").doc(PATIENT_ID);

async function run() {
  if (!liveBookingConfigured()) {
    console.error("Live-Buchung NICHT konfiguriert (ELEVENLABS/LISA/PUBLIC_BASE_URL). Abbruch.");
    process.exit(1);
  }

  const campSnap = await campRef.get();
  if (!campSnap.exists) { console.error(`Bucket ${campaignId} nicht gefunden. Erst seed laufen lassen.`); process.exit(1); }
  const camp = campSnap.data();
  const patSnap = await patRef.get();
  if (!patSnap.exists) { console.error("Testpatient nicht gefunden. Erst seed laufen lassen."); process.exit(1); }
  const pat = patSnap.data();
  const phone = pat.mobilePhoneNumber;
  const patientName = `${pat.firstName} ${pat.lastName}`.trim();
  const campaignPrompt = camp?.cfg?.phoneKi?.prompt || "";

  // Freien Slot suchen (heute bevorzugt, sonst naechster verfuegbarer Tag).
  await loadBooking(clientId).catch(() => {});
  let found;
  try {
    found = await findSlots(clientId, {
      calendarId: camp.calendarId, doctorName: camp.calendarName,
      visitMotiveId: camp.visitMotiveId, visitMotiveName: camp.visitMotiveName,
      startDate: wantDay,
    });
  } catch (e) { found = { ok: false, error: String(e?.message || e) }; }
  if (!found?.ok || !found.slots?.length) {
    console.error(`Keine freien Slots fuer ${camp.visitMotiveName} @ ${camp.calendarName}: ${found?.error || "leer"}`);
    process.exit(1);
  }
  const nowMs = Date.now();
  const future = found.slots
    .map((iso) => ({ iso, ms: new Date(iso).getTime(), p: isoParts(iso) }))
    .filter((x) => x.p && Number.isFinite(x.ms) && x.ms >= nowMs + 60 * 60000)
    .sort((a, b) => a.ms - b.ms);
  const today = future.filter((x) => x.p.date === wantDay);
  const pick = (today[0] || future[0]);
  if (!pick) { console.error("Kein zukuenftiger Slot (>= +60min) verfuegbar."); process.exit(1); }
  const { date, time } = pick.p;

  const instruction = composeRecallCallInstruction({
    practiceName: PRACTICE, patientName, date, timeLabel: time,
    calendarName: camp.calendarName, visitMotiveName: camp.visitMotiveName,
    overdueDays: 180, source: "campaign", campaignPrompt, liveBooking: true,
  });

  const bookingContext = {
    patientId: PATIENT_ID, patientName,
    calendarId: camp.calendarId, calendarName: camp.calendarName,
    visitMotiveId: camp.visitMotiveId, visitMotiveName: camp.visitMotiveName,
    slotIso: pick.iso, caseId: "",
  };

  console.log(`\n=== ANRUF Bucket ${key.toUpperCase()} ===`);
  console.log(`Patient:  ${patientName}  (${phone})`);
  console.log(`Angebot:  ${date} ${time}  |  ${camp.visitMotiveName} @ ${camp.calendarName}`);
  console.log(`\n--- INSTRUKTION AN LISA ---\n${instruction}\n---------------------------\n`);

  const res = await lisaStartCall(clientId, {
    phone, instruction, contactName: patientName, by: "Chef-Test", bookingContext,
  });
  console.log("lisaStartCall:", JSON.stringify(res));
  if (!res.ok) process.exit(1);

  // Auf Task-Ende warten und Transkript ziehen (neuester call-Task zur Nummer).
  await watchNewestCall(phone);
}

function tasksCol() {
  return db.collection("clients").doc(clientId).collection("mas_lisa_tasks");
}

async function watchNewestCall(phone) {
  // Neuesten call-Task zu dieser Nummer finden (ohne zusammengesetzten Index).
  const snap = await tasksCol().where("phone", "==", phone).limit(50).get()
    .catch((e) => { console.error("task query:", String(e?.message || e)); return null; });
  if (!snap || snap.empty) { console.error("Kein Task gefunden zum Beobachten."); return; }
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.kind === "call")
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
  if (!docs.length) { console.error("Kein call-Task gefunden."); return; }
  const taskId = docs[0].id;
  console.log(`\nBeobachte Task ${taskId} ...`);
  const ref = tasksCol().doc(taskId);
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < 360000) {
    const s = await ref.get();
    const t = s.data() || {};
    if (t.status !== last) {
      console.log(`[${new Date().toLocaleTimeString("de-DE")}] status=${t.status} outcome=${t.outcome || "-"} booked=${t.bookedSlotIso || "-"}`);
      last = t.status;
    }
    if (t.status === "done" || t.status === "failed") {
      const detail = await getLisaTaskDetail(clientId, taskId).catch((e) => ({ ok: false, error: String(e) }));
      if (detail.ok) {
        console.log(`\n=== TRANSKRIPT (${(detail.transcript || []).length} Zeilen, ${detail.durationSecs || "?"}s) ===`);
        for (const it of detail.transcript || []) {
          const who = it.role === "agent" ? "LISA " : "PAT  ";
          const ts = it.timeInCallSecs >= 0 ? `[${it.timeInCallSecs}s] ` : "";
          console.log(`${who} ${ts}${it.message}`);
        }
      } else {
        console.log("Transkript:", detail.error || detail.reason);
      }
      console.log(`\nOutcome: ${t.outcome}  |  Gebucht: ${t.bookedSlotIso || "NEIN"}  |  Summary: ${t.resultSummary || "-"}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("Timeout - Gespraech evtl. noch aktiv. Letzter Status:", last);
}

run().catch((e) => { console.error(e); process.exit(1); });
